// Queensland school-catchment sources and pipeline constants.

export {
  COORD_PRECISION,
  ensureDir,
  readJson,
  writeJson,
  roundCoord,
  geometryBbox,
  coarsenBbox,
  countVertices,
  mergeGeometries,
  groupExactGeometryVariants,
  distanceKm,
  normaliseName,
  pointInGeometry,
} from './catchment-common.mjs';

export const QLD_CATCHMENT_SOURCE = 'data.qld.gov.au';
export const CATCHMENT_DATASET_URL =
  'https://www.data.qld.gov.au/dataset/queensland-state-schools-geographic-information';
export const OFFICIAL_FINDER_URL = 'https://www.qgso.qld.gov.au/maps/edmap/';
export const DATASET_ID = 'b01b50fc-b8ab-4c88-bc4a-34d42930fea8';
export const DATA_YEAR = 2026;
export const LICENCE = 'CC BY 4.0';
export const ATTRIBUTION = 'Department of Education, Queensland';

export const RAW_DIR = 'data/catchment/qld/raw';
export const PROCESSED_DIR = 'data/catchment/qld/processed';
export const PUBLIC_DIR = 'public/data/catchment/qld';

const resourceUrl = (resourceId, file) => (
  `https://www.data.qld.gov.au/dataset/${DATASET_ID}/resource/${resourceId}/download/${file}`
);

export const LAYERS = [
  {
    key: 'primary',
    kind: 'primary',
    catch_type: 'PRIMARY',
    year_levels: ['P', '1', '2', '3', '4', '5', '6'],
    sites_resource_id: '145b0e94-dfce-42b3-872b-8866b29b20ee',
    sites_file: 'primary_sites_2026.kml',
    catchments_resource_id: 'a35846d9-e320-46fc-aea1-b477001ca485',
    catchments_file: 'primary_catchments_2026.kml',
  },
  {
    key: 'junior_secondary',
    kind: 'secondary',
    catch_type: 'JUNIOR_SECONDARY',
    year_levels: ['7', '8', '9', '10'],
    sites_resource_id: '827b0eae-12f3-4604-831d-97cde7d021dc',
    sites_file: 'junior_secondary_sites_2026.kml',
    catchments_resource_id: '2557305a-5339-4945-819f-551bd917fe39',
    catchments_file: 'junior_secondary_catchments_2026.kml',
  },
  {
    key: 'senior_secondary',
    kind: 'secondary',
    catch_type: 'SENIOR_SECONDARY',
    year_levels: ['11', '12'],
    sites_resource_id: '9ca39d88-29ca-43ab-a928-3372024163b9',
    sites_file: 'senior_secondary_sites_2026.kml',
    catchments_resource_id: '930ba950-9661-4edb-bb04-8cdfb3305d33',
    catchments_file: 'senior_secondary_catchments_2026.kml',
  },
].map((layer) => ({
  ...layer,
  sites_url: resourceUrl(layer.sites_resource_id, layer.sites_file),
  catchments_url: resourceUrl(layer.catchments_resource_id, layer.catchments_file),
}));

export const QLD_BBOX = { minLng: 137.9, minLat: -29.3, maxLng: 153.7, maxLat: -9.0 };
export const MAX_SITE_DISTANCE_KM = 1.5;

export const AUDITED_ACARA_NAME_BY_CENTRE_CODE = {
  '5704': 'Northern Peninsula Area College - Ama Mary Eseli Injinoo Campus',
};

/** Expand the abbreviations used by the official Queensland KML site names. */
export function expandQldSchoolName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\bSIPS\b/gi, 'State Infants and Primary School')
    .replace(/\bSHS\b/gi, 'State High School')
    .replace(/\bCOM S\b/gi, 'Community School')
    .replace(/\bSS\b/gi, 'State School');
}
