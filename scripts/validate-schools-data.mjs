import fs from 'node:fs';

const schoolsPath = 'public/data/schools.json';
const metadataPath = 'public/data/schools.metadata.json';
const allowedSectors = new Set(['Government', 'Non-government']);

const schools = JSON.parse(fs.readFileSync(schoolsPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const localIds = new Set();
const duplicateLocalIds = [];
const invalidSectors = new Set();

for (const school of schools) {
  if (!school.local_id || typeof school.local_id !== 'string') {
    throw new Error(`Missing local_id for ${school.school_name ?? '<unknown school>'}`);
  }

  if (localIds.has(school.local_id)) duplicateLocalIds.push(school.local_id);
  localIds.add(school.local_id);

  if (!allowedSectors.has(school.sector)) invalidSectors.add(school.sector);
}

if (duplicateLocalIds.length > 0) {
  throw new Error(`Duplicate local_id values: ${duplicateLocalIds.slice(0, 10).join(', ')}`);
}

if (invalidSectors.size > 0) {
  throw new Error(`Invalid sector values: ${[...invalidSectors].join(', ')}`);
}

if (metadata.dataset_status !== 'foundation_incomplete') {
  throw new Error('Metadata must mark this as a foundation/incomplete dataset.');
}

if (!metadata.provenance?.rank_scope?.toLowerCase().includes('unknown')) {
  throw new Error('Metadata must document unknown legacy rank scope.');
}

console.log(JSON.stringify({
  schools: schools.length,
  uniqueLocalIds: localIds.size,
  sectors: [...allowedSectors],
  metadataStatus: metadata.dataset_status,
}, null, 2));
