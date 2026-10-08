// Validate Queensland stage catchments and their canonical attachments.

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_YEAR,
  LICENCE,
  LAYERS,
  PROCESSED_DIR,
  PUBLIC_DIR,
  QLD_BBOX,
  QLD_CATCHMENT_SOURCE,
  readJson,
  pointInGeometry,
} from './qld-catchment-common.mjs';
import { eachRing, ringIsClosed } from './catchment-common.mjs';

const EXPECTED = {
  primary: { catchments: 1032, sites: 1033, joinRate: 0.997 },
  junior_secondary: { catchments: 274, sites: 276, joinRate: 0.995 },
  senior_secondary: { catchments: 229, sites: 229, joinRate: 0.995 },
};
const MAX_UNMATCHED_SOURCE_RECORDS = 5;
const EXPECTED_VARIANTS = 1362;
const canonicalPath = 'public/data/schools.canonical.json';
const locationPath = 'data/acara/processed/school-location-2025.json';
const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const layer = readJson(path.join(PROCESSED_DIR, 'catchment-layer.json'));
const index = readJson(path.join(PUBLIC_DIR, 'index.json'));
const unmatched = readJson(path.join(PROCESSED_DIR, 'unmatched.json'));
const locations = readJson(locationPath).records;
const locationsByAgeId = new Map(locations.map((school) => [Number(school.location_age_id), school]));
const canonicalSchools = fs.existsSync(canonicalPath) ? readJson(canonicalPath) : null;

check(layer.state === 'QLD' && index.state === 'QLD', 'State metadata is not QLD');
check(layer.data_year === DATA_YEAR && index.data_year === DATA_YEAR, `Data year is not ${DATA_YEAR}`);
check(index.licence === LICENCE, `Index licence is not ${LICENCE}`);

for (const { key } of LAYERS) {
  const stats = layer.stats?.[key];
  const expected = EXPECTED[key];
  check(Boolean(stats), `No join stats for ${key}`);
  if (!stats) continue;
  check(stats.catchments === expected.catchments, `${key} has ${stats.catchments} catchments, expected ${expected.catchments}`);
  check(stats.sites === expected.sites, `${key} has ${stats.sites} sites, expected ${expected.sites}`);
  check(
    stats.join_rate >= expected.joinRate,
    `${key} join rate ${(stats.join_rate * 100).toFixed(2)}% is below ${(expected.joinRate * 100).toFixed(1)}%`,
  );
}
check(unmatched.count <= MAX_UNMATCHED_SOURCE_RECORDS, `${unmatched.count} unmatched records exceed ${MAX_UNMATCHED_SOURCE_RECORDS}`);
check(
  layer.join.matched_source_entities + layer.join.unmatched_source_entities
    === LAYERS.reduce((sum, item) => sum + layer.stats[item.key].catchments, 0),
  'Source join totals do not add up',
);
check(index.catchments.length === EXPECTED_VARIANTS, `${index.catchments.length} variants, expected ${EXPECTED_VARIANTS}`);

const zoneIds = new Set();
const geometryUrls = new Set();
const exactGeometryBySchoolKind = new Map();
let vertices = 0;
let containing = 0;

for (const entry of index.catchments) {
  check(Boolean(entry.zone_id), `location ${entry.location_age_id}: missing zone_id`);
  check(Boolean(entry.geometry_url), `${entry.zone_id ?? entry.location_age_id}: missing geometry_url`);
  check(!zoneIds.has(entry.zone_id), `Duplicate zone_id ${entry.zone_id}`);
  check(!geometryUrls.has(entry.geometry_url), `Duplicate geometry_url ${entry.geometry_url}`);
  zoneIds.add(entry.zone_id);
  geometryUrls.add(entry.geometry_url);

  const filePath = path.join('public', String(entry.geometry_url ?? '').replace(/^\/+/, ''));
  if (!fs.existsSync(filePath)) {
    errors.push(`${entry.zone_id}: geometry_url does not resolve (${entry.geometry_url})`);
    continue;
  }
  const feature = readJson(filePath);
  const props = feature.properties ?? {};
  check(feature.type === 'Feature', `${entry.zone_id}: not a GeoJSON Feature`);
  check(props.zone_id === entry.zone_id, `${entry.zone_id}: feature zone_id differs from index`);
  check(props.location_age_id === entry.location_age_id, `${entry.zone_id}: feature location differs from index`);
  check(props.kind === entry.kind, `${entry.zone_id}: feature kind differs from index`);
  check(JSON.stringify(props.year_levels) === JSON.stringify(entry.year_levels), `${entry.zone_id}: feature years differ from index`);
  check(props.data_year === DATA_YEAR, `${entry.zone_id}: feature data_year is not ${DATA_YEAR}`);
  check(props.source === QLD_CATCHMENT_SOURCE, `${entry.zone_id}: wrong source`);
  check(props.licence === LICENCE, `${entry.zone_id}: wrong licence`);

  if (entry.catch_type === 'PRIMARY') {
    check(entry.kind === 'primary', `${entry.zone_id}: primary catchment has kind ${entry.kind}`);
    check(entry.year_levels.join(',') === 'P,1,2,3,4,5,6', `${entry.zone_id}: primary years are not Prep-6`);
  } else if (entry.catch_type === 'JUNIOR_SECONDARY') {
    check(entry.year_levels.join(',') === '7,8,9,10', `${entry.zone_id}: junior years are not 7-10`);
  } else if (entry.catch_type === 'SENIOR_SECONDARY') {
    check(entry.year_levels.join(',') === '11,12', `${entry.zone_id}: senior years are not 11-12`);
  } else if (entry.catch_type === 'JUNIOR_SECONDARY+SENIOR_SECONDARY') {
    check(entry.year_levels.join(',') === '7,8,9,10,11,12', `${entry.zone_id}: combined years are not 7-12`);
  } else errors.push(`${entry.zone_id}: unexpected catch_type ${entry.catch_type}`);

  const exactKey = `${entry.location_age_id}:${entry.kind}:${JSON.stringify(feature.geometry)}`;
  check(!exactGeometryBySchoolKind.has(exactKey), `${entry.zone_id}: identical geometry was not coalesced`);
  exactGeometryBySchoolKind.set(exactKey, entry.zone_id);

  const knownType = eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${entry.zone_id}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < QLD_BBOX.minLng || lng > QLD_BBOX.maxLng || lat < QLD_BBOX.minLat || lat > QLD_BBOX.maxLat) {
        errors.push(`${entry.zone_id}: coordinate ${lng},${lat} falls outside QLD`);
        return;
      }
      if (lng < entry.bbox[0] || lng > entry.bbox[2] || lat < entry.bbox[1] || lat > entry.bbox[3]) {
        errors.push(`${entry.zone_id}: coordinate ${lng},${lat} falls outside the index bbox`);
        return;
      }
    }
  });
  if (!knownType) errors.push(`Unexpected geometry type ${feature.geometry.type}`);

  const school = locationsByAgeId.get(Number(entry.location_age_id));
  check(Boolean(school), `${entry.zone_id}: no ACARA location record`);
  if (school) {
    check(school.state === 'QLD', `${entry.zone_id}: attached to a ${school.state} school`);
    check(school.sector === 'Government', `${entry.zone_id}: attached to a ${school.sector} school`);
    if (pointInGeometry([school.longitude, school.latitude], feature.geometry)) containing += 1;
    else errors.push(`${entry.zone_id}: attached ACARA location lies outside this exact stage variant`);
  }
}

const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(geometryFiles.length === index.catchments.length, `${geometryFiles.length} geometry files but ${index.catchments.length} index entries`);

if (canonicalSchools) {
  const canonicalQld = canonicalSchools.flatMap((school) => (
    (school.catchments ?? [])
      .filter((catchment) => catchment.source === QLD_CATCHMENT_SOURCE)
      .map((catchment) => ({ school, catchment }))
  ));
  check(canonicalQld.length === index.catchments.length, `Canonical has ${canonicalQld.length} QLD variants, index has ${index.catchments.length}`);
  for (const { school, catchment } of canonicalQld) {
    check(school.state === 'QLD', `${school.school_name}: QLD zone attached to ${school.state}`);
    check(school.sector === 'Government', `${school.school_name}: QLD zone attached to ${school.sector}`);
    check(zoneIds.has(catchment.zone_id), `${school.school_name}: canonical zone_id not in index`);
    check(geometryUrls.has(catchment.geometry_url), `${school.school_name}: canonical geometry_url not in index`);
    check(Array.isArray(catchment.year_levels) && catchment.year_levels.length > 0, `${school.school_name}: missing years`);
    check(catchment.data_year === DATA_YEAR, `${school.school_name}: catchment data_year is not ${DATA_YEAR}`);
    check(Boolean(catchment.source_school_code), `${school.school_name}: missing source_school_code`);
  }
} else warnings.push('schools.canonical.json not found — skipped canonical attachment checks');

if (index.data_year < new Date().getFullYear()) {
  warnings.push(`QLD catchments are for ${index.data_year}; check the official dataset for a newer release.`);
}

console.log(`Index variants: ${index.catchments.length}`);
console.log(`Exact variants containing their ACARA location: ${containing}/${index.catchments.length}`);
console.log(`Vertices: ${vertices.toLocaleString()}`);
console.log(`Matched source entities: ${layer.join.matched_source_entities}`);
console.log(`Unmatched source records: ${unmatched.count}`);
console.log(`Join methods: ${JSON.stringify(layer.join.method_counts)}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 30)) console.error(`ERROR ${error}`);
  if (errors.length > 30) console.error(`... and ${errors.length - 30} more`);
  process.exit(1);
}
console.log('OK');
