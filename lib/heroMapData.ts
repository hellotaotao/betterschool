import type { School, SchoolCatchment } from '@/types/school';
import type { CatchmentFeature } from '@/lib/catchmentLookup';
import { getCatchmentEntries, getSchoolSlug, getSchoolsDataset, readCatchmentFeature } from '@/lib/schoolsData';
import {
  MAP_SIZE,
  bboxesOverlap,
  contextBounds,
  featureRings,
  fitFrame,
  frameBounds,
  project,
  ringsPath,
  scaleBar,
  withinBounds,
  type MapFrame,
} from '@/lib/heroMap';
import { getMarkerColor, getMarkerRadius } from '@/utils/schoolFilters';

/**
 * Server-side assembly of the hero map: which schools and zones are drawn and
 * where. Reads the dataset and geometry off disk, so never import it from a
 * client component.
 */

/** Marker radii are tuned for a full-screen map; scaled to sit in the hero. */
const DOT_SCALE = 0.7;
/** Neighbouring zones drawn as context, nearest first. */
const MAX_CONTEXT_ZONES = 24;
const MAX_BACKGROUND_SCHOOLS = 120;

export interface MapDot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sector: string;
  color: string;
  x: number;
  y: number;
  r: number;
  slug: string;
  state: string;
}

export interface MapFocus extends MapDot {
  /** Marker text, e.g. a rank in the table beside the map. */
  number?: string;
  /** Picked out with a ring and a name label. */
  selected: boolean;
}

export interface MapVariant {
  key: string;
  label: string;
  path: string;
}

/** What the interactive map needs on top of the drawing: geometry is fetched by URL, not inlined. */
export interface LiveMapData {
  bounds: [[number, number], [number, number]];
  /** Same order as `HeroMapModel.variants`, so the radio switch indexes both. */
  variants: { key: string; label: string; url: string }[];
  fixed: string[];
  /** Neighbouring zones, each named after the school it belongs to. */
  context: { url: string; name: string; slug: string; state: string }[];
}

export interface HeroMapModel {
  frame: MapFrame;
  live: LiveMapData;
  variants: MapVariant[];
  /** Zones drawn alongside the focus ones, every variant at once. */
  fixedZones: string[];
  context: string[];
  dots: MapDot[];
  focus: MapFocus[];
  scale: { km: number; units: number };
  sectors: string[];
}

export interface ZoneInput {
  key: string;
  label: string;
  feature: CatchmentFeature;
  /** The published geometry file, which the interactive map fetches. */
  url: string;
}

export function geometryUrl(entry: { state: string; location_age_id: number; kind: string; geometry_url?: string }): string {
  return entry.geometry_url ?? `/data/catchment/${entry.state}/${entry.location_age_id}-${entry.kind}.json`;
}

let schoolsByAcara: Map<number, School> | undefined;
function schoolByAcara(id: number): School | undefined {
  schoolsByAcara ??= new Map(getSchoolsDataset().schools.map(school => [school.acara_sml_id, school]));
  return schoolsByAcara.get(id);
}

export function featureFor(school: School, catchment: SchoolCatchment): CatchmentFeature | null {
  if (!Number.isFinite(school.location_age_id)) return null;
  return readCatchmentFeature({
    state: school.state.toLowerCase(),
    location_age_id: Number(school.location_age_id),
    kind: catchment.kind,
    geometry_url: catchment.geometry_url,
  });
}

/**
 * Which neighbouring zones are comparable with the one shown: same kind, and
 * where the source publishes year levels, one that covers the shown zone's
 * first year — VIC publishes a boundary per year group, and drawing every
 * group of every neighbour would stack three outlines on each street.
 */
export interface ContextRule {
  kind: SchoolCatchment['kind'];
  year?: string;
}

function dot(school: School, frame: MapFrame): MapDot {
  const { x, y } = project(frame, { lat: Number(school.lat), lng: Number(school.lng) });
  return {
    id: school.id,
    name: school.school_name,
    lat: Math.round(Number(school.lat) * 1e5) / 1e5,
    lng: Math.round(Number(school.lng) * 1e5) / 1e5,
    sector: school.sector,
    color: getMarkerColor(school.sector),
    x: round(x),
    y: round(y),
    r: round(getMarkerRadius(school.total_enrolments) * DOT_SCALE),
    slug: getSchoolSlug(school),
    state: school.state,
  };
}

const fromCentre = (point: { x: number; y: number }) => Math.hypot(point.x - MAP_SIZE / 2, point.y - MAP_SIZE / 2);

// One decimal of a drawing unit is far below a pixel; the rest is page weight.
const round = (value: number) => Math.round(value * 10) / 10;

const located = (school: School) => Number.isFinite(school.lat) && Number.isFinite(school.lng);

export function buildHeroMap({
  focus,
  variants = [],
  fixedZones = [],
  context,
  fitZones = true,
  fitAlso = [],
}: {
  focus: { school: School; number?: string; selected?: boolean }[];
  /** Mutually exclusive boundaries; the reader picks one. */
  variants?: ZoneInput[];
  /** Boundaries always drawn, e.g. every zone of the schools in a suburb. */
  fixedZones?: ZoneInput[];
  context?: ContextRule | null;
  /** False when a zone is far larger than the focus and would shrink it to a dot. */
  fitZones?: boolean;
  /** More places the frame must hold, e.g. the nearest schools, so a rural school is not a lone dot. */
  fitAlso?: { lat: number; lng: number }[];
}): HeroMapModel | null {
  const placed = focus.filter(entry => located(entry.school));
  if (placed.length === 0) return null;

  const zoneRings = fitZones
    ? [...variants, ...fixedZones].map(zone => zone.feature).flatMap(featureRings)
    : [];
  const frame = fitFrame(
    [...placed.map(entry => ({ lat: Number(entry.school.lat), lng: Number(entry.school.lng) })), ...fitAlso],
    zoneRings,
  );
  const bounds = contextBounds(frame);
  const state = placed[0].school.state;
  const focusIds = new Set(placed.map(entry => entry.school.id));

  const dataset = getSchoolsDataset();
  const dots = dataset.schools
    .filter(school => school.state === state && !focusIds.has(school.id) && located(school))
    .filter(school => withinBounds(bounds, { lat: Number(school.lat), lng: Number(school.lng) }))
    .map(school => dot(school, frame))
    .sort((a, b) => fromCentre(a) - fromCentre(b))
    .slice(0, MAX_BACKGROUND_SCHOOLS)
    // Largest first, so a small school is never hidden under a big neighbour.
    .sort((a, b) => b.r - a.r);

  const shownOwners = new Set(
    [...variants, ...fixedZones].map(zone => zone.feature.properties.acara_sml_id),
  );
  const contextPaths: string[] = [];
  const liveContext: LiveMapData['context'] = [];
  if (context) {
    const seen = new Set<string>();
    const candidates = getCatchmentEntries()
      .filter(entry => entry.state === state.toLowerCase() && entry.kind === context.kind)
      .filter(entry => !shownOwners.has(entry.acara_sml_id))
      .filter(entry => !context.year || entry.year_levels.length === 0 || entry.year_levels.includes(context.year))
      .filter(entry => bboxesOverlap(bounds, entry.bbox))
      .map(entry => {
        const centre = project(frame, { lng: (entry.bbox[0] + entry.bbox[2]) / 2, lat: (entry.bbox[1] + entry.bbox[3]) / 2 });
        return { entry, distance: fromCentre(centre) };
      })
      .sort((a, b) => a.distance - b.distance);
    for (const { entry } of candidates) {
      if (contextPaths.length >= MAX_CONTEXT_ZONES) break;
      const key = `${entry.acara_sml_id}-${entry.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const feature = readCatchmentFeature(entry);
      if (!feature) continue;
      // Faint 1px context lines: a coarser tolerance is invisible and halves the bytes.
      const path = ringsPath(frame, featureRings(feature), 1.5);
      if (path) contextPaths.push(path);
      const owner = schoolByAcara(entry.acara_sml_id);
      if (owner) {
        liveContext.push({ url: geometryUrl(entry), name: owner.school_name, slug: getSchoolSlug(owner), state: owner.state });
      }
    }
  }

  const focusDots: MapFocus[] = placed.map(entry => ({
    ...dot(entry.school, frame),
    number: entry.number,
    selected: Boolean(entry.selected),
  }));

  const drawnVariants = variants
    .map(variant => ({ variant, path: ringsPath(frame, featureRings(variant.feature)) }))
    .filter(entry => entry.path);

  return {
    frame,
    live: {
      bounds: frameBounds(frame),
      variants: drawnVariants.map(({ variant }) => ({ key: variant.key, label: variant.label, url: variant.url })),
      fixed: fixedZones.map(zone => zone.url),
      context: liveContext,
    },
    variants: drawnVariants.map(({ variant, path }) => ({ key: variant.key, label: variant.label, path })),
    fixedZones: fixedZones.map(zone => ringsPath(frame, featureRings(zone.feature))).filter(Boolean),
    context: contextPaths,
    dots,
    focus: focusDots,
    scale: scaleBar(frame),
    sectors: [...new Set([...focusDots, ...dots].map(entry => entry.sector))]
      .sort((a, b) => ['Government', 'Catholic', 'Independent'].indexOf(a) - ['Government', 'Catholic', 'Independent'].indexOf(b)),
  };
}
