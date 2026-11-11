import { describe, expect, it } from 'vitest';
import type { CatchmentFeature, Ring } from './catchmentLookup';
import {
  MAP_SIZE,
  bboxesOverlap,
  compactYears,
  contextBounds,
  featureRings,
  fitFrame,
  formatScale,
  overlayPosition,
  project,
  ringsPath,
  scaleBar,
  simplifyLine,
  withinBounds,
} from './heroMap';

const BOX_HILL = { lat: -37.8189, lng: 145.1255 };

describe('fitFrame and project', () => {
  it('gives a lone school a neighbourhood rather than a zoomed-in dot', () => {
    const frame = fitFrame([BOX_HILL]);
    expect(frame.radiusKm).toBeCloseTo(0.9);
    expect(project(frame, BOX_HILL)).toEqual({ x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
  });

  it('centres on the bounding box and keeps every point inside the square', () => {
    const east = { lat: BOX_HILL.lat, lng: BOX_HILL.lng + 0.05 };
    const south = { lat: BOX_HILL.lat - 0.03, lng: BOX_HILL.lng };
    const frame = fitFrame([BOX_HILL, east, south]);
    for (const point of [BOX_HILL, east, south]) {
      const { x, y } = project(frame, point);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(MAP_SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MAP_SIZE);
    }
    // East is right and south is down.
    expect(project(frame, east).x).toBeGreaterThan(project(frame, BOX_HILL).x);
    expect(project(frame, south).y).toBeGreaterThan(project(frame, BOX_HILL).y);
  });

  it('fits zone vertices as well as points', () => {
    const ring: Ring = [[145.10, -37.80], [145.16, -37.80], [145.16, -37.84], [145.10, -37.80]];
    const withZone = fitFrame([BOX_HILL], [ring]);
    expect(withZone.radiusKm).toBeGreaterThan(fitFrame([BOX_HILL]).radiusKm);
  });

  it('refuses an empty focus', () => {
    expect(() => fitFrame([])).toThrow();
  });
});

describe('ringsPath', () => {
  const frame = fitFrame([BOX_HILL]);

  it('drops consecutive points that snap to the same spot and the closing repeat', () => {
    const ring: Ring = [
      [145.12, -37.81], [145.12000001, -37.81], [145.13, -37.81], [145.13, -37.82], [145.12, -37.81],
    ];
    const path = ringsPath(frame, [ring]);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.split('L')).toHaveLength(3);
  });

  it('leaves out a ring too small to draw', () => {
    const speck: Ring = [[145.12, -37.81], [145.1200001, -37.8100001], [145.12, -37.81]];
    expect(ringsPath(frame, [speck])).toBe('');
  });

  it('reads polygons and multipolygons alike', () => {
    const ring: Ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    const polygon = { geometry: { type: 'Polygon', coordinates: [ring] } } as unknown as CatchmentFeature;
    const multi = { geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring, ring]] } } as unknown as CatchmentFeature;
    expect(featureRings(polygon)).toHaveLength(1);
    expect(featureRings(multi)).toHaveLength(3);
  });
});

describe('contextBounds', () => {
  it('reaches past the focus square on every side', () => {
    const frame = fitFrame([BOX_HILL]);
    const bounds = contextBounds(frame);
    expect(withinBounds(bounds, BOX_HILL)).toBe(true);
    expect(withinBounds(bounds, { lat: BOX_HILL.lat, lng: BOX_HILL.lng + 0.02 })).toBe(true);
    expect(withinBounds(bounds, { lat: BOX_HILL.lat, lng: BOX_HILL.lng + 0.2 })).toBe(false);
    expect(bboxesOverlap(bounds, [145.0, -37.9, 145.11, -37.7])).toBe(true);
    expect(bboxesOverlap(bounds, [146.0, -37.9, 146.1, -37.7])).toBe(false);
  });
});

describe('scaleBar', () => {
  it('picks a round distance near 72 drawing units', () => {
    const bar = scaleBar(fitFrame([BOX_HILL]));
    expect([0.1, 0.2, 0.5, 1]).toContain(bar.km);
    expect(bar.units).toBeGreaterThan(30);
    expect(bar.units).toBeLessThan(160);
  });

  it('writes short distances in metres', () => {
    expect(formatScale(0.5)).toEqual({ value: 500, unit: 'm' });
    expect(formatScale(2)).toEqual({ value: 2, unit: 'km' });
  });
});

describe('overlayPosition', () => {
  it('measures across from the centre line and down from the top edge', () => {
    expect(overlayPosition({ x: MAP_SIZE / 2, y: MAP_SIZE / 2 })).toEqual({
      left: 'calc(50% + 0 * var(--u))',
      top: `calc(${MAP_SIZE / 2} * var(--u))`,
    });
    expect(overlayPosition({ x: MAP_SIZE / 2 + 12.34, y: 7.06 })).toEqual({
      left: 'calc(50% + 12.3 * var(--u))',
      top: 'calc(7.1 * var(--u))',
    });
  });
});

describe('compactYears', () => {
  it('collapses runs of three or more and lists the rest', () => {
    expect(compactYears(['P', '1', '2', '3', '4', '5', '6'])).toBe('P–6');
    expect(compactYears(['Preschool', 'K', '1', '2'])).toBe('Preschool–2');
    expect(compactYears(['7', '8', '10', '12'])).toBe('7, 8, 10, 12');
    expect(compactYears(['9', '10', '11', '12', '7', '8'])).toBe('7–12');
    expect(compactYears(['11'])).toBe('11');
    expect(compactYears([])).toBe('');
  });
});

describe('simplifyLine', () => {
  it('drops a zig-zag finer than the tolerance and keeps a real corner', () => {
    const zigzag = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index % 2 === 0 ? 0 : 0.3 }));
    expect(simplifyLine(zigzag, 0.5)).toHaveLength(2);
    const corner = [{ x: 0, y: 0 }, { x: 50, y: 0.2 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(simplifyLine(corner, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });
});
