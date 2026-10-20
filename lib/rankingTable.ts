// The sortable, re-weightable ranking table: sorting, shared ranks, in-table
// percentiles and the reader's own weighted mix. Pure, so the server render and
// the browser agree on every rank.

export const TABLE_METRICS = ['vce_median', 'vce_40', 'icsea', 'enrolments', 'ratio'] as const;
export type TableMetric = typeof TABLE_METRICS[number];

/** Which end ranks first. Students per teacher lists from the fewest. */
export const TABLE_ORDER: Record<TableMetric, 'desc' | 'asc'> = {
  vce_median: 'desc',
  vce_40: 'desc',
  icsea: 'desc',
  enrolments: 'desc',
  ratio: 'asc',
};

/**
 * Second key for ties. VCE medians are whole numbers — twelve Victorian
 * schools share 36 — so the share of 40+ scores separates them, and the other
 * way round.
 */
const TIE_BREAK: Partial<Record<TableMetric, TableMetric>> = {
  vce_median: 'vce_40',
  vce_40: 'vce_median',
};

/** Metrics a reader may weight; size and staffing describe a school, they do not score it. */
export const WEIGHTABLE: readonly TableMetric[] = ['vce_median', 'vce_40', 'icsea'];

export interface TableRow {
  id: string;
  name: string;
  href: string;
  suburb: string;
  suburbHref: string;
  sector: string;
  /** Below the cohort floor for VCE results: listed only when the reader asks. */
  smallCohort?: boolean;
  values: Partial<Record<TableMetric, number | null>>;
}

export type SortKey = TableMetric | 'mix';
export type Weights = Partial<Record<TableMetric, number>>;

function value(row: TableRow, metric: TableMetric): number | null {
  const v = row.values[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function compareMetric(a: TableRow, b: TableRow, metric: TableMetric): number {
  const x = value(a, metric);
  const y = value(b, metric);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return TABLE_ORDER[metric] === 'desc' ? y - x : x - y;
}

/** Rows best first by one metric; rows without a value go last, then by name. */
export function sortRows(rows: readonly TableRow[], metric: TableMetric): TableRow[] {
  const tie = TIE_BREAK[metric];
  return [...rows].sort((a, b) => (
    compareMetric(a, b, metric)
    || (tie ? compareMetric(a, b, tie) : 0)
    || a.name.localeCompare(b.name)
  ));
}

/**
 * Display ranks for rows already sorted by `metric`: rows equal on the metric
 * and its tie-break share the first one's rank; a row with no value has none.
 */
export function assignRanks(sorted: readonly TableRow[], metric: TableMetric): (number | null)[] {
  const tie = TIE_BREAK[metric];
  const ranks: (number | null)[] = [];
  sorted.forEach((row, index) => {
    if (value(row, metric) === null) {
      ranks.push(null);
      return;
    }
    const previous = sorted[index - 1];
    const same = previous
      && value(previous, metric) === value(row, metric)
      && (!tie || value(previous, tie) === value(row, tie));
    ranks.push(same ? ranks[index - 1] : index + 1);
  });
  return ranks;
}

/**
 * Each row's mid-rank percentile on one metric among the given rows, oriented
 * so 100 is always the metric's best end. Ties get the same percentile.
 */
export function percentiles(rows: readonly TableRow[], metric: TableMetric): Map<string, number> {
  const known = rows.flatMap(row => {
    const v = value(row, metric);
    return v === null ? [] : [{ id: row.id, v }];
  });
  const sorted = known.map(entry => entry.v).sort((a, b) => a - b);
  const out = new Map<string, number>();
  for (const { id, v } of known) {
    let below = 0;
    while (below < sorted.length && sorted[below] < v) below++;
    let upTo = below;
    while (upTo < sorted.length && sorted[upTo] === v) upTo++;
    const ascending = ((below + upTo) / 2 / sorted.length) * 100;
    out.set(id, TABLE_ORDER[metric] === 'desc' ? ascending : 100 - ascending);
  }
  return out;
}

export interface MixedRow { row: TableRow; score: number; rank: number }

/**
 * The reader's weighted mix: the weighted mean of each chosen metric's
 * percentile within `rows`. Only rows with every weighted metric take part,
 * since a missing figure is not a zero.
 */
export function mixRows(rows: readonly TableRow[], weights: Weights): MixedRow[] {
  const chosen = WEIGHTABLE.filter(metric => (weights[metric] ?? 0) > 0);
  if (chosen.length === 0) return [];
  const eligible = rows.filter(row => chosen.every(metric => value(row, metric) !== null));
  const pct = new Map(chosen.map(metric => [metric, percentiles(eligible, metric)]));
  const total = chosen.reduce((sum, metric) => sum + (weights[metric] ?? 0), 0);
  const scored = eligible.map(row => ({
    row,
    score: Math.round(chosen.reduce((sum, metric) => sum + (pct.get(metric)!.get(row.id) ?? 0) * (weights[metric] ?? 0), 0) / total * 10) / 10,
  }));
  scored.sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name));
  const mixed: MixedRow[] = [];
  scored.forEach((entry, index) => {
    const tied = index > 0 && scored[index - 1].score === entry.score;
    mixed.push({ ...entry, rank: tied ? mixed[index - 1].rank : index + 1 });
  });
  return mixed;
}

// --- URL state ---------------------------------------------------------------

export interface TableState {
  sort: SortKey;
  weights: Weights;
  includeSmall: boolean;
}

/** `?sort=mix&w=vce_median.50,icsea.20&small=1`; anything unrecognised is ignored. */
export function parseTableQuery(search: string, fallback: TableState): TableState {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  const weights: Weights = {};
  for (const part of (params.get('w') ?? '').split(',')) {
    const [metric, raw] = part.split('.');
    const amount = Number(raw);
    if ((WEIGHTABLE as readonly string[]).includes(metric) && Number.isInteger(amount) && amount >= 0 && amount <= 100) {
      weights[metric as TableMetric] = amount;
    }
  }
  return {
    sort: sort === 'mix' || (TABLE_METRICS as readonly string[]).includes(sort ?? '') ? (sort as SortKey) : fallback.sort,
    weights: Object.keys(weights).length > 0 ? weights : fallback.weights,
    includeSmall: params.get('small') === '1' ? true : fallback.includeSmall,
  };
}

export function tableQuery(state: TableState, fallback: TableState): string {
  const params = new URLSearchParams();
  if (state.sort !== fallback.sort) params.set('sort', state.sort);
  if (state.sort === 'mix') {
    params.set('w', WEIGHTABLE.filter(metric => state.weights[metric] !== undefined)
      .map(metric => `${metric}.${state.weights[metric]}`).join(','));
  }
  if (state.includeSmall) params.set('small', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}
