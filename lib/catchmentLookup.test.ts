import { describe, expect, it } from 'vitest';
import {
  bboxContains,
  candidatesAt,
  catchmentGeometryUrl,
  pointInGeometry,
  pointInPolygon,
  pointInRing,
  type CatchmentIndex,
  type Ring,
} from './catchmentLookup';

/** Unit square, closed. */
const square: Ring = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
/** Hole covering the middle. */
const hole: Ring = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]];

describe('pointInRing', () => {
  it('accepts an interior point', () => {
    expect(pointInRing([5, 5], square)).toBe(true);
  });

  it('rejects points outside on every side', () => {
    expect(pointInRing([-1, 5], square)).toBe(false);
    expect(pointInRing([11, 5], square)).toBe(false);
    expect(pointInRing([5, -1], square)).toBe(false);
    expect(pointInRing([5, 11], square)).toBe(false);
  });

  it('handles a concave ring', () => {
    // A 'C' shape: the notch on the right is outside despite being within the bbox.
    const c: Ring = [[0, 0], [0, 10], [10, 10], [10, 8], [2, 8], [2, 2], [10, 2], [10, 0], [0, 0]];
    expect(pointInRing([1, 5], c)).toBe(true);
    expect(pointInRing([6, 5], c)).toBe(false);
  });

  it('handles real-world negative latitudes', () => {
    const nsw: Ring = [[151.0, -34.0], [151.0, -33.0], [152.0, -33.0], [152.0, -34.0], [151.0, -34.0]];
    expect(pointInRing([151.5, -33.5], nsw)).toBe(true);
    expect(pointInRing([150.5, -33.5], nsw)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('excludes points inside a hole', () => {
    expect(pointInPolygon([5, 5], [square, hole])).toBe(false);
    expect(pointInPolygon([1, 1], [square, hole])).toBe(true);
  });

  it('returns false for empty ring lists', () => {
    expect(pointInPolygon([5, 5], [])).toBe(false);
  });
});

describe('pointInGeometry', () => {
  it('handles Polygon', () => {
    expect(pointInGeometry([5, 5], { type: 'Polygon', coordinates: [square] })).toBe(true);
  });

  it('handles MultiPolygon by matching any part', () => {
    const far: Ring = [[100, 100], [100, 110], [110, 110], [110, 100], [100, 100]];
    const geometry = { type: 'MultiPolygon' as const, coordinates: [[square], [far]] };
    expect(pointInGeometry([5, 5], geometry)).toBe(true);
    expect(pointInGeometry([105, 105], geometry)).toBe(true);
    expect(pointInGeometry([50, 50], geometry)).toBe(false);
  });
});

describe('bboxContains', () => {
  it('is inclusive of the edges, because index bboxes are rounded outward', () => {
    expect(bboxContains([0, 0, 10, 10], [0, 0])).toBe(true);
    expect(bboxContains([0, 0, 10, 10], [10, 10])).toBe(true);
    expect(bboxContains([0, 0, 10, 10], [10.0001, 5])).toBe(false);
  });
});

describe('candidatesAt', () => {
  const index: CatchmentIndex = {
    state: 'NSW',
    data_year: 2026,
    source_url: 'https://example.invalid',
    attribution: 'NSW Department of Education',
    licence: 'CC-BY',
    catchments: [
      { location_age_id: 1, acara_sml_id: 11, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [150, -34, 151, -33] },
      { location_age_id: 2, acara_sml_id: 22, kind: 'secondary', catch_type: 'HIGH_COED', year_levels: ['7'], bbox: [150.5, -33.8, 152, -33.2] },
      { location_age_id: 3, acara_sml_id: 33, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [140, -37, 141, -36] },
    ],
  };

  it('returns every catchment whose bbox covers the point, across kinds', () => {
    const hits = candidatesAt(index, [150.7, -33.5]);
    expect(hits.map(entry => entry.location_age_id)).toEqual([1, 2]);
  });

  it('returns nothing far from any catchment', () => {
    expect(candidatesAt(index, [145, -30])).toEqual([]);
  });
});

describe('catchmentGeometryUrl', () => {
  it('matches the filename the build script emits', () => {
    expect(catchmentGeometryUrl({ location_age_id: 50321, kind: 'primary' }))
      .toBe('/data/catchment/nsw/50321-primary.json');
  });
});
