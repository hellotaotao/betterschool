// Validate the NSW catchment artefacts.
//
// The join-rate floors are the important check: if data.nsw renames a column or
// changes an ID scheme, the join degrades silently and the app quietly stops
// showing catchments for a chunk of Sydney. Failing the build is the point.

import fs from 'node:fs';
import path from 'node:path';
import {
  PROCESSED_DIR,
  PUBLIC_DIR,
  NSW_BBOX,
  readJson,
} from './nsw-catchment-common.mjs';

/** Measured baselines; a drop below these means something upstream moved. */
const JOIN_RATE_FLOOR = { primary: 0.99, secondary: 0.98, future: 0.80 };

const canonicalPath = 'public/data/schools.canonical.json';
const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function ringIsClosed(ring) {
  if (ring.length < 4) return false;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  return firstLng === lastLng && firstLat === lastLat;
}

function eachRing(geometry, visit) {
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(visit);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((polygon) => polygon.forEach(visit));
  else errors.push(`Unexpected geometry type ${geometry.type}`);
}

const layer = readJson(path.join(PROCESSED_DIR, 'catchment-layer.json'));
const index = readJson(path.join(PUBLIC_DIR, 'index.json'));
const unmatched = readJson(path.join(PROCESSED_DIR, 'unmatched.json'));

// 1. Join rates have not regressed.
for (const [kind, floor] of Object.entries(JOIN_RATE_FLOOR)) {
  const stats = layer.stats[kind];
  check(stats !== undefined, `No join stats for layer ${kind}`);
  if (!stats) continue;
  check(
    stats.join_rate >= floor,
    `${kind} join rate ${(stats.join_rate * 100).toFixed(1)}% is below the ${(floor * 100).toFixed(0)}% floor `
      + `(${stats.joined}/${stats.polygons}) — the upstream ID scheme probably changed`,
  );
}

// 2. Every indexed catchment has a geometry file, and it is well formed.
let vertices = 0;
for (const entry of index.catchments) {
  const fileName = `${entry.location_age_id}-${entry.kind}.json`;
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    errors.push(`Index references missing geometry file ${fileName}`);
    continue;
  }

  const feature = readJson(filePath);
  check(feature.type === 'Feature', `${fileName}: not a GeoJSON Feature`);
  check(feature.properties?.data_year === index.data_year, `${fileName}: data_year disagrees with the index`);
  check(Array.isArray(entry.year_levels) && entry.year_levels.length > 0, `${fileName}: no year levels`);

  eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${fileName}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < NSW_BBOX.minLng || lng > NSW_BBOX.maxLng || lat < NSW_BBOX.minLat || lat > NSW_BBOX.maxLat) {
        errors.push(`${fileName}: coordinate ${lng},${lat} falls outside NSW`);
        return;
      }
      // The index bbox is a prefilter: rounding it must only ever expand it, so
      // every real vertex has to sit inside.
      if (lng < entry.bbox[0] || lng > entry.bbox[2] || lat < entry.bbox[1] || lat > entry.bbox[3]) {
        errors.push(`${fileName}: vertex ${lng},${lat} lies outside its index bbox`);
        return;
      }
    }
  });
}

// 3. No orphan files left behind by a previous build.
const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(
  geometryFiles.length === index.catchments.length,
  `${geometryFiles.length} geometry files but ${index.catchments.length} index entries — stale files from an earlier build?`,
);

// 4. Canonical attachment: NSW Government schools only.
if (fs.existsSync(canonicalPath)) {
  const schools = readJson(canonicalPath);
  let attached = 0;
  for (const school of schools) {
    // Other states publish zones too now, so filter by source rather than
    // asserting on every school that has any catchment at all.
    const nswCatchments = (school.catchments ?? []).filter((c) => c.source === 'data.nsw.gov.au');
    if (nswCatchments.length === 0) continue;
    attached += 1;
    check(school.state === 'NSW', `${school.school_name}: NSW catchment attached to a ${school.state} school`);
    check(
      school.sector === 'Government',
      `${school.school_name}: catchment attached to a ${school.sector} school — non-government schools have no zone`,
    );
    for (const catchment of nswCatchments) {
      check(Boolean(catchment.source_url), `${school.school_name}: catchment missing source_url`);
      check(Number.isFinite(catchment.data_year), `${school.school_name}: catchment missing data_year`);
    }
  }
  check(attached > 0, 'Canonical has no NSW catchments attached — did canonical:build run after nsw:catchment:build?');
  console.log(`Canonical NSW schools with a catchment: ${attached}`);
} else {
  warnings.push('schools.canonical.json not found — skipped the canonical attachment checks');
}

console.log(`Index entries: ${index.catchments.length}, vertices: ${vertices.toLocaleString()}`);
console.log(`Enrolment year: ${index.data_year}`);
console.log(`Unmatched polygons: ${unmatched.count}`);
for (const [kind, stats] of Object.entries(layer.stats)) {
  console.log(`  ${kind}: ${stats.joined}/${stats.polygons} (${(stats.join_rate * 100).toFixed(1)}%)`);
}

for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 20)) console.error(`ERROR ${error}`);
  if (errors.length > 20) console.error(`… and ${errors.length - 20} more`);
  process.exit(1);
}
console.log('OK');
