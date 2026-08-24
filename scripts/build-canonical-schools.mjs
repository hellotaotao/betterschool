import fs from 'node:fs';
import { classifyReligion, deriveIsReligious } from './religion-classify.mjs';

const profilePath = 'data/acara/processed/school-profile-2025.json';
const religionOverridesPath = 'data/religion/manual-overrides.json';
// Optional layers: each absent until that state's catchment build has run.
// location_age_id is an ACARA identifier and so is nationally unique, which is
// why the states can share one lookup without colliding.
const catchmentLayerPaths = {
  NSW: 'data/catchment/nsw/processed/catchment-layer.json',
  SA: 'data/catchment/sa/processed/catchment-layer.json',
  VIC: 'data/catchment/vic/processed/catchment-layer.json',
  QLD: 'data/catchment/qld/processed/catchment-layer.json',
};
const locationPath = 'data/acara/processed/school-location-2025.json';
const legacyPath = 'public/data/schools.json';
const matchesPath = 'data/acara/processed/betterschool-acara-matches.json';
const outputPath = 'public/data/schools.canonical.json';
const metadataPath = 'public/data/schools.metadata.json';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function validCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -44.5 && lat <= -9 && lng >= 112 && lng <= 154;
}

function compactObject(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function canonicalId(record) {
  return `acara-${record.acara_sml_id}-${record.location_age_id}-${record.school_age_id}`;
}

const profilePayload = readJson(profilePath);
const locationPayload = readJson(locationPath);
const legacySchools = readJson(legacyPath);
const matchesPayload = readJson(matchesPath);
const religionOverrides = new Map(
  (fs.existsSync(religionOverridesPath) ? readJson(religionOverridesPath) : [])
    .map((override) => [override.acara_sml_id, override]),
);
const catchmentLayers = Object.fromEntries(
  Object.entries(catchmentLayerPaths)
    .map(([state, layerPath]) => [state, fs.existsSync(layerPath) ? readJson(layerPath) : null])
    .filter(([, layer]) => layer !== null),
);
const catchmentsByLocationAgeId = new Map();
for (const layer of Object.values(catchmentLayers)) {
  for (const [locationAgeId, entries] of Object.entries(layer.by_location_age_id ?? {})) {
    // A site belongs to one state, so an existing key would mean two states
    // claimed the same ACARA site — a real conflict, not something to merge.
    if (catchmentsByLocationAgeId.has(locationAgeId)) {
      throw new Error(`Two states both published a catchment for location_age_id ${locationAgeId}`);
    }
    catchmentsByLocationAgeId.set(locationAgeId, entries);
  }
}

const profilesByLocationAgeId = new Map(profilePayload.records.map(record => [record.location_age_id, record]));
const legacyByLocalId = new Map(legacySchools.map(record => [record.local_id, record]));
const matchedByLocationAgeId = new Map();
const ambiguousCandidateKeys = new Set();

for (const match of matchesPayload.matches) {
  if (match.match_status === 'matched') {
    matchedByLocationAgeId.set(match.location_age_id, match);
  } else if (match.match_status === 'ambiguous') {
    for (const candidate of match.candidates ?? []) {
      ambiguousCandidateKeys.add(`${candidate.acara_sml_id}:${candidate.location_age_id}:${candidate.school_age_id}`);
    }
  }
}

const schools = [];
for (const location of locationPayload.records) {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  if (!validCoordinate(lat, lng)) continue;

  const profile = profilesByLocationAgeId.get(location.location_age_id);
  const match = matchedByLocationAgeId.get(location.location_age_id);
  const legacy = match ? legacyByLocalId.get(match.local_id) : undefined;
  const ambiguousKey = `${location.acara_sml_id}:${location.location_age_id}:${location.school_age_id}`;
  const hasLegacyMetric = Boolean(legacy && Number.isFinite(legacy.score) && Number.isFinite(legacy.rank));

  let religion = classifyReligion({
    sector: profile?.sector ?? location.sector,
    governingBody: profile?.governing_body,
    schoolName: location.school_name,
  });
  const religionOverride = religionOverrides.get(location.acara_sml_id);
  if (religionOverride) {
    religion = {
      religious_affiliation: religionOverride.religious_affiliation,
      is_religious: religionOverride.is_religious ?? deriveIsReligious(religionOverride.religious_affiliation),
      religion_source: 'manual',
    };
  }

  // Government schools charge no tuition (voluntary contributions only) — a reliable fact.
  // Catholic/Independent fees are not collected yet (left undefined, not guessed).
  const sectorValue = profile?.sector ?? location.sector;
  const fees = sectorValue === 'Government'
    ? { fee_precision: 'band', band: 'free', fee_source: 'government_free' }
    : undefined;
  const myschoolUrl = Number.isFinite(location.acara_sml_id)
    ? `https://www.myschool.edu.au/school/${location.acara_sml_id}`
    : undefined;
  // Government schools only: catchments are a statutory feature of public
  // enrolment. Catholic and Independent schools admit on their own criteria
  // (parish, siblings, entrance exam) and have no geographic zone, so attaching
  // one here — even by accident — would state something false.
  const catchments = sectorValue === 'Government'
    ? catchmentsByLocationAgeId.get(String(location.location_age_id))
    : undefined;

  schools.push(compactObject({
    id: canonicalId(location),
    local_id: legacy?.local_id,
    acara_sml_id: location.acara_sml_id,
    location_age_id: location.location_age_id,
    school_age_id: location.school_age_id,
    rolled_school_id: location.rolled_school_id,
    school_name: location.school_name,
    suburb: location.suburb,
    state: location.state,
    postcode: String(location.postcode),
    lat,
    lng,
    sector: profile?.sector ?? location.sector,
    school_type: profile?.school_type ?? location.school_type,
    campus_type: profile?.campus_type ?? location.campus_type,
    year_range: profile?.year_range,
    special_school: location.special_school,
    geolocation: profile?.geolocation,
    icsea: profile?.icsea,
    icsea_percentile: profile?.icsea_percentile,
    total_enrolments: profile?.enrolments?.total,
    girls: profile?.enrolments?.girls,
    boys: profile?.enrolments?.boys,
    enrolments_fte: profile?.enrolments?.fte,
    lbote_yes_percent: profile?.enrolments?.lbote_yes_percent,
    lbote_no_percent: profile?.enrolments?.lbote_no_percent,
    lbote_not_stated_percent: profile?.enrolments?.lbote_not_stated_percent,
    indigenous_percent: profile?.enrolments?.indigenous_percent,
    school_url: profile?.school_url,
    myschool_url: myschoolUrl,
    governing_body: profile?.governing_body,
    governing_body_url: profile?.governing_body_url,
    religious_affiliation: religion.religious_affiliation,
    is_religious: religion.is_religious,
    religion_source: religion.religion_source,
    fees,
    catchments,
    legacy_score: hasLegacyMetric ? legacy.score : undefined,
    legacy_rank: hasLegacyMetric ? legacy.rank : undefined,
    legacy_metric_status: hasLegacyMetric
      ? 'available'
      : ambiguousCandidateKeys.has(ambiguousKey)
        ? 'ambiguous_unmatched'
        : 'unavailable',
    match_method: match?.match_method,
    source: {
      canonical_base: 'ACARA Data Access Program public School Location/Profile 2025',
      metric_layer: hasLegacyMetric ? 'Legacy imported public/data/schools.json score/rank attached by deterministic ACARA match' : undefined,
      metadata: '/data/schools.metadata.json',
      data_year: 2025,
    },
  }));
}

schools.sort((a, b) =>
  a.state.localeCompare(b.state) ||
  a.suburb.localeCompare(b.suburb) ||
  a.school_name.localeCompare(b.school_name) ||
  a.id.localeCompare(b.id)
);

const ids = new Set(schools.map(school => school.id));
if (ids.size !== schools.length) throw new Error('Generated duplicate canonical ids.');

fs.writeFileSync(outputPath, `${JSON.stringify(schools, null, 2)}\n`);

const sectorCounts = schools.reduce((acc, school) => {
  acc[school.sector] = (acc[school.sector] ?? 0) + 1;
  return acc;
}, {});
const legacyStatusCounts = schools.reduce((acc, school) => {
  acc[school.legacy_metric_status] = (acc[school.legacy_metric_status] ?? 0) + 1;
  return acc;
}, {});
const religionAffiliationCounts = schools.reduce((acc, school) => {
  const key = school.religious_affiliation ?? 'Unknown';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const religionSourceCounts = schools.reduce((acc, school) => {
  const key = school.religion_source ?? 'none';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const feesBandCounts = schools.reduce((acc, school) => {
  const key = school.fees?.band ?? 'not_collected';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const catchmentCounts = schools.reduce((acc, school) => {
  for (const catchment of school.catchments ?? []) {
    acc[catchment.kind] = (acc[catchment.kind] ?? 0) + 1;
  }
  if (school.catchments) acc.schools_with_catchment = (acc.schools_with_catchment ?? 0) + 1;
  return acc;
}, {});

const metadata = readJson(metadataPath);
metadata.dataset_status = 'canonical_acara_base_with_legacy_metric_layer';
metadata.coverage_note = 'Canonical public app dataset is ACARA 2025 official public School Location/Profile records with valid coordinates. Legacy score/rank are optional attached metrics only.';
metadata.provenance.source = 'ACARA Data Access Program public School Location/Profile 2025 is the canonical base/map layer.';
metadata.provenance.rank_scope = 'Legacy imported rank attached only for deterministic ACARA matches; unknown scope and not an official/national ACARA rank.';
metadata.provenance.score_scope = 'Legacy imported score attached only for deterministic ACARA matches; methodology opaque and not an authoritative ACARA measure.';
metadata.provenance.acara_public_data.note = 'Official ACARA identity, profile and location data is the canonical base table/map layer. Legacy score/rank is retained only as an optional metric layer for matched schools.';
metadata.fields.id = 'Canonical deterministic app identifier based on ACARA acara_sml_id + location_age_id + school_age_id.';
metadata.fields.local_id = 'Legacy BetterSchool local_id, present only when a legacy record was deterministically matched to ACARA.';
metadata.fields.sector = 'Official ACARA sector value (for example Government, Catholic, Independent).';
metadata.fields.legacy_rank = 'Optional legacy imported rank; display as legacy/current-dataset rank, not official or national.';
metadata.fields.legacy_score = 'Optional legacy imported score; display as legacy/current-dataset reference value, not official or national.';
metadata.fields.legacy_metric_status = 'available when legacy score/rank are attached; unavailable for official ACARA-only schools; ambiguous_unmatched for ACARA candidates tied to an ambiguous legacy match.';
metadata.provenance.religion = 'Religious affiliation is INFERRED, not an official ACARA field. Catholic/Government come from sector (high confidence); Independent schools are classified only from religious governing bodies or a conservative explicit-name match, and are left Unknown rather than guessed when signals are weak.';
metadata.fields.religious_affiliation = 'Inferred denomination, or Secular (Government) / Unknown. Not official ACARA data.';
metadata.fields.is_religious = 'true = faith-based, false = secular (Government), null = Unknown.';
metadata.fields.religion_source = 'sector | governing_body | name_explicit | manual; absent when Unknown.';
metadata.provenance.naplan = 'NAPLAN scores are not stored. Each school links out to its official My School page via myschool_url for NAPLAN results.';
metadata.provenance.fees = 'Government schools are marked free (no tuition; voluntary contributions only). Catholic/Independent fees are not yet collected — left absent rather than guessed. Future fees carry precise amounts where available, otherwise a band, always with a source.';
metadata.fields.myschool_url = 'Deep link to the school My School page, built from acara_sml_id (verified pattern).';
metadata.fields.fees = 'Tuition fees: free for Government; other sectors pending collection. Precise amount preferred, else band; always with fee_source.';
const catchmentProvenance = {
  NSW: (layer) => `NSW government school intake zones from data.nsw.gov.au (CC-BY, ${layer.data_year} enrolment year), joined by USE_ID -> master dataset School_code -> AgeID -> location_age_id. Deterministic ID join only; unjoined polygons are recorded in data/catchment/nsw/processed/unmatched.json rather than name-matched. Covers 2,029 of 2,223 NSW government schools. Boundaries are a guide, not a legal instrument — NSW Department of Education disclaims responsibility where this data informs property decisions, and the official School Finder is authoritative.`,
  SA: (layer) => `SA government school zones from data.sa.gov.au (CC-BY, ${layer.data_year} enrolment year), joined by org_num -> Government Education Sites -> the one ACARA school that is both within ${(layer.join.max_allowed_km * 1000).toFixed(0)} m of the published site and named the same (observed max ${(layer.join.max_distance_km * 1000).toFixed(0)} m). Name and distance both select the match, because co-located campuses make either alone wrong. Unconfirmed polygons are recorded in data/catchment/sa/processed/unmatched.json. South Australia publishes zones for only part of its government system — 124 of 521 schools — and the published data does not say why, so a South Australian school without a zone must not be read as "no zone published for a school that has one". No year levels: the SA source carries none per zone.`,
  VIC: (layer) => `Victorian government school zones from discover.data.vic.gov.au (CC BY 4.0, ${layer.data_year} enrolment year), joined from the exact ENTITY_CODE school number to the official Victorian school identity, then to one exact ACARA base or campus name whose coordinates fall inside the published polygon. When the older site register has no row, the exact source identity plus polygon containment is required. ${layer.join.joined_entities} of ${layer.join.entities} source entities joined; the rest are recorded in data/catchment/vic/processed/unmatched.json, with no fuzzy or nearest-school fallback. Secondary boundaries remain distinct by published year level: only byte-identical 6-decimal geometries are coalesced, and their year labels are unioned.`,
  QLD: (layer) => `Queensland government school negotiated catchments from data.qld.gov.au (CC BY 4.0, ${layer.data_year}), published separately for primary (Prep-6), junior secondary (Years 7-10) and senior secondary (Years 11-12). Centre_code joins each boundary to the official site, then one exact expanded ACARA school identity must be within ${(layer.join.max_allowed_km * 1000).toFixed(0)} m and inside the polygon (observed max ${(layer.join.max_distance_km * 1000).toFixed(0)} m). One audited official campus rename and exact base-campus fallbacks are explicit; a missing site row may use only one exact source identity inside the polygon. ${layer.join.matched_source_entities} source records joined and ${layer.join.unmatched_source_entities} are recorded in data/catchment/qld/processed/unmatched.json. Junior and senior geometries stay distinct unless their rounded coordinates are byte-identical.`,
};

metadata.provenance.catchment = Object.keys(catchmentLayers).length > 0
  ? Object.entries(catchmentLayers)
    .map(([state, layer]) => catchmentProvenance[state](layer))
    .join(' ')
  : 'Not collected in this build.';
metadata.fields.catchments = 'NSW, SA, VIC and QLD, Government schools only. Each distinct boundary variant carries zone_id, geometry_url (loaded on demand), catch_type, data_year and source. year_levels are exact source-published levels where available (NSW, VIC and QLD); SA publishes none. Year/stage variants with different geometry remain separate. Absent means no catchment data for that school, and what that means differs by state — see provenance.catchment.';
metadata.generated_from = {
  canonical_builder: 'scripts/build-canonical-schools.mjs',
  acara_location_records: locationPayload.records.length,
  acara_profile_records: profilePayload.records.length,
  output_records: schools.length,
  skipped_invalid_coordinates: locationPayload.records.length - schools.length,
  legacy_input_records: legacySchools.length,
  legacy_matches_available: legacyStatusCounts.available ?? 0,
  legacy_ambiguous_unmatched: legacyStatusCounts.ambiguous_unmatched ?? 0,
  sector_counts: sectorCounts,
  religion_affiliation_counts: religionAffiliationCounts,
  religion_source_counts: religionSourceCounts,
  fees_band_counts: feesBandCounts,
  catchment_counts: catchmentCounts,
};
metadata.generated_at = new Date().toISOString();

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  schools: schools.length,
  legacyMetricStatus: legacyStatusCounts,
  sectorCounts,
  religionAffiliationCounts,
  religionSourceCounts,
  feesBandCounts,
}, null, 2));
