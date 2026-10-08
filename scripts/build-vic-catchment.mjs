// Join Victorian school zones to ACARA locations and emit exact year variants.

import fs from 'node:fs';
import path from 'node:path';
import { readLayers } from './parse-vic-catchment.mjs';
import {
  CATCHMENT_DATASET_URL,
  SITES_DATASET_URL,
  VIC_CATCHMENT_SOURCE,
  DATA_YEAR,
  LICENCE,
  ATTRIBUTION,
  RAW_DIR,
  PROCESSED_DIR,
  PUBLIC_DIR,
  SITES_CSV,
  LAYERS,
  VIC_BBOX,
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  parseCsv,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
  normaliseName,
  pointInGeometry,
  groupExactGeometryVariants,
} from './vic-catchment-common.mjs';
import { bboxWithin, uniqueSchools, variantSlug } from './catchment-common.mjs';

const locationPath = 'data/acara/processed/school-location-2025.json';
const manifestPath = path.join(PROCESSED_DIR, 'fetch-manifest.json');

/**
 * Resolve one source entity without fuzzy matching.
 *
 * The school-number hop supplies the official current base name where the 2025
 * site register contains the entity. ACARA then has to agree on an exact base
 * or campus identity and place that location inside at least one published
 * polygon. A missing site row can use the exact source identity plus the same
 * containment requirement. Ambiguity is rejected rather than distance-ranked.
 */
export function resolveEntityMatch({ source_name, campus_name, geometries, site, acaraSchools }) {
  const inside = (school) => (
    Number.isFinite(school.longitude)
    && Number.isFinite(school.latitude)
    && geometries.some((geometry) => pointInGeometry([school.longitude, school.latitude], geometry))
  );
  const eligible = acaraSchools.filter(inside);
  const sourceBase = normaliseName(source_name);
  const siteBase = site ? normaliseName(site.School_Name) : '';
  const baseNames = [...new Set([sourceBase, siteBase].filter(Boolean))];
  const campus = normaliseName(campus_name);
  const campusNames = new Set([campus]);
  for (const base of baseNames) campusNames.add(normaliseName(`${base} ${campus_name}`));

  const tiers = [
    {
      method: 'exact_campus_name_and_containment',
      schools: eligible.filter((school) => campusNames.has(normaliseName(school.school_name))),
    },
    {
      method: 'exact_base_name_and_containment',
      schools: eligible.filter((school) => baseNames.includes(normaliseName(school.school_name))),
    },
    {
      method: 'exact_base_with_campus_suffix_and_containment',
      schools: eligible.filter((school) => {
        const name = normaliseName(school.school_name);
        return baseNames.some((base) => name.startsWith(`${base} `));
      }),
    },
  ];

  for (const tier of tiers) {
    const candidates = uniqueSchools(tier.schools);
    if (candidates.length === 1) return { school: candidates[0], method: tier.method };
    if (candidates.length > 1) {
      return {
        school: null,
        reason: 'several_exact_acara_candidates_inside_zone',
        candidates: candidates.map((school) => school.school_name),
      };
    }
  }

  return { school: null, reason: 'no_exact_acara_candidate_inside_zone', candidates: [] };
}

function sourceRecords(layers) {
  return LAYERS.flatMap((layer) => layers[layer.key]);
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath} — run 'npm run vic:catchment:fetch' first`);
  }
  readJson(manifestPath);

  const siteRows = parseCsv(fs.readFileSync(path.join(RAW_DIR, SITES_CSV), 'utf8'));
  const siteBySchoolNumber = new Map(
    siteRows
      .filter((site) => site.Education_Sector === 'Government' && site.Entity_Type === '1')
      .map((site) => [String(Number(site.School_No)), site]),
  );

  const locationPayload = readJson(locationPath);
  const acaraSchools = locationPayload.records.filter((school) => (
    school.state === 'VIC'
    && school.sector === 'Government'
    && Number.isFinite(school.location_age_id)
    && Number.isFinite(school.latitude)
    && Number.isFinite(school.longitude)
  ));

  const layers = readLayers();
  const allRecords = sourceRecords(layers);
  const entities = new Map();
  for (const record of allRecords) {
    if (!entities.has(record.source_school_code)) {
      entities.set(record.source_school_code, {
        source_school_code: record.source_school_code,
        school_number: record.school_number,
        source_name: record.source_name,
        campus_name: record.campus_name,
        records: [],
      });
    }
    entities.get(record.source_school_code).records.push(record);
  }

  const matchByEntity = new Map();
  const unmatched = [];
  const methodCounts = {};
  for (const entity of entities.values()) {
    const site = siteBySchoolNumber.get(entity.school_number) ?? null;
    const result = resolveEntityMatch({
      source_name: entity.source_name,
      campus_name: entity.campus_name,
      geometries: entity.records.map((record) => record.geometry),
      site,
      acaraSchools,
    });
    if (!result.school) {
      unmatched.push({
        source_school_code: entity.source_school_code,
        school_number: entity.school_number,
        source_name: entity.source_name,
        campus_name: entity.campus_name,
        site_name: site?.School_Name ?? null,
        layers: [...new Set(entity.records.map((record) => record.layer))].sort(),
        reason: result.reason,
        candidates: result.candidates,
      });
      continue;
    }
    matchByEntity.set(entity.source_school_code, { school: result.school, site, method: result.method });
    methodCounts[result.method] = (methodCounts[result.method] ?? 0) + 1;
  }

  const stats = {};
  for (const layer of LAYERS) {
    const records = layers[layer.key];
    const joined = records.filter((record) => matchByEntity.has(record.source_school_code)).length;
    stats[layer.key] = {
      polygons: records.length,
      joined,
      join_rate: Number((joined / records.length).toFixed(4)),
    };
  }

  // Merge multiple polygons within one source layer before comparing geometry
  // across year layers. This preserves multipart zones while allowing only
  // exactly identical rounded year shapes to share one runtime variant.
  const sameLayerGroups = new Map();
  for (const record of allRecords) {
    const match = matchByEntity.get(record.source_school_code);
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
  let outsideVic = 0;

  for (const group of bySchoolKind.values()) {
    const variants = groupExactGeometryVariants(group.records);
    for (const variant of variants) {
      const bbox = geometryBbox(variant.geometry);
      if (!bboxWithin(bbox, VIC_BBOX)) outsideVic += 1;
      const slug = variantSlug(group.kind, variant.year_levels, variant.geometry);
      const zoneId = `vic:${group.ageId}:${slug}`;
      const fileName = `${group.ageId}-${slug}.json`;
      const geometryUrl = `/data/catchment/vic/${fileName}`;
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
          source: VIC_CATCHMENT_SOURCE,
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
        source: VIC_CATCHMENT_SOURCE,
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
    state: 'VIC',
    data_year: DATA_YEAR,
    coord_precision: COORD_PRECISION,
    source: VIC_CATCHMENT_SOURCE,
    source_url: CATCHMENT_DATASET_URL,
    licence: LICENCE,
    attribution: ATTRIBUTION,
    generated_at: new Date().toISOString(),
    catchments: indexEntries,
  }, { pretty: false });

  writeJson(path.join(PROCESSED_DIR, 'catchment-layer.json'), {
    state: 'VIC',
    data_year: DATA_YEAR,
    generated_at: new Date().toISOString(),
    stats,
    join: {
      method: 'ENTITY_CODE school number -> official VIC site identity -> exact ACARA base/campus identity + polygon containment; exact source identity + containment when the older site register has no row',
      sites_dataset: SITES_DATASET_URL,
      entities: entities.size,
      joined_entities: matchByEntity.size,
      unmatched_entities: unmatched.length,
      method_counts: methodCounts,
    },
    by_location_age_id: Object.fromEntries(byLocationAgeId),
  });

  writeJson(path.join(PROCESSED_DIR, 'unmatched.json'), {
    generated_at: new Date().toISOString(),
    count: unmatched.length,
    note: 'Source entities without one exact ACARA identity whose published coordinates fall inside their zone. No fuzzy name or nearest-school fallback is used.',
    records: unmatched,
  });

  for (const layer of LAYERS) {
    const layerStats = stats[layer.key];
    console.log(`${layer.key}: ${layerStats.joined}/${layerStats.polygons} joined (${(layerStats.join_rate * 100).toFixed(1)}%)`);
  }
  console.log(`Entities joined: ${matchByEntity.size}/${entities.size}`);
  console.log(`ACARA locations with zones: ${byLocationAgeId.size}`);
  console.log(`Feature files: ${indexEntries.length}, ${(totalBytes / 1e6).toFixed(2)} MB, ${totalVertices.toLocaleString()} vertices`);
  console.log(`Index: ${(fs.statSync(indexPath).size / 1e3).toFixed(0)} KB`);
  console.log(`Unmatched entities: ${unmatched.length}`);
  if (outsideVic > 0) console.log(`WARNING: ${outsideVic} variants have a bbox outside VIC`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
