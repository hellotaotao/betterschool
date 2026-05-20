import fs from 'node:fs';
import { writeJson, normalizeName, stableCandidate } from './acara-common.mjs';

const schools = JSON.parse(fs.readFileSync('public/data/schools.json', 'utf8'));
const profilePayload = JSON.parse(fs.readFileSync('data/acara/processed/school-profile-2025.json', 'utf8'));
const locationPayload = JSON.parse(fs.readFileSync('data/acara/processed/school-location-2025.json', 'utf8'));
const generatedAt = new Date().toISOString();

const locationsBySmlId = new Map(locationPayload.records.map((record) => [record.acara_sml_id, record]));
const acaraRecords = profilePayload.records.map((profile) => ({
  ...profile,
  latitude: locationsBySmlId.get(profile.acara_sml_id)?.latitude ?? null,
  longitude: locationsBySmlId.get(profile.acara_sml_id)?.longitude ?? null,
}));

function key(parts) {
  return parts.map((part) => String(part ?? '').trim().toUpperCase()).join('|');
}

function buildIndex(selector) {
  const index = new Map();
  for (const record of acaraRecords) {
    const indexKey = selector(record);
    if (!indexKey) continue;
    const existing = index.get(indexKey) ?? [];
    existing.push(record);
    index.set(indexKey, existing);
  }
  return index;
}

const byNamePostcodeState = buildIndex((record) => {
  const name = normalizeName(record.school_name);
  if (!name || !record.postcode || !record.state) return null;
  return key([name, record.postcode, record.state]);
});

const byNameSuburbState = buildIndex((record) => {
  const name = normalizeName(record.school_name);
  if (!name || !record.suburb || !record.state) return null;
  return key([name, record.suburb, record.state]);
});

function schoolPostcode(school) {
  if (school.postcode === null || school.postcode === undefined) return null;
  return String(school.postcode).trim().padStart(4, '0');
}

function matchSchool(school) {
  const base = {
    local_id: school.local_id,
    school_name: school.school_name,
    state: school.state,
    postcode: schoolPostcode(school),
  };

  const normalizedSchoolName = normalizeName(school.school_name);
  const postcodeStateKey = key([normalizedSchoolName, schoolPostcode(school), school.state]);
  const postcodeCandidates = byNamePostcodeState.get(postcodeStateKey) ?? [];
  if (postcodeCandidates.length === 1) {
    return {
      ...base,
      match_status: 'matched',
      match_method: 'normalized_name_postcode_state',
      acara_sml_id: postcodeCandidates[0].acara_sml_id,
      location_age_id: postcodeCandidates[0].location_age_id,
      school_age_id: postcodeCandidates[0].school_age_id,
      candidate_count: 1,
      candidates: [],
      matched_acara_record: stableCandidate(postcodeCandidates[0]),
    };
  }
  if (postcodeCandidates.length > 1) {
    return {
      ...base,
      match_status: 'ambiguous',
      match_method: 'normalized_name_postcode_state',
      candidate_count: postcodeCandidates.length,
      candidates: postcodeCandidates.map(stableCandidate),
    };
  }

  const suburb = school.suburb ?? school.address_suburb;
  const suburbStateKey = key([normalizedSchoolName, suburb, school.state]);
  const suburbCandidates = byNameSuburbState.get(suburbStateKey) ?? [];
  if (suburbCandidates.length === 1) {
    return {
      ...base,
      match_status: 'matched',
      match_method: 'normalized_name_suburb_state',
      acara_sml_id: suburbCandidates[0].acara_sml_id,
      location_age_id: suburbCandidates[0].location_age_id,
      school_age_id: suburbCandidates[0].school_age_id,
      candidate_count: 1,
      candidates: [],
      matched_acara_record: stableCandidate(suburbCandidates[0]),
    };
  }
  if (suburbCandidates.length > 1) {
    return {
      ...base,
      match_status: 'ambiguous',
      match_method: 'normalized_name_suburb_state',
      candidate_count: suburbCandidates.length,
      candidates: suburbCandidates.map(stableCandidate),
    };
  }

  return {
    ...base,
    match_status: 'unmatched',
    match_method: null,
    acara_sml_id: null,
    location_age_id: null,
    school_age_id: null,
    candidate_count: 0,
    candidates: [],
  };
}

const matches = schools.map(matchSchool);
const summary = matches.reduce((accumulator, match) => {
  accumulator[match.match_status] = (accumulator[match.match_status] ?? 0) + 1;
  return accumulator;
}, {});

const outputPath = writeJson('betterschool-acara-matches.json', {
  generated_at: generatedAt,
  source_files: [
    'public/data/schools.json',
    'data/acara/processed/school-profile-2025.json',
    'data/acara/processed/school-location-2025.json',
  ],
  methodology: [
    'Deterministic exact match on normalized school_name + postcode + state.',
    'Fallback deterministic exact match on normalized school_name + suburb + state.',
    'No fuzzy matches are promoted to authoritative matches.',
  ],
  summary: {
    total: matches.length,
    matched: summary.matched ?? 0,
    unmatched: summary.unmatched ?? 0,
    ambiguous: summary.ambiguous ?? 0,
  },
  matches,
});

console.log(JSON.stringify({ outputPath, ...summary, total: matches.length }, null, 2));
