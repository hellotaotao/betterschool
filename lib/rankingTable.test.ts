import { describe, expect, it } from 'vitest';
import {
  assignRanks,
  mixRows,
  parseTableQuery,
  percentiles,
  sortRows,
  tableQuery,
  type TableRow,
  type TableState,
} from './rankingTable';

const row = (id: string, values: TableRow['values']): TableRow => ({
  id, name: id, href: `/school/${id}`, suburb: 'X', suburbHref: '/suburb/x', sector: 'Government', values,
});

describe('sortRows and assignRanks', () => {
  const rows = [
    row('b', { vce_median: 36, vce_40: 25 }),
    row('a', { vce_median: 36, vce_40: 30 }),
    row('c', { vce_median: 37, vce_40: 20 }),
    row('d', { vce_median: null }),
    row('e', { vce_median: 36, vce_40: 25 }),
  ];

  it('breaks a median tie on the 40+ share, then by name, and puts missing values last', () => {
    expect(sortRows(rows, 'vce_median').map(r => r.id)).toEqual(['c', 'a', 'b', 'e', 'd']);
  });

  it('shares a rank only when the tie-break ties too', () => {
    const sorted = sortRows(rows, 'vce_median');
    expect(assignRanks(sorted, 'vce_median')).toEqual([1, 2, 3, 3, null]);
  });

  it('lists students per teacher from the fewest', () => {
    const sorted = sortRows([row('x', { ratio: 14 }), row('y', { ratio: 9 })], 'ratio');
    expect(sorted.map(r => r.id)).toEqual(['y', 'x']);
  });
});

describe('percentiles', () => {
  it('puts the best end at 100 whichever way the metric runs', () => {
    const rows = [row('lo', { icsea: 900, ratio: 15 }), row('hi', { icsea: 1200, ratio: 8 })];
    expect(percentiles(rows, 'icsea').get('hi')).toBe(75);
    expect(percentiles(rows, 'ratio').get('hi')).toBe(75);
  });
});

describe('mixRows', () => {
  const rows = [
    row('a', { vce_median: 37, icsea: 1100 }),
    row('b', { vce_median: 33, icsea: 1200 }),
    row('c', { vce_median: 35, icsea: null }),
  ];

  it('ranks by the weighted mean of percentiles among rows with every weighted metric', () => {
    const mixed = mixRows(rows, { vce_median: 80, icsea: 20 });
    expect(mixed.map(m => m.row.id)).toEqual(['a', 'b']);
    expect(mixed[0].rank).toBe(1);
  });

  it('leaves out a row missing a weighted figure rather than scoring it zero', () => {
    expect(mixRows(rows, { vce_median: 50, icsea: 50 }).some(m => m.row.id === 'c')).toBe(false);
    expect(mixRows(rows, { vce_median: 100 }).some(m => m.row.id === 'c')).toBe(true);
  });

  it('returns nothing when every weight is zero', () => {
    expect(mixRows(rows, { vce_median: 0 })).toEqual([]);
  });
});

describe('table query', () => {
  const fallback: TableState = { sort: 'vce_median', weights: { vce_median: 50, vce_40: 30, icsea: 20 }, includeSmall: false };

  it('round-trips a custom mix', () => {
    const state: TableState = { sort: 'mix', weights: { vce_median: 70, vce_40: 0, icsea: 30 }, includeSmall: true };
    expect(parseTableQuery(tableQuery(state, fallback), fallback)).toEqual(state);
  });

  it('writes nothing for the default view and ignores junk', () => {
    expect(tableQuery(fallback, fallback)).toBe('');
    expect(parseTableQuery('?sort=evil&w=ratio.50,icsea.900', fallback)).toEqual(fallback);
  });
});
