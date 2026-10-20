// Attach each VCAA SSCAI row to exactly one ACARA location, or record why not.
//
// VCAA publishes a school name and locality but no ACARA identifier. A row is
// accepted only by an exact rule below; anything else stays in unmatched.json
// with its reason, never a nearest or fuzzy guess. Reads the ACARA location
// layer rather than canonical, because canonical consumes this layer.

import fs from 'node:fs';
import path from 'node:path';
import { distanceKm, readJson, writeJson } from './catchment-common.mjs';
import {
  ATTRIBUTION,
  LAYER_PATH,
  NUMERIC_FIELDS,
  PROCESSED_DIR,
  SOURCE_PAGE_URL,
  SSCAI_FILES,
  YEARS,
  acaraNameKey,
  localityKey,
  vcaaNameKey,
} from './vcaa-common.mjs';

const LOCATION_PATH = 'data/acara/processed/school-location-2025.json';

/**
 * How far a same-name school may sit from the VCAA locality before the name
 * alone stops counting as evidence. Neighbouring suburbs are within it (Mill
 * Park ↔ Epping, Kurnai's Churchill campus ↔ Morwell); St Margaret's School in
 * Berwick and St Margaret's School in East Geelong, about 100 km apart, are not.
 */
export const MAX_UNIQUE_NAME_KM = 12;
const ALIASES_PATH = path.join(PROCESSED_DIR, 'aliases.json');

/**
 * Audited exceptions, checked in beside the outputs:
 * - `aliases`: "<VCAA name>|<VCAA locality>" → acara_sml_id, for a row whose
 *   name or locality differs from ACARA's in a way no word expansion covers.
 * - `not_schools`: "<VCAA name>|<VCAA locality>" → reason, for providers with
 *   no ACARA school record (TAFEs, adult education centres).
 */
function readAliases() {
  if (!fs.existsSync(ALIASES_PATH)) return { aliases: {}, not_schools: {} };
  return readJson(ALIASES_PATH);
}

export function rowKey(record) {
  return `${record.school}|${record.locality}`;
}

/**
 * Pure matcher over one results year. Returns matches keyed by acara_sml_id
 * and the unmatched rows with reasons. Two rows claiming one ACARA school are
 * both rejected: the source then describes two things we would show as one.
 */
export function matchYear(records, locations, { aliases = {}, not_schools: notSchools = {} } = {}) {
  const byNameLocality = new Map();
  const byName = new Map();
  for (const location of locations) {
    const name = acaraNameKey(location.school_name);
    const key = `${name}|${localityKey(location.suburb)}`;
    byNameLocality.set(key, [...(byNameLocality.get(key) ?? []), location]);
    byName.set(name, [...(byName.get(name) ?? []), location]);
  }
  const bySmlId = new Map(locations.map(location => [location.acara_sml_id, location]));
  // VCAA gives no coordinates, so a locality is placed at the mean position of
  // the ACARA schools in the suburb of that name. No school there, no position.
  const localitySums = new Map();
  for (const location of locations) {
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
    const key = localityKey(location.suburb);
    const sum = localitySums.get(key) ?? { lat: 0, lng: 0, n: 0 };
    sum.lat += location.latitude;
    sum.lng += location.longitude;
    sum.n += 1;
    localitySums.set(key, sum);
  }
  const localityPosition = key => {
    const sum = localitySums.get(key);
    return sum ? { lat: sum.lat / sum.n, lng: sum.lng / sum.n } : null;
  };
  const vcaaNameCounts = new Map();
  for (const record of records) {
    const name = vcaaNameKey(record.school);
    vcaaNameCounts.set(name, (vcaaNameCounts.get(name) ?? 0) + 1);
  }

  const claims = new Map();
  const unmatched = [];
  for (const record of records) {
    const key = rowKey(record);
    if (notSchools[key]) {
      unmatched.push({ ...record, reason: 'not_an_acara_school', note: notSchools[key] });
      continue;
    }
    let location = null;
    let method = null;
    if (aliases[key] !== undefined) {
      location = bySmlId.get(aliases[key]) ?? null;
      method = 'audited_alias';
      if (!location) {
        unmatched.push({ ...record, reason: 'alias_target_missing' });
        continue;
      }
    } else {
      const name = vcaaNameKey(record.school);
      const exact = byNameLocality.get(`${name}|${localityKey(record.locality)}`) ?? [];
      const sameName = byName.get(name) ?? [];
      if (exact.length === 1) {
        location = exact[0];
        method = 'exact_name_and_locality';
      } else if (exact.length === 0 && sameName.length === 1 && vcaaNameCounts.get(name) === 1) {
        // Unique on both sides: one VCAA row and one ACARA school of this name,
        // whose addresses disagree only on locality — and only nearby.
        const position = localityPosition(localityKey(record.locality));
        const candidate = sameName[0];
        const km = position ? distanceKm(position.lat, position.lng, candidate.latitude, candidate.longitude) : null;
        if (km === null || km > MAX_UNIQUE_NAME_KM) {
          unmatched.push({ ...record, reason: km === null ? 'locality_unplaced' : 'same_name_too_far', km: km === null ? null : Math.round(km) });
          continue;
        }
        location = candidate;
        method = 'exact_name_unique_both_sides';
      } else {
        unmatched.push({
          ...record,
          reason: exact.length > 1 || sameName.length > 1 ? 'ambiguous_name' : 'no_acara_match',
          candidates: sameName.length,
        });
        continue;
      }
    }
    const list = claims.get(location.acara_sml_id) ?? [];
    list.push({ record, method });
    claims.set(location.acara_sml_id, list);
  }

  const matches = new Map();
  for (const [smlId, list] of claims) {
    if (list.length === 1) {
      matches.set(smlId, list[0]);
      continue;
    }
    for (const { record } of list) unmatched.push({ ...record, reason: 'two_rows_one_school', acara_sml_id: smlId });
  }
  return { matches, unmatched };
}

function resultFields(record, year) {
  const result = { year };
  for (const field of NUMERIC_FIELDS) result[field] = record[field];
  result.small_school = record.small_school;
  if (Object.keys(record.withheld).length > 0) result.withheld = record.withheld;
  return result;
}

function main() {
  const locations = readJson(LOCATION_PATH).records.filter(location => location.state === 'VIC');
  const audited = readAliases();
  const results = {};
  const stats = {};
  const unmatchedByYear = {};

  for (const year of YEARS) {
    const { records } = readJson(path.join(PROCESSED_DIR, `sscai-${year}.json`));
    const { matches, unmatched } = matchYear(records, locations, audited);
    const methods = {};
    for (const [smlId, { record, method }] of matches) {
      methods[method] = (methods[method] ?? 0) + 1;
      (results[smlId] ??= []).push(resultFields(record, year));
    }
    const reasons = {};
    for (const row of unmatched) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    stats[year] = {
      source_rows: records.length,
      matched: matches.size,
      matched_with_median: [...matches.values()].filter(({ record }) => record.median_study_score !== null).length,
      methods,
      unmatched: reasons,
    };
    unmatchedByYear[year] = unmatched.sort((a, b) => a.reason.localeCompare(b.reason) || a.school.localeCompare(b.school));
  }

  for (const list of Object.values(results)) list.sort((a, b) => b.year - a.year);

  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), unmatchedByYear);
  writeJson(LAYER_PATH, {
    source: 'VCAA Senior Secondary Completion and Achievement Information',
    source_page: SOURCE_PAGE_URL,
    source_files: SSCAI_FILES,
    attribution: ATTRIBUTION,
    years: YEARS,
    join: stats,
    results,
  });
  console.log(JSON.stringify(stats, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
