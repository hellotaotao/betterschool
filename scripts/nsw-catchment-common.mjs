// Geometry, rounding and IO rules are identical for every state; only the
// source URLs, attribute names and join chain below are NSW's own.
export {
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  roundCoord,
  roundCoordinates,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
} from './catchment-common.mjs';

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

/** Source attribute names for the per-year-level flags, in school order. */
export const YEAR_FIELDS = [
  ['KINDERGART', 'K'],
  ['YEAR1', '1'], ['YEAR2', '2'], ['YEAR3', '3'], ['YEAR4', '4'],
  ['YEAR5', '5'], ['YEAR6', '6'], ['YEAR7', '7'], ['YEAR8', '8'],
  ['YEAR9', '9'], ['YEAR10', '10'], ['YEAR11', '11'], ['YEAR12', '12'],
];

/** Rough NSW bounding box, used to reject geometry that lands somewhere impossible. */
export const NSW_BBOX = { minLng: 140.9, minLat: -37.6, maxLng: 159.3, maxLat: -27.9 };

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
