import type { CatchmentFeature, Ring } from '@/lib/catchmentLookup';
import { kmOffset } from '@/lib/schoolInsights';

/**
 * Geometry for the static hero map on the SEO pages.
 *
 * Pure functions only: the server component does the drawing, this decides
 * where things go, so the arithmetic is tested without rendering.
 */

export interface LngLat {
  lat: number;
  lng: number;
}

/** Side of the square viewBox, in drawing units. */
export const MAP_SIZE = 480;
/** Room left around the focus so its outermost point is not on the edge. */
const MAP_PADDING = 36;
/** A single school still gets a neighbourhood around it, not a zoomed-in dot. */
const MIN_RADIUS_KM = 0.9;

export interface MapFrame {
  origin: LngLat;
  pxPerKm: number;
  /** Half the side of the square that holds the focus, in km. */
  radiusKm: number;
}

/** Every vertex of every ring, outer and holes, of a polygon or multipolygon. */
export function featureRings(feature: CatchmentFeature): Ring[] {
  return feature.geometry.type === 'Polygon'
    ? (feature.geometry.coordinates as Ring[])
    : (feature.geometry.coordinates as Ring[][]).flat();
}

/**
 * The square frame that holds every focus point and zone vertex, centred on
 * their bounding box rather than on any one school, so a zone that sits to one
 * side of its school is not pushed off the picture.
 */
export function fitFrame(points: LngLat[], rings: Ring[] = []): MapFrame {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (lng: number, lat: number) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };
  for (const point of points) visit(point.lng, point.lat);
  for (const ring of rings) for (const [lng, lat] of ring) visit(lng, lat);
  if (!Number.isFinite(minLng)) throw new Error('fitFrame needs at least one point');

  const origin = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const corner = kmOffset(origin, { lat: minLat, lng: maxLng });
  const radiusKm = Math.max(MIN_RADIUS_KM, Math.abs(corner.x), Math.abs(corner.y));
  return { origin, radiusKm, pxPerKm: (MAP_SIZE / 2 - MAP_PADDING) / radiusKm };
}

/** Drawing coordinates, y down; the frame's origin lands in the centre. */
export function project(frame: MapFrame, point: LngLat): { x: number; y: number } {
  const offset = kmOffset(frame.origin, point);
  return {
    x: MAP_SIZE / 2 + offset.x * frame.pxPerKm,
    y: MAP_SIZE / 2 + offset.y * frame.pxPerKm,
  };
}

type Point = { x: number; y: number };

function segmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Douglas–Peucker, iterative so a 20,000-vertex coastline cannot overflow the stack. */
export function simplifyLine(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const candidate = segmentDistance(points[index], points[first], points[last]);
      if (candidate > distance) {
        distance = candidate;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/**
 * SVG path data for rings at the size drawn.
 *
 * Vertices closer than `grid` drawing units to the line through their
 * neighbours are dropped (Douglas–Peucker), then the rest snap to the grid.
 * That is rasterisation, not a simplified boundary: at 480 units across the
 * dropped points move the line by under a pixel, the stored geometry is
 * untouched, and the exact boundary is what the zone lookup runs against.
 * Without it a Tasmanian coastline put a megabyte of invisible zig-zags into
 * one page.
 */
export function ringsPath(frame: MapFrame, rings: Ring[], grid = 0.5): string {
  const snap = (value: number) => Math.round(value / grid) * grid;
  const parts: string[] = [];
  for (const ring of rings) {
    const projected = ring.map(([lng, lat]) => project(frame, { lat, lng }));
    const points: string[] = [];
    let previous = '';
    for (const { x, y } of simplifyLine(projected, grid)) {
      const point = `${snap(x)},${snap(y)}`;
      if (point !== previous) points.push(point);
      previous = point;
    }
    if (points.length > 1 && points[0] === points[points.length - 1]) points.pop();
    if (points.length > 2) parts.push(`M${points.join('L')}Z`);
  }
  return parts.join('');
}

/**
 * [minLng, minLat, maxLng, maxLat] of the area worth drawing context in: the
 * focus square plus `factor` times its radius, which covers the margins a wide
 * or tall figure shows beside the square.
 */
export function contextBounds(frame: MapFrame, factor = 2.4): [number, number, number, number] {
  const km = frame.radiusKm * factor;
  const latSpan = km / 110.574;
  const lngSpan = km / (111.32 * Math.cos((frame.origin.lat * Math.PI) / 180));
  return [frame.origin.lng - lngSpan, frame.origin.lat - latSpan, frame.origin.lng + lngSpan, frame.origin.lat + latSpan];
}

export function bboxesOverlap(a: readonly number[], b: readonly number[]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function withinBounds(bounds: readonly number[], point: LngLat): boolean {
  return point.lng >= bounds[0] && point.lng <= bounds[2] && point.lat >= bounds[1] && point.lat <= bounds[3];
}

/**
 * A scale bar of 1, 2 or 5 × 10ⁿ km (or metres below a kilometre) whose drawn
 * length lands nearest 72 drawing units.
 */
export function scaleBar(frame: MapFrame): { km: number; units: number } {
  const target = 72 / frame.pxPerKm;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const km = [1, 2, 5, 10]
    .map(multiple => multiple * magnitude)
    .reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best));
  return { km, units: km * frame.pxPerKm };
}

export function formatScale(km: number): { value: number; unit: 'km' | 'm' } {
  return km < 1 ? { value: Math.round(km * 1000), unit: 'm' } : { value: km, unit: 'km' };
}

/**
 * CSS `left`/`top` for an HTML overlay at a drawing point. The SVG scales
 * with `meet`, centred across and pinned to the top (xMidYMin), so one
 * drawing unit is `--u` (set from container query units), the viewBox's
 * centre line is the canvas's, and its top edge is the canvas's.
 */
export function overlayPosition(point: { x: number; y: number }): { left: string; top: string } {
  const units = (value: number) => Math.round(value * 10) / 10;
  return {
    left: `calc(50% + ${units(point.x - MAP_SIZE / 2)} * var(--u))`,
    top: `calc(${units(point.y)} * var(--u))`,
  };
}

const YEAR_ORDER: Record<string, number> = { Preschool: -1, K: 0, P: 0 };
const yearIndex = (level: string) => YEAR_ORDER[level] ?? Number(level);

/**
 * Year levels as a short label: runs of three or more collapse to a range
 * ("P–6", "7–12"), anything else is listed ("7, 8, 10, 12"). Sources list them
 * in any order, and a map chip has no room for "K, 1, 2, 3, 4, 5, 6".
 */
export function compactYears(levels: string[]): string {
  const sorted = [...levels]
    .filter(level => Number.isFinite(yearIndex(level)))
    .sort((a, b) => yearIndex(a) - yearIndex(b));
  const parts: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) parts.push(`${run[0]}–${run[run.length - 1]}`);
    else parts.push(...run);
    run = [];
  };
  for (const level of sorted) {
    const last = run[run.length - 1];
    if (last !== undefined && yearIndex(level) !== yearIndex(last) + 1) flush();
    run.push(level);
  }
  flush();
  return parts.join(', ');
}
