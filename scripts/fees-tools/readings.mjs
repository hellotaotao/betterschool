// Small builders for readings files consumed by `npm run fees:merge`.
// A readings script imports these, lists one entry per school, and calls save().
//
//   f(feeYear, basis, rows, sourceUrl, otherCompulsory?, extra?)
//     rows: [[years, tuition, total, child_2?, child_3?, child_4?], ...];
//     null skips a figure. years '*' becomes the school's ACARA year range ("P-6", "7-12").
//     feeYear null adds a year_note saying the page gives no year.
//   comp(name, unit, amountOrRows, extra?)
//   described(feeYear, pricingModel, summary, sourceUrl, extra?)
//   perTerm(feeYear, basis, amount, sourceUrl, other?, terms = 4)
//   nf / nx / np(note): not_found / not_extracted / not_published with a reason.
import fs from 'node:fs';

const schools = JSON.parse(fs.readFileSync('public/data/schools.canonical.json', 'utf8'));
const range = new Map((schools.schools ?? schools).map(s => [String(s.acara_sml_id), (s.year_range ?? '').replace('Prep', 'P')]));

export const FAMILY = 'one-child family, annual family fee (charged per family, not per child)';
export const ONE_CHILD = 'one-child family, annual tuition (sibling rates are lower)';

export const f = (fee_year, basis, rows, source_url, other = null, extra = {}) => {
  const by_year = rows.map(([years, tuition, total, child_2, child_3, child_4]) => ({
    years,
    ...(tuition != null ? { tuition } : {}),
    ...(total != null ? { total } : {}),
    ...(child_2 != null ? { child_2 } : {}),
    ...(child_3 != null ? { child_3 } : {}),
    ...(child_4 != null ? { child_4 } : {}),
  }));
  const hasChildCols = by_year.some(row => row.child_2 != null || row.child_3 != null || row.child_4 != null);
  const inferredUnit = extra.billing_unit ?? (/charged per family, not per child/i.test(basis ?? '') ? 'per_family' : undefined);
  const inferredSiblingBasis = extra.sibling_amounts_basis ?? (hasChildCols ? 'per_child' : undefined);
  return {
    status: 'found',
    fees: {
      fee_year,
      ...(fee_year === null ? { year_note: `The school fee page does not state the year (checked ${new Date().toISOString().slice(0, 10)}).` } : {}),
      ...(inferredUnit ? { billing_unit: inferredUnit } : {}),
      basis,
      by_year,
      ...(inferredSiblingBasis ? { sibling_amounts_basis: inferredSiblingBasis } : {}),
      other_compulsory: other,
      source: 'school_website',
      source_url,
      ...extra,
    },
  };
};

export const comp = (name, unit, amountOrRows, extra = {}) => (
  Array.isArray(amountOrRows)
    ? { name, unit, by_year: amountOrRows.map(([years, amount]) => ({ years, amount })), ...extra }
    : { name, unit, amount: amountOrRows, ...extra }
);

export const described = (fee_year, pricing_model, summary, source_url, extra = {}) => ({
  status: 'described',
  fees_description: {
    fee_year,
    ...(fee_year === null ? { year_note: `The school fee page does not state the year (checked ${new Date().toISOString().slice(0, 10)}).` } : {}),
    pricing_model,
    summary,
    source: 'school_website',
    source_url,
    ...extra,
  },
});

export const perTerm = (fee_year, basis, amount, source_url, other = null, terms = 4) => {
  const reading = f(fee_year, basis, [['*', amount]], source_url, other);
  reading.fees.by_year = [{ years: '*', per_term: amount, terms }];
  return reading;
};
export const nf = note => ({ status: 'not_found', note });
export const nx = note => ({ status: 'not_extracted', note });
export const np = note => ({ status: 'not_published', note });

export function save(file, readings) {
  for (const [id, r] of Object.entries(readings)) {
    const fallbackRange = range.get(id) || 'all';
    for (const row of r.fees?.by_year ?? []) if (row.years === '*') row.years = fallbackRange;
    for (const component of r.fees?.components ?? []) {
      for (const row of component.by_year ?? []) if (row.years === '*') row.years = fallbackRange;
    }
  }
  fs.writeFileSync(file, JSON.stringify(readings, null, 1));
  console.log(`${Object.keys(readings).length} readings -> ${file}`);
}
