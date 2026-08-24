// Validate ACT 2027 Priority Enrolment Area joins, geometry and canonical use.

import fs from 'node:fs';
import path from 'node:path';
import {
  ACT_BBOX,
  ACT_CATCHMENT_SOURCE,
  DATA_YEAR,
  EXPECTED_SOURCE_FEATURES,
  PROCESSED_DIR,
  PUBLIC_DIR,
  geometryAreaKm2,
  pointInGeometry,
  readJson,
} from './act-catchment-common.mjs';

const EXPECTED_STATS = {
  Primary: { polygons: 63, joined: 61, attachments: 61, floor: 0.9683 },
  High: { polygons: 22, joined: 22, attachments: 23, floor: 1 },
  College: { polygons: 9, joined: 9, attachments: 9, floor: 1 },
};
const canonicalPath = 'public/data/schools.canonical.json';
const errors = [];
const warnings = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

function eachRing(geometry, visit) {
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(visit);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((polygon) => polygon.forEach(visit));
  else errors.push(`Unexpected geometry type ${geometry.type}`);
}

function ringIsClosed(ring) {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

const layer = readJson(path.join(PROCESSED_DIR, 'catchment-layer.json'));
const unmatched = readJson(path.join(PROCESSED_DIR, 'unmatched.json'));
const index = readJson(path.join(PUBLIC_DIR, 'index.json'));
const canonical = fs.existsSync(canonicalPath) ? readJson(canonicalPath) : null;
const schoolsByLocation = new Map((canonical ?? []).map((school) => [Number(school.location_age_id), school]));

check(layer.join?.source_features === EXPECTED_SOURCE_FEATURES,
  `ACT source has ${layer.join?.source_features} features, expected ${EXPECTED_SOURCE_FEATURES}`);
for (const [type, expected] of Object.entries(EXPECTED_STATS)) {
  const actual = layer.stats?.[type];
  check(actual?.polygons === expected.polygons, `${type}: ${actual?.polygons} polygons, expected ${expected.polygons}`);
  check(actual?.joined === expected.joined, `${type}: ${actual?.joined} joined, expected ${expected.joined}`);
  check(actual?.attachments === expected.attachments,
    `${type}: ${actual?.attachments} attachments, expected ${expected.attachments}`);
  check(actual?.join_rate >= expected.floor,
    `${type}: join rate ${actual?.join_rate} is below ${expected.floor}`);
}
check(layer.join?.joined_source_features === 92, 'ACT must join 92/94 source features');
check(layer.join?.source_attachments === 93, 'ACT must emit 93 source attachments');
check(layer.join?.matched_locations === 83, 'ACT must attach PEAs to 83 ACARA locations');
check(layer.join?.variants === 93, 'ACT must emit 93 exact variants');
check(index.catchments.length === 93, `ACT index has ${index.catchments.length} entries, expected 93`);
check(unmatched.count === 2, `ACT unmatched count is ${unmatched.count}, expected 2 future schools`);
check(
  unmatched.records.every((record) => record.reason === 'exact_acara_identity_has_no_location_age_id'),
  'ACT unmatched records must be exact future identities lacking location_age_id',
);
check(
  new Set(unmatched.records.map((record) => record.source_name)).size === 2
    && unmatched.records.some((record) => record.source_name === 'Strathnairn Primary School')
    && unmatched.records.some((record) => record.source_name === 'Whitlam Primary School (P-6)'),
  'ACT future-school unmatched tripwire changed',
);

if (index.data_year < new Date().getFullYear()) {
  warnings.push(`ACT PEA data year ${index.data_year} is behind the current year`);
}

let vertices = 0;
let contained = 0;
const verificationRows = [];
for (const entry of index.catchments) {
  const relativeUrl = String(entry.geometry_url ?? '').replace(/^\/+/, '');
  const filePath = path.join('public', relativeUrl);
  check(Boolean(entry.zone_id), `${entry.location_age_id}: missing stable zone_id`);
  check(Boolean(entry.geometry_url), `${entry.location_age_id}: missing geometry_url`);
  check(fs.existsSync(filePath), `${entry.zone_id}: geometry file is missing`);
  if (!fs.existsSync(filePath)) continue;

  const feature = readJson(filePath);
  const school = schoolsByLocation.get(Number(entry.location_age_id));
  const layerEntry = (layer.by_location_age_id?.[String(entry.location_age_id)] ?? [])
    .find((candidate) => candidate.zone_id === entry.zone_id);
  check(feature.type === 'Feature', `${entry.zone_id}: not a GeoJSON Feature`);
  check(feature.properties?.data_year === DATA_YEAR, `${entry.zone_id}: incorrect data_year`);
  check(feature.properties?.zone_id === entry.zone_id, `${entry.zone_id}: feature/index identity mismatch`);
  check(Array.isArray(entry.year_levels) && entry.year_levels.length > 0,
    `${entry.zone_id}: ACT publishes an exact per-zone year range`);
  check(Boolean(layerEntry?.source_school_code), `${entry.zone_id}: missing source_school_code`);
  if (entry.kind === 'secondary') {
    check(entry.year_levels.every((level) => Number(level) >= 7 && Number(level) <= 12),
      `${entry.zone_id}: secondary year level outside 7-12`);
  }

  eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${entry.zone_id}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < ACT_BBOX.minLng || lng > ACT_BBOX.maxLng || lat < ACT_BBOX.minLat || lat > ACT_BBOX.maxLat) {
        errors.push(`${entry.zone_id}: coordinate ${lng},${lat} outside ACT`);
        break;
      }
      if (lng < entry.bbox[0] || lng > entry.bbox[2] || lat < entry.bbox[1] || lat > entry.bbox[3]) {
        errors.push(`${entry.zone_id}: coordinate ${lng},${lat} outside index bbox`);
        break;
      }
    }
  });

  if (school) {
    if (pointInGeometry([school.lng, school.lat], feature.geometry)) contained += 1;
    else errors.push(`${school.school_name}: coordinates outside attached ${entry.zone_id}`);
    verificationRows.push({
      school: school.school_name,
      suburb: school.suburb,
      type: entry.catch_type,
      years: entry.year_levels.join(','),
      code: layerEntry?.source_school_code,
      area: geometryAreaKm2(feature.geometry),
    });
  }
}
check(contained === index.catchments.length,
  `${contained}/${index.catchments.length} ACT variants contain their attached school`);

const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(geometryFiles.length === index.catchments.length,
  `${geometryFiles.length} geometry files but ${index.catchments.length} index entries`);

if (canonical) {
  let attachedSchools = 0;
  let attachedVariants = 0;
  for (const school of canonical) {
    const catchments = (school.catchments ?? []).filter((item) => item.source === ACT_CATCHMENT_SOURCE);
    if (catchments.length === 0) continue;
    attachedSchools += 1;
    attachedVariants += catchments.length;
    check(school.state === 'ACT', `${school.school_name}: ACT PEA attached to ${school.state}`);
    check(school.sector === 'Government', `${school.school_name}: ACT PEA attached to ${school.sector}`);
    for (const catchment of catchments) {
      check(Boolean(catchment.source_url), `${school.school_name}: missing source_url`);
      check(catchment.data_year === DATA_YEAR, `${school.school_name}: wrong data_year`);
      check(Boolean(catchment.source_school_code), `${school.school_name}: missing source_school_code`);
      check(Array.isArray(catchment.year_levels) && catchment.year_levels.length > 0,
        `${school.school_name}: missing source year levels`);
      const target = path.join('public', String(catchment.geometry_url ?? '').replace(/^\/+/, ''));
      check(fs.existsSync(target), `${school.school_name}: geometry_url target missing`);
    }
  }
  check(attachedSchools === 83, `Canonical has ${attachedSchools} ACT schools with PEAs, expected 83`);
  check(attachedVariants === 93, `Canonical has ${attachedVariants} ACT PEA variants, expected 93`);
} else {
  warnings.push('schools.canonical.json not found; canonical checks skipped');
}

verificationRows.sort((a, b) => a.suburb.localeCompare(b.suburb) || a.school.localeCompare(b.school));
console.log('Human verification - ACT variants sorted by suburb:');
for (const row of verificationRows) {
  console.log(`  ${row.suburb} | ${row.school} | ${row.type} | ${row.years} | ${row.code} | ${row.area.toFixed(2)} km2`);
}
console.log(`Source features joined: ${layer.join.joined_source_features}/${layer.join.source_features}`);
console.log(`Index variants: ${index.catchments.length}, attached locations: ${layer.join.matched_locations}`);
console.log(`Variants containing their own school: ${contained}/${index.catchments.length}`);
console.log(`Vertices: ${vertices.toLocaleString()}, unmatched: ${unmatched.count}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 30)) console.error(`ERROR ${error}`);
  if (errors.length > 30) console.error(`... and ${errors.length - 30} more`);
  process.exit(1);
}
console.log('OK');
