// Join SA zone polygons onto ACARA school identity and emit the artefacts the
// app loads at runtime.
//
// Join chain:
//
//   zone shapefile org_num
//     → GovernmentEducationSites org_num        (exact identifier, 130/130)
//     → that site's published latitude/longitude and name
//     → the one ACARA SA government school that is both within
//       MAX_SITE_DISTANCE_KM and named the same (median 0 m, max 522 m)
//
// The last hop is spatial rather than by identifier because ACARA carries no SA
// org_num and SA carries no ACARA id, so the two ID spaces never meet. It is
// still not a guess: both departments publish a point and a name for the same
// physical site, and a match needs both to agree. Neither signal alone is
// enough — Blackwood High School's site has Blackwood Primary School 232 m
// away, so distance alone would attach a high school's zone to a primary
// school, while name alone would not catch a repeated name in another town.
// Exactly one candidate must survive; zero or several go to unmatched.json.
//
// No year levels are published for SA zones. The shapefile has no year-level
// attributes, and the sites layer's designation ("Reception to Year 12") is a
// property of the school, not of the zone: six combined schools hold both a
// primary and a secondary zone, so copying that designation onto each would
// claim the primary zone runs to Year 12. Absent is the honest state here, and
// the UI falls back to the school's own ACARA year range.
//
// Reads the ACARA location layer rather than schools.canonical.json on purpose:
// canonical consumes the catchment layer this script produces, so depending on
// it here would be circular.

import fs from 'node:fs';
import path from 'node:path';
import { readLayers } from './parse-sa-catchment.mjs';
import {
  LAYERS,
  RAW_DIR,
  PROCESSED_DIR,
  PUBLIC_DIR,
  SITES_GEOJSON,
  SA_CATCHMENT_SOURCE,
  PRIMARY_DATASET_URL,
  HIGH_DATASET_URL,
  SITES_DATASET_URL,
  LICENCE,
  ATTRIBUTION,
  COORD_PRECISION,
  DATA_YEAR,
  SA_BBOX,
  MAX_SITE_DISTANCE_KM,
  ensureDir,
  readJson,
  writeJson,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
  distanceKm,
  normaliseName,
} from './sa-catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

/** Dataset page for a zone kind, used for per-zone provenance. */
function datasetUrlFor(kind) {
  return kind === 'primary' ? PRIMARY_DATASET_URL : HIGH_DATASET_URL;
}

function withinSa(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return minLng >= SA_BBOX.minLng && maxLng <= SA_BBOX.maxLng
    && minLat >= SA_BBOX.minLat && maxLat <= SA_BBOX.maxLat;
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath} — run 'npm run sa:catchment:fetch' first`);
  }
  readJson(manifestPath);

  // org_num → SA education site (name, coordinates, suburb).
  const sitesPath = path.join(RAW_DIR, 'sites', SITES_GEOJSON);
  const sitesGeoJson = readJson(sitesPath);
  const siteByOrgNum = new Map();
  for (const feature of sitesGeoJson.features) {
    const site = feature.properties ?? {};
    if (site.category_name !== 'School') continue;
    const orgNum = Number(site.org_num);
    if (!Number.isFinite(orgNum)) continue;
    siteByOrgNum.set(orgNum, site);
  }

  // ACARA SA government schools with coordinates — the join target.
  const locationPayload = readJson(locationPath);
  const acaraSchools = locationPayload.records.filter((record) => (
    record.state === 'SA'
    && record.sector === 'Government'
    && Number.isFinite(record.latitude)
    && Number.isFinite(record.longitude)
  ));

  const layers = await readLayers();

  // Group by (school, kind) first: a school can contribute several polygons to
  // one layer, and a combined school appears in both layers.
  const grouped = new Map();
  const unmatched = [];
  const stats = {};
  const joinDistances = [];

  for (const { kind } of LAYERS) {
    const records = layers[kind];
    let joined = 0;

    for (const record of records) {
      const site = Number.isFinite(record.org_num) ? siteByOrgNum.get(record.org_num) : undefined;
      if (!site) {
        unmatched.push({
          kind,
          reason: 'org_num_not_in_education_sites',
          org_num: record.org_num ?? null,
          source_name: record.source_name,
        });
        continue;
      }

      if (!Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) {
        unmatched.push({
          kind,
          reason: 'site_has_no_coordinates',
          org_num: record.org_num,
          source_name: record.source_name,
        });
        continue;
      }

      // Both signals must hold, and the name is the selector rather than an
      // afterthought: taking the closest school and then checking its name gets
      // co-located campuses wrong. Blackwood High School's site has Blackwood
      // Primary School 232 m away, so "nearest, then verify" would have thrown
      // the high school's zone away — or, without the check, attached it to the
      // primary school.
      const nameKey = normaliseName(site.site_name);
      const candidates = [];
      let nearestAny = null;
      for (const school of acaraSchools) {
        const km = distanceKm(site.latitude, site.longitude, school.latitude, school.longitude);
        if (!nearestAny || km < nearestAny.km) nearestAny = { km, school };
        if (km > MAX_SITE_DISTANCE_KM) continue;
        if (normaliseName(school.school_name) !== nameKey) continue;
        candidates.push({ km, school });
      }
      candidates.sort((a, b) => a.km - b.km);

      if (candidates.length !== 1) {
        unmatched.push({
          kind,
          reason: candidates.length === 0
            ? 'no_acara_school_with_this_name_within_range'
            : 'several_acara_schools_share_this_name_within_range',
          org_num: record.org_num,
          source_name: record.source_name,
          site_name: site.site_name,
          nearest_school: nearestAny?.school.school_name ?? null,
          nearest_distance_km: nearestAny ? Number(nearestAny.km.toFixed(3)) : null,
          candidates: candidates.map((c) => c.school.school_name),
        });
        continue;
      }

      const [matched] = candidates;
      joinDistances.push(matched.km);

      const ageId = String(matched.school.location_age_id ?? '');
      if (!ageId) {
        unmatched.push({
          kind,
          reason: 'acara_school_has_no_location_age_id',
          org_num: record.org_num,
          source_name: record.source_name,
        });
        continue;
      }

      const key = `${ageId}:${kind}`;
      if (!grouped.has(key)) grouped.set(key, { ageId, kind, location: matched.school, site, records: [] });
      grouped.get(key).records.push(record);
      joined += 1;
    }

    stats[kind] = {
      polygons: records.length,
      joined,
      join_rate: records.length > 0 ? Number((joined / records.length).toFixed(4)) : 0,
    };
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
  let outsideSa = 0;

  for (const { ageId, kind, location, site, records } of grouped.values()) {
    const geometry = mergeGeometries(records);
    const bbox = geometryBbox(geometry);
    if (!withinSa(bbox)) outsideSa += 1;

    const catchTypes = [...new Set(records.map((record) => record.catch_type))];
    const fileName = `${ageId}-${kind}.json`;

    const entry = {
      location_age_id: Number(ageId),
      acara_sml_id: location.acara_sml_id,
      kind,
      catch_type: catchTypes.join('+'),
      // No year_levels: the source publishes none per zone. Consumers must treat
      // the field as optional rather than reading an empty array as "no years".
      year_levels: [],
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
        year_levels: [],
        data_year: DATA_YEAR,
        source: SA_CATCHMENT_SOURCE,
        source_url: datasetUrlFor(kind),
        licence: LICENCE,
        attribution: ATTRIBUTION,
      },
    };

    const outPath = path.join(PUBLIC_DIR, fileName);
    writeJson(outPath, feature, { pretty: false });
    totalBytes += fs.statSync(outPath).size;
    totalVertices += countVertices(geometry);

    if (!layerForCanonical.has(ageId)) layerForCanonical.set(ageId, []);
    layerForCanonical.get(ageId).push({
      geometry_url: `/data/catchment/sa/${fileName}`,
      kind,
      catch_type: entry.catch_type,
      // Always present, always empty: consumers type this as string[], and an
      // absent field would be a different thing again from "the source
      // publishes no per-zone year levels".
      year_levels: [],
      source_school_code: String(site.org_num),
      data_year: DATA_YEAR,
      source: SA_CATCHMENT_SOURCE,
      source_url: datasetUrlFor(kind),
    });
  }

  index.sort((a, b) => a.location_age_id - b.location_age_id || a.kind.localeCompare(b.kind));

  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  writeJson(indexPath, {
    state: 'SA',
    data_year: DATA_YEAR,
    coord_precision: COORD_PRECISION,
    source: SA_CATCHMENT_SOURCE,
    source_url: PRIMARY_DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: index,
  }, { pretty: false });

  joinDistances.sort((a, b) => a - b);
  const median = joinDistances.length > 0 ? joinDistances[Math.floor(joinDistances.length / 2)] : 0;
  const maxDistance = joinDistances.length > 0 ? joinDistances[joinDistances.length - 1] : 0;

  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'SA',
    data_year: DATA_YEAR,
    generated_at: new Date().toISOString(),
    stats,
    join: {
      method: 'org_num -> education sites -> nearest ACARA school, confirmed by name',
      sites_dataset: SITES_DATASET_URL,
      median_distance_km: Number(median.toFixed(4)),
      max_distance_km: Number(maxDistance.toFixed(4)),
      max_allowed_km: MAX_SITE_DISTANCE_KM,
    },
    by_location_age_id: Object.fromEntries(layerForCanonical),
  });

  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Zone polygons whose org_num did not resolve to an ACARA school on both distance and name. Left unmatched rather than taken on one signal.',
    records: unmatched,
  });

  for (const { kind } of LAYERS) {
    const s = stats[kind];
    console.log(`${kind}: ${s.joined}/${s.polygons} joined (${(s.join_rate * 100).toFixed(1)}%)`);
  }
  console.log(`Schools with zones: ${layerForCanonical.size}`);
  console.log(`Join distance: median ${(median * 1000).toFixed(0)} m, max ${(maxDistance * 1000).toFixed(0)} m`);
  console.log(`Feature files: ${index.length}, ${(totalBytes / 1e6).toFixed(2)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Index: ${(fs.statSync(indexPath).size / 1e3).toFixed(0)} KB`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (outsideSa > 0) console.log(`WARNING: ${outsideSa} zones have a bbox outside SA`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
