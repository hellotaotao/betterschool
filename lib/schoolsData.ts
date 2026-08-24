import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { School, type SchoolCatchment } from '@/types/school';
import {
  CATCHMENT_STATES,
  pointInGeometry,
  type CatchmentFeature,
  type CatchmentIndex,
  type CatchmentIndexEntry,
} from './catchmentLookup';
import { buildSchoolSlugs, stateSlug, suburbSlug } from './slug';

// Server-only: build-time sitemap generation and on-demand ISR pages read the
// dataset straight off disk rather than fetching it. Never import this from a
// "use client" component.
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function readJson<T>(...segments: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...segments), 'utf8')) as T;
}

export interface SuburbGroup {
  state: string;
  suburb: string;
  slug: string;
  postcodes: string[];
  schools: School[];
  /**
   * Mean position of this suburb's schools. Not the suburb's geographic centre
   * — we hold no suburb boundaries — so it is only ever used to order other
   * suburbs by proximity, never presented as the suburb's location.
   */
  lat: number;
  lng: number;
}

export interface SchoolsDataset {
  schools: School[];
  slugs: Map<string, string>;
  /** `${stateSlug}/${schoolSlug}` → school */
  bySlug: Map<string, School>;
  /** `${stateSlug}/${suburbSlug}` → suburb group */
  suburbs: Map<string, SuburbGroup>;
  metadata: { generated_at?: string; generated_from?: Record<string, unknown> };
}

/**
 * Load and index the canonical dataset for build-time or server runtime use.
 *
 * `cache()` dedupes calls within a React server render; the module-level
 * fallback reuses the dataset for non-React build callers and later ISR route
 * renders in the same process.
 */
let cachedDataset: SchoolsDataset | null = null;

export const getSchoolsDataset = cache((): SchoolsDataset => {
  if (cachedDataset) return cachedDataset;

  const schools = readJson<School[]>('schools.canonical.json');
  const metadata = readJson<SchoolsDataset['metadata']>('schools.metadata.json');
  const slugs = buildSchoolSlugs(schools);

  const bySlug = new Map<string, School>();
  const suburbs = new Map<string, SuburbGroup>();

  for (const school of schools) {
    const slug = slugs.get(school.id);
    if (slug) bySlug.set(`${stateSlug(school.state)}/${slug}`, school);

    const suburbKey = `${stateSlug(school.state)}/${suburbSlug(school.suburb)}`;
    let group = suburbs.get(suburbKey);
    if (!group) {
      group = {
        state: school.state,
        suburb: school.suburb,
        slug: suburbSlug(school.suburb),
        postcodes: [],
        schools: [],
        lat: 0,
        lng: 0,
      };
      suburbs.set(suburbKey, group);
    }
    group.schools.push(school);
    if (school.postcode && !group.postcodes.includes(school.postcode)) {
      group.postcodes.push(school.postcode);
    }
  }

  for (const group of suburbs.values()) {
    group.schools.sort((a, b) => a.school_name.localeCompare(b.school_name));
    group.postcodes.sort();
    // Every ACARA record in the canonical file has coordinates, so this is a
    // mean over the whole group rather than over whichever schools happened to
    // carry a position.
    group.lat = group.schools.reduce((sum, s) => sum + Number(s.lat), 0) / group.schools.length;
    group.lng = group.schools.reduce((sum, s) => sum + Number(s.lng), 0) / group.schools.length;
  }

  cachedDataset = { schools, slugs, bySlug, suburbs, metadata };
  return cachedDataset;
});

export function getSchoolBySlug(state: string, slug: string): School | undefined {
  return getSchoolsDataset().bySlug.get(`${stateSlug(state)}/${slug}`);
}

export function getSuburb(state: string, slug: string): SuburbGroup | undefined {
  return getSchoolsDataset().suburbs.get(`${stateSlug(state)}/${slug}`);
}

export function getSchoolSlug(school: School): string {
  return getSchoolsDataset().slugs.get(school.id) ?? '';
}

/** Other schools in the same suburb, excluding the given one. */
export function getSuburbPeers(school: School, limit = 12): School[] {
  const group = getSuburb(school.state, suburbSlug(school.suburb));
  if (!group) return [];
  return group.schools.filter(peer => peer.id !== school.id).slice(0, limit);
}

/** Straight-line distance in km. Haversine on a spherical earth. */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Suburbs holding the most schools, nationally or within one state.
 *
 * A hub that fans out to 1,431 alphabetical entries gives each of them a
 * 1/1431 share of whatever reaches it. This puts the densest suburbs one click
 * from the hub instead. "Most schools" is a count we hold, not a popularity
 * claim we would have to invent traffic data to make.
 */
export function getLargestSuburbs(state: string | null, limit: number): SuburbGroup[] {
  const dataset = getSchoolsDataset();
  const groups = [...dataset.suburbs.values()]
    .filter(group => (state ? group.state === state : true));

  return groups
    .sort((a, b) => b.schools.length - a.schools.length || a.suburb.localeCompare(b.suburb))
    .slice(0, limit);
}

export interface NearbySuburb {
  group: SuburbGroup;
  km: number;
}

/**
 * The nearest other suburbs in the same state, by straight-line distance
 * between school positions.
 *
 * This replaced a shared-postcode rule. Postcode needed no coordinates, but it
 * left 1,242 of 4,800 suburb pages (26%) with no outbound link at all — a page
 * a reader and a crawler can both enter and neither can leave. Distance is
 * computed from official ACARA coordinates, which every school has, so every
 * suburb page now links onward.
 *
 * Straight-line, not travel distance, and the page says so.
 */
export function getRelatedSuburbs(group: SuburbGroup, limit = 12): NearbySuburb[] {
  const dataset = getSchoolsDataset();
  const scored: NearbySuburb[] = [];

  for (const candidate of dataset.suburbs.values()) {
    if (candidate === group) continue;
    if (candidate.state !== group.state) continue;
    scored.push({ group: candidate, km: distanceKm(group.lat, group.lng, candidate.lat, candidate.lng) });
  }

  return scored.sort((a, b) => a.km - b.km).slice(0, limit);
}

export interface NearbySchool {
  school: School;
  slug: string;
  km: number;
}

/**
 * The nearest schools outside this school's own suburb.
 *
 * 2,716 of 4,800 suburbs hold exactly one school, so `getSuburbPeers` returns
 * nothing for more than half the school pages — leaving them with no lateral
 * link and near-duplicate content against their own suburb page. This is also
 * the question an address-first reader is actually asking: the suburb boundary
 * is an administrative line, not the edge of what their child can attend.
 *
 * Kept as a separate section from the same-suburb peers rather than padding
 * that list, so "in this suburb" and "near this suburb" stay distinguishable.
 */
export function getNearbySchools(school: School, limit = 8): NearbySchool[] {
  const dataset = getSchoolsDataset();
  const own = suburbSlug(school.suburb);
  const scored: NearbySchool[] = [];

  for (const candidate of dataset.schools) {
    if (candidate.id === school.id) continue;
    if (candidate.state !== school.state) continue;
    if (suburbSlug(candidate.suburb) === own) continue;
    const slug = dataset.slugs.get(candidate.id);
    if (!slug) continue;
    scored.push({
      school: candidate,
      slug,
      km: distanceKm(Number(school.lat), Number(school.lng), Number(candidate.lat), Number(candidate.lng)),
    });
  }

  return scored.sort((a, b) => a.km - b.km).slice(0, limit);
}

// --- Catchments -------------------------------------------------------------

let cachedCatchmentEntries: CatchmentIndexEntry[] | undefined;

/**
 * Every published state's index entries, merged.
 *
 * A state listed in CATCHMENT_STATES whose build has not been run contributes
 * nothing rather than throwing — a checkout with only one state built is normal.
 */
export function getCatchmentEntries(): CatchmentIndexEntry[] {
  if (cachedCatchmentEntries !== undefined) return cachedCatchmentEntries;

  cachedCatchmentEntries = CATCHMENT_STATES.flatMap(state => {
    const file = path.join(DATA_DIR, 'catchment', state, 'index.json');
    if (!fs.existsSync(file)) return [];
    const index = JSON.parse(fs.readFileSync(file, 'utf8')) as CatchmentIndex;
    // Stamped by the reader, not stored per entry — see the client loader.
    return index.catchments.map(entry => ({ ...entry, state }));
  });

  return cachedCatchmentEntries;
}

export function readCatchmentFeature(
  entry: Pick<CatchmentIndexEntry, 'state' | 'location_age_id' | 'kind'> & Pick<Partial<CatchmentIndexEntry>, 'geometry_url'>,
): CatchmentFeature | null {
  const file = entry.geometry_url
    ? path.join(process.cwd(), 'public', entry.geometry_url.replace(/^\/+/, ''))
    : path.join(DATA_DIR, 'catchment', entry.state, `${entry.location_age_id}-${entry.kind}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CatchmentFeature;
}

/** Schools with a published catchment, one entry per school. */
export function getSchoolsWithCatchments(): School[] {
  return getSchoolsDataset().schools.filter(school => (school.catchments?.length ?? 0) > 0);
}

export interface SchoolInZone {
  school: School;
  slug: string;
}

export interface CatchmentZoneSection {
  catchment: SchoolCatchment;
  feature: CatchmentFeature;
  inside: SchoolInZone[];
  suburbs: string[];
}

const cachedStateSchools = new Map<string, School[]>();

/**
 * One state's schools with usable coordinates, computed once per state.
 *
 * A zone never crosses a state border, so testing a zone against the whole
 * country would be ~11,000 point-in-polygon calls to find candidates that could
 * only ever have come from one state.
 */
function getSchoolsForState(state: string): School[] {
  const key = state.toUpperCase();
  let pool = cachedStateSchools.get(key);
  if (!pool) {
    pool = getSchoolsDataset().schools.filter(
      school => school.state === key && Number.isFinite(school.lat) && Number.isFinite(school.lng),
    );
    cachedStateSchools.set(key, pool);
  }
  return pool;
}

/** [minLng, minLat, maxLng, maxLat] of a polygon or multipolygon. */
function geometryBbox(geometry: CatchmentFeature['geometry']): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (coordinates: unknown): void => {
    if (typeof (coordinates as number[])[0] === 'number') {
      const [lng, lat] = coordinates as [number, number];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    (coordinates as unknown[]).forEach(visit);
  };
  visit(geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Which schools sit inside a catchment polygon.
 *
 * This is a fact we can compute exactly — a school's coordinates either fall in
 * the boundary or they do not. It is deliberately NOT dressed up as "the
 * suburbs this zone covers": without suburb boundary data that would be an
 * inference, and the schools inside a zone are only a sample of its area.
 */
export function getSchoolsInZone(feature: CatchmentFeature, state: string, limit?: number): SchoolInZone[] {
  const candidates = getSchoolsForState(state);
  const [minLng, minLat, maxLng, maxLat] = geometryBbox(feature.geometry);
  const inside: SchoolInZone[] = [];

  for (const school of candidates) {
    if (school.acara_sml_id === feature.properties.acara_sml_id) continue;
    // Cheap rejection first: point-in-polygon over a few hundred vertices, run
    // for every school in the state on every one of ~2,150 zone pages, is what
    // makes the build slow. The bbox test removes almost all of them.
    if (school.lng < minLng || school.lng > maxLng || school.lat < minLat || school.lat > maxLat) continue;
    if (!pointInGeometry([school.lng, school.lat], feature.geometry)) continue;
    inside.push({ school, slug: getSchoolSlug(school) });
  }

  inside.sort((a, b) => a.school.school_name.localeCompare(b.school.school_name));
  return limit !== undefined && Number.isFinite(limit) ? inside.slice(0, limit) : inside;
}

/** Suburbs of the schools inside a zone — a sample of the area, not its extent. */
export function getZoneSuburbs(inside: SchoolInZone[]): string[] {
  return [...new Set(inside.map(entry => entry.school.suburb))].sort();
}

/** Each published zone paired with its own geometry and computed area sample. */
export function getCatchmentZoneSections(school: School): CatchmentZoneSection[] {
  if (!Number.isFinite(school.location_age_id)) return [];

  return (school.catchments ?? []).flatMap<CatchmentZoneSection>(catchment => {
    const feature = readCatchmentFeature({
      state: school.state.toLowerCase(),
      location_age_id: Number(school.location_age_id),
      kind: catchment.kind,
      geometry_url: catchment.geometry_url,
    });
    if (!feature) return [];

    const inside = getSchoolsInZone(feature, school.state);
    return [{ catchment, feature, inside, suburbs: getZoneSuburbs(inside) }];
  });
}

// --- State-level indexes ----------------------------------------------------

export interface StateSummary {
  /** ACARA state code, e.g. 'NSW'. */
  state: string;
  slug: string;
  schools: number;
  suburbs: SuburbGroup[];
  /** Schools in the state with a published intake zone. */
  zoned: number;
}

let cachedStateSummaries: StateSummary[] | null = null;

/**
 * One entry per state, used by the browse index.
 *
 * These pages exist so the long-tail pages are not orphans: a page reachable
 * only from the sitemap has no internal links pointing at it, which both hides
 * it from readers and tells search engines nothing about its importance.
 */
export function getStateSummaries(): StateSummary[] {
  if (cachedStateSummaries) return cachedStateSummaries;

  const dataset = getSchoolsDataset();
  const byState = new Map<string, StateSummary>();

  for (const group of dataset.suburbs.values()) {
    let summary = byState.get(group.state);
    if (!summary) {
      summary = { state: group.state, slug: stateSlug(group.state), schools: 0, suburbs: [], zoned: 0 };
      byState.set(group.state, summary);
    }
    summary.suburbs.push(group);
    summary.schools += group.schools.length;
    summary.zoned += group.schools.filter(school => (school.catchments?.length ?? 0) > 0).length;
  }

  for (const summary of byState.values()) {
    summary.suburbs.sort((a, b) => a.suburb.localeCompare(b.suburb));
  }

  cachedStateSummaries = [...byState.values()].sort((a, b) => b.schools - a.schools);
  return cachedStateSummaries;
}

export function getStateSummary(state: string): StateSummary | undefined {
  const wanted = stateSlug(state);
  return getStateSummaries().find(summary => summary.slug === wanted);
}

/** Group suburbs under their first character, so an index can be scanned. */
export function groupSuburbsByInitial(suburbs: SuburbGroup[]): [string, SuburbGroup[]][] {
  const groups = new Map<string, SuburbGroup[]>();
  for (const suburb of suburbs) {
    const initial = /^[A-Za-z]/.test(suburb.suburb) ? suburb.suburb[0].toUpperCase() : '#';
    const bucket = groups.get(initial);
    if (bucket) bucket.push(suburb);
    else groups.set(initial, [suburb]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
