import { describe, expect, it } from 'vitest';
import { mergeZoneSections } from './zoneSections';

const variant = (kind: string, year_levels: string[]) => ({ kind, year_levels });
const section = (kind: string, years: string[], inside: string[]) => ({
  catchment: variant(kind, years),
  inside,
  suburbs: [],
});

describe('mergeZoneSections', () => {
  it('collapses year-level variants that contain the same schools', () => {
    // Box Hill High School: three VIC secondary boundaries, one set of schools.
    const merged = mergeZoneSections([
      section('secondary', ['7', '8', '10', '12'], ['a', 'b']),
      section('secondary', ['9'], ['b', 'a']),
      section('secondary', ['11'], ['a', 'b']),
    ], id => id);

    expect(merged).toHaveLength(1);
    expect(merged[0].catchments).toHaveLength(3);
    expect(merged[0].distinguishingYears).toBeNull();
  });

  it('labels same-kind sections by year when their schools differ', () => {
    const merged = mergeZoneSections([
      section('secondary', ['7', '8', '9', '10'], ['a']),
      section('secondary', ['11', '12'], ['a', 'b']),
    ], id => id);

    expect(merged.map(entry => entry.distinguishingYears)).toEqual([
      ['7', '8', '9', '10'],
      ['11', '12'],
    ]);
  });

  it('never merges across kinds, even with identical schools', () => {
    const merged = mergeZoneSections([
      section('primary', ['K', '1'], ['a']),
      section('secondary', ['7'], ['a']),
    ], id => id);

    expect(merged.map(entry => entry.kind)).toEqual(['primary', 'secondary']);
    expect(merged.every(entry => entry.distinguishingYears === null)).toBe(true);
  });
});
