// Join the ACT Government 2027 PEA polygons to ACARA location identity.
//
// Exact source identity selects the school and polygon containment verifies it.
// Parenthetical stage labels are removed only from the known official syntax;
// the checked-in alias/campus tables cover the remaining exact differences.
// Two new-school identities exist in ACARA 2025 without a location_age_id, so
// their polygons remain explicit unmatched records rather than receiving an
// invented key. No fuzzy or nearest-school fallback is used.

import fs from 'node:fs';
import path from 'node:path';
import { readActZones } from './parse-act-catchment.mjs';
import {
  ACT_BBOX,
  ACT_CATCHMENT_SOURCE,
  ACT_NAME_ALIASES,
  ACT_STAGE_CAMPUS_TARGETS,
  ATTRIBUTION,
  DATASET_URL,
  DATA_YEAR,
  EXPECTED_SOURCE_FEATURES,
  LICENCE,
  PROCESSED_DIR,
  PUBLIC_DIR,
  coarsenBbox,
  countVertices,
  ensureDir,
  geometryBbox,
  groupExactGeometryVariants,
  normaliseName,
  pointInGeometry,
  readJson,
  writeJson,
} from './act-catchment-common.mjs';
import { bboxWithin } from './catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

export function actBaseSchoolName(sourceName) {
  return sourceName
    .replace(/\s*\((?:P-6|P-2|3-6|7-10|11-12)\)\s*$/i, '')
    .replace(/\s*\(including Tharwa Preschool\)\s*$/i, '')
    .trim();
}

const exactContained = (targetNames, geometry, acaraSchools) => {
  const keys = new Set(targetNames.map(normaliseName));
  return acaraSchools.filter((school) => (
    keys.has(normaliseName(school.school_name))
    && pointInGeometry([school.longitude, school.latitude], geometry)
  ));
};

export function resolveActMatches({ record, acaraSchools }) {
  const campusTargets = ACT_STAGE_CAMPUS_TARGETS.get(record.source_name);
  const aliasTargets = ACT_NAME_ALIASES.get(record.source_name);
  const targetNames = campusTargets ?? aliasTargets ?? [actBaseSchoolName(record.source_name)];
  const candidates = exactContained(targetNames, record.geometry, acaraSchools)
    .sort((a, b) => (a.location_age_id ?? Number.MAX_SAFE_INTEGER) - (b.location_age_id ?? Number.MAX_SAFE_INTEGER));

  if (candidates.some((school) => !Number.isFinite(school.location_age_id))) {
    return { schools: [], reason: 'exact_acara_identity_has_no_location_age_id' };
  }
  const expected = campusTargets?.length ?? 1;
  if (candidates.length !== expected) {
    return {
      schools: [],
      reason: candidates.length === 0
        ? 'no_exact_acara_candidate_inside_zone'
        : 'unexpected_exact_acara_candidate_count_inside_zone',
    };
  }
  return {
    schools: candidates,
    method: campusTargets
      ? 'audited_stage_to_campuses_and_containment'
      : aliasTargets
        ? 'audited_exact_alias_and_containment'
        : 'exact_base_name_and_containment',
  };
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}; run 'npm run act:catchment:fetch' first`);
  }
  readJson(manifestPath);
  const records = readActZones();
  if (records.length !== EXPECTED_SOURCE_FEATURES) {
    throw new Error(`ACT source has ${records.length} features, expected ${EXPECTED_SOURCE_FEATURES}`);
  }

  const locations = readJson(locationPath).records.filter((record) => (
    record.state === 'ACT'
    && record.sector === 'Government'
    && Number.isFinite(record.latitude)
    && Number.isFinite(record.longitude)
  ));
  const grouped = new Map();
  const unmatched = [];
  const matchMethods = {};
  const stats = Object.fromEntries(['Primary', 'High', 'College'].map((type) => [type, {
    polygons: 0, joined: 0, attachments: 0, join_rate: 0,
  }]));

  for (const record of records) {
    stats[record.source_type].polygons += 1;
    const result = resolveActMatches({ record, acaraSchools: locations });
    if (result.schools.length === 0) {
      unmatched.push({
        reason: result.reason,
        source_school_code: record.source_school_code,
        source_name: record.source_name,
        source_type: record.source_type,
        source_year_range: record.source_year_range,
      });
      continue;
    }
    stats[record.source_type].joined += 1;
    stats[record.source_type].attachments += result.schools.length;
    matchMethods[result.method] = (matchMethods[result.method] ?? 0) + 1;

    for (const school of result.schools) {
      const key = `${school.location_age_id}:${record.kind}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ageId: String(school.location_age_id), kind: record.kind, school, records: [] });
      }
      grouped.get(key).records.push({ ...record, match_method: result.method });
    }
  }
  for (const value of Object.values(stats)) {
    value.join_rate = Number((value.joined / value.polygons).toFixed(4));
  }

  ensureDir(PUBLIC_DIR);
  for (const file of fs.readdirSync(PUBLIC_DIR)) fs.unlinkSync(path.join(PUBLIC_DIR, file));

  const index = [];
  const canonical = {};
  let totalBytes = 0;
  let totalVertices = 0;
  let outsideAct = 0;

  for (const group of grouped.values()) {
    const variants = groupExactGeometryVariants(group.records);
    for (const variant of variants) {
      const bbox = geometryBbox(variant.geometry);
      if (!bboxWithin(bbox, ACT_BBOX)) outsideAct += 1;
      const catchType = variant.catch_types.join('+');
      const sourceCode = variant.source_school_codes.join('+');
      const zoneId = `act-${group.ageId}-${group.kind}-${sourceCode.replace(/[^a-zA-Z0-9-]+/g, '-')}`;
      const fileName = `${zoneId}.json`;
      const entry = {
        location_age_id: Number(group.ageId),
        acara_sml_id: group.school.acara_sml_id,
        kind: group.kind,
        catch_type: catchType,
        year_levels: variant.year_levels,
        zone_id: zoneId,
        geometry_url: `/data/catchment/act/${fileName}`,
        bbox: coarsenBbox(bbox),
      };
      index.push(entry);

      const feature = {
        type: 'Feature',
        geometry: variant.geometry,
        properties: {
          location_age_id: Number(group.ageId),
          acara_sml_id: group.school.acara_sml_id,
          school_name: group.school.school_name,
          kind: group.kind,
          catch_type: catchType,
          year_levels: variant.year_levels,
          zone_id: zoneId,
          data_year: DATA_YEAR,
          source: ACT_CATCHMENT_SOURCE,
          source_url: DATASET_URL,
          licence: LICENCE,
          attribution: ATTRIBUTION,
        },
      };
      const outputPath = path.join(PUBLIC_DIR, fileName);
      writeJson(outputPath, feature, { pretty: false });
      totalBytes += fs.statSync(outputPath).size;
      totalVertices += countVertices(variant.geometry);

      if (!canonical[group.ageId]) canonical[group.ageId] = [];
      canonical[group.ageId].push({
        geometry_url: entry.geometry_url,
        zone_id: zoneId,
        kind: group.kind,
        catch_type: catchType,
        year_levels: variant.year_levels,
        source_school_code: sourceCode,
        data_year: DATA_YEAR,
        source: ACT_CATCHMENT_SOURCE,
        source_url: DATASET_URL,
      });
    }
  }

  index.sort((a, b) => (
    a.location_age_id - b.location_age_id
    || a.kind.localeCompare(b.kind)
    || a.zone_id.localeCompare(b.zone_id)
  ));
  for (const entries of Object.values(canonical)) {
    entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.zone_id.localeCompare(b.zone_id));
  }

  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  writeJson(indexPath, {
    state: 'ACT',
    data_year: DATA_YEAR,
    source: ACT_CATCHMENT_SOURCE,
    source_url: DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: index,
  }, { pretty: false });
  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'ACT',
    data_year: DATA_YEAR,
    generated_at: new Date().toISOString(),
    stats,
    join: {
      method: 'exact base name or audited exact alias/campus mapping plus polygon containment',
      source_features: records.length,
      joined_source_features: records.length - unmatched.length,
      source_attachments: Object.values(stats).reduce((sum, value) => sum + value.attachments, 0),
      matched_locations: new Set([...grouped.values()].map((group) => group.ageId)).size,
      variants: index.length,
      match_methods: matchMethods,
    },
    by_location_age_id: canonical,
  });
  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Exact future-school identities without a 2025 ACARA location_age_id remain unmatched. No key is invented and no fuzzy or nearest-school fallback is used.',
    records: unmatched,
  });

  console.log(`ACT source features joined: ${records.length - unmatched.length}/${records.length}`);
  console.log(`Source attachments: ${Object.values(stats).reduce((sum, value) => sum + value.attachments, 0)}`);
  console.log(`ACARA locations with PEAs: ${Object.keys(canonical).length}/${locations.filter((item) => Number.isFinite(item.location_age_id)).length}`);
  console.log(`Exact variants: ${index.length}, ${(totalBytes / 1e6).toFixed(2)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Match methods: ${JSON.stringify(matchMethods)}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (outsideAct > 0) console.log(`WARNING: ${outsideAct} zones have a bbox outside ACT`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
