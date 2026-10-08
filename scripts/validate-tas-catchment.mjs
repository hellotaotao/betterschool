// Validate Tasmania's published intake-area geometry, exact joins and canonical
// attachments. The source is comprehensive for primary/district address areas;
// high-school feeder relationships are intentionally outside this layer.

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_YEAR,
  EXPECTED_SOURCE_FEATURES,
  PROCESSED_DIR,
  PUBLIC_DIR,
  TAS_BBOX,
  TAS_CATCHMENT_SOURCE,
  geometryAreaKm2,
  pointInGeometry,
  readJson,
} from './tas-catchment-common.mjs';
import { eachRing, ringIsClosed } from './catchment-common.mjs';

const canonicalPath = 'public/data/schools.canonical.json';
const errors = [];
const warnings = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

const layer = readJson(path.join(PROCESSED_DIR, 'catchment-layer.json'));
const unmatched = readJson(path.join(PROCESSED_DIR, 'unmatched.json'));
const index = readJson(path.join(PUBLIC_DIR, 'index.json'));
const canonical = fs.existsSync(canonicalPath) ? readJson(canonicalPath) : null;
const schoolsByLocation = new Map((canonical ?? []).map((school) => [Number(school.location_age_id), school]));

const stats = layer.stats?.primary;
check(stats?.polygons === EXPECTED_SOURCE_FEATURES,
  `TAS source has ${stats?.polygons} polygons, expected ${EXPECTED_SOURCE_FEATURES}`);
check(stats?.join_rate === 1, `TAS join rate is ${stats?.join_rate}, expected 1.0`);
check(stats?.school_attachments === 150, `TAS has ${stats?.school_attachments} school attachments, expected 150`);
check(unmatched.count === 0, `${unmatched.count} TAS polygons remain unmatched`);
check(index.catchments.length === 150, `TAS index has ${index.catchments.length} entries, expected 150`);

if (index.data_year < new Date().getFullYear()) {
  warnings.push(
    `TAS open-data snapshot is ${index.data_year}; check LISTdata for a newer statewide extract before rebuilding.`,
  );
}

let vertices = 0;
let contained = 0;
const verificationRows = [];
for (const entry of index.catchments) {
  const fileName = `${entry.location_age_id}-primary.json`;
  const filePath = path.join(PUBLIC_DIR, fileName);
  check(fs.existsSync(filePath), `${fileName}: geometry file is missing`);
  if (!fs.existsSync(filePath)) continue;

  const feature = readJson(filePath);
  const school = schoolsByLocation.get(Number(entry.location_age_id));
  const layerEntry = layer.by_location_age_id?.[String(entry.location_age_id)]?.[0];
  check(feature.type === 'Feature', `${fileName}: not a GeoJSON Feature`);
  check(feature.properties?.data_year === DATA_YEAR, `${fileName}: incorrect data_year`);
  check(entry.kind === 'primary', `${fileName}: TAS address intake must be primary kind`);
  check(entry.catch_type === 'PRIMARY_INTAKE', `${fileName}: incorrect catch_type`);
  check(Array.isArray(entry.year_levels) && entry.year_levels.length === 0,
    `${fileName}: source has no per-zone year levels`);
  check(Boolean(layerEntry?.source_school_code), `${fileName}: missing source_school_code`);

  const knownType = eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${fileName}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < TAS_BBOX.minLng || lng > TAS_BBOX.maxLng || lat < TAS_BBOX.minLat || lat > TAS_BBOX.maxLat) {
        errors.push(`${fileName}: coordinate ${lng},${lat} is outside TAS`);
        break;
      }
      if (lng < entry.bbox[0] || lng > entry.bbox[2] || lat < entry.bbox[1] || lat > entry.bbox[3]) {
        errors.push(`${fileName}: coordinate ${lng},${lat} is outside the index bbox`);
        break;
      }
    }
  });
  if (!knownType) errors.push(`Unexpected geometry type ${feature.geometry.type}`);

  if (school) {
    if (pointInGeometry([school.lng, school.lat], feature.geometry)) contained += 1;
    else errors.push(`${school.school_name}: its coordinates fall outside its attached zone`);
    verificationRows.push({
      suburb: school.suburb,
      school: school.school_name,
      area: geometryAreaKm2(feature.geometry),
      code: layerEntry?.source_school_code,
    });
  }
}
check(contained === index.catchments.length,
  `${contained}/${index.catchments.length} TAS zones contain their attached school`);

const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(geometryFiles.length === index.catchments.length,
  `${geometryFiles.length} geometry files but ${index.catchments.length} index entries`);

if (canonical) {
  let attached = 0;
  for (const school of canonical) {
    const catchments = (school.catchments ?? []).filter((item) => item.source === TAS_CATCHMENT_SOURCE);
    if (catchments.length === 0) continue;
    attached += 1;
    check(school.state === 'TAS', `${school.school_name}: TAS zone attached to ${school.state}`);
    check(school.sector === 'Government', `${school.school_name}: TAS zone attached to ${school.sector}`);
    for (const catchment of catchments) {
      check(Boolean(catchment.source_url), `${school.school_name}: missing source_url`);
      check(catchment.data_year === DATA_YEAR, `${school.school_name}: wrong data_year`);
      check(Boolean(catchment.source_school_code), `${school.school_name}: missing source_school_code`);
      check(Array.isArray(catchment.year_levels) && catchment.year_levels.length === 0,
        `${school.school_name}: TAS year_levels must be an empty array`);
      const geometryPath = path.join('public', String(catchment.geometry_url ?? '').replace(/^\/+/, ''));
      check(fs.existsSync(geometryPath), `${school.school_name}: missing geometry_url target`);
    }
  }
  check(attached === 150, `Canonical has ${attached} TAS schools with zones, expected 150`);
} else {
  warnings.push('schools.canonical.json not found; canonical attachment checks skipped');
}

verificationRows.sort((a, b) => a.suburb.localeCompare(b.suburb) || a.school.localeCompare(b.school));
console.log('Human verification - TAS zones sorted by suburb:');
for (const row of verificationRows) {
  console.log(`  ${row.suburb} | ${row.school} | ${row.code} | ${row.area.toFixed(2)} km2`);
}
console.log(`Source polygons: ${stats.polygons}, school attachments: ${index.catchments.length}`);
console.log(`Zones containing their own school: ${contained}/${index.catchments.length}`);
console.log(`Vertices: ${vertices.toLocaleString()}`);
console.log(`Unmatched: ${unmatched.count}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 30)) console.error(`ERROR ${error}`);
  if (errors.length > 30) console.error(`... and ${errors.length - 30} more`);
  process.exit(1);
}
console.log('OK');
