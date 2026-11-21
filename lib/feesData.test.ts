import { describe, expect, it } from 'vitest';
import {
  annualFigure,
  getFeeRecord,
  hasSiblingRows,
  isPerFamilyFee,
  leadFeeRow,
  rowFigureKind,
  type PublishedFees,
} from './feesData';

const baseFees = (overrides: Partial<PublishedFees> = {}): PublishedFees => ({
  fee_year: 2026,
  basis: 'annual tuition',
  by_year: [{ years: '7', tuition: 10000 }],
  source: 'school_website',
  source_url: 'https://school.example/fees',
  ...overrides,
});

describe('fee helpers', () => {
  it('identifies per-family billing from billing_unit or basis wording', () => {
    expect(isPerFamilyFee(baseFees({ billing_unit: 'per_family' }))).toBe(true);
    expect(isPerFamilyFee(baseFees({ billing_unit: 'per_student', basis: 'charged per family, not per child' }))).toBe(false);
    expect(isPerFamilyFee(baseFees({ basis: 'one-child family, annual family fee (charged per family, not per child)' }))).toBe(true);
    expect(isPerFamilyFee(baseFees({ basis: 'annual tuition; building levy per family extra' }))).toBe(false);
  });

  it('detects sibling columns and row figure kinds accurately', () => {
    expect(hasSiblingRows(baseFees())).toBe(false);
    expect(hasSiblingRows(baseFees({ by_year: [{ years: 'K', total: 4000, child_2: 3000 }] }))).toBe(true);

    expect(rowFigureKind({ years: '7', tuition: 5000, total: 6200 })).toBe('total');
    expect(rowFigureKind({ years: '7', tuition: 5000 })).toBe('tuition');
    expect(rowFigureKind({ years: '7', per_term: 1200, terms: 4 })).toBe('per_term');
    expect(annualFigure({ years: '7', per_term: 1200, terms: 4 })).toBe(4800);
    expect(leadFeeRow(baseFees({ by_year: [{ years: 'K-6', tuition: 3000 }, { years: '7-12', tuition: 7000 }] }))?.years).toBe('7-12');
  });
});

describe('getFeeRecord against fees ledger', () => {
  it('returns multi-child SCS totals including $0 fourth child (53221)', () => {
    const record = getFeeRecord(53221);
    expect(record.status).toBe('found');
    if (record.status !== 'found') return;
    expect(record.fees.billing_unit).toBe('per_student');
    expect(record.fees.sibling_amounts_basis).toBe('per_child');
    expect(hasSiblingRows(record.fees)).toBe(true);
    const year5 = record.fees.by_year.find(row => row.years === '5');
    expect(year5).toMatchObject({ total: 2531, child_2: 2278, child_3: 1645, child_4: 0 });
  });

  it('returns itemized CSPD components, sibling totals, and preserved discount (43180)', () => {
    const record = getFeeRecord(43180);
    expect(record.status).toBe('found');
    if (record.status !== 'found') return;
    expect(record.fees.discount).toContain('halved');
    expect(record.fees.components?.find(c => c.name === 'Diocesan Building Levy')?.unit).toBe('per_family');
    expect(record.fees.by_year[0]).toMatchObject({ years: 'K', tuition: 1410, total: 2955, child_2: 1659, child_3: 1305, child_4: 600 });
  });

  it('returns St Michael\'s Daylesford as per_family with all 5 components and concession (45749)', () => {
    const record = getFeeRecord(45749);
    expect(record.status).toBe('found');
    if (record.status !== 'found') return;
    expect(isPerFamilyFee(record.fees)).toBe(true);
    expect(record.fees.components).toHaveLength(5);
    expect(record.fees.concession).toContain('Health Care Card');
  });

  it('resolves sub-campus records from their parent school (40410 -> 43858)', () => {
    const campus = getFeeRecord(40410);
    const parent = getFeeRecord(43858);
    expect(campus.status).toBe('found');
    expect(campus.campusOf).toBe('St Spyridon College');
    if (campus.status === 'found' && parent.status === 'found') {
      expect(campus.fees).toEqual(parent.fees);
    }
  });
});
