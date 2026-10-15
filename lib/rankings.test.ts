import { describe, expect, it } from 'vitest';
import { parseRankingSlug, rankingSlug, topByIcsea } from './rankings';

const school = (name: string, icsea?: number) => ({ school_name: name, icsea });

describe('ranking slugs', () => {
  it('round-trips every type, with and without a sector', () => {
    for (const key of [
      { schoolType: 'Primary', sector: null },
      { schoolType: 'Secondary', sector: 'Government' },
      { schoolType: 'Combined', sector: 'Independent' },
    ] as const) {
      expect(parseRankingSlug(rankingSlug(key))).toEqual(key);
    }
    expect(rankingSlug({ schoolType: 'Primary', sector: 'Catholic' })).toBe('primary-catholic');
  });

  it('rejects anything it would not build', () => {
    expect(parseRankingSlug('special')).toBeNull();
    expect(parseRankingSlug('primary-private')).toBeNull();
    expect(parseRankingSlug('primary-government-x')).toBeNull();
    expect(parseRankingSlug('Primary')).toBeNull();
  });
});

describe('topByIcsea', () => {
  it('ranks only schools with a value, highest first', () => {
    const result = topByIcsea([school('A', 1000), school('B'), school('C', 1100), school('D', 900)], 10, 3);
    expect(result?.ranked).toBe(3);
    expect(result?.rows.map(row => [row.school.school_name, row.rank])).toEqual([['C', 1], ['A', 2], ['D', 3]]);
  });

  it('keeps every school tied at the cut-off', () => {
    const result = topByIcsea([school('A', 1100), school('B', 1000), school('C', 1000), school('D', 900)], 2, 3);
    expect(result?.rows.map(row => [row.school.school_name, row.rank])).toEqual([['A', 1], ['B', 2], ['C', 2]]);
  });

  it('declines a group too small to rank', () => {
    expect(topByIcsea([school('A', 1000), school('B', 1100), school('C')], 10, 3)).toBeNull();
  });
});
