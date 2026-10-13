import { GRADE_KEYS, type GradeKey, type School } from '@/types/school';

// What a school page says beyond the bare profile fields. Everything here is
// arithmetic over official ACARA values — counts, shares and comparisons of
// size. Nothing ranks a school or scores its quality, and a rule that cannot
// be decided from the data returns nothing rather than a softened guess.

export interface Cohort {
  key: GradeKey;
  /** null = the year level is offered but ACARA publishes no count. */
  count: number | null;
}

/** Offered year levels in teaching order. */
export function gradeCohorts(school: Pick<School, 'grade_enrolments'>): Cohort[] {
  const grades = school.grade_enrolments;
  if (!grades) return [];
  return GRADE_KEYS.filter(key => key in grades).map(key => ({ key, count: grades[key] ?? null }));
}

/**
 * The name each state gives the year before Year 1. ACARA's key for it is
 * state-neutral; a parent only recognises their own state's word.
 */
const FOUNDATION_LABELS: Record<string, string> = {
  NSW: 'K', ACT: 'K', VIC: 'Prep', QLD: 'Prep', TAS: 'Prep', SA: 'R', WA: 'PP', NT: 'T',
};

/** Short axis label. Ungraded and pre-foundation years return null: those need a translated word. */
export function gradeShortLabel(key: GradeKey, state: string): string | null {
  if (key === 'one_year_before_year_1') return FOUNDATION_LABELS[state] ?? 'F';
  const year = /^year_(\d+)$/.exec(key);
  return year ? year[1] : null;
}

/**
 * Students per teacher, both in full-time equivalents.
 *
 * Calculated here, not published by ACARA as a field — the page labels it so.
 * It is a school-wide average and says nothing about any one class's size.
 */
export function studentsPerTeacher(school: Pick<School, 'enrolments_fte' | 'staff'>): number | null {
  const students = school.enrolments_fte;
  const teachers = school.staff?.teaching_fte;
  if (!Number.isFinite(students) || !Number.isFinite(teachers)) return null;
  if (Number(students) <= 0 || Number(teachers) <= 0) return null;
  return Math.round((Number(students) / Number(teachers)) * 10) / 10;
}

/** Whole-number share of `sortedAscending` strictly below `value`. */
export function percentBelow(sortedAscending: number[], value: number): number {
  if (sortedAscending.length === 0) return 0;
  let low = 0;
  let high = sortedAscending.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedAscending[mid] < value) low = mid + 1;
    else high = mid;
  }
  return Math.round((low / sortedAscending.length) * 100);
}

/** Whole-number share of `sortedAscending` strictly above `value`. */
export function percentAbove(sortedAscending: number[], value: number): number {
  if (sortedAscending.length === 0) return 0;
  const above = sortedAscending.filter(entry => entry > value).length;
  return Math.round((above / sortedAscending.length) * 100);
}

export type Highlight =
  | { kind: 'special' }
  | { kind: 'girlsOnly' | 'boysOnly'; count: number }
  | { kind: 'onlySchoolInSuburb' }
  | { kind: 'onlySectorInSuburb'; total: number }
  | { kind: 'large' | 'small'; percent: number; poolSize: number }
  | { kind: 'remote'; geolocation: string }
  | { kind: 'lbote'; percent: number }
  | { kind: 'indigenous'; percent: number }
  | { kind: 'entryYear'; year: number; count: number; previousCount: number }
  | { kind: 'multiCampus' };

export interface HighlightContext {
  /** Every school in the same suburb, this one included. */
  suburbSchools: Pick<School, 'id' | 'sector'>[];
  /** Enrolments of same-state, same-type schools, ascending. */
  sizePool: number[];
}

// Below this a single-sex roll can be coincidence: a twelve-student remote
// school whose pupils all happen to be boys is not a boys' school.
const SINGLE_SEX_MIN_ENROLMENTS = 100;
// A percentile over a handful of schools is noise.
const SIZE_POOL_MIN = 20;
const SIZE_EXTREME_PERCENT = 90;
const MAX_HIGHLIGHTS = 4;

/**
 * The largest step up between consecutive year levels, where it is big enough
 * to be an intake rather than drift — the Year 7 entry at a K-12 school, or
 * Year 11 at a senior college that also runs a small middle school.
 */
export function entryYear(cohorts: Cohort[]): { year: number; count: number; previousCount: number } | null {
  const byYear = new Map<number, number>();
  for (const cohort of cohorts) {
    const match = /^year_(\d+)$/.exec(cohort.key);
    if (match && cohort.count !== null) byYear.set(Number(match[1]), cohort.count);
  }

  let best: { year: number; count: number; previousCount: number } | null = null;
  for (const [year, count] of byYear) {
    const previousCount = byYear.get(year - 1);
    if (previousCount === undefined || previousCount < 1) continue;
    if (count < previousCount * 1.5 || count - previousCount < 20) continue;
    if (!best || count - previousCount > best.count - best.previousCount) {
      best = { year, count, previousCount };
    }
  }
  return best;
}

/**
 * What sets this school apart, most structural fact first.
 *
 * This is what stops 11,000 pages reading as one template: a page leads with
 * whichever of these are true for its school, and most schools trigger a
 * different handful. Returns an empty list for an unremarkable profile — the
 * section is then omitted, never padded.
 */
export function schoolHighlights(school: School, context: HighlightContext): Highlight[] {
  const highlights: Highlight[] = [];
  const total = Number(school.total_enrolments);

  if (school.school_type === 'Special') highlights.push({ kind: 'special' });

  if (Number.isFinite(total) && total >= SINGLE_SEX_MIN_ENROLMENTS) {
    if (school.boys === 0 && school.girls === total) highlights.push({ kind: 'girlsOnly', count: total });
    if (school.girls === 0 && school.boys === total) highlights.push({ kind: 'boysOnly', count: total });
  }

  const suburbTotal = context.suburbSchools.length;
  if (suburbTotal === 1) {
    highlights.push({ kind: 'onlySchoolInSuburb' });
  } else if (
    suburbTotal >= 3
    && context.suburbSchools.filter(peer => peer.sector === school.sector).length === 1
  ) {
    highlights.push({ kind: 'onlySectorInSuburb', total: suburbTotal });
  }

  const entry = entryYear(gradeCohorts(school));
  if (entry) highlights.push({ kind: 'entryYear', ...entry });

  if (Number.isFinite(total) && context.sizePool.length >= SIZE_POOL_MIN) {
    const below = percentBelow(context.sizePool, total);
    const above = percentAbove(context.sizePool, total);
    if (below >= SIZE_EXTREME_PERCENT) {
      highlights.push({ kind: 'large', percent: below, poolSize: context.sizePool.length });
    } else if (above >= SIZE_EXTREME_PERCENT) {
      highlights.push({ kind: 'small', percent: above, poolSize: context.sizePool.length });
    }
  }

  if (school.geolocation === 'Remote' || school.geolocation === 'Very Remote') {
    highlights.push({ kind: 'remote', geolocation: school.geolocation });
  }

  if (Number(school.lbote_yes_percent) >= 60) {
    highlights.push({ kind: 'lbote', percent: Number(school.lbote_yes_percent) });
  }
  if (Number(school.indigenous_percent) >= 50) {
    highlights.push({ kind: 'indigenous', percent: Number(school.indigenous_percent) });
  }

  if (school.campus_type === 'School Head Campus') highlights.push({ kind: 'multiCampus' });

  return highlights.slice(0, MAX_HIGHLIGHTS);
}

// --- Neighbourhood diagram ----------------------------------------------------

export interface KmPoint { x: number; y: number }

/**
 * Offset from an origin in kilometres, east and south positive (SVG axes).
 *
 * Equirectangular about the origin's latitude: the error is far below a pixel
 * over the tens of kilometres a neighbourhood diagram spans.
 */
export function kmOffset(origin: { lat: number; lng: number }, point: { lat: number; lng: number }): KmPoint {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * kmPerDegLng,
    y: (origin.lat - point.lat) * kmPerDegLat,
  };
}

/** Ring spacing of 1, 2 or 5 × 10ⁿ km that puts two to four rings inside `radiusKm`. */
export function ringStepKm(radiusKm: number): number {
  const target = radiusKm / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const candidates = [1, 2, 5, 10].map(multiple => multiple * magnitude);
  return candidates.reduce((best, step) => (
    Math.abs(step - target) < Math.abs(best - target) ? step : best
  ));
}
