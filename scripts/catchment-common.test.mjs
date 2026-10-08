import { describe, expect, it } from 'vitest';
import * as common from './catchment-common.mjs';

describe('normaliseName', () => {
  it('normalises deterministic punctuation and case without fuzzy matching', () => {
    expect(common.normaliseName("St John's & District School")).toBe('st john s district school');
    expect(common.normaliseName('Unley High School')).not.toBe(common.normaliseName('Unley Hgh School'));
  });
});

describe('parseCsv', () => {
  it('handles a BOM, quoted commas and escaped quotes', () => {
    expect(common.parseCsv('\uFEFFid,name\r\n1,"Park, North"\r\n2,"The ""Village"" School"\r\n')).toEqual([
      { id: '1', name: 'Park, North' },
      { id: '2', name: 'The "Village" School' },
    ]);
  });
});

describe('geometryAreaKm2', () => {
  it('measures polygon area and subtracts holes', () => {
    expect(common.geometryAreaKm2).toBeTypeOf('function');
    if (typeof common.geometryAreaKm2 !== 'function') return;

    const outer = [[138.0, -35.0], [138.01, -35.0], [138.01, -34.99], [138.0, -34.99], [138.0, -35.0]];
    const hole = [[138.002, -34.998], [138.008, -34.998], [138.008, -34.992], [138.002, -34.992], [138.002, -34.998]];
    const full = common.geometryAreaKm2({ type: 'Polygon', coordinates: [outer] });
    const withHole = common.geometryAreaKm2({ type: 'Polygon', coordinates: [outer, hole] });

    expect(full).toBeGreaterThan(0.9);
    expect(full).toBeLessThan(1.2);
    expect(withHole).toBeGreaterThan(0);
    expect(withHole).toBeLessThan(full);
  });
});

describe('groupExactGeometryVariants', () => {
  const polygon = (east) => ({
    type: 'Polygon',
    coordinates: [[[144, -38], [east, -38], [east, -37], [144, -38]]],
  });

  it('coalesces only byte-identical geometry and unions published source fields', () => {
    expect(common.groupExactGeometryVariants([
      { geometry: polygon(145), year_levels: ['7'], catch_type: 'JUNIOR', source_school_code: '1000' },
      { geometry: polygon(145), year_levels: ['8'], catch_type: 'JUNIOR', source_school_code: '1000' },
      { geometry: polygon(146), year_levels: ['9'], catch_type: 'JUNIOR', source_school_code: '1000' },
    ])).toEqual([
      {
        geometry: polygon(145),
        year_levels: ['7', '8'],
        catch_types: ['JUNIOR'],
        source_school_codes: ['1000'],
      },
      {
        geometry: polygon(146),
        year_levels: ['9'],
        catch_types: ['JUNIOR'],
        source_school_codes: ['1000'],
      },
    ]);
  });
});

describe('shared validation helpers', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];

  it('checks a bbox against a state envelope, edges inclusive', () => {
    const envelope = { minLng: 140, minLat: -38, maxLng: 150, maxLat: -28 };
    expect(common.bboxWithin([140, -38, 150, -28], envelope)).toBe(true);
    expect(common.bboxWithin([139.9, -37, 145, -30], envelope)).toBe(false);
  });

  it('treats a ring as closed only with four positions ending where it starts', () => {
    expect(common.ringIsClosed(ring)).toBe(true);
    expect(common.ringIsClosed([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(common.ringIsClosed([[0, 0], [1, 1], [0, 0]])).toBe(false);
  });

  it('visits polygon and multipolygon rings and reports any other type', () => {
    const seen = [];
    expect(common.eachRing({ type: 'MultiPolygon', coordinates: [[ring], [ring, ring]] }, (r) => seen.push(r))).toBe(true);
    expect(seen).toHaveLength(3);
    expect(common.eachRing({ type: 'Point', coordinates: [0, 0] }, () => {})).toBe(false);
  });

  it('gives different geometry a different variant slug', () => {
    const a = common.variantSlug('secondary', ['7', '8'], { type: 'Polygon', coordinates: [ring] });
    const b = common.variantSlug('secondary', ['7', '8'], { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] });
    expect(a).toMatch(/^secondary-years-7-8-[0-9a-f]{10}$/);
    expect(a).not.toBe(b);
  });
});
