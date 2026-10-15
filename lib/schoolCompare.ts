import type { School } from '@/types/school';
import { studentsPerTeacher } from './schoolInsights';

// Side-by-side comparison of schools on sourced fields. Every figure here is
// an official ACARA value or arithmetic over one, and the page names the
// field, the year and the group it is ranked within.

export const COMPARE_METRICS = ['icsea', 'enrolments', 'ratio'] as const;
export type CompareMetric = typeof COMPARE_METRICS[number];

/**
 * Which end of each metric ranks first. Only ICSEA's direction is a reading of
 * the field (higher = more advantaged intake); size and staffing simply list
 * from the largest number and the fewest students per teacher.
 */
export const METRIC_ORDER: Record<CompareMetric, 'desc' | 'asc'> = {
  icsea: 'desc',
  enrolments: 'desc',
  ratio: 'asc',
};

type MetricSource = Pick<School, 'icsea' | 'total_enrolments' | 'enrolments_fte' | 'staff'>;

export function metricValue(school: MetricSource, metric: CompareMetric): number | null {
  const value = metric === 'icsea'
    ? school.icsea
    : metric === 'enrolments'
      ? school.total_enrolments
      : studentsPerTeacher(school);
  return Number.isFinite(value) ? Number(value) : null;
}

export interface Rank {
  /** 1 = first in the metric's order. Tied values share a rank. */
  rank: number;
  /** Schools in the group with a value; schools without one are not ranked. */
  of: number;
}

/**
 * Where `value` falls among `values`, or null when it has no value or the
 * group is too small for a rank to say anything.
 */
export function rankAmong(
  values: readonly (number | null)[],
  value: number | null,
  order: 'desc' | 'asc',
  minGroup = 3,
): Rank | null {
  if (value === null) return null;
  const known = values.filter((entry): entry is number => entry !== null);
  if (known.length < minGroup) return null;
  const ahead = known.filter(entry => (order === 'desc' ? entry > value : entry < value)).length;
  return { rank: ahead + 1, of: known.length };
}

/**
 * Schools ordered by one metric, best first in its order; schools without a
 * value go last, then by name so the order is stable between builds.
 */
export function sortByMetric<T extends MetricSource & Pick<School, 'school_name'>>(
  schools: readonly T[],
  metric: CompareMetric,
): T[] {
  const order = METRIC_ORDER[metric];
  return [...schools].sort((a, b) => {
    const va = metricValue(a, metric);
    const vb = metricValue(b, metric);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) {
      return order === 'desc' ? vb - va : va - vb;
    }
    return a.school_name.localeCompare(b.school_name);
  });
}

/**
 * Display ranks for an already-sorted list: tied values share the rank of the
 * first of them, and a school without a value has none.
 */
export function displayRanks(sorted: readonly MetricSource[], metric: CompareMetric): (number | null)[] {
  const ranks: (number | null)[] = [];
  let previous: number | null = null;
  sorted.forEach((school, index) => {
    const value = metricValue(school, metric);
    if (value === null) {
      ranks.push(null);
      return;
    }
    ranks.push(index > 0 && value === previous ? ranks[index - 1] : index + 1);
    previous = value;
  });
  return ranks;
}
