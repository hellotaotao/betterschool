import { describe, expect, it } from 'vitest';
import * as common from './catchment-common.mjs';

describe('normaliseName', () => {
  it('normalises deterministic punctuation and case without fuzzy matching', () => {
    expect(common.normaliseName("St John's & District School")).toBe('st john s district school');
    expect(common.normaliseName('Unley High School')).not.toBe(common.normaliseName('Unley Hgh School'));
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
