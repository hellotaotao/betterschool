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
