// Read the published Queensland KML layers into normalised feature records.

import fs from 'node:fs';
import path from 'node:path';
import {
  LAYERS,
  RAW_DIR,
  roundCoord,
  geometryBbox,
  countVertices,
} from './qld-catchment-common.mjs';

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function tagBody(text, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(text);
  return match ? match[1] : null;
}

function plainText(value) {
  return decodeEntities(value).replace(/<[^>]+>/g, '').trim();
}

function descriptionFields(placemark) {
  const description = decodeEntities(tagBody(placemark, 'description') ?? '');
  const fields = {};
  for (const row of description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => plainText(match[1]));
    if (cells.length >= 2) fields[cells[0]] = cells[1];
  }
  return fields;
}

function identity(placemark) {
  const name = plainText(tagBody(placemark, 'name') ?? '');
  const fields = descriptionFields(placemark);
  const sourceName = String(fields.Centre_name ?? name).trim();
  const sourceSchoolCode = String(fields.Centre_code ?? '').trim();
  if (!name || !sourceName || !sourceSchoolCode) {
    throw new Error('Queensland placemark has no complete centre identity in its name/description');
  }
  if (name !== sourceName) {
    throw new Error(`Queensland placemark name differs from Centre_name: ${name} / ${sourceName}`);
  }
  return { source_name: sourceName, source_school_code: sourceSchoolCode };
}

function placemarks(kml) {
  const records = [...String(kml).matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)].map((match) => match[1]);
  if (records.length === 0) throw new Error('KML has no Placemark records');
  return records;
}

function parseCoordinate(value) {
  const parts = value.split(',');
  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`Malformed KML coordinate: ${value}`);
  }
  return [roundCoord(longitude), roundCoord(latitude)];
}

function coordinateList(value) {
  const coordinates = plainText(value).split(/\s+/).filter(Boolean).map(parseCoordinate);
  if (coordinates.length < 4) throw new Error('KML polygon ring has fewer than four vertices');
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('KML polygon ring is not closed');
  return coordinates;
}

function boundaryRing(polygon, boundaryTag) {
  const boundary = tagBody(polygon, boundaryTag);
  if (boundary === null) return null;
  const coordinates = tagBody(boundary, 'coordinates');
  if (coordinates === null) throw new Error(`${boundaryTag} has no coordinates`);
  return coordinateList(coordinates);
}

function polygonRings(polygon) {
  const outer = boundaryRing(polygon, 'outerBoundaryIs');
  if (!outer) throw new Error('KML Polygon has no outerBoundaryIs');
  const holes = [...polygon.matchAll(/<innerBoundaryIs\b[^>]*>([\s\S]*?)<\/innerBoundaryIs>/gi)].map((match) => {
    const coordinates = tagBody(match[1], 'coordinates');
    if (coordinates === null) throw new Error('innerBoundaryIs has no coordinates');
    return coordinateList(coordinates);
  });
  return [outer, ...holes];
}

function geometryFromPlacemark(placemark) {
  const polygons = [...placemark.matchAll(/<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/gi)]
    .map((match) => polygonRings(match[1]));
  if (polygons.length === 0) throw new Error('Queensland catchment placemark has no Polygon');
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

export function parseSiteKml(kml) {
  return placemarks(kml).map((placemark) => {
    const point = tagBody(placemark, 'Point');
    const coordinates = point === null ? null : tagBody(point, 'coordinates');
    if (coordinates === null) throw new Error('Queensland site placemark has no Point coordinates');
    const [longitude, latitude] = parseCoordinate(plainText(coordinates).split(/\s+/)[0]);
    return { ...identity(placemark), longitude, latitude };
  });
}

export function parseCatchmentKml(kml, layer) {
  return placemarks(kml).map((placemark) => {
    const centre = identity(placemark);
    const geometry = geometryFromPlacemark(placemark);
    return {
      ...centre,
      layer: layer.key,
      kind: layer.kind,
      catch_type: layer.catch_type,
      year_levels: [...layer.year_levels],
      geometry,
      bbox: geometryBbox(geometry),
      vertices: countVertices(geometry),
    };
  });
}

export function readLayers() {
  return Object.fromEntries(LAYERS.map((layer) => {
    const catchmentsPath = path.join(RAW_DIR, layer.catchments_file);
    const sitesPath = path.join(RAW_DIR, layer.sites_file);
    if (!fs.existsSync(catchmentsPath) || !fs.existsSync(sitesPath)) {
      throw new Error(`Missing Queensland KML for ${layer.key} — run 'npm run qld:catchment:fetch' first`);
    }
    return [layer.key, {
      catchments: parseCatchmentKml(fs.readFileSync(catchmentsPath, 'utf8'), layer),
      sites: parseSiteKml(fs.readFileSync(sitesPath, 'utf8')),
    }];
  }));
}

function main() {
  const layers = readLayers();
  for (const layer of LAYERS) {
    const { catchments, sites } = layers[layer.key];
    const vertices = catchments.reduce((sum, record) => sum + record.vertices, 0);
    console.log(`${layer.key}: ${catchments.length} catchments, ${sites.length} sites, ${vertices.toLocaleString()} vertices`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
