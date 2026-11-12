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
}

export interface PublishedFees {
  fee_year: number | null;
  year_note?: string;
  basis: string;
  by_year: FeeRow[];
  other_compulsory?: string | null;
  source: 'school_website' | 'scs_endpoint' | 'diocese_schedule';
  source_url: string;
}

/**
 * What the ledger knows about one school. `missing` is a school never
 * attempted; every other status is an attempt with a recorded outcome, and the
 * page words them differently because "the school does not publish fees" and
 * "we have not looked yet" are different facts.
 */
export type FeeRecord =
  | { status: 'found'; checked: string; fees: PublishedFees }
  | { status: 'not_published'; checked: string }
  | { status: 'unavailable'; checked: string }
  | { status: 'missing' };

type LedgerEntry = { status: string; checked: string; fees?: PublishedFees };
const schools = (ledger as unknown as { schools: Record<string, LedgerEntry> }).schools;

export function getFeeRecord(acaraId: number): FeeRecord {
  const entry = schools[String(acaraId)];
  if (!entry) return { status: 'missing' };
  if (entry.status === 'found' && entry.fees) return { status: 'found', checked: entry.checked, fees: entry.fees };
  if (entry.status === 'not_published') return { status: 'not_published', checked: entry.checked };
  return { status: 'unavailable', checked: entry.checked };
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
