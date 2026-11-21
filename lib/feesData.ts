import ledger from '@/data/fees/processed/fees.json';

/**
 * Published fees per school, read from the fees ledger
 * (data/fees/processed/fees.json, spec docs/specs/2026-11-12-school-fees-design.md).
 *
 * Imported rather than read off disk so the bundler ships it with the server
 * pages. Server only: it is half a megabyte the map app never needs.
 */

export interface FeeRow {
  years: string;
  tuition?: number;
  total?: number;
  per_term?: number;
  terms?: number;
  child_2?: number;
  child_3?: number;
  child_4?: number;
}

export interface FeeComponent {
  name: string;
  unit: 'per_student' | 'per_family';
  period?: 'annual' | 'per_term' | 'per_semester';
  terms?: number;
  amount?: number;
  by_year?: { years: string; amount: number }[];
  note?: string;
}

export interface OneOffFee {
  item: string;
  aud: number;
}

export interface PublishedFees {
  fee_year: number | null;
  year_note?: string;
  billing_unit?: 'per_student' | 'per_family';
  basis: string;
  by_year: FeeRow[];
  components?: FeeComponent[];
  other_compulsory?: string | null;
  sibling?: string;
  sibling_amounts_basis?: 'per_child' | 'family_total';
  one_off?: OneOffFee[];
  concession?: string;
  boarding?: string;
  /**
   * A time-limited discount the school applies to everyone eligible. The
   * figures stay at the published full price; this line says what comes off.
   */
  discount?: string;
  notes?: string;
  source: 'school_website' | 'scs_endpoint' | 'diocese_schedule';
  source_url: string;
}

/** A school whose published fee structure does not fit an annual table. */
export interface DescribedFees {
  fee_year: number | null;
  year_note?: string;
  pricing_model:
    | 'per_term_unspecified'
    | 'by_program'
    | 'income_tiered'
    | 'family_combination'
    | 'estimator_only'
    | 'custom';
  summary: string;
  source: 'school_website' | 'scs_endpoint' | 'diocese_schedule';
  source_url: string;
}

/** A school that says in its own words that it charges no tuition. */
export interface FeeFree {
  statement: string;
  source_url: string;
}

/**
 * What the ledger knows about one school. `missing` is a school never
 * attempted; every other status is an attempt with a recorded outcome, and the
 * page words them differently because "the school does not publish fees" and
 * "we have not looked yet" are different facts.
 */
export type FeeRecord = (
  | { status: 'found'; checked: string; fees: PublishedFees }
  | { status: 'described'; checked: string; described: DescribedFees }
  | { status: 'fee_free'; checked: string; free: FeeFree }
  | { status: 'not_published'; checked: string }
  | { status: 'unavailable'; checked: string }
  | { status: 'missing' }
) & {
  /** Set on a sub-campus: the record is its parent school's, named here so the page says so. */
  campusOf?: string;
};

type LedgerEntry = {
  status: string;
  checked: string;
  fees?: PublishedFees;
  fees_description?: DescribedFees;
  free?: FeeFree;
  parent_acara_sml_id?: number;
  parent_name?: string;
};
const schools = (ledger as unknown as { schools: Record<string, LedgerEntry> }).schools;

export function getFeeRecord(acaraId: number): FeeRecord {
  const entry = schools[String(acaraId)];
  if (!entry) return { status: 'missing' };
  // A sub-campus has no fee schedule of its own; it is part of its parent school.
  if (entry.status === 'campus' && entry.parent_acara_sml_id != null) {
    const parent = schools[String(entry.parent_acara_sml_id)];
    const record: FeeRecord = parent && parent.status !== 'campus'
      ? getFeeRecord(entry.parent_acara_sml_id)
      : { status: 'unavailable', checked: entry.checked };
    return { ...record, campusOf: entry.parent_name };
  }
  if (entry.status === 'found' && entry.fees) return { status: 'found', checked: entry.checked, fees: entry.fees };
  if (entry.status === 'described' && entry.fees_description) {
    return { status: 'described', checked: entry.checked, described: entry.fees_description };
  }
  if (entry.status === 'fee_free' && entry.free) return { status: 'fee_free', checked: entry.checked, free: entry.free };
  if (entry.status === 'not_published') return { status: 'not_published', checked: entry.checked };
  return { status: 'unavailable', checked: entry.checked };
}

/** Whether the primary schedule figure is charged per household rather than per student. */
export function isPerFamilyFee(fees: PublishedFees): boolean {
  return fees.billing_unit === 'per_family'
    || (!fees.billing_unit && /charged per family, not per child/i.test(fees.basis));
}

/** Whether the schedule includes explicit multi-child columns (2nd/3rd/4th+ child). */
export function hasSiblingRows(fees: PublishedFees): boolean {
  return fees.by_year.some(row => row.child_2 != null || row.child_3 != null || row.child_4 != null);
}

/** What figure type a row carries as its primary amount. */
export function rowFigureKind(row: FeeRow): 'total' | 'tuition' | 'per_term' | null {
  if (row.total != null) return 'total';
  if (row.tuition != null) return 'tuition';
  if (row.per_term != null && row.terms != null) return 'per_term';
  return null;
}

/** The row covering Year 7, else the first secondary row, else the first row. */
export function leadFeeRow(fees: PublishedFees): FeeRow | null {
  const covers = (row: FeeRow, year: number) => {
    const [low, high = low] = row.years.split('-');
    return /^\d+$/.test(low) && /^\d+$/.test(high) && Number(low) <= year && year <= Number(high);
  };
  return fees.by_year.find(row => covers(row, 7))
    ?? fees.by_year.find(row => [8, 9, 10, 11, 12].some(year => covers(row, year)))
    ?? fees.by_year[0]
    ?? null;
}

/** The figure a row is compared on: the published total when there is one. */
export function annualFigure(row: FeeRow): number | null {
  if (row.total != null) return row.total;
  if (row.tuition != null) return row.tuition;
  if (row.per_term != null && row.terms != null) return row.per_term * row.terms;
  return null;
}
