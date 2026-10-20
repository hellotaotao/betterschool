// Shared constants and pure helpers for the VCAA Senior Secondary Completion
// and Achievement Information (SSCAI) layer: per-school VCE results.

import { normaliseName } from './catchment-common.mjs';

export const SOURCE_PAGE_URL =
  'https://vcaa.vic.edu.au/administration/school-administration/performance-senior-secondary/senior-secondary-completion-and-achievement-information';
export const ATTRIBUTION =
  '© Victorian Curriculum and Assessment Authority. For current versions and related content visit www.vcaa.vic.edu.au';

// One file per results year. VCAA moved the files between hosts, so each URL
// is pinned as published rather than derived from a pattern.
export const SSCAI_FILES = {
  2022: 'https://www.vcaa.vic.edu.au/sites/default/files/Documents/statistics/2022/2022SeniorSecondaryCompletionAndAchievementInformation.xlsx',
  2023: 'https://www.vcaa.vic.edu.au/sites/default/files/Documents/statistics/2023/2023SeniorSecondaryCompletionAndAchievementInformation.xlsx',
  2024: 'https://www.vcaa.vic.edu.au/sites/default/files/Documents/statistics/2024/2024SeniorSecondaryCompletionAndAchievementInformation.xlsx',
  2025: 'https://vcaacorporateprod.prod.acquia-sites.com/sites/default/files/2025-12/2025-SeniorSecondaryCompletionandAchievementInformation.xlsx',
};
export const YEARS = Object.keys(SSCAI_FILES).map(Number).sort((a, b) => a - b);

export const RAW_DIR = 'data/vcaa/raw';
export const PROCESSED_DIR = 'data/vcaa/processed';
export const LAYER_PATH = `${PROCESSED_DIR}/year12-layer.json`;

/**
 * Columns located by header text, because VCAA reorders and renames them
 * between years (the median sits in column 15 in 2022 and 21 in 2023).
 * `optional` columns are absent from some years.
 */
export const COLUMNS = {
  school: { match: /^School$/i },
  adult_school: { match: /^Adult School/i, optional: true },
  small_school: { match: /^Small School/i },
  locality: { match: /^Locality/i },
  vce_students: { match: /^Number of students enrolled in at least one VCE/i },
  vtac_application_pct: { match: /applying for tertiary places/i },
  vce_completion_pct: { match: /^Percentage of satisfactory VCE completions/i },
  median_study_score: { match: /^Median VCE study score/i },
  pct_study_scores_40_plus: { match: /^Percentage of study scores of 40 and over/i },
};

export const NUMERIC_FIELDS = [
  'vce_students',
  'vtac_application_pct',
  'vce_completion_pct',
  'median_study_score',
  'pct_study_scores_40_plus',
];

/** Row index of the header (its first cell reads "School") and the column of each field. */
export function locateColumns(rows) {
  const headerRow = rows.findIndex(row => Array.isArray(row) && String(row[0] ?? '').trim() === 'School');
  if (headerRow < 0) throw new Error('No header row starting with "School"');
  const header = rows[headerRow].map(cell => String(cell ?? '').replace(/\s+/g, ' ').trim());
  const columns = {};
  for (const [field, { match, optional }] of Object.entries(COLUMNS)) {
    const hits = header.flatMap((text, index) => (match.test(text) ? [index] : []));
    if (hits.length > 1) throw new Error(`Header for ${field} matches ${hits.length} columns`);
    if (hits.length === 0) {
      if (optional) continue;
      throw new Error(`No column for ${field}`);
    }
    columns[field] = hits[0];
  }
  return { headerRow, columns };
}

/**
 * One cell as a number, or null with the reason it is not one. VCAA writes
 * "I/D" (fewer than four students), "< 4" for small counts and "-" where the
 * school has no such program; none of these is a zero.
 */
export function parseValue(cell) {
  if (typeof cell === 'number') return Number.isFinite(cell) ? { value: cell } : { value: null, reason: 'invalid' };
  const text = String(cell ?? '').trim();
  if (text === '') return { value: null, reason: 'blank' };
  if (/^i\/d$/i.test(text)) return { value: null, reason: 'insufficient_data' };
  if (/^<\s*4$/.test(text)) return { value: null, reason: 'fewer_than_4' };
  if (text === '-') return { value: null, reason: 'not_applicable' };
  const number = Number(text);
  return Number.isFinite(number) ? { value: number } : { value: null, reason: 'invalid' };
}

/** VCAA marks flags with an asterisk; anything else is unflagged. */
export function parseFlag(cell) {
  return String(cell ?? '').trim() !== '';
}

/**
 * Word-level expansions of VCAA's truncated school names. Each was read off an
 * unmatched row and checked against the ACARA name it should become; nothing
 * is fuzzy. Applied to VCAA names only.
 */
export const NAME_EXPANSIONS = {
  internatl: 'international',
  comm: 'community',
  schl: 'school',
  sec: 'secondary',
  coll: 'college',
};

export function vcaaNameKey(name) {
  return normaliseName(name)
    .split(' ')
    .map(word => NAME_EXPANSIONS[word] ?? word)
    .join(' ');
}

export function acaraNameKey(name) {
  return normaliseName(name);
}

export function localityKey(locality) {
  return normaliseName(locality);
}
