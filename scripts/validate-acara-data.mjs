import fs from 'node:fs';

const files = [
  ['profile', 'data/acara/processed/school-profile-2025.json', ['acara_sml_id', 'school_name'], ['location_age_id', 'school_age_id']],
  ['location', 'data/acara/processed/school-location-2025.json', ['acara_sml_id', 'school_name', 'latitude', 'longitude'], ['location_age_id', 'school_age_id']],
  ['enrolmentsByGrade', 'data/acara/processed/enrolments-by-grade-2025.json', ['acara_sml_id', 'school_name'], ['location_age_id', 'school_age_id']],
];

const summary = {};

for (const [label, filePath, requiredFields, monitoredIdFields] of files) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(payload.records)) throw new Error(`${filePath} must contain records[]`);
  if (payload.record_count !== payload.records.length) {
    throw new Error(`${filePath} record_count ${payload.record_count} does not match records length ${payload.records.length}`);
  }
  if (!payload.source?.source_url || !payload.source?.source_file || !payload.source?.data_year) {
    throw new Error(`${filePath} missing source provenance`);
  }

  const missing = [];
  const monitoredMissing = Object.fromEntries(monitoredIdFields.map((field) => [field, 0]));
  for (const [index, record] of payload.records.entries()) {
    for (const field of requiredFields) {
      if (record[field] === null || record[field] === undefined || record[field] === '') {
        missing.push({ index, field, school_name: record.school_name ?? null });
        break;
      }
    }
    for (const field of monitoredIdFields) {
      if (record[field] === null || record[field] === undefined || record[field] === '') monitoredMissing[field] += 1;
    }
  }
  if (missing.length > 0) {
    throw new Error(`${filePath} has required field gaps: ${JSON.stringify(missing.slice(0, 10))}`);
  }

  summary[label] = {
    records: payload.records.length,
    monitoredMissingIds: monitoredMissing,
  };
}

const matchesPayload = JSON.parse(fs.readFileSync('data/acara/processed/betterschool-acara-matches.json', 'utf8'));
if (!Array.isArray(matchesPayload.matches)) throw new Error('Matches payload must contain matches[]');

const computedMatchSummary = matchesPayload.matches.reduce((accumulator, match) => {
  if (!['matched', 'unmatched', 'ambiguous'].includes(match.match_status)) {
    throw new Error(`Invalid match_status ${match.match_status} for ${match.local_id}`);
  }
  if (match.match_status === 'matched' && !match.acara_sml_id) {
    throw new Error(`Matched record missing acara_sml_id for ${match.local_id}`);
  }
  if (match.match_status === 'unmatched' && match.candidate_count !== 0) {
    throw new Error(`Unmatched record should have zero candidates for ${match.local_id}`);
  }
  if (match.match_status === 'ambiguous' && (!Array.isArray(match.candidates) || match.candidates.length < 2)) {
    throw new Error(`Ambiguous record should list candidates for ${match.local_id}`);
  }
  accumulator[match.match_status] = (accumulator[match.match_status] ?? 0) + 1;
  return accumulator;
}, { matched: 0, unmatched: 0, ambiguous: 0 });

const expectedSummary = matchesPayload.summary;
for (const key of ['matched', 'unmatched', 'ambiguous']) {
  if (expectedSummary[key] !== computedMatchSummary[key]) {
    throw new Error(`Match summary mismatch for ${key}: ${expectedSummary[key]} != ${computedMatchSummary[key]}`);
  }
}

summary.matches = { total: matchesPayload.matches.length, ...computedMatchSummary };
console.log(JSON.stringify(summary, null, 2));
