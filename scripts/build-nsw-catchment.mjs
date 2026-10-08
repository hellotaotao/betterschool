// Join NSW catchment polygons onto ACARA school identity and emit the artefacts
// the app loads at runtime.
//
// Join chain (all deterministic IDs — no fuzzy name matching anywhere):
//
//   shapefile USE_ID
//     → master_dataset.School_code
//     → master_dataset.AgeID
//     → ACARA location_age_id
//
// AgeID maps to location_age_id specifically; it matches school_age_id zero
// times. Measured hit rates: primary 99.9%, secondary 98.4%, future 86.5% (the
// future shortfall is unopened schools that ACARA 2025 does not list yet).
// Anything that fails to join is written to unmatched.json rather than being
// guessed at by name.
//
// Reads the ACARA location layer rather than schools.canonical.json on purpose:
// canonical consumes the catchment layer this script produces, so depending on
// it here would be circular.

import fs from 'node:fs';
import path from 'node:path';
import { readLayers } from './parse-nsw-catchment.mjs';
import {
  LAYERS,
  RAW_DIR,
  PROCESSED_DIR,
  PUBLIC_DIR,
  NSW_CATCHMENT_SOURCE,
  CATCHMENT_DATASET_URL,
  LICENCE,
  ATTRIBUTION,
  COORD_PRECISION,
  NSW_BBOX,
  ensureDir,
  readJson,
  writeJson,
  geometryBbox,
  coarsenBbox,
  countVertices,
  parseCsv,
} from './nsw-catchment-common.mjs';
import { bboxWithin } from './catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

/** Merge same-school, same-kind polygons into one MultiPolygon. */
function mergeGeometries(records) {
  if (records.length === 1) return records[0].geometry;

  const polygons = [];
  for (const record of records) {
    if (record.geometry.type === 'Polygon') polygons.push(record.geometry.coordinates);
    else if (record.geometry.type === 'MultiPolygon') polygons.push(...record.geometry.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath} — run 'npm run nsw:catchment:fetch' first`);
  }
  const manifest = readJson(manifestPath);
  const dataYear = manifest.current_enrolment_year;

  // School_code → AgeID
  const masterRows = parseCsv(fs.readFileSync(path.join(RAW_DIR, 'master_dataset.csv'), 'utf8'));
  const codeToAgeId = new Map();
  for (const row of masterRows) {
    const code = String(row.School_code ?? '').trim();
    const ageId = String(row.AgeID ?? '').trim();
    if (code && /^\d+$/.test(ageId)) codeToAgeId.set(code, ageId);
  }

  // AgeID (= location_age_id) → ACARA identity.
  //
  // A location_age_id is a *site*, not a school entity, so it is not unique: a
  // renamed or restructured school leaves the old and new entities sharing one
  // site (Randwick Boys High School / Randwick High School; St Peter's Lutheran
  // School / Wimmera Lutheran College - Dimboola Campus). Seven such groups
  // exist nationally, two in NSW.
  //
  // We attach the catchment to every entity at the site rather than inventing a
  // "which one is current" rule we cannot verify from this data. The boundary
  // genuinely covers that site, so this states nothing false, and the geometry
  // file is keyed by location_age_id so the entities share one file.
  const locationPayload = readJson(locationPath);
  const byLocationAgeId = new Map();
  for (const record of locationPayload.records) {
    const key = String(record.location_age_id ?? '');
    if (!key) continue;
    if (!byLocationAgeId.has(key)) byLocationAgeId.set(key, []);
    byLocationAgeId.get(key).push(record);
  }
  const sharedSites = [...byLocationAgeId.values()].filter((records) => records.length > 1).length;

  const layers = await readLayers();

  // Group by (school, kind) first: a Central School appears in both the primary
  // and secondary layers, and two primary rows share a USE_ID.
  const grouped = new Map();
  const unmatched = [];
  const stats = {};

  for (const { kind } of LAYERS) {
    const records = layers[kind];
    let joined = 0;

    for (const record of records) {
      const ageId = record.nsw_school_code ? codeToAgeId.get(record.nsw_school_code) : undefined;
      if (!ageId) {
        unmatched.push({
          kind,
          reason: 'no_school_code_in_master_dataset',
          nsw_school_code: record.nsw_school_code || null,
          source_name: record.source_name,
        });
        continue;
      }

      const locations = byLocationAgeId.get(ageId);
      if (!locations) {
        unmatched.push({
          kind,
          reason: 'age_id_not_in_acara',
          nsw_school_code: record.nsw_school_code,
          age_id: ageId,
          source_name: record.source_name,
        });
        continue;
      }

      // Where a site hosts several entities, label the geometry with the newest
      // (highest acara_sml_id) — it is the one a user is most likely looking at.
      const location = [...locations].sort((a, b) => b.acara_sml_id - a.acara_sml_id)[0];

      const key = `${ageId}:${kind}`;
      if (!grouped.has(key)) grouped.set(key, { ageId, kind, location, records: [] });
      grouped.get(key).records.push(record);
      joined += 1;
    }

    stats[kind] = { polygons: records.length, joined, join_rate: Number((joined / records.length).toFixed(4)) };
  }

  // Emit one GeoJSON Feature per (school, kind), plus a bbox index for lookup.
  ensureDir(PUBLIC_DIR);
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    fs.unlinkSync(path.join(PUBLIC_DIR, file)); // stale files would outlive a boundary change
  }

  const index = [];
  const layerForCanonical = new Map();
  let totalVertices = 0;
  let totalBytes = 0;
  let outsideNsw = 0;

  for (const { ageId, kind, location, records } of grouped.values()) {
    const geometry = mergeGeometries(records);
    const bbox = geometryBbox(geometry);
    if (!bboxWithin(bbox, NSW_BBOX)) outsideNsw += 1;

    // Year levels and catch types can differ between merged rows; keep the union
    // rather than silently picking one.
    const yearLevels = [...new Set(records.flatMap((record) => record.year_levels))];
    const catchTypes = [...new Set(records.map((record) => record.catch_type))];
    const effectiveYears = records.map((record) => record.effective_year).filter(Number.isFinite);
    const boundaryUpdated = records.map((record) => record.boundary_updated).filter(Boolean).sort().pop();

    const fileName = `${ageId}-${kind}.json`;
    const geometryUrl = `/data/catchment/${'nsw'}/${fileName}`;

    const entry = {
      location_age_id: Number(ageId),
      acara_sml_id: location.acara_sml_id,
      kind,
      catch_type: catchTypes.join('+'),
      year_levels: yearLevels,
      ...(effectiveYears.length > 0 ? { effective_year: Math.min(...effectiveYears) } : {}),
      bbox: coarsenBbox(bbox),
    };
    index.push(entry);

    const feature = {
      type: 'Feature',
      geometry,
      properties: {
        location_age_id: Number(ageId),
        acara_sml_id: location.acara_sml_id,
        school_name: location.school_name,
        kind,
        catch_type: entry.catch_type,
        year_levels: yearLevels,
        ...(entry.effective_year ? { effective_year: entry.effective_year } : {}),
        data_year: dataYear,
        source: NSW_CATCHMENT_SOURCE,
        source_url: CATCHMENT_DATASET_URL,
        licence: LICENCE,
        attribution: ATTRIBUTION,
        ...(boundaryUpdated ? { boundary_updated: boundaryUpdated } : {}),
      },
    };

    const outPath = path.join(PUBLIC_DIR, fileName);
    writeJson(outPath, feature, { pretty: false });
    totalBytes += fs.statSync(outPath).size;
    totalVertices += countVertices(geometry);

    if (!layerForCanonical.has(ageId)) layerForCanonical.set(ageId, []);
    layerForCanonical.get(ageId).push({
      geometry_url: geometryUrl,
      kind,
      catch_type: entry.catch_type,
      year_levels: yearLevels,
      ...(entry.effective_year ? { effective_year: entry.effective_year } : {}),
      source_school_code: records[0].nsw_school_code,
      data_year: dataYear,
      source: NSW_CATCHMENT_SOURCE,
      source_url: CATCHMENT_DATASET_URL,
      ...(boundaryUpdated ? { boundary_updated: boundaryUpdated } : {}),
    });
  }

  index.sort((a, b) => a.location_age_id - b.location_age_id || a.kind.localeCompare(b.kind));

  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  writeJson(indexPath, {
    state: 'NSW',
    data_year: dataYear,
    coord_precision: COORD_PRECISION,
    source: NSW_CATCHMENT_SOURCE,
    source_url: CATCHMENT_DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: index,
  }, { pretty: false });

  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'NSW',
    data_year: dataYear,
    generated_at: new Date().toISOString(),
    stats,
    by_location_age_id: Object.fromEntries(layerForCanonical),
  });

  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Catchment polygons with no deterministic route to an ACARA school. Left unmatched rather than name-matched.',
    records: unmatched,
  });

  for (const { kind } of LAYERS) {
    const s = stats[kind];
    console.log(`${kind}: ${s.joined}/${s.polygons} joined (${(s.join_rate * 100).toFixed(1)}%)`);
  }
  console.log(`Sites with catchments: ${layerForCanonical.size} (${sharedSites} sites nationally host >1 ACARA entity)`);
  console.log(`Feature files: ${index.length}, ${(totalBytes / 1e6).toFixed(1)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Index: ${(fs.statSync(indexPath).size / 1e3).toFixed(0)} KB`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (outsideNsw > 0) console.log(`WARNING: ${outsideNsw} catchments have a bbox outside NSW`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
