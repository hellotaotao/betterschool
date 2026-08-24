// Read the published VIC GeoJSON files into normalised feature records.

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_YEAR,
  LAYERS,
  RAW_DIR,
  parseVicYearLevels,
  schoolNumberFromEntityCode,
  readJson,
  roundCoordinates,
  geometryBbox,
  countVertices,
} from './vic-catchment-common.mjs';

function field(properties, name) {
  const key = Object.keys(properties).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : properties[key];
}

/** Normalise the attributes the join and variant identity depend on. */
export function readZoneAttributes(properties) {
  const sourceSchoolCode = String(field(properties, 'entity_code') ?? '').trim();
  const sourceName = String(field(properties, 'school_name') ?? '').trim();
  const campusName = String(field(properties, 'campus_name') ?? '').trim();
  const rawYearLevel = field(properties, 'year_level');
  const boundaryYear = Number(field(properties, 'boundary_year'));

  if (!sourceSchoolCode || !sourceName || !campusName || rawYearLevel === undefined || rawYearLevel === '') {
    throw new Error(
      `Zone has no ENTITY_CODE, school name, campus name or year level. Attribute names present: ${Object.keys(properties).join(', ')}`,
    );
  }
  if (boundaryYear !== DATA_YEAR) {
    throw new Error(`Zone boundary year ${boundaryYear} does not match pinned ${DATA_YEAR}`);
  }

  return {
    source_school_code: sourceSchoolCode,
    school_number: schoolNumberFromEntityCode(sourceSchoolCode),
    source_name: sourceName,
    campus_name: campusName,
    year_levels: parseVicYearLevels(rawYearLevel),
  };
}

function readLayer(layer) {
  const filePath = path.join(RAW_DIR, 'zones', layer.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath} — run 'npm run vic:catchment:fetch' first`);
  }

  const collection = readJson(filePath);
  if (collection.crs?.properties?.name !== 'urn:ogc:def:crs:OGC:1.3:CRS84') {
    throw new Error(`${layer.file} is not published in CRS84`);
  }

  return collection.features
    .filter((feature) => feature.geometry?.coordinates?.length > 0)
    .map((feature) => {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
        throw new Error(`${layer.file} contains unsupported geometry ${feature.geometry.type}`);
      }
      const attributes = readZoneAttributes(feature.properties ?? {});
      const geometry = {
        type: feature.geometry.type,
        coordinates: roundCoordinates(feature.geometry.coordinates),
      };
      return {
        ...attributes,
        layer: layer.key,
        kind: layer.kind,
        catch_type: layer.catch_type,
        geometry,
        bbox: geometryBbox(geometry),
        vertices: countVertices(geometry),
      };
    });
}

export function readLayers() {
  return Object.fromEntries(LAYERS.map((layer) => [layer.key, readLayer(layer)]));
}

function main() {
  const layers = readLayers();
  for (const layer of LAYERS) {
    const records = layers[layer.key];
    const vertices = records.reduce((sum, record) => sum + record.vertices, 0);
    console.log(`${layer.key}: ${records.length} polygons, ${vertices.toLocaleString()} vertices`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
