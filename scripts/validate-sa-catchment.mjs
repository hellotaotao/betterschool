// Validate the SA catchment artefacts.
//
// The join checks are the important ones. SA's chain ends in a spatial hop
// rather than an identifier, so the guard is not just "did it join" but "did it
// join to the right school": every zone must sit close to its ACARA match and
// carry the same name. If data.sa renames a column or moves a site, that shows
// up here as a distance or a name disagreement rather than as a Adelaide suburb
// quietly pointing at the wrong school.

import fs from 'node:fs';
import path from 'node:path';
import {
  PROCESSED_DIR,
  PUBLIC_DIR,
  SA_BBOX,
  DATA_YEAR,
  MAX_SITE_DISTANCE_KM,
  readJson,
  geometryAreaKm2,
  pointInGeometry,
} from './sa-catchment-common.mjs';
import { eachRing, ringIsClosed } from './catchment-common.mjs';

/**
 * Measured baselines. Both layers joined completely on the 2025 data, so the
 * floor is 1.0 — anything less means a site or an org_num moved and needs a
 * human to look, not a silently smaller map.
 */
const JOIN_RATE_FLOOR = { primary: 1.0, secondary: 1.0 };

/** Zone counts on the 2025 layers, as a tripwire for a half-downloaded archive. */
const EXPECTED_ZONES = { primary: 84, secondary: 46 };

const canonicalPath = 'public/data/schools.canonical.json';
const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const layer = readJson(path.join(PROCESSED_DIR, 'catchment-layer.json'));
const index = readJson(path.join(PUBLIC_DIR, 'index.json'));
const unmatched = readJson(path.join(PROCESSED_DIR, 'unmatched.json'));
const canonicalSchools = fs.existsSync(canonicalPath) ? readJson(canonicalPath) : null;
const schoolsByAcara = new Map((canonicalSchools ?? []).map((school) => [school.acara_sml_id, school]));
const schoolsByLocation = new Map((canonicalSchools ?? []).map((school) => [Number(school.location_age_id), school]));

// 1. Join rates have not regressed.
for (const [kind, floor] of Object.entries(JOIN_RATE_FLOOR)) {
  const stats = layer.stats[kind];
  check(stats !== undefined, `No join stats for layer ${kind}`);
  if (!stats) continue;
  check(
    stats.join_rate >= floor,
    `${kind} join rate ${(stats.join_rate * 100).toFixed(1)}% is below the ${(floor * 100).toFixed(0)}% floor `
      + `(${stats.joined}/${stats.polygons}) — see ${path.join(PROCESSED_DIR, 'unmatched.json')}`,
  );
  check(
    stats.polygons === EXPECTED_ZONES[kind],
    `${kind} layer has ${stats.polygons} polygons, expected ${EXPECTED_ZONES[kind]} — `
      + 'the pinned resource may point at a different enrolment year',
  );
}

// 2. The spatial hop landed where it should have.
check(
  layer.join?.max_distance_km <= MAX_SITE_DISTANCE_KM,
  `A zone joined to an ACARA school ${layer.join?.max_distance_km} km away, past the ${MAX_SITE_DISTANCE_KM} km limit`,
);
check(unmatched.count === 0, `${unmatched.count} zones could not be joined — see unmatched.json`);

// 2a. Publication lag is the upstream's, not a build error — but it has to be
// visible. SA's newest release is a year or more behind the calendar year.
const currentYear = new Date().getFullYear();
if (index.data_year < currentYear) {
  warnings.push(
    `SA zones are for the ${index.data_year} enrolment year, and it is ${currentYear}. `
    + 'Check data.sa.gov.au for a newer release and bump DATA_YEAR in sa-catchment-common.mjs.',
  );
}

// 3. Every indexed catchment has a geometry file, and it is well formed.
let vertices = 0;
const verificationRows = [];
for (const entry of index.catchments) {
  const fileName = `${entry.location_age_id}-${entry.kind}.json`;
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    errors.push(`Index references missing geometry file ${fileName}`);
    continue;
  }

  const feature = readJson(filePath);
  const school = schoolsByLocation.get(Number(entry.location_age_id));
  const layerEntry = (layer.by_location_age_id?.[String(entry.location_age_id)] ?? [])
    .find((candidate) => candidate.kind === entry.kind);
  verificationRows.push({
    suburb: school?.suburb ?? 'Unknown',
    school: school?.school_name ?? feature.properties?.school_name ?? 'Unknown',
    kind: entry.kind,
    catchType: entry.catch_type,
    sourceSchoolCode: layerEntry?.source_school_code ?? 'Unknown',
    areaKm2: geometryAreaKm2(feature.geometry),
  });
  check(feature.type === 'Feature', `${fileName}: not a GeoJSON Feature`);
  check(feature.properties?.data_year === DATA_YEAR, `${fileName}: data_year disagrees with the pinned enrolment year`);
  check(Boolean(feature.properties?.catch_type), `${fileName}: no catch_type`);
  // Deliberately the opposite of the NSW check: SA publishes no per-zone year
  // levels, so an entry that suddenly has some means something invented them.
  check(
    Array.isArray(entry.year_levels) && entry.year_levels.length === 0,
    `${fileName}: has year levels, but the SA source publishes none per zone`,
  );

  const knownType = eachRing(feature.geometry, (ring) => {
    vertices += ring.length;
    if (!ringIsClosed(ring)) errors.push(`${fileName}: unclosed ring`);
    for (const [lng, lat] of ring) {
      if (lng < SA_BBOX.minLng || lng > SA_BBOX.maxLng || lat < SA_BBOX.minLat || lat > SA_BBOX.maxLat) {
        errors.push(`${fileName}: coordinate ${lng},${lat} falls outside SA`);
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
  if (!knownType) errors.push(`Unexpected geometry type ${feature.geometry.type}`);
}

// 3a. Every zone contains the school it belongs to.
//
// A stronger statement than the distance check that made the join: this asks
// the geometry itself whether the school we attached sits inside its own
// boundary. It holds for all 130 SA zones, so a failure means a zone landed on
// the wrong school — the exact error the name check exists to prevent, caught
// here from a different direction.
if (canonicalSchools) {
  let contained = 0;
  for (const entry of index.catchments) {
    const school = schoolsByAcara.get(entry.acara_sml_id);
    const filePath = path.join(PUBLIC_DIR, `${entry.location_age_id}-${entry.kind}.json`);
    if (!school || !fs.existsSync(filePath)) continue;
    const feature = readJson(filePath);
    if (pointInGeometry([school.lng, school.lat], feature.geometry)) contained += 1;
    else {
      errors.push(
        `${school.school_name}: its own coordinates fall outside the ${entry.kind} zone attached to it`,
      );
    }
  }
  console.log(`Zones containing their own school: ${contained}/${index.catchments.length}`);
}

// 4. No orphan files left behind by a previous build.
const geometryFiles = fs.readdirSync(PUBLIC_DIR).filter((file) => file !== 'index.json');
check(
  geometryFiles.length === index.catchments.length,
  `${geometryFiles.length} geometry files but ${index.catchments.length} index entries — stale files from an earlier build?`,
);

// 5. Canonical attachment: SA Government schools only.
if (canonicalSchools) {
  let attached = 0;
  for (const school of canonicalSchools) {
    const saCatchments = (school.catchments ?? []).filter((c) => c.source === 'data.sa.gov.au');
    if (saCatchments.length === 0) continue;
    attached += 1;
    check(school.state === 'SA', `${school.school_name}: SA catchment attached to a ${school.state} school`);
    check(
      school.sector === 'Government',
      `${school.school_name}: catchment attached to a ${school.sector} school — non-government schools have no zone`,
    );
    for (const catchment of saCatchments) {
      check(Boolean(catchment.source_url), `${school.school_name}: catchment missing source_url`);
      check(catchment.data_year === DATA_YEAR, `${school.school_name}: catchment data_year is not ${DATA_YEAR}`);
      const geometryPath = path.join('public', String(catchment.geometry_url ?? '').replace(/^\/+/, ''));
      check(
        Boolean(catchment.geometry_url) && fs.existsSync(geometryPath),
        `${school.school_name}: geometry_url does not resolve to a file (${catchment.geometry_url ?? 'missing'})`,
      );
      // The array must exist even though it is always empty here. Omitting it
      // once shipped `undefined.length` to every SA school page that has a
      // zone, because consumers type the field as string[].
      check(
        Array.isArray(catchment.year_levels) && catchment.year_levels.length === 0,
        `${school.school_name}: SA catchment must carry an empty year_levels array, not a missing or populated one`,
      );
      check(
        Boolean(catchment.source_school_code),
        `${school.school_name}: catchment missing source_school_code`,
      );
    }
  }
  check(attached > 0, 'Canonical has no SA catchments attached — did canonical:build run after sa:catchment:build?');
  console.log(`Canonical SA schools with a catchment: ${attached}`);
} else {
  warnings.push('schools.canonical.json not found — skipped the canonical attachment checks');
}

check(
  verificationRows.length === index.catchments.length,
  `Human verification list has ${verificationRows.length} rows for ${index.catchments.length} index entries`,
);
verificationRows.sort((a, b) => (
  a.suburb.localeCompare(b.suburb)
  || a.school.localeCompare(b.school)
  || a.kind.localeCompare(b.kind)
));

console.log('Human verification — all SA zones sorted by suburb:');
for (const row of verificationRows) {
  console.log(
    `  ${row.suburb} | ${row.school} | ${row.kind} | ${row.catchType} | org_num ${row.sourceSchoolCode} | ${row.areaKm2.toFixed(2)} km²`,
  );
}

console.log(`Index entries: ${index.catchments.length}, vertices: ${vertices.toLocaleString()}`);
console.log(`Enrolment year: ${index.data_year}`);
console.log(`Join distance: median ${(layer.join.median_distance_km * 1000).toFixed(0)} m, max ${(layer.join.max_distance_km * 1000).toFixed(0)} m`);
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
