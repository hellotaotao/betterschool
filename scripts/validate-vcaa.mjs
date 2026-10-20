// Sanity checks on the VCAA layer before canonical:build consumes it.

import { readJson } from './catchment-common.mjs';
import { LAYER_PATH, YEARS } from './vcaa-common.mjs';

const LOCATION_PATH = 'data/acara/processed/school-location-2025.json';
// Share of VCAA rows that publish a median and attach to an ACARA school. The
// 2025 build attaches 548 of 555; a drop below this means names or localities
// changed upstream and the alias table needs another audit.
const MIN_MEDIAN_JOIN_RATE = 0.97;

const errors = [];
const fail = message => errors.push(message);

const layer = readJson(LAYER_PATH);
const vicIds = new Set(readJson(LOCATION_PATH).records.filter(r => r.state === 'VIC').map(r => r.acara_sml_id));

for (const year of YEARS) {
  const stats = layer.join[year];
  if (!stats) {
    fail(`No join stats for ${year}`);
    continue;
  }
  const { records } = readJson(`data/vcaa/processed/sscai-${year}.json`);
  const withMedian = records.filter(record => record.median_study_score !== null).length;
  const rate = stats.matched_with_median / withMedian;
  if (rate < MIN_MEDIAN_JOIN_RATE) {
    fail(`${year}: ${stats.matched_with_median}/${withMedian} rows with a median joined (${(rate * 100).toFixed(1)}%)`);
  }
  if (stats.unmatched.two_rows_one_school) fail(`${year}: ${stats.unmatched.two_rows_one_school} rows collide on one ACARA school`);
  if (stats.unmatched.alias_target_missing) fail(`${year}: alias points at a missing ACARA id`);
  console.log(`${year}: ${stats.matched_with_median}/${withMedian} medians joined (${(rate * 100).toFixed(1)}%)`);
}

const inRange = (value, min, max) => value === null || (Number.isFinite(value) && value >= min && value <= max);
for (const [smlId, results] of Object.entries(layer.results)) {
  if (!vicIds.has(Number(smlId))) fail(`${smlId}: not a Victorian ACARA location`);
  const years = results.map(result => result.year);
  if (new Set(years).size !== years.length) fail(`${smlId}: duplicate results year`);
  if (years.some((year, index) => index > 0 && year >= years[index - 1])) fail(`${smlId}: results not newest first`);
  for (const result of results) {
    if (!inRange(result.median_study_score, 10, 50)) fail(`${smlId} ${result.year}: median ${result.median_study_score}`);
    for (const field of ['pct_study_scores_40_plus', 'vce_completion_pct', 'vtac_application_pct']) {
      if (!inRange(result[field], 0, 100)) fail(`${smlId} ${result.year}: ${field} ${result[field]}`);
    }
    if (!inRange(result.vce_students, 0, 5000)) fail(`${smlId} ${result.year}: vce_students ${result.vce_students}`);
    // A withheld value must never also carry a number, and a number is never
    // the stand-in for "fewer than four" or "not applicable".
    for (const field of Object.keys(result.withheld ?? {})) {
      if (result[field] !== null) fail(`${smlId} ${result.year}: ${field} withheld but has a value`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${Object.keys(layer.results).length} schools with results`);
