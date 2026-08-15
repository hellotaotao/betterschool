import { CatchmentKind } from '@/types/school';

export interface CatchmentIndexEntry {
  location_age_id: number;
  acara_sml_id: number;
  kind: CatchmentKind;
  catch_type: string;
  year_levels: string[];
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
export function candidatesAt(index: CatchmentIndex, point: [number, number]): CatchmentIndexEntry[] {
  return index.catchments.filter(entry => bboxContains(entry.bbox, point));
}

export function catchmentGeometryUrl(entry: { location_age_id: number; kind: CatchmentKind }): string {
  return `/data/catchment/nsw/${entry.location_age_id}-${entry.kind}.json`;
}
