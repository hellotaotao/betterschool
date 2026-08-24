// Read the SA zone shapefiles into normalised feature records.
//
// Exposed as a function rather than writing an intermediate file, matching the
// NSW parse step: build-sa-catchment.mjs consumes readLayers() directly and
// only writes the final per-school files.
//
// Source projection is EPSG:4283 (GDA94 geographic), the same as NSW. That
// differs from WGS84 by under two metres in Australia — well inside the
// precision these boundaries carry — so coordinates pass through to Leaflet
// unprojected.
//
// Unlike the NSW layers there are no per-year-level attributes here. The SA
// shapefile carries only org_num, school and type, so no year levels are
// derived: see the note in build-sa-catchment.mjs.

import fs from 'node:fs';
import path from 'node:path';
import * as shapefile from 'shapefile';
import {
  LAYERS,
  RAW_DIR,
  roundCoordinates,
  geometryBbox,
  countVertices,
} from './sa-catchment-common.mjs';

/**
 * Read an attribute case-insensitively.
 *
 * The department changed the casing between releases — 2023EY ships SCHOOL and
 * ORG_NUM, 2025EY ships school and org_num. Reading one casing does not throw
 * on the other, it silently yields undefined for every row, so the build would
 * produce a full set of polygons that join to nothing.
 */
function field(properties, name) {
  const key = Object.keys(properties).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : properties[key];
}

/** Normalise the three attributes the join depends on, failing closed. */
export function readZoneAttributes(properties) {
  const attributes = {
    org_num: Number(field(properties, 'org_num')),
    catch_type: String(field(properties, 'type') ?? '').trim(),
    source_name: String(field(properties, 'school') ?? '').trim(),
  };
  if (!Number.isFinite(attributes.org_num) || !attributes.source_name || !attributes.catch_type) {
    throw new Error(
      `Zone has no org_num or school name/type. Attribute names present: ${Object.keys(properties).join(', ')}`,
    );
  }
  return attributes;
}

/** Read one shapefile layer into normalised records. */
async function readLayer({ kind, dir, base }) {
  const shpPath = path.join(RAW_DIR, dir, `${base}.shp`);
  const dbfPath = path.join(RAW_DIR, dir, `${base}.dbf`);

  if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
    throw new Error(`Missing ${base}.shp/.dbf in ${path.join(RAW_DIR, dir)} — run 'npm run sa:catchment:fetch' first`);
  }

  // The DBF is latin1; reading it as UTF-8 mangles names containing apostrophes
  // and accented characters.
  const collection = await shapefile.read(shpPath, dbfPath, { encoding: 'latin1' });

  const records = collection.features
    .filter((feature) => feature.geometry && feature.geometry.coordinates?.length > 0)
    .map((feature) => {
      const properties = feature.properties ?? {};
      const attributes = readZoneAttributes(properties);
      const geometry = {
        type: feature.geometry.type,
        coordinates: roundCoordinates(feature.geometry.coordinates),
      };

      return {
        kind,
        ...attributes,
        geometry,
        bbox: geometryBbox(geometry),
        vertices: countVertices(geometry),
      };
    });

  return records;
}

/** Read both layers. Returns { primary, secondary }. */
export async function readLayers() {
  const result = {};
  for (const layer of LAYERS) {
    result[layer.kind] = await readLayer(layer);
  }
  return result;
}

async function main() {
  const layers = await readLayers();

  for (const { kind } of LAYERS) {
    const records = layers[kind];
    const byCatchType = {};
    let vertices = 0;
    let missingOrg = 0;

    for (const record of records) {
      byCatchType[record.catch_type] = (byCatchType[record.catch_type] ?? 0) + 1;
      vertices += record.vertices;
      if (!Number.isFinite(record.org_num)) missingOrg += 1;
    }

    console.log(`${kind}: ${records.length} polygons, ${vertices.toLocaleString()} vertices`);
    console.log(`  type: ${JSON.stringify(byCatchType)}`);
    if (missingOrg > 0) console.log(`  WARNING: ${missingOrg} features have no org_num`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
