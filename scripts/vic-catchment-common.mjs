// Victorian school-zone sources and the constants its pipeline needs.

export {
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  roundCoordinates,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
  distanceKm,
  normaliseName,
  pointInGeometry,
  parseCsv,
} from './catchment-common.mjs';

export const VIC_CATCHMENT_SOURCE = 'discover.data.vic.gov.au';
export const CATCHMENT_DATASET_URL =
  'https://discover.data.vic.gov.au/dataset/victorian-government-school-zones-2027';
export const CATCHMENT_RESOURCE_ID = '5b2a9b83-5635-48d0-85cd-e674e8912c69';
export const CATCHMENT_ZIP_URL =
  'https://www.education.vic.gov.au/Documents/about/research/datavic/dv419_DataVic_School_Zones_2027_MAR26.zip';
export const SITES_DATASET_URL =
  'https://discover.data.vic.gov.au/dataset/school-locations-2025';
export const SITES_RESOURCE_ID = 'd26bf015-a1e5-48dd-a1d6-8edd4b0a511b';
export const SITES_CSV_URL =
  'https://www.education.vic.gov.au/Documents/about/research/datavic/dv402-SchoolLocations2025.csv';

export const DATA_YEAR = 2027;
export const LICENCE = 'CC BY 4.0';
export const ATTRIBUTION = 'Department of Education, Victoria';

export const RAW_DIR = 'data/catchment/vic/raw';
export const PROCESSED_DIR = 'data/catchment/vic/processed';
export const PUBLIC_DIR = 'public/data/catchment/vic';
export const SITES_CSV = 'school-locations-2025.csv';

export const LAYERS = [
  { key: 'primary', kind: 'primary', catch_type: 'PRIMARY', file: 'Primary_Integrated_2027.geojson' },
  ...[7, 8, 9, 10, 11, 12].map((year) => ({
    key: `secondary_year_${year}`,
    kind: 'secondary',
    catch_type: 'SECONDARY_INTEGRATED',
    file: `Secondary_Integrated_Year${year}_2027.geojson`,
  })),
  { key: 'junior_secondary', kind: 'secondary', catch_type: 'JUNIOR_SECONDARY', file: 'Standalone_juniorsec_2027.geojson' },
  { key: 'senior_secondary', kind: 'secondary', catch_type: 'SENIOR_SECONDARY', file: 'Standalone_seniorsec_2027.geojson' },
  { key: 'single_sex', kind: 'secondary', catch_type: 'SINGLE_SEX', file: 'Standalone_singlesex_2027.geojson' },
];

export const VIC_BBOX = { minLng: 140.8, minLat: -39.3, maxLng: 150.1, maxLat: -33.8 };
export const MAX_SITE_DISTANCE_KM = 1.5;

const PRIMARY_LEVELS = ['P', '1', '2', '3', '4', '5', '6'];

/** Parse only the year-level labels the department actually publishes. */
export function parseVicYearLevels(value) {
  const text = String(value ?? '').trim();
  if (text === 'P6') return [...PRIMARY_LEVELS];
  if (/^(?:[7-9]|1[0-2])$/.test(text)) return [text];

  const range = /^(7|8|9|10|11|12)\s+to\s+(7|8|9|10|11|12)$/i.exec(text);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start <= end) return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
  }

  throw new Error(`Unknown Victorian zone year level: ${text || '(blank)'}`);
}

/** ENTITY_CODE is entity type + zero-padded school number + campus suffix. */
export function schoolNumberFromEntityCode(value) {
  const text = String(value ?? '').trim();
  const match = /^1(\d{4})(\d{2})$/.exec(text);
  if (!match) throw new Error(`Malformed Victorian entity code: ${text || '(blank)'}`);
  return String(Number(match[1]));
}

const levelOrder = (level) => (level === 'P' ? 0 : Number(level));

/**
 * Coalesce only byte-identical rounded geometries.
 *
 * Different year layers can publish genuinely different boundaries. A shared
 * geometry may safely carry the union of its source year labels; geometries
 * that differ by even one rounded coordinate remain separate variants.
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
