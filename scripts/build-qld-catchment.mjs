// Join Queensland catchments to ACARA sites and emit exact stage variants.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readLayers } from './parse-qld-catchment.mjs';
import {
  CATCHMENT_DATASET_URL,
  QLD_CATCHMENT_SOURCE,
  DATA_YEAR,
  LICENCE,
  ATTRIBUTION,
  PROCESSED_DIR,
  PUBLIC_DIR,
  LAYERS,
  QLD_BBOX,
  MAX_SITE_DISTANCE_KM,
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
  groupExactGeometryVariants,
  distanceKm,
  normaliseName,
  pointInGeometry,
  expandQldSchoolName,
  AUDITED_ACARA_NAME_BY_CENTRE_CODE,
} from './qld-catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

function uniqueSchools(schools) {
  return [...new Map(schools.map((school) => [Number(school.location_age_id), school])).values()];
}

/** Resolve one official site by exact expanded identity, distance and containment. */
export function resolveSiteMatch({ source_name, source_school_code, site, geometries, acaraSchools }) {
  const expandedNames = [...new Set([source_name, site.source_name]
    .filter(Boolean)
    .map(expandQldSchoolName))];
  const nameKeys = new Set(expandedNames.map(normaliseName));
  const withinDistanceAndZone = (school) => (
    Number.isFinite(school.longitude)
    && Number.isFinite(school.latitude)
    && distanceKm(site.latitude, site.longitude, school.latitude, school.longitude) <= MAX_SITE_DISTANCE_KM
    && geometries.some((geometry) => pointInGeometry([school.longitude, school.latitude], geometry))
  );

  const tiers = [
    {
      method: 'exact_expanded_name_distance_and_containment',
      schools: acaraSchools.filter((school) => nameKeys.has(normaliseName(school.school_name))),
    },
  ];
  const alias = AUDITED_ACARA_NAME_BY_CENTRE_CODE[source_school_code];
  if (alias) {
    tiers.push({
      method: 'audited_exact_alias_distance_and_containment',
      schools: acaraSchools.filter((school) => normaliseName(school.school_name) === normaliseName(alias)),
    });
  }
  const baseKeys = new Set(expandedNames.map((name) => normaliseName(
    name.replace(/\s+-?\s*(?:Primary|Secondary|Junior|Senior|Kindergarten) Campus$/i, ''),
  )));
  tiers.push({
    method: 'exact_base_name_distance_and_containment',
    schools: acaraSchools.filter((school) => baseKeys.has(normaliseName(school.school_name))),
  });

  const auditedCandidates = [];
  for (const tier of tiers) {
    const exactName = uniqueSchools(tier.schools);
    auditedCandidates.push(...exactName);
    const candidates = exactName.filter(withinDistanceAndZone);
    if (candidates.length === 1) {
      return {
        school: candidates[0],
        method: tier.method,
        distance_km: distanceKm(site.latitude, site.longitude, candidates[0].latitude, candidates[0].longitude),
      };
    }
    if (candidates.length > 1) {
      return {
        school: null,
        reason: 'several_exact_acara_candidates_within_distance_and_zone',
        candidates: candidates.map((school) => school.school_name),
      };
    }
  }
  return {
    school: null,
    reason: 'no_exact_acara_candidate_within_distance_and_zone',
    candidates: uniqueSchools(auditedCandidates).map((school) => ({
      school_name: school.school_name,
      location_age_id: school.location_age_id,
      distance_km: distanceKm(site.latitude, site.longitude, school.latitude, school.longitude),
      inside_zone: geometries.some((geometry) => pointInGeometry([school.longitude, school.latitude], geometry)),
    })),
  };
}

/** Exact source identity plus containment fallback for an omitted site row. */
export function resolveSourceIdentityMatch({ source_name, geometries, acaraSchools }) {
  const expectedName = normaliseName(expandQldSchoolName(source_name));
  const exactName = uniqueSchools(acaraSchools.filter(
    (school) => normaliseName(school.school_name) === expectedName,
  ));
  const candidates = exactName.filter((school) => (
    geometries.some((geometry) => pointInGeometry([school.longitude, school.latitude], geometry))
  ));
  if (candidates.length === 1) {
    return { school: candidates[0], method: 'exact_source_name_and_containment_without_site_row' };
  }
  if (candidates.length > 1) {
    return {
      school: null,
      reason: 'several_exact_acara_candidates_inside_zone_without_site_row',
      candidates: candidates.map((school) => school.school_name),
    };
  }
  return {
    school: null,
    reason: 'no_official_site_or_exact_acara_identity_inside_zone',
    candidates: exactName.map((school) => school.school_name),
  };
}

function withinQld(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return minLng >= QLD_BBOX.minLng && maxLng <= QLD_BBOX.maxLng
    && minLat >= QLD_BBOX.minLat && maxLat <= QLD_BBOX.maxLat;
}

function variantSlug(kind, yearLevels, geometry) {
  const levels = yearLevels.map((level) => level.toLowerCase()).join('-');
  const digest = crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex').slice(0, 10);
  return `${kind}-years-${levels}-${digest}`;
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath} — run 'npm run qld:catchment:fetch' first`);
  }
  readJson(manifestPath);

  const locationPayload = readJson(locationPath);
  const acaraSchools = locationPayload.records.filter((school) => (
    school.state === 'QLD'
    && school.sector === 'Government'
    && Number.isFinite(school.location_age_id)
    && Number.isFinite(school.latitude)
    && Number.isFinite(school.longitude)
    && school.longitude <= 154
  ));
  const layers = readLayers();

  const matches = new Map();
  const unmatched = [];
  const stats = {};
  const methodCounts = {};
  let maxDistanceKm = 0;

  for (const layer of LAYERS) {
    const { catchments, sites } = layers[layer.key];
    const sitesByCode = new Map(sites.map((site) => [site.source_school_code, site]));
    let joined = 0;

    for (const record of catchments) {
      const matchKey = `${layer.key}:${record.source_school_code}`;
      if (matches.has(matchKey)) {
        joined += 1;
        continue;
      }
      const site = sitesByCode.get(record.source_school_code);
      const sameEntityGeometries = catchments
        .filter((candidate) => candidate.source_school_code === record.source_school_code)
        .map((candidate) => candidate.geometry);
      if (!site) {
        const fallback = resolveSourceIdentityMatch({
          source_name: record.source_name,
          geometries: sameEntityGeometries,
          acaraSchools,
        });
        if (fallback.school) {
          matches.set(matchKey, { ...fallback, site: null });
          joined += 1;
          methodCounts[fallback.method] = (methodCounts[fallback.method] ?? 0) + 1;
          continue;
        }
        unmatched.push({
          layer: layer.key,
          source_school_code: record.source_school_code,
          source_name: record.source_name,
          reason: fallback.reason,
          candidates: fallback.candidates,
        });
        continue;
      }
      const result = resolveSiteMatch({
        source_name: record.source_name,
        source_school_code: record.source_school_code,
        site,
        geometries: sameEntityGeometries,
        acaraSchools,
      });
      if (!result.school) {
        unmatched.push({
          layer: layer.key,
          source_school_code: record.source_school_code,
          source_name: record.source_name,
          site,
          reason: result.reason,
          candidates: result.candidates,
        });
        continue;
      }
      matches.set(matchKey, { ...result, site });
      joined += 1;
      methodCounts[result.method] = (methodCounts[result.method] ?? 0) + 1;
      maxDistanceKm = Math.max(maxDistanceKm, result.distance_km);
    }

    stats[layer.key] = {
      catchments: catchments.length,
      sites: sites.length,
      joined,
      join_rate: Number((joined / catchments.length).toFixed(4)),
    };
  }

  const sameLayerGroups = new Map();
  for (const layer of LAYERS) {
    for (const record of layers[layer.key].catchments) {
      const match = matches.get(`${layer.key}:${record.source_school_code}`);
      if (!match) continue;
      const ageId = String(match.school.location_age_id);
      const key = `${ageId}:${record.kind}:${record.layer}:${record.source_school_code}`;
      if (!sameLayerGroups.has(key)) {
        sameLayerGroups.set(key, {
          ageId,
          kind: record.kind,
          layer: record.layer,
          match,
          source_school_code: record.source_school_code,
          catch_type: record.catch_type,
          year_levels: record.year_levels,
          records: [],
        });
      }
      sameLayerGroups.get(key).records.push(record);
    }
  }

  const bySchoolKind = new Map();
  for (const group of sameLayerGroups.values()) {
    const key = `${group.ageId}:${group.kind}`;
    if (!bySchoolKind.has(key)) {
      bySchoolKind.set(key, {
        ageId: group.ageId,
        kind: group.kind,
        location: group.match.school,
        records: [],
      });
    }
    bySchoolKind.get(key).records.push({
      geometry: mergeGeometries(group.records),
      year_levels: group.year_levels,
      catch_type: group.catch_type,
      source_school_code: group.source_school_code,
    });
  }

  ensureDir(PUBLIC_DIR);
  for (const file of fs.readdirSync(PUBLIC_DIR)) fs.unlinkSync(path.join(PUBLIC_DIR, file));

  const indexEntries = [];
  const byLocationAgeId = new Map();
  let totalVertices = 0;
  let totalBytes = 0;
  let outsideQld = 0;

  for (const group of bySchoolKind.values()) {
    for (const variant of groupExactGeometryVariants(group.records)) {
      const bbox = geometryBbox(variant.geometry);
      if (!withinQld(bbox)) outsideQld += 1;
      const slug = variantSlug(group.kind, variant.year_levels, variant.geometry);
      const zoneId = `qld:${group.ageId}:${slug}`;
      const fileName = `${group.ageId}-${slug}.json`;
      const geometryUrl = `/data/catchment/qld/${fileName}`;
      const catchType = variant.catch_types.join('+');
      const sourceSchoolCode = variant.source_school_codes.join('+');
      const entry = {
        zone_id: zoneId,
        geometry_url: geometryUrl,
        location_age_id: Number(group.ageId),
        acara_sml_id: group.location.acara_sml_id,
        kind: group.kind,
        catch_type: catchType,
        year_levels: variant.year_levels,
        bbox: coarsenBbox(bbox),
      };
      indexEntries.push(entry);

      const feature = {
        type: 'Feature',
        geometry: variant.geometry,
        properties: {
          zone_id: zoneId,
          location_age_id: Number(group.ageId),
          acara_sml_id: group.location.acara_sml_id,
          school_name: group.location.school_name,
          kind: group.kind,
          catch_type: catchType,
          year_levels: variant.year_levels,
          data_year: DATA_YEAR,
          source: QLD_CATCHMENT_SOURCE,
          source_url: CATCHMENT_DATASET_URL,
          licence: LICENCE,
          attribution: ATTRIBUTION,
        },
      };
      const outputPath = path.join(PUBLIC_DIR, fileName);
      writeJson(outputPath, feature, { pretty: false });
      totalBytes += fs.statSync(outputPath).size;
      totalVertices += countVertices(variant.geometry);

      if (!byLocationAgeId.has(group.ageId)) byLocationAgeId.set(group.ageId, []);
      byLocationAgeId.get(group.ageId).push({
        zone_id: zoneId,
        geometry_url: geometryUrl,
        kind: group.kind,
        catch_type: catchType,
        year_levels: variant.year_levels,
        source_school_code: sourceSchoolCode,
        data_year: DATA_YEAR,
        source: QLD_CATCHMENT_SOURCE,
        source_url: CATCHMENT_DATASET_URL,
      });
    }
  }

  indexEntries.sort((a, b) => (
    a.location_age_id - b.location_age_id
    || a.kind.localeCompare(b.kind)
    || a.year_levels.join(',').localeCompare(b.year_levels.join(','), undefined, { numeric: true })
    || a.zone_id.localeCompare(b.zone_id)
  ));
  for (const entries of byLocationAgeId.values()) {
    entries.sort((a, b) => (
      a.kind.localeCompare(b.kind)
      || a.year_levels.join(',').localeCompare(b.year_levels.join(','), undefined, { numeric: true })
      || a.zone_id.localeCompare(b.zone_id)
    ));
  }

  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  writeJson(indexPath, {
    state: 'QLD',
    data_year: DATA_YEAR,
    coord_precision: COORD_PRECISION,
    source: QLD_CATCHMENT_SOURCE,
    source_url: CATCHMENT_DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: indexEntries,
  }, { pretty: false });

  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'QLD',
    data_year: DATA_YEAR,
    generated_at: new Date().toISOString(),
    stats,
    join: {
      method: 'Centre_code catchment -> official QLD site -> exact expanded ACARA identity within 1.5 km and inside the published polygon',
      max_allowed_km: MAX_SITE_DISTANCE_KM,
      max_distance_km: Number(maxDistanceKm.toFixed(6)),
      matched_source_entities: matches.size,
      unmatched_source_entities: unmatched.length,
      method_counts: methodCounts,
    },
    by_location_age_id: Object.fromEntries(byLocationAgeId),
  });

  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Source records without one exact expanded ACARA identity within the site-distance bound and exact published geometry. No fuzzy-name or nearest-school fallback is used.',
    records: unmatched,
  });

  for (const layer of LAYERS) {
    const layerStats = stats[layer.key];
    console.log(`${layer.key}: ${layerStats.joined}/${layerStats.catchments} joined (${(layerStats.join_rate * 100).toFixed(1)}%)`);
  }
  console.log(`Matched source entities: ${matches.size}`);
  console.log(`ACARA locations with zones: ${byLocationAgeId.size}`);
  console.log(`Feature files: ${indexEntries.length}, ${(totalBytes / 1e6).toFixed(2)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Index: ${(fs.statSync(indexPath).size / 1e3).toFixed(0)} KB`);
  console.log(`Unmatched source records: ${unmatched.length}`);
  if (outsideQld > 0) console.log(`WARNING: ${outsideQld} variants have a bbox outside QLD`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
