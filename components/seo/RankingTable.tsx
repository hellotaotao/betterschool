"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  WEIGHTABLE,
  assignRanks,
  mixRows,
  parseTableQuery,
  sortRows,
  tableQuery,
  type SortKey,
  type TableMetric,
  type TableRow,
  type TableState,
  type Weights,
} from '@/lib/rankingTable';
import { sectorBadgeClass } from '@/utils/schoolFilters';

export interface RankingTableLabels {
  rank: string;
  school: string;
  suburb: string;
  sector: string;
  columns: Record<TableMetric, string>;
  sortBy: string;
  sortMix: string;
  mixScore: string;
  /** Contains {count}. */
  weightsHint: string;
  includeSmall?: string;
  /** Contain {count}. */
  showAll: string;
  showTop: string;
  sectors: Record<string, string>;
}

interface Props {
  rows: TableRow[];
  columns: TableMetric[];
  defaultSort: TableMetric;
  defaultWeights: Weights;
  showSector: boolean;
  labels: RankingTableLabels;
  /** Rows shown before "show all". */
  limit?: number;
}

const fill = (template: string, count: number) => template.replace('{count}', count.toLocaleString('en-AU'));

function format(metric: TableMetric, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (metric === 'ratio') return value.toFixed(1);
  if (metric === 'vce_40') return `${value}%`;
  if (metric === 'enrolments') return value.toLocaleString('en-AU');
  return String(value);
}

/**
 * Ranking table the reader can re-sort or re-weight. The server renders the
 * default order, which is what a crawler indexes; the browser takes over from
 * there and mirrors the view into the query string so it can be shared.
 */
export default function RankingTable({ rows, columns, defaultSort, defaultWeights, showSector, labels, limit = 100 }: Props) {
  const fallback: TableState = useMemo(
    () => ({ sort: defaultSort, weights: defaultWeights, includeSmall: false }),
    [defaultSort, defaultWeights],
  );
  const [state, setState] = useState<TableState>(fallback);
  const [showAll, setShowAll] = useState(false);
  const weightable = WEIGHTABLE.filter(metric => columns.includes(metric));
  const canMix = weightable.length >= 2;
  const hasSmall = rows.some(row => row.smallCohort);

  // The query string is read after hydration so the server render and the
  // first client render agree.
  useEffect(() => {
    setState(parseTableQuery(window.location.search, fallback));
  }, [fallback]);

  useEffect(() => {
    const query = tableQuery(state, fallback);
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  }, [state, fallback]);

  const visible = useMemo(
    () => (state.includeSmall ? rows : rows.filter(row => !row.smallCohort)),
    [rows, state.includeSmall],
  );

  const ordered = useMemo(() => {
    if (state.sort === 'mix' && canMix) {
      return mixRows(visible, state.weights).map(entry => ({ row: entry.row, rank: entry.rank as number | null, score: entry.score }));
    }
    const metric = state.sort === 'mix' ? defaultSort : state.sort;
    const sorted = sortRows(visible, metric);
    const ranks = assignRanks(sorted, metric);
    return sorted.map((row, index) => ({ row, rank: ranks[index], score: undefined as number | undefined }));
  }, [visible, state.sort, state.weights, canMix, defaultSort]);

  const shown = showAll ? ordered : ordered.slice(0, limit);
  const activeSort: SortKey = state.sort === 'mix' && !canMix ? defaultSort : state.sort;
  const setSort = (sort: SortKey) => setState(current => ({ ...current, sort }));
  const setWeight = (metric: TableMetric, amount: number) => setState(current => ({
    ...current,
    sort: 'mix',
    weights: { ...current.weights, [metric]: amount },
  }));

  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-xs ${
    active ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 text-gray-700 hover:border-indigo-400 hover:text-indigo-700'
  }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs text-gray-500">{labels.sortBy}</span>
        {columns.map(metric => (
          <button key={metric} type="button" className={pill(activeSort === metric)} aria-pressed={activeSort === metric} onClick={() => setSort(metric)}>
            {labels.columns[metric]}
          </button>
        ))}
        {canMix && (
          <button type="button" className={pill(activeSort === 'mix')} aria-pressed={activeSort === 'mix'} onClick={() => setSort('mix')}>
            {labels.sortMix}
          </button>
        )}
      </div>

      {canMix && activeSort === 'mix' && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <div className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-x-3 gap-y-2 text-xs text-gray-600">
            {weightable.map(metric => (
              <label key={metric} className="contents">
                <span>{labels.columns[metric]}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={state.weights[metric] ?? 0}
                  onChange={event => setWeight(metric, Number(event.target.value))}
                />
                <span className="text-right tabular-nums">{state.weights[metric] ?? 0}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{fill(labels.weightsHint, ordered.length)}</p>
        </div>
      )}

      {hasSmall && labels.includeSmall && (
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={state.includeSmall}
            onChange={event => setState(current => ({ ...current, includeSmall: event.target.checked }))}
          />
          {labels.includeSmall}
        </label>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[40rem]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 [&>th]:whitespace-nowrap">
              <th scope="col" className="w-10 py-2 pr-2 font-medium">{labels.rank}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{labels.school}</th>
              <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{labels.suburb}</th>
              {showSector && <th scope="col" className="py-2 pr-3 font-medium">{labels.sector}</th>}
              {activeSort === 'mix' && <th scope="col" className="py-2 pr-3 text-right font-medium text-gray-900">{labels.mixScore}</th>}
              {columns.map(metric => (
                <th key={metric} scope="col" className={`py-2 pr-3 text-right font-medium ${activeSort === metric ? 'text-gray-900' : ''}`}>
                  <button type="button" onClick={() => setSort(metric)} className="hover:text-indigo-700">
                    {labels.columns[metric]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row, rank, score }) => (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="py-2 pr-2 tabular-nums text-gray-500">{rank ?? '—'}</td>
                <td className="py-2 pr-3">
                  <Link href={row.href} className="text-indigo-700 hover:underline">{row.name}</Link>
                  {/* Narrow screens fold the suburb under the name so the figures stay in view. */}
                  <span className="block text-xs text-gray-500 sm:hidden">{row.suburb}</span>
                </td>
                <td className="hidden py-2 pr-3 sm:table-cell">
                  <Link href={row.suburbHref} className="text-gray-600 hover:text-indigo-700 hover:underline">{row.suburb}</Link>
                </td>
                {showSector && (
                  <td className="py-2 pr-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${sectorBadgeClass(row.sector)}`}>
                      {labels.sectors[row.sector] ?? row.sector}
                    </span>
                  </td>
                )}
                {activeSort === 'mix' && <td className="py-2 pr-3 text-right font-semibold tabular-nums">{score}</td>}
                {columns.map(metric => (
                  <td key={metric} className={`py-2 pr-3 text-right tabular-nums ${activeSort === metric ? 'font-semibold' : ''}`}>
                    {format(metric, row.values[metric])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordered.length > limit && (
        <button type="button" onClick={() => setShowAll(value => !value)} className="mt-3 text-xs text-indigo-700 hover:underline">
          {showAll ? fill(labels.showTop, limit) : fill(labels.showAll, ordered.length)}
        </button>
      )}
    </div>
  );
}
