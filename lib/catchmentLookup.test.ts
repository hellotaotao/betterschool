import { describe, expect, it } from 'vitest';
import {
  bboxContains,
  candidatesAt,
  catchmentGeometryUrl,
  pointInGeometry,
  zonesInBounds,
  pointInPolygon,
  pointInRing,
  type CatchmentIndex,
  type Ring,
  type CatchmentIndexEntry,
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
      { state: 'nsw', location_age_id: 1, acara_sml_id: 11, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [150, -34, 151, -33] },
      { state: 'nsw', location_age_id: 2, acara_sml_id: 22, kind: 'secondary', catch_type: 'HIGH_COED', year_levels: ['7'], bbox: [150.5, -33.8, 152, -33.2] },
      { state: 'nsw', location_age_id: 3, acara_sml_id: 33, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [140, -37, 141, -36] },
      { state: 'sa', location_age_id: 4, acara_sml_id: 44, kind: 'primary', catch_type: 'PRIM', year_levels: ['R'], bbox: [138.5, -35, 138.7, -34.8] },
    ],
  };

  it('returns every catchment whose bbox covers the point, across kinds', () => {
    const hits = candidatesAt(index.catchments, [150.7, -33.5]);
    expect(hits.map(entry => entry.location_age_id)).toEqual([1, 2]);
  });

  it('returns nothing far from any catchment', () => {
    expect(candidatesAt(index.catchments, [145, -30])).toEqual([]);
  });
});

describe('catchmentGeometryUrl', () => {
  it('matches the filename the build script emits', () => {
    expect(catchmentGeometryUrl({ state: 'nsw', location_age_id: 50321, kind: 'primary' }))
      .toBe('/data/catchment/nsw/50321-primary.json');
  });

  // The entry carries its own state, so one merged index can serve a lookup
  // that straddles a border without the caller tracking which file to read.
  it('routes each state to its own directory', () => {
    expect(catchmentGeometryUrl({ state: 'sa', location_age_id: 1234, kind: 'secondary' }))
      .toBe('/data/catchment/sa/1234-secondary.json');
  });
});

describe('zonesInBounds', () => {
  const entries: CatchmentIndexEntry[] = [
    { state: 'nsw', location_age_id: 1, acara_sml_id: 11, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [151.0, -33.9, 151.1, -33.8] },
    { state: 'nsw', location_age_id: 2, acara_sml_id: 22, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [151.1, -33.9, 151.2, -33.8] },
    { state: 'nsw', location_age_id: 3, acara_sml_id: 33, kind: 'secondary', catch_type: 'HIGH_COED', year_levels: ['7'], bbox: [151.0, -33.9, 151.2, -33.8] },
    { state: 'nsw', location_age_id: 4, acara_sml_id: 44, kind: 'primary', catch_type: 'PRIMARY', year_levels: ['K'], bbox: [149.0, -33.9, 149.1, -33.8] },
  ];
  const view = { west: 151.05, south: -33.88, east: 151.15, north: -33.82 };

  it('returns only the requested kind', () => {
    // Primary and secondary are independent coverages of the same ground, so
    // the overlay draws one at a time; mixing them is what makes it unreadable.
    expect(zonesInBounds(entries, view, 'primary').map(e => e.location_age_id)).toEqual([1, 2]);
    expect(zonesInBounds(entries, view, 'secondary').map(e => e.location_age_id)).toEqual([3]);
  });

  it('excludes zones whose bbox misses the viewport entirely', () => {
    expect(zonesInBounds(entries, view, 'primary').map(e => e.location_age_id)).not.toContain(4);
  });

  it('includes a zone that merely overlaps an edge, since bbox is a prefilter', () => {
    const sliver = { west: 151.09, south: -33.85, east: 151.095, north: -33.84 };
    expect(zonesInBounds(entries, sliver, 'primary').map(e => e.location_age_id)).toEqual([1]);
  });

  it('returns nothing for a viewport nowhere near any zone', () => {
    expect(zonesInBounds(entries, { west: 130, south: -20, east: 131, north: -19 }, 'primary')).toEqual([]);
  });
});
