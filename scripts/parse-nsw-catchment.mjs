// Read the NSW catchment shapefiles into normalised feature records.
//
// Exposed as a function rather than writing an intermediate file: the geometry
// is ~719k vertices across the three layers, so a processed-JSON staging step
// would cost ~30 MB on disk and in git for no benefit. build-nsw-catchment.mjs
// consumes readLayers() directly and only writes the final per-school files.
//
// Source projection is EPSG:4283 (GDA94 geographic). That differs from WGS84 by
// under two metres in Australia — well inside the precision these boundaries
// carry — so coordinates pass through to Leaflet unprojected.

import fs from 'node:fs';
import path from 'node:path';
import * as shapefile from 'shapefile';
import {
  LAYERS,
  RAW_DIR,
  readYearLevels,
  roundCoordinates,
  geometryBbox,
  countVertices,
} from './nsw-catchment-common.mjs';

/** Read one shapefile layer into normalised records. */
async function readLayer({ kind, base }) {
  const shpPath = path.join(RAW_DIR, `${base}.shp`);
  const dbfPath = path.join(RAW_DIR, `${base}.dbf`);

  if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
    throw new Error(`Missing ${base}.shp/.dbf in ${RAW_DIR} — run 'npm run nsw:catchment:fetch' first`);
  }

  // The DBF is latin1; reading it as UTF-8 mangles names containing apostrophes
  // and accented characters.
  const collection = await shapefile.read(shpPath, dbfPath, { encoding: 'latin1' });

  return collection.features
    .filter((feature) => feature.geometry && feature.geometry.coordinates?.length > 0)
    .map((feature) => {
      const properties = feature.properties ?? {};
      const geometry = {
        type: feature.geometry.type,
        coordinates: roundCoordinates(feature.geometry.coordinates),
      };
      const { year_levels, effective_year } = readYearLevels(properties);

      return {
        kind,
        nsw_school_code: String(properties.USE_ID ?? '').trim(),
        catch_type: String(properties.CATCH_TYPE ?? '').trim(),
        source_name: String(properties.USE_DESC ?? '').trim(),
        boundary_updated: String(properties.ADD_DATE ?? '').trim() || undefined,
        year_levels,
        effective_year,
        geometry,
        bbox: geometryBbox(geometry),
        vertices: countVertices(geometry),
      };
    });
}

/** Read all three layers. Returns { primary, secondary, future }. */
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
    let missingCode = 0;

    for (const record of records) {
      byCatchType[record.catch_type] = (byCatchType[record.catch_type] ?? 0) + 1;
      vertices += record.vertices;
      if (!record.nsw_school_code) missingCode += 1;
    }

    console.log(`${kind}: ${records.length} polygons, ${vertices.toLocaleString()} vertices`);
    console.log(`  catch_type: ${JSON.stringify(byCatchType)}`);
    if (missingCode > 0) console.log(`  WARNING: ${missingCode} features have no USE_ID`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
