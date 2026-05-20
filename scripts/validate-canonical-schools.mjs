import fs from 'node:fs';

const schoolsPath = 'public/data/schools.canonical.json';
const metadataPath = 'public/data/schools.metadata.json';

const schools = JSON.parse(fs.readFileSync(schoolsPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const ids = new Set();
const duplicateIds = [];
const sectorCounts = {};
const statusCounts = {};
let invalidCoordinates = 0;
let withLegacyScore = 0;
let withLegacyRank = 0;

for (const school of schools) {
  if (!school.id || typeof school.id !== 'string') throw new Error(`Missing id for ${school.school_name ?? '<unknown>'}`);
  if (!school.id.startsWith('acara-')) throw new Error(`Non-ACARA canonical id: ${school.id}`);
  if (ids.has(school.id)) duplicateIds.push(school.id);
  ids.add(school.id);

  if (!Number.isFinite(school.acara_sml_id)) {
    throw new Error(`Missing ACARA SML ID for ${school.id}`);
  }

  if (!Number.isFinite(school.lat) || !Number.isFinite(school.lng) || school.lat < -44.5 || school.lat > -9 || school.lng < 112 || school.lng > 154) {
    invalidCoordinates += 1;
  }

  if (!school.school_name || !school.suburb || !school.state || !school.postcode) {
    throw new Error(`Missing display fields for ${school.id}`);
  }

  sectorCounts[school.sector] = (sectorCounts[school.sector] ?? 0) + 1;
  statusCounts[school.legacy_metric_status] = (statusCounts[school.legacy_metric_status] ?? 0) + 1;
  if (Number.isFinite(school.legacy_score)) withLegacyScore += 1;
  if (Number.isFinite(school.legacy_rank)) withLegacyRank += 1;

  if (school.legacy_metric_status === 'available') {
    if (!school.local_id) throw new Error(`Legacy metric available without local_id: ${school.id}`);
    if (!Number.isFinite(school.legacy_score) || !Number.isFinite(school.legacy_rank)) {
      throw new Error(`Legacy metric available but score/rank missing: ${school.id}`);
    }
  }
}

if (duplicateIds.length > 0) throw new Error(`Duplicate ids: ${duplicateIds.slice(0, 10).join(', ')}`);
if (invalidCoordinates > 0) throw new Error(`Invalid coordinates: ${invalidCoordinates}`);
if (statusCounts.available !== withLegacyScore || withLegacyScore !== withLegacyRank) {
  throw new Error(`Legacy score/rank availability mismatch: ${JSON.stringify({ statusCounts, withLegacyScore, withLegacyRank })}`);
}
if (metadata.dataset_status !== 'canonical_acara_base_with_legacy_metric_layer') {
  throw new Error('Metadata must mark ACARA as canonical base with legacy metric layer.');
}
if (!metadata.coverage_note?.includes('ACARA')) {
  throw new Error('Metadata coverage note must describe ACARA canonical base.');
}

console.log(JSON.stringify({
  schools: schools.length,
  uniqueIds: ids.size,
  legacyMetricStatus: statusCounts,
  sectorCounts,
}, null, 2));
