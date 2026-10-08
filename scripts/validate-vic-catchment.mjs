// Validate Victorian year-specific catchment artefacts and canonical links.

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_YEAR,
  LAYERS,
  LICENCE,
  PROCESSED_DIR,
  PUBLIC_DIR,
  VIC_BBOX,
  VIC_CATCHMENT_SOURCE,
  readJson,
  pointInGeometry,
} from './vic-catchment-common.mjs';
import { eachRing, ringIsClosed } from './catchment-common.mjs';

const JOIN_RATE_FLOOR = {
  primary: 0.98,
  secondary_year_7: 0.98,
  secondary_year_8: 0.98,
  secondary_year_9: 0.99,
  secondary_year_10: 1,
  secondary_year_11: 1,
  secondary_year_12: 1,
  junior_secondary: 1,
  senior_secondary: 1,
  single_sex: 1,
};

const EXPECTED_POLYGONS = {
  primary: 1269,
  secondary_year_7: 326,
  secondary_year_8: 326,
  secondary_year_9: 320,
  secondary_year_10: 305,
  secondary_year_11: 293,
  secondary_year_12: 291,
  junior_secondary: 2,
  senior_secondary: 3,
  single_sex: 5,
};

const MAX_UNMATCHED_ENTITIES = 27;
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

check(layer.state === 'VIC' && index.state === 'VIC', 'State metadata is not VIC');
check(layer.data_year === DATA_YEAR && index.data_year === DATA_YEAR, `Data year is not ${DATA_YEAR}`);
check(index.licence === LICENCE, `Index licence is not ${LICENCE}`);

for (const { key } of LAYERS) {
  const stats = layer.stats?.[key];
  check(Boolean(stats), `No join stats for ${key}`);
  if (!stats) continue;
  check(
    stats.polygons === EXPECTED_POLYGONS[key],
    `${key} has ${stats.polygons} polygons, expected ${EXPECTED_POLYGONS[key]}`,
  );
  check(
    stats.join_rate >= JOIN_RATE_FLOOR[key],
    `${key} join rate ${(stats.join_rate * 100).toFixed(1)}% is below ${(JOIN_RATE_FLOOR[key] * 100).toFixed(0)}%`,
  );
}
check(
  unmatched.count <= MAX_UNMATCHED_ENTITIES,
  `${unmatched.count} source entities are unmatched, above the audited maximum ${MAX_UNMATCHED_ENTITIES}`,
);
check(
  layer.join?.joined_entities + layer.join?.unmatched_entities === layer.join?.entities,
  'Entity join totals do not add up',
);

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

  const relativeUrl = String(entry.geometry_url ?? '').replace(/^\/+/, '');
  const filePath = path.join('public', relativeUrl);
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
  check(props.source === VIC_CATCHMENT_SOURCE, `${entry.zone_id}: wrong source`);
  check(props.licence === LICENCE, `${entry.zone_id}: wrong licence`);
  check(Array.isArray(entry.year_levels) && entry.year_levels.length > 0, `${entry.zone_id}: no published year levels`);

  if (entry.kind === 'primary') {
    check(
      entry.year_levels.join(',') === 'P,1,2,3,4,5,6',
      `${entry.zone_id}: primary variant does not carry P-6`,
    );
  } else if (entry.kind === 'secondary') {
    check(
      entry.year_levels.every((year) => ['7', '8', '9', '10', '11', '12'].includes(year)),
      `${entry.zone_id}: secondary variant has a non-secondary year`,
    );
  } else errors.push(`${entry.zone_id}: unexpected kind ${entry.kind}`);

  const exactKey = `${entry.location_age_id}:${entry.kind}:${JSON.stringify(feature.geometry)}`;
  check(!exactGeometryBySchoolKind.has(exactKey), `${entry.zone_id}: identical geometry was not coalesced`);
  exactGeometryBySchoolKind.set(exactKey, entry.zone_id);

  const knownType = eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${entry.zone_id}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < VIC_BBOX.minLng || lng > VIC_BBOX.maxLng || lat < VIC_BBOX.minLat || lat > VIC_BBOX.maxLat) {
        errors.push(`${entry.zone_id}: coordinate ${lng},${lat} falls outside VIC`);
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
    check(school.state === 'VIC', `${entry.zone_id}: attached to a ${school.state} school`);
    check(school.sector === 'Government', `${entry.zone_id}: attached to a ${school.sector} school`);
    if (pointInGeometry([school.longitude, school.latitude], feature.geometry)) containing += 1;
    else errors.push(`${entry.zone_id}: attached ACARA location lies outside this exact year variant`);
  }
}

const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(
  geometryFiles.length === index.catchments.length,
  `${geometryFiles.length} geometry files but ${index.catchments.length} index entries`,
);

if (canonicalSchools) {
  const canonicalVic = canonicalSchools.flatMap((school) => (
    (school.catchments ?? [])
      .filter((catchment) => catchment.source === VIC_CATCHMENT_SOURCE)
      .map((catchment) => ({ school, catchment }))
  ));
  check(
    canonicalVic.length === index.catchments.length,
    `Canonical has ${canonicalVic.length} VIC variants, index has ${index.catchments.length}`,
  );
  for (const { school, catchment } of canonicalVic) {
    check(school.state === 'VIC', `${school.school_name}: VIC zone attached to ${school.state}`);
    check(school.sector === 'Government', `${school.school_name}: VIC zone attached to ${school.sector}`);
    check(Boolean(catchment.zone_id), `${school.school_name}: catchment missing zone_id`);
    check(zoneIds.has(catchment.zone_id), `${school.school_name}: canonical zone_id not in index`);
    check(geometryUrls.has(catchment.geometry_url), `${school.school_name}: canonical geometry_url not in index`);
    check(Array.isArray(catchment.year_levels) && catchment.year_levels.length > 0, `${school.school_name}: catchment missing years`);
    check(Boolean(catchment.source_url), `${school.school_name}: catchment missing source_url`);
    check(catchment.data_year === DATA_YEAR, `${school.school_name}: catchment data_year is not ${DATA_YEAR}`);
    check(Boolean(catchment.source_school_code), `${school.school_name}: catchment missing source_school_code`);
  }
} else {
  warnings.push('schools.canonical.json not found — skipped canonical attachment checks');
}

const currentYear = new Date().getFullYear();
if (index.data_year < currentYear) {
  warnings.push(`VIC zones are for ${index.data_year}; check the official dataset for a newer release.`);
}

console.log(`Index variants: ${index.catchments.length}`);
console.log(`Exact variants containing their ACARA location: ${containing}/${index.catchments.length}`);
console.log(`Vertices: ${vertices.toLocaleString()}`);
console.log(`Entities joined: ${layer.join.joined_entities}/${layer.join.entities}`);
console.log(`Unmatched entities: ${unmatched.count}`);
console.log(`Join methods: ${JSON.stringify(layer.join.method_counts)}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 30)) console.error(`ERROR ${error}`);
  if (errors.length > 30) console.error(`… and ${errors.length - 30} more`);
  process.exit(1);
}
console.log('OK');
