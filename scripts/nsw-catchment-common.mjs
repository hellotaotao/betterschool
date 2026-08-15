import fs from 'node:fs';
import path from 'node:path';

export const NSW_CATCHMENT_SOURCE = 'data.nsw.gov.au';
export const CATCHMENT_DATASET_URL =
  'https://data.nsw.gov.au/data/dataset/nsw-education-school-intake-zones-catchment-areas-for-nsw-government-schools';
export const CATCHMENT_ZIP_URL =
  'https://data.nsw.gov.au/data/dataset/8b1e8161-7252-43d9-81ed-6311569cb1d7/resource/32d6f502-ddb1-45d9-b114-5e34ddfd33ac/download/catchments.zip';
export const MASTER_DATASET_URL =
  'https://data.nsw.gov.au/data/dataset/78c10ea3-8d04-4c9c-b255-bbf8547e37e7/resource/3e6d5f6a-055c-440d-a690-fc0537c31095/download/master_dataset.csv';
export const MASTER_DATASET_PAGE =
  'https://data.nsw.gov.au/data/dataset/nsw-education-nsw-public-schools-master-dataset';

/** Both source datasets are CC-BY; attribution is mandatory wherever we render them. */
export const LICENCE = 'CC-BY';
export const ATTRIBUTION = 'NSW Department of Education';

export const RAW_DIR = 'data/catchment/nsw/raw';
export const PROCESSED_DIR = 'data/catchment/nsw/processed';
export const PUBLIC_DIR = 'public/data/catchment/nsw';

/** The three shapefile layers shipped inside catchments.zip. */
export const LAYERS = [
  { kind: 'primary', base: 'catchments_primary' },
  { kind: 'secondary', base: 'catchments_secondary' },
  { kind: 'future', base: 'catchments_future' },
];

/**
 * Coordinate decimal places kept when writing GeoJSON.
 *
 * 6 dp is ~0.1 m at NSW latitudes — far finer than the boundaries themselves
 * are meaningful — while cutting file size roughly in half versus the raw
 * doubles. This is rounding, NOT geometric simplification: no vertex is ever
 * dropped, so adjacent catchments cannot develop slivers or gaps and the
 * reverse lookup stays faithful to the published boundary.
 */
export const COORD_PRECISION = 6;

/** Source attribute names for the per-year-level flags, in school order. */
export const YEAR_FIELDS = [
  ['KINDERGART', 'K'],
  ['YEAR1', '1'], ['YEAR2', '2'], ['YEAR3', '3'], ['YEAR4', '4'],
  ['YEAR5', '5'], ['YEAR6', '6'], ['YEAR7', '7'], ['YEAR8', '8'],
  ['YEAR9', '9'], ['YEAR10', '10'], ['YEAR11', '11'], ['YEAR12', '12'],
];

/** Rough NSW bounding box, used to reject geometry that lands somewhere impossible. */
export const NSW_BBOX = { minLng: 140.9, minLat: -37.6, maxLng: 159.3, maxLat: -27.9 };

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

/**
 * Read the per-year-level flags off a source feature.
 *
 * The primary/secondary layers use 'Y'/'N'. The future layer instead stores the
 * year the level starts (e.g. 2027), with 0 meaning "not offered" — so the same
 * columns need two readings. Returning the levels themselves rather than the
 * CATCH_TYPE label matters: INFANTS catchments only cover K-2 and CENTRAL_*
 * ones span K-12, which the label alone would hide.
 */
export function readYearLevels(properties) {
  const levels = [];
  const startYears = [];

  for (const [field, level] of YEAR_FIELDS) {
    const raw = properties[field];
    if (raw === null || raw === undefined || raw === '') continue;

    const text = String(raw).trim();
    if (text === 'Y') {
      levels.push(level);
      continue;
    }
    if (text === 'N' || text === '0') continue;

    const year = Number(text);
    if (Number.isFinite(year) && year > 0) {
      levels.push(level);
      startYears.push(year);
    }
  }

  return {
    year_levels: levels,
    effective_year: startYears.length > 0 ? Math.min(...startYears) : undefined,
  };
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

/**
 * Minimal RFC 4180 CSV row splitter.
 *
 * master_dataset.csv contains quoted fields with embedded commas (addresses,
 * school names), so splitting on ',' loses column alignment and silently
 * corrupts the AgeID join.
 */
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

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}
