// Geometry and file helpers shared by every state's catchment pipeline.
//
// Split out of nsw-catchment-common.mjs when South Australia was added: the
// per-state modules differ in source URLs, attribute names and join chain, but
// none of that reaches the rounding, bbox and IO rules, which must stay
// identical across states or the reverse lookup would behave differently
// depending on which side of a border a user clicked.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Coordinate decimal places kept when writing GeoJSON.
 *
 * 6 dp is ~0.1 m at Australian latitudes — far finer than the boundaries
 * themselves are meaningful — while cutting file size roughly in half versus
 * the raw doubles. This is rounding, NOT geometric simplification: no vertex is
 * ever dropped, so adjacent catchments cannot develop slivers or gaps and the
 * reverse lookup stays faithful to the published boundary.
 */
export const COORD_PRECISION = 6;

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, payload, { pretty = true } = {}) {
  ensureDir(path.dirname(filePath));
  const body = pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  fs.writeFileSync(filePath, `${body}\n`);
  return filePath;
}

/** Minimal RFC 4180 CSV row splitter. */
export function splitCsvRow(line) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = false;
      } else current += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

/** Parse a CSV document into objects keyed by its header row. */
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function roundCoord(value) {
  return Number(value.toFixed(COORD_PRECISION));
}

/** Recursively round every coordinate pair in a GeoJSON coordinate array. */
export function roundCoordinates(coordinates) {
  if (typeof coordinates[0] === 'number') {
    return [roundCoord(coordinates[0]), roundCoord(coordinates[1])];
  }
  return coordinates.map(roundCoordinates);
}

/** Compute [minLng, minLat, maxLng, maxLat] for a GeoJSON geometry. */
export function geometryBbox(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  const visit = (coordinates) => {
    if (typeof coordinates[0] === 'number') {
      const [lng, lat] = coordinates;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    coordinates.forEach(visit);
  };

  visit(geometry.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Round a bbox to 4 dp (~11 m) for the lookup index, always outward.
 *
 * The index is only a coarse prefilter before exact point-in-polygon on the
 * full-precision geometry, so 6 dp there is wasted bytes. Rounding must expand
 * the box, never shrink it: a box rounded inward could exclude a point that
 * genuinely falls inside the catchment.
 */
export function coarsenBbox([minLng, minLat, maxLng, maxLat]) {
  const floor = (value) => Math.floor(value * 1e4) / 1e4;
  const ceil = (value) => Math.ceil(value * 1e4) / 1e4;
  return [floor(minLng), floor(minLat), ceil(maxLng), ceil(maxLat)];
}

/** Count coordinate pairs in a geometry — used for coverage reporting. */
export function countVertices(geometry) {
  let total = 0;
  const visit = (coordinates) => {
    if (typeof coordinates[0] === 'number') { total += 1; return; }
    coordinates.forEach(visit);
  };
  visit(geometry.coordinates);
  return total;
}

/** Approximate a small GeoJSON polygon's surface area in square kilometres. */
export function geometryAreaKm2(geometry) {
  const ringArea = (ring) => {
    if (ring.length < 4) return 0;
    const radiusKm = 6371.0088;
    const toRad = (degrees) => (degrees * Math.PI) / 180;
    const meanLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
    const cosLat = Math.cos(toRad(meanLat));
    const projected = ring.map(([lng, lat]) => [
      radiusKm * toRad(lng) * cosLat,
      radiusKm * toRad(lat),
    ]);
    let twiceArea = 0;
    for (let index = 0; index < projected.length - 1; index += 1) {
      const [x1, y1] = projected[index];
      const [x2, y2] = projected[index + 1];
      twiceArea += x1 * y2 - x2 * y1;
    }
    return Math.abs(twiceArea) / 2;
  };

  const polygonArea = (rings) => {
    if (rings.length === 0) return 0;
    return Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
  };

  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, rings) => sum + polygonArea(rings), 0);
  }
  return 0;
}

/** Merge same-school, same-kind polygons into one MultiPolygon. */
export function mergeGeometries(records) {
  if (records.length === 1) return records[0].geometry;

  const polygons = [];
  for (const record of records) {
    if (record.geometry.type === 'Polygon') polygons.push(record.geometry.coordinates);
    else if (record.geometry.type === 'MultiPolygon') polygons.push(...record.geometry.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

const levelOrder = (level) => (level === 'P' ? 0 : Number(level));

/**
 * Coalesce only byte-identical rounded geometries.
 *
 * A shared geometry may safely carry the union of its source year labels;
 * geometries that differ by even one rounded coordinate remain separate
 * variants. This is shared because several states publish stage/year layers.
 */
export function groupExactGeometryVariants(records) {
  const grouped = new Map();
  for (const record of records) {
    const key = JSON.stringify(record.geometry);
    let variant = grouped.get(key);
    if (!variant) {
      variant = {
        geometry: record.geometry,
        yearLevels: new Set(),
        catchTypes: new Set(),
        sourceSchoolCodes: new Set(),
      };
      grouped.set(key, variant);
    }
    for (const level of record.year_levels) variant.yearLevels.add(level);
    if (record.catch_type) variant.catchTypes.add(record.catch_type);
    if (record.source_school_code) variant.sourceSchoolCodes.add(record.source_school_code);
  }

  return [...grouped.values()].map((variant) => ({
    geometry: variant.geometry,
    year_levels: [...variant.yearLevels].sort((a, b) => levelOrder(a) - levelOrder(b)),
    catch_types: [...variant.catchTypes].sort(),
    source_school_codes: [...variant.sourceSchoolCodes].sort(),
  }));
}

/** Great-circle distance in km — used to confirm an ID join landed on the right site. */
export function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Case- and punctuation-insensitive name key, for verifying a join rather than making one. */
export function normaliseName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Ray-cast point-in-polygon, holes respected.
 *
 * Mirrors lib/catchmentLookup.ts. Kept here so the validators can ask the
 * geometry the same question the app asks at runtime; a validator that used a
 * looser test could pass a boundary the app then disagrees with.
 */
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false; // in a hole
  }
  return true;
}

export function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((rings) => pointInPolygon(point, rings));
  return false;
}
