// South Australian intake-zone sources and the constants its pipeline needs.
//
// Geometry, rounding and IO rules come from catchment-common.mjs and are shared
// with NSW; only what follows is South Australia's own.
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
  distanceKm,
  normaliseName,
  pointInGeometry,
} from './catchment-common.mjs';

export const SA_CATCHMENT_SOURCE = 'data.sa.gov.au';

/**
 * Dataset pages, for attribution and for a human to check when a build breaks.
 *
 * Note the slug: data.sa.gov.au also hosts an older pair under
 * `...-south-australian-government-...`, last updated January 2022 and stopping
 * at the 2023 enrolment year. The current datasets use `-govt-`. Reading the
 * wrong pair would publish three-year-old boundaries as current, so the slugs
 * are pinned here rather than being searched for.
 */
export const PRIMARY_DATASET_URL =
  'https://data.sa.gov.au/data/dataset/school-zones-for-south-australian-govt-primary-schools';
export const HIGH_DATASET_URL =
  'https://data.sa.gov.au/data/dataset/school-zones-for-south-australian-govt-high-schools';
export const SITES_DATASET_URL =
  'https://data.sa.gov.au/data/dataset/south-australian-government-education-site';

/**
 * Enrolment year these boundaries apply to, and the resources that carry it.
 *
 * Pinned rather than "latest": the department publishes several enrolment years
 * side by side, and silently rolling forward would change every published zone
 * without anyone deciding to. Bumping this is a deliberate edit.
 */
export const DATA_YEAR = 2025;

export const PRIMARY_ZIP_URL =
  'https://data.sa.gov.au/data/dataset/4ec9b847-da5d-4ac6-82aa-5d653c17e19e/resource/3aca3689-0967-4239-8e03-4b0359fbbf95/download/primaryschoolzones2025ey.zip';
export const HIGH_ZIP_URL =
  'https://data.sa.gov.au/data/dataset/46832dee-6c89-4a09-b813-f7864f257bde/resource/2107f2b8-610c-4caa-a640-153c6e46176d/download/highschoolzones2025ey.zip';
export const SITES_ZIP_URL =
  'https://www.dptiapps.com.au/dataportal/GovernmentEducationSites_geojson.zip';

/** All three source datasets are CC-BY; attribution is mandatory wherever we render them. */
export const LICENCE = 'CC-BY';
export const ATTRIBUTION = 'Department for Education, South Australia';

export const RAW_DIR = 'data/catchment/sa/raw';
export const PROCESSED_DIR = 'data/catchment/sa/processed';
export const PUBLIC_DIR = 'public/data/catchment/sa';

/**
 * The two shapefile layers, and the zone kind each one publishes.
 *
 * Kind comes from the layer, not from the `type` attribute. A combined
 * Reception-to-12 school appears in both layers as type PRSEC, so reading kind
 * off `type` would label its high-school zone "primary".
 */
export const LAYERS = [
  { kind: 'primary', dir: 'primary', base: 'PrimarySchoolZones2025EY' },
  { kind: 'secondary', dir: 'high', base: 'HighSchoolZones2025EY' },
];

/** GeoJSON member of the sites zip. GDA94 to match the zone shapefiles' .prj. */
export const SITES_GEOJSON = 'GovernmentEducationSites_GDA94.geojson';

/** Rough SA bounding box, used to reject geometry that lands somewhere impossible. */
export const SA_BBOX = { minLng: 128.9, minLat: -38.2, maxLng: 141.1, maxLat: -25.9 };

/**
 * How far a zone's site may sit from the ACARA school it joins to.
 *
 * The join itself is by org_num, an exact identifier; this is the check that
 * the identifier landed on the school we think it did. Both sources publish a
 * point for the same site, so agreement is normally exact — the observed
 * maximum across all 130 zones is 522 m (Aldinga Payinthi College), where the
 * names agree too. Anything past this goes to unmatched.json.
 */
export const MAX_SITE_DISTANCE_KM = 1.5;
