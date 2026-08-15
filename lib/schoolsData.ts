import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { School } from '@/types/school';
import {
  pointInGeometry,
  type CatchmentFeature,
  type CatchmentIndex,
  type CatchmentIndexEntry,
} from './catchmentLookup';
import { buildSchoolSlugs, stateSlug, suburbSlug } from './slug';

// Server-only: these pages are prerendered, so the dataset is read straight off
// disk rather than fetched. Never import this from a "use client" component.
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
 * Load and index the canonical dataset once per build.
 *
 * `cache()` dedupes across the many pages generated in a single render pass;
 * the module-level fallback covers generateStaticParams, which runs outside a
 * React render.
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

/**
 * Nearby suburbs, defined as other suburbs sharing a postcode with this one.
 *
 * Postcode is an honest proxy that needs no extra dataset. It is not a distance
 * ranking and is not presented as one.
 */
export function getRelatedSuburbs(group: SuburbGroup, limit = 12): SuburbGroup[] {
  const dataset = getSchoolsDataset();
  const postcodes = new Set(group.postcodes);
  const related: SuburbGroup[] = [];

  for (const candidate of dataset.suburbs.values()) {
    if (candidate === group) continue;
    if (candidate.state !== group.state) continue;
    if (!candidate.postcodes.some(postcode => postcodes.has(postcode))) continue;
    related.push(candidate);
    if (related.length >= limit) break;
  }

  return related.sort((a, b) => a.suburb.localeCompare(b.suburb));
}

// --- Catchments -------------------------------------------------------------

let cachedCatchmentIndex: CatchmentIndex | null | undefined;

export function getCatchmentIndex(): CatchmentIndex | null {
  if (cachedCatchmentIndex !== undefined) return cachedCatchmentIndex;
  const file = path.join(DATA_DIR, 'catchment', 'nsw', 'index.json');
  cachedCatchmentIndex = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as CatchmentIndex)
    : null;
  return cachedCatchmentIndex;
}

export function readCatchmentFeature(entry: Pick<CatchmentIndexEntry, 'location_age_id' | 'kind'>): CatchmentFeature | null {
  const file = path.join(DATA_DIR, 'catchment', 'nsw', `${entry.location_age_id}-${entry.kind}.json`);
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

let cachedNswSchools: School[] | null = null;

/** NSW schools with usable coordinates, computed once for all zone pages. */
function getNswSchools(): School[] {
  if (!cachedNswSchools) {
    cachedNswSchools = getSchoolsDataset().schools.filter(
      school => school.state === 'NSW' && Number.isFinite(school.lat) && Number.isFinite(school.lng),
    );
  }
  return cachedNswSchools;
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
export function getSchoolsInZone(feature: CatchmentFeature, limit = 40): SchoolInZone[] {
  const candidates = getNswSchools();
  const [minLng, minLat, maxLng, maxLat] = geometryBbox(feature.geometry);
  const inside: SchoolInZone[] = [];

  for (const school of candidates) {
    if (school.acara_sml_id === feature.properties.acara_sml_id) continue;
    // Cheap rejection first: point-in-polygon over a few hundred vertices, run
    // for every NSW school on every one of 2,029 zone pages, is what makes the
    // build slow. The bbox test removes almost all of them.
    if (school.lng < minLng || school.lng > maxLng || school.lat < minLat || school.lat > maxLat) continue;
    if (!pointInGeometry([school.lng, school.lat], feature.geometry)) continue;
    inside.push({ school, slug: getSchoolSlug(school) });
    if (inside.length >= limit) break;
  }

  return inside.sort((a, b) => a.school.school_name.localeCompare(b.school.school_name));
}

/** Suburbs of the schools inside a zone — a sample of the area, not its extent. */
export function getZoneSuburbs(inside: SchoolInZone[]): string[] {
  return [...new Set(inside.map(entry => entry.school.suburb))].sort();
}
