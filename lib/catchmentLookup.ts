import { CatchmentKind } from '@/types/school';

export interface CatchmentIndexEntry {
  /** Lowercase state slug, e.g. 'nsw'. Decides which directory holds the geometry. */
  state: string;
  location_age_id: number;
  acara_sml_id: number;
  kind: CatchmentKind;
  catch_type: string;
  year_levels: string[];
  /** Stable identity for one distinct boundary variant. Absent on legacy NSW/SA indexes. */
  zone_id?: string;
  /** Published geometry path. Absent on legacy indexes, whose filename is deterministic. */
  geometry_url?: string;
  effective_year?: number;
  /** [minLng, minLat, maxLng, maxLat], rounded outward — a prefilter, not a boundary. */
  bbox: [number, number, number, number];
}

export interface CatchmentIndex {
  state: string;
  data_year: number;
  source_url: string;
  attribution: string;
  licence: string;
  catchments: CatchmentIndexEntry[];
}

export type Ring = [number, number][];
export interface PolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Ring[] | Ring[][];
}

export interface CatchmentFeature {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: {
    location_age_id: number;
    acara_sml_id: number;
    school_name: string;
    kind: CatchmentKind;
    catch_type: string;
    year_levels: string[];
    zone_id?: string;
    effective_year?: number;
    data_year: number;
    source_url: string;
    attribution: string;
  };
}

/**
 * Ray-casting point-in-ring test.
 *
 * Points exactly on an edge are not guaranteed either way — floating point makes
 * that undecidable in general. Callers must treat near-boundary results as
 * advisory and point users at the official School Finder, which is what the
 * NSW department itself says to do.
 */
export function pointInRing(point: [number, number], ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = (yi > y) !== (yj > y);
    if (!straddles) continue;
    const intersectX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < intersectX) inside = !inside;
  }

  return inside;
}

/** A point is in a polygon when it is inside the outer ring and outside every hole. */
export function pointInPolygon(point: [number, number], rings: Ring[]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

export function pointInGeometry(point: [number, number], geometry: PolygonGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(point, geometry.coordinates as Ring[]);
  }
  return (geometry.coordinates as Ring[][]).some(polygon => pointInPolygon(point, polygon));
}

export function bboxContains(bbox: [number, number, number, number], point: [number, number]): boolean {
  const [lng, lat] = point;
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Narrow the index to catchments whose bbox contains the point.
 *
 * Scanning ~2,150 bounding boxes is sub-millisecond, and it typically leaves a
 * handful of candidates — few enough that fetching their full-precision geometry
 * on demand is cheap. This is why no spatial grid is needed.
 */
export function candidatesAt(entries: CatchmentIndexEntry[], point: [number, number]): CatchmentIndexEntry[] {
  return entries.filter(entry => bboxContains(entry.bbox, point));
}

/**
 * Identify one published state's overall zone envelope for no-result copy.
 *
 * This does not claim the point is inside a zone. It only lets the UI explain
 * why a miss inside a state's collected area means something different there.
 * An overlap stays unknown rather than choosing one state arbitrarily.
 */
export function catchmentStateAt(
  entries: CatchmentIndexEntry[],
  point: [number, number],
): string | null {
  const extents = new Map<string, [number, number, number, number]>();
  for (const entry of entries) {
    const current = extents.get(entry.state);
    if (!current) {
      extents.set(entry.state, [...entry.bbox]);
      continue;
    }
    current[0] = Math.min(current[0], entry.bbox[0]);
    current[1] = Math.min(current[1], entry.bbox[1]);
    current[2] = Math.max(current[2], entry.bbox[2]);
    current[3] = Math.max(current[3], entry.bbox[3]);
  }

  const matches = [...extents.entries()]
    .filter(([, bbox]) => bboxContains(bbox, point))
    .map(([state]) => state);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * States with a published intake-zone layer, in the order they were added.
 *
 * A constant rather than a fetched manifest: a state arrives with a build
 * script and a copy change anyway, so there is nothing here a round trip could
 * learn that the code does not already state. Loaders must tolerate a state
 * listed here whose data has not been built yet.
 */
export const CATCHMENT_STATES = ['nsw', 'sa', 'vic'] as const;

export type ZoneOverlayKind =
  | 'off'
  | 'primary'
  | 'secondary-unspecified'
  | 'year-7'
  | 'year-8'
  | 'year-9'
  | 'year-10'
  | 'year-11'
  | 'year-12';

export interface ViewportBounds { west: number; south: number; east: number; north: number }

/**
 * Zones of one kind whose bbox overlaps a viewport.
 *
 * The browse overlay's candidate step. Pure and separate from the fetching so
 * the cap that protects it can be tested without a network.
 */
export function zonesInBounds(
  entries: CatchmentIndexEntry[],
  bounds: ViewportBounds,
  overlay: Exclude<ZoneOverlayKind, 'off'>,
): CatchmentIndexEntry[] {
  return entries.filter(entry => {
    if (overlay === 'primary') {
      if (entry.kind !== 'primary') return false;
    } else if (overlay === 'secondary-unspecified') {
      if (entry.kind !== 'secondary' || entry.year_levels.length > 0) return false;
    } else {
      const year = overlay.slice('year-'.length);
      if (entry.kind !== 'secondary' || !entry.year_levels.includes(year)) return false;
    }
    const [west, south, east, north] = entry.bbox;
    return !(east < bounds.west || west > bounds.east || north < bounds.south || south > bounds.north);
  });
}

export function catchmentGeometryUrl(
  entry: { state: string; location_age_id: number; kind: CatchmentKind; geometry_url?: string },
): string {
  return entry.geometry_url ?? `/data/catchment/${entry.state}/${entry.location_age_id}-${entry.kind}.json`;
}
