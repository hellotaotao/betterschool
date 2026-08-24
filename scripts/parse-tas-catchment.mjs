// Parse the LISTdata shapefile and project its EPSG:28355 geometry to WGS84.
// No vertex is simplified or removed; only the shared 6-decimal rounding is
// applied after projection.

import fs from 'node:fs';
import path from 'node:path';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
import {
  EPSG_28355,
  RAW_DIR,
  SHAPEFILE_BASE,
  countVertices,
  geometryBbox,
  roundCoordinates,
} from './tas-catchment-common.mjs';

function field(properties, name) {
  const key = Object.keys(properties).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : properties[key];
}

export function readZoneAttributes(properties) {
  const attributes = {
    source_name: String(field(properties, 'SCHOOL_NAM') ?? field(properties, 'SCHOOL_NAME') ?? '').trim(),
    source_sector: String(field(properties, 'SCHOOL_SEC') ?? field(properties, 'SCHOOL_SECTOR_NAME') ?? '').trim(),
    source_school_code: String(field(properties, 'SCHOOL_NUM') ?? field(properties, 'SCHOOL_NUMBER') ?? '').trim(),
    associate_feeder: String(field(properties, 'ASSOCIATE_') ?? field(properties, 'ASSOCIATE_FEEDER') ?? '').trim(),
  };
  if (!attributes.source_name || !attributes.source_sector) {
    throw new Error(
      `Zone has no school name or sector. Attribute names present: ${Object.keys(properties).join(', ')}`,
    );
  }
  return attributes;
}

export function projectCoordinates(coordinates) {
  if (typeof coordinates[0] === 'number') {
    return proj4(EPSG_28355, 'EPSG:4326', coordinates);
  }
  return coordinates.map(projectCoordinates);
}

export async function readTasZones() {
  const shpPath = path.join(RAW_DIR, `${SHAPEFILE_BASE}.shp`);
  const dbfPath = path.join(RAW_DIR, `${SHAPEFILE_BASE}.dbf`);
  if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
    throw new Error(`Missing TAS shapefile in ${RAW_DIR}; run 'npm run tas:catchment:fetch' first`);
  }

  const collection = await shapefile.read(shpPath, dbfPath, { encoding: 'latin1' });
  return collection.features.map((feature) => {
    if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      throw new Error(`TAS intake feature has unsupported or missing geometry: ${feature.geometry?.type ?? 'missing'}`);
    }
    const attributes = readZoneAttributes(feature.properties ?? {});
    const geometry = {
      type: feature.geometry.type,
      coordinates: roundCoordinates(projectCoordinates(feature.geometry.coordinates)),
    };
    return {
      ...attributes,
      geometry,
      bbox: geometryBbox(geometry),
      vertices: countVertices(geometry),
    };
  });
}

async function main() {
  const records = await readTasZones();
  const sectors = {};
  let vertices = 0;
  for (const record of records) {
    sectors[record.source_sector] = (sectors[record.source_sector] ?? 0) + 1;
    vertices += record.vertices;
  }
  console.log(`TAS: ${records.length} polygons, ${vertices.toLocaleString()} vertices`);
  console.log(`  sectors: ${JSON.stringify(sectors)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
