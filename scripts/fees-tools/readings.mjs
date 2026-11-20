// Small builders for readings files consumed by `npm run fees:merge`.
// A readings script imports these, lists one entry per school, and calls save().
//
//   f(feeYear, basis, rows, sourceUrl, otherCompulsory?, extra?)
//     rows: [[years, tuition, total], ...]; null skips a figure. years '*'
//     becomes the school's ACARA year range ("P-6", "7-12").
//     feeYear null adds a year_note saying the page gives no year.
//   perTerm(feeYear, basis, amount, sourceUrl, other?, terms = 4)
//   nf / nx / np(note): not_found / not_extracted / not_published with a reason.
import fs from 'node:fs';

const schools = JSON.parse(fs.readFileSync('public/data/schools.canonical.json', 'utf8'));
const range = new Map((schools.schools ?? schools).map(s => [String(s.acara_sml_id), (s.year_range ?? '').replace('Prep', 'P')]));

export const FAMILY = 'one-child family, annual family fee (charged per family, not per child)';
export const ONE_CHILD = 'one-child family, annual tuition (sibling rates are lower)';

export const f = (fee_year, basis, rows, source_url, other = null, extra = {}) => ({
  status: 'found',
  fees: {
    fee_year,
    ...(fee_year === null ? { year_note: `The school fee page does not state the year (checked ${new Date().toISOString().slice(0, 10)}).` } : {}),
    basis,
    by_year: rows.map(([years, tuition, total]) => ({ years, ...(tuition != null ? { tuition } : {}), ...(total != null ? { total } : {}) })),
    other_compulsory: other,
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
    for (const row of r.fees?.by_year ?? []) if (row.years === '*') row.years = range.get(id) || 'all';
  }
  fs.writeFileSync(file, JSON.stringify(readings, null, 1));
  console.log(`${Object.keys(readings).length} readings -> ${file}`);
}
