// Attach Tasmanian primary/district intake areas to ACARA school identity.
//
// The source carries no ACARA identifier or official school-site table. The
// safe join is therefore exact identity plus an independent spatial condition:
// an exact ACARA name (or checked-in exact rename) must lie inside the polygon.
// One explicitly shared feature is attached to both schools it names, but only
// when both coordinates are contained. Anything else remains unmatched.
//
// The source publishes no per-zone year attributes. Although the department
// describes primary schools as K-6 and district schools as K-12, those are
// school designations, not attributes of individual polygons, so year_levels
// remains empty. The separate high-school feeder layer is deliberately not
// emitted: entitlement follows the primary school attended at the end of Year
// 6, not simply the residential address, and the runtime contract represents
// address catchments rather than feeder relationships.

import fs from 'node:fs';
import path from 'node:path';
import { readTasZones } from './parse-tas-catchment.mjs';
import {
  ATTRIBUTION,
  DATA_YEAR,
  DATASET_URL,
  EXPECTED_SOURCE_FEATURES,
  LICENCE,
  PROCESSED_DIR,
  PUBLIC_DIR,
  TAS_BBOX,
  TAS_CATCHMENT_SOURCE,
  TAS_NAME_ALIASES,
  TAS_SHARED_ZONES,
  coarsenBbox,
  countVertices,
  ensureDir,
  geometryBbox,
  mergeGeometries,
  normaliseName,
  pointInGeometry,
  readJson,
  writeJson,
} from './tas-catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

const candidatesByExactNames = (names, geometry, acaraSchools) => {
  const keys = new Set(names.map(normaliseName));
  return acaraSchools.filter((school) => (
    keys.has(normaliseName(school.school_name))
    && pointInGeometry([school.longitude, school.latitude], geometry)
  ));
};

export function resolveTasMatches({ record, acaraSchools }) {
  const sharedNames = TAS_SHARED_ZONES.get(record.source_name);
  if (sharedNames) {
    const schools = candidatesByExactNames(sharedNames, record.geometry, acaraSchools)
      .sort((a, b) => a.location_age_id - b.location_age_id);
    if (schools.length === sharedNames.length) {
      return { schools, method: 'audited_shared_zone_and_containment' };
    }
    return { schools: [], reason: 'shared_zone_did_not_contain_both_named_schools' };
  }

  const aliasNames = TAS_NAME_ALIASES.get(record.source_name);
  const targetNames = aliasNames ?? [record.source_name];
  const schools = candidatesByExactNames(targetNames, record.geometry, acaraSchools);
  if (schools.length === 1) {
    return {
      schools,
      method: aliasNames ? 'audited_exact_alias_and_containment' : 'exact_name_and_containment',
    };
  }
  return {
    schools: [],
    reason: schools.length === 0
      ? 'no_exact_acara_candidate_inside_zone'
      : 'several_exact_acara_candidates_inside_zone',
  };
}

function withinTas([minLng, minLat, maxLng, maxLat]) {
  return minLng >= TAS_BBOX.minLng && maxLng <= TAS_BBOX.maxLng
    && minLat >= TAS_BBOX.minLat && maxLat <= TAS_BBOX.maxLat;
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}; run 'npm run tas:catchment:fetch' first`);
  }
  readJson(manifestPath);

  const locationPayload = readJson(locationPath);
  const acaraSchools = locationPayload.records.filter((record) => (
    record.state === 'TAS'
    && record.sector === 'Government'
    && Number.isFinite(record.latitude)
    && Number.isFinite(record.longitude)
  ));
  const records = await readTasZones();
  if (records.length !== EXPECTED_SOURCE_FEATURES) {
    throw new Error(`TAS source has ${records.length} features, expected ${EXPECTED_SOURCE_FEATURES}`);
  }

  const grouped = new Map();
  const unmatched = [];
  const matchMethods = {};
  let joinedFeatures = 0;

  for (const record of records) {
    const result = resolveTasMatches({ record, acaraSchools });
    if (result.schools.length === 0) {
      unmatched.push({
        reason: result.reason,
        source_school_code: record.source_school_code || null,
        source_name: record.source_name,
        source_sector: record.source_sector,
      });
      continue;
    }

    joinedFeatures += 1;
    matchMethods[result.method] = (matchMethods[result.method] ?? 0) + 1;
    for (const school of result.schools) {
      const ageId = String(school.location_age_id ?? '');
      if (!ageId) throw new Error(`ACARA match has no location_age_id: ${school.school_name}`);
      if (!grouped.has(ageId)) grouped.set(ageId, { school, records: [], matchMethods: new Set() });
      grouped.get(ageId).records.push(record);
      grouped.get(ageId).matchMethods.add(result.method);
    }
  }

  ensureDir(PUBLIC_DIR);
  for (const file of fs.readdirSync(PUBLIC_DIR)) fs.unlinkSync(path.join(PUBLIC_DIR, file));

  const index = [];
  const canonical = {};
  let totalBytes = 0;
  let totalVertices = 0;
  let outsideTas = 0;

  for (const [ageId, group] of grouped) {
    const geometry = mergeGeometries(group.records);
    const bbox = geometryBbox(geometry);
    if (!withinTas(bbox)) outsideTas += 1;
    const sourceCodes = [...new Set(group.records.map((record) => (
      record.source_school_code || record.source_name
    )))];
    const sourceSectors = [...new Set(group.records.map((record) => record.source_sector))];
    const fileName = `${ageId}-primary.json`;
    const entry = {
      location_age_id: Number(ageId),
      acara_sml_id: group.school.acara_sml_id,
      kind: 'primary',
      catch_type: 'PRIMARY_INTAKE',
      year_levels: [],
      bbox: coarsenBbox(bbox),
    };
    index.push(entry);

    const feature = {
      type: 'Feature',
      geometry,
      properties: {
        location_age_id: Number(ageId),
        acara_sml_id: group.school.acara_sml_id,
        school_name: group.school.school_name,
        kind: 'primary',
        catch_type: entry.catch_type,
        year_levels: [],
        data_year: DATA_YEAR,
        source: TAS_CATCHMENT_SOURCE,
        source_url: DATASET_URL,
        licence: LICENCE,
        attribution: ATTRIBUTION,
      },
    };
    const outputPath = path.join(PUBLIC_DIR, fileName);
    writeJson(outputPath, feature, { pretty: false });
    totalBytes += fs.statSync(outputPath).size;
    totalVertices += countVertices(geometry);

    canonical[ageId] = [{
      geometry_url: `/data/catchment/tas/${fileName}`,
      kind: 'primary',
      catch_type: entry.catch_type,
      year_levels: [],
      source_school_code: sourceCodes.join('+'),
      data_year: DATA_YEAR,
      source: TAS_CATCHMENT_SOURCE,
      source_url: DATASET_URL,
      source_sector: sourceSectors.join('+'),
      match_method: [...group.matchMethods].sort().join('+'),
    }];
  }

  index.sort((a, b) => a.location_age_id - b.location_age_id);
  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  writeJson(indexPath, {
    state: 'TAS',
    data_year: DATA_YEAR,
    source: TAS_CATCHMENT_SOURCE,
    source_url: DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: index,
  }, { pretty: false });

  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'TAS',
    data_year: DATA_YEAR,
    generated_at: new Date().toISOString(),
    stats: {
      primary: {
        polygons: records.length,
        joined: joinedFeatures,
        join_rate: Number((joinedFeatures / records.length).toFixed(4)),
        school_attachments: grouped.size,
      },
    },
    join: {
      method: 'exact ACARA name or audited exact alias plus polygon containment',
      match_methods: matchMethods,
      shared_source_features: TAS_SHARED_ZONES.size,
    },
    by_location_age_id: canonical,
  });
  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Source polygons without one exact contained ACARA identity are left unmatched. No fuzzy or nearest-school fallback is used.',
    records: unmatched,
  });

  console.log(`TAS source features joined: ${joinedFeatures}/${records.length}`);
  console.log(`ACARA schools with intake areas: ${grouped.size}/${acaraSchools.length}`);
  console.log(`Match methods: ${JSON.stringify(matchMethods)}`);
  console.log(`Feature files: ${index.length}, ${(totalBytes / 1e6).toFixed(2)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (outsideTas > 0) console.log(`WARNING: ${outsideTas} zones have a bbox outside TAS`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
