// ACT Priority Enrolment Area source configuration.
//
// The official ArcGIS item is the 2026 release for 2027 enrolments. Its item
// metadata identifies the feature service, enrolment year and CC BY 4.0 licence.
export {
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  roundCoordinates,
  geometryBbox,
  coarsenBbox,
  countVertices,
  geometryAreaKm2,
  groupExactGeometryVariants,
  normaliseName,
  pointInGeometry,
} from './catchment-common.mjs';

export const ACT_CATCHMENT_SOURCE = 'ACTmapi';
export const ITEM_ID = '41bc23f14bb249ba9ed80b5260657c6a';
export const DATASET_URL = `https://www.arcgis.com/home/item.html?id=${ITEM_ID}`;
export const ITEM_API_URL = `https://www.arcgis.com/sharing/rest/content/items/${ITEM_ID}?f=json`;
export const FEATURE_SERVICE_URL =
  'https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_Priority_Enrolment_Areas_2026/FeatureServer';
export const LAYER_ID = 2;
export const QUERY_URL = `${FEATURE_SERVICE_URL}/${LAYER_ID}/query`;
export const FINDER_URL =
  'https://www.act.gov.au/education-and-training/find-a-school-and-enrol/find-a-school-in-your-priority-enrolment-area';

export const RELEASE_YEAR = 2026;
export const DATA_YEAR = 2027;
export const LICENCE = 'CC BY 4.0';
export const ATTRIBUTION = 'Australian Capital Territory Government';

export const RAW_DIR = 'data/catchment/act/raw';
export const PROCESSED_DIR = 'data/catchment/act/processed';
export const PUBLIC_DIR = 'public/data/catchment/act';
export const RAW_GEOJSON = 'priority-enrolment-areas-2027.geojson';
export const RAW_ITEM = 'arcgis-item.json';
export const EXPECTED_SOURCE_FEATURES = 94;
export const ACT_BBOX = { minLng: 148.75, minLat: -35.7, maxLng: 149.45, maxLat: -34.95 };

// Exact audited identity differences between current ACT labels and ACARA 2025.
export const ACT_NAME_ALIASES = new Map([
  ['Canberra College', ['The Canberra College']],
  ['Strathnairn Primary School', ['Strathnairn School']],
  ['Whitlam Primary School (P-6)', ['Whitlam School']],
]);

// ACT publishes Melba Copland as one school with stage PEAs; ACARA publishes
// two locations for the same school_age_id. The 7-10 stage serves both site
// records because Year 10 is on the head campus, while 11-12 serves that head
// campus only. Every mapped coordinate must still fall inside the source zone.
export const ACT_STAGE_CAMPUS_TARGETS = new Map([
  ['Melba Copland Secondary School (7-10)', [
    'Melba Copland Secondary School Copland Campus Years 7 - 9',
    'Melba Copland Secondary School Copland Campus Years 10 - 12',
  ]],
  ['Melba Copland Secondary School (11-12)', [
    'Melba Copland Secondary School Copland Campus Years 10 - 12',
  ]],
]);

// The ArcGIS YEAR_LEVEL field stores each school's eventual generic range.
// The official 2026/2027 PEA page publishes narrower transition years for two
// newly opening schools. Those current-enrolment facts override the generic
// range; no other year is inferred.
export const ACT_2027_YEAR_OVERRIDES = new Map([
  ['Aunty Agnes Shea High School', ['7', '8', '9']],
  ['Whitlam Primary School (P-6)', ['Preschool', 'K', '1', '2']],
]);
