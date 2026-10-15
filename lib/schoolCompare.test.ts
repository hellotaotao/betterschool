import { describe, expect, it } from 'vitest';
import { displayRanks, metricValue, rankAmong, sortByMetric } from './schoolCompare';

const school = (name: string, values: { icsea?: number; total_enrolments?: number; enrolments_fte?: number; teaching_fte?: number }) => ({
  school_name: name,
  icsea: values.icsea,
  total_enrolments: values.total_enrolments,
  enrolments_fte: values.enrolments_fte,
  staff: values.teaching_fte === undefined ? undefined : { teaching_fte: values.teaching_fte },
});

describe('metricValue', () => {
  it('reads ICSEA and enrolments, and calculates students per teacher', () => {
    const s = school('A', { icsea: 1100, total_enrolments: 500, enrolments_fte: 480, teaching_fte: 32 });
    expect(metricValue(s, 'icsea')).toBe(1100);
    expect(metricValue(s, 'enrolments')).toBe(500);
    expect(metricValue(s, 'ratio')).toBe(15);
  });

  it('returns null rather than zero when a field is missing', () => {
    const s = school('A', {});
    expect(metricValue(s, 'icsea')).toBeNull();
    expect(metricValue(s, 'ratio')).toBeNull();
  });
});

describe('rankAmong', () => {
  it('ranks from the top for a descending metric', () => {
    expect(rankAmong([1000, 1100, 1200, null], 1100, 'desc')).toEqual({ rank: 2, of: 3 });
  });

  it('ranks from the bottom for an ascending metric', () => {
    expect(rankAmong([12, 15, 18], 12, 'asc')).toEqual({ rank: 1, of: 3 });
  });

  it('gives tied values the same rank', () => {
    expect(rankAmong([1100, 1100, 1000], 1100, 'desc')).toEqual({ rank: 1, of: 3 });
  });

  it('refuses a rank without a value or in a group too small to mean anything', () => {
    expect(rankAmong([1000, 1100, 1200], null, 'desc')).toBeNull();
    expect(rankAmong([1000, 1100, null], 1100, 'desc')).toBeNull();
  });
});

describe('sortByMetric and displayRanks', () => {
  const list = [
    school('Bravo', { icsea: 1050 }),
    school('Alpha', { icsea: 1100 }),
    school('Delta', {}),
    school('Charlie', { icsea: 1100 }),
  ];

  it('puts the highest ICSEA first, breaks ties by name, and missing values last', () => {
    expect(sortByMetric(list, 'icsea').map(s => s.school_name)).toEqual(['Alpha', 'Charlie', 'Bravo', 'Delta']);
  });

  it('shares a rank between tied schools and leaves an unvalued school unranked', () => {
    expect(displayRanks(sortByMetric(list, 'icsea'), 'icsea')).toEqual([1, 1, 3, null]);
  });
});
