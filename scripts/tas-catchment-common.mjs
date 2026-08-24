// Tasmanian primary and district-school intake-area source configuration.
//
// LISTdata publishes the Department of Education layer as a statewide archive.
// The archive is pinned rather than discovered as "latest", and its own README
// states the CC BY 3.0 Australia licence. Geometry/IO helpers remain shared.
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
  mergeGeometries,
  normaliseName,
  pointInGeometry,
} from './catchment-common.mjs';

export const TAS_CATCHMENT_SOURCE = 'LISTdata';
export const DATASET_URL = 'https://listdata.thelist.tas.gov.au/opendata/index.html';
export const METADATA_URL =
  'https://www.thelist.tas.gov.au/app/content/data/geo-meta-data-record?detailRecordUID=a3862681-7a0c-4df6-a34b-bc594f00b45d';
export const ZIP_URL =
  'https://listdata.thelist.tas.gov.au/opendata/data/LIST_DOE_SCHOOL_INTAKE_AREAS_STATEWIDE.zip';

// The current open-data snapshot was extracted in July 2025 and includes the
// Legana Primary School intake area introduced for the 2025 opening. Most
// other boundaries are the statewide areas effective since Term 1, 2021.
export const DATA_YEAR = 2025;
export const LICENCE = 'CC BY 3.0 AU';
export const ATTRIBUTION = 'Department for Education, Children and Young People, Tasmania';

export const RAW_DIR = 'data/catchment/tas/raw';
export const PROCESSED_DIR = 'data/catchment/tas/processed';
export const PUBLIC_DIR = 'public/data/catchment/tas';
export const ARCHIVE_NAME = 'LIST_DOE_SCHOOL_INTAKE_AREAS_STATEWIDE.zip';
export const SHAPEFILE_BASE = 'list_doe_school_intake_areas_statewide';

export const TAS_BBOX = { minLng: 143.5, minLat: -43.8, maxLng: 148.6, maxLat: -39.0 };
export const EXPECTED_SOURCE_FEATURES = 149;

// The source uses GDA94 / MGA Zone 55. proj4 accepts this explicit definition
// without relying on a mutable online EPSG registry.
export const EPSG_28355 = '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs';

// Exact, audited name transitions between the published intake layer and the
// 2025 ACARA school identity snapshot. No fuzzy or edit-distance matching.
export const TAS_NAME_ALIASES = new Map([
  ['Dover District High School', ['Dover District School']],
  ['Rosebery District High School', ['Rosebery District School']],
  ['Yolla District High School', ['Yolla District School']],
  ['New school opening in 2025 - Legana Primary School', ['Legana Primary School']],
]);

// This source feature is explicitly labelled Shared and names both schools.
// Both schools must be inside the polygon before either attachment is emitted.
export const TAS_SHARED_ZONES = new Map([
  ['Sandy Bay Infant and Waimea Heights (Shared)', [
    'Sandy Bay Infant School',
    'Waimea Heights Primary School',
  ]],
]);
