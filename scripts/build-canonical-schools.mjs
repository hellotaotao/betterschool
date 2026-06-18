import fs from 'node:fs';
import { classifyReligion, deriveIsReligious } from './religion-classify.mjs';

const profilePath = 'data/acara/processed/school-profile-2025.json';
const religionOverridesPath = 'data/religion/manual-overrides.json';
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
