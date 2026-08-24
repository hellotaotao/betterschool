// Parse the ACT Government 2027 Priority Enrolment Area GeoJSON.
// Geometry is already WGS84; every vertex is retained and rounded to 6 dp.

import fs from 'node:fs';
import path from 'node:path';
import {
  ACT_2027_YEAR_OVERRIDES,
  RAW_DIR,
  RAW_GEOJSON,
  countVertices,
  geometryBbox,
  readJson,
  roundCoordinates,
} from './act-catchment-common.mjs';

function field(properties, name) {
  const key = Object.keys(properties).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : properties[key];
}

const ACT_LEVEL_SEQUENCE = ['Preschool', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export function parseActYearLevels(range) {
  const [rawStart, rawEnd, extra] = String(range ?? '').trim().split('-');
  if (!rawStart || !rawEnd || extra !== undefined) throw new Error(`Unsupported ACT year range: ${range}`);
  const start = rawStart === 'P' ? 'Preschool' : rawStart;
  const startIndex = ACT_LEVEL_SEQUENCE.indexOf(start);
  const endIndex = ACT_LEVEL_SEQUENCE.indexOf(rawEnd);
  if (startIndex < 0 || endIndex < startIndex) throw new Error(`Unsupported ACT year range: ${range}`);
  return ACT_LEVEL_SEQUENCE.slice(startIndex, endIndex + 1);
}

export function effectiveActYearLevels(sourceName, sourceRange) {
  return ACT_2027_YEAR_OVERRIDES.get(sourceName) ?? parseActYearLevels(sourceRange);
}

export function readActZoneAttributes(properties) {
  const sourceName = String(field(properties, 'SCHOOL_NAME') ?? '').trim();
  const sourceType = String(field(properties, 'TYPE') ?? '').trim();
  const sourceYearRange = String(field(properties, 'YEAR_LEVEL') ?? '').trim();
  const sourceId = String(field(properties, 'id') ?? field(properties, 'id_0') ?? '').trim();
  const government = String(field(properties, 'GOVERNMENT') ?? '').trim();
  if (!sourceName || !sourceType || !sourceYearRange || !sourceId) {
    throw new Error(
      `ACT zone has no school name, type, year range or source id. Fields: ${Object.keys(properties).join(', ')}`,
    );
  }
  if (government !== 'Yes') throw new Error(`${sourceName}: expected GOVERNMENT=Yes, got ${government}`);

  const typeMap = {
    Primary: { kind: 'primary', catch_type: 'PRIMARY_PEA' },
    High: { kind: 'secondary', catch_type: 'HIGH_PEA' },
    College: { kind: 'secondary', catch_type: 'COLLEGE_PEA' },
  };
  const mapped = typeMap[sourceType];
  if (!mapped) throw new Error(`${sourceName}: unsupported ACT zone type ${sourceType}`);

  return {
    source_school_code: sourceId,
    source_name: sourceName,
    source_type: sourceType,
    source_year_range: sourceYearRange,
    year_levels: effectiveActYearLevels(sourceName, sourceYearRange),
    ...mapped,
  };
}

export function readActZones() {
  const filePath = path.join(RAW_DIR, RAW_GEOJSON);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}; run 'npm run act:catchment:fetch' first`);
  }
  const collection = readJson(filePath);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('ACT source is not a GeoJSON FeatureCollection');
  }
  return collection.features.map((feature) => {
    if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      throw new Error(`ACT feature has unsupported geometry: ${feature.geometry?.type ?? 'missing'}`);
    }
    const geometry = {
      type: feature.geometry.type,
      coordinates: roundCoordinates(feature.geometry.coordinates),
    };
    return {
      ...readActZoneAttributes(feature.properties ?? {}),
      geometry,
      bbox: geometryBbox(geometry),
      vertices: countVertices(geometry),
    };
  });
}

function main() {
  const records = readActZones();
  const types = {};
  const ranges = {};
  let vertices = 0;
  for (const record of records) {
    types[record.source_type] = (types[record.source_type] ?? 0) + 1;
    ranges[record.source_year_range] = (ranges[record.source_year_range] ?? 0) + 1;
    vertices += record.vertices;
  }
  console.log(`ACT: ${records.length} polygons, ${vertices.toLocaleString()} vertices`);
  console.log(`  types: ${JSON.stringify(types)}`);
  console.log(`  source ranges: ${JSON.stringify(ranges)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
