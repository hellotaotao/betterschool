import crypto from 'node:crypto';
import fs from 'node:fs';
import { toMapSchool } from './client-schools.mjs';

// Derived from the canonical file rather than built alongside it, so it can be
// regenerated without the ACARA inputs that canonical:build needs.
const canonicalPath = 'public/data/schools.canonical.json';
const outputPath = 'public/data/schools.client.json';
const metadataPath = 'public/data/schools.metadata.json';

const schools = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const slim = schools.map(toMapSchool);
const output = JSON.stringify(slim);
fs.writeFileSync(outputPath, output);

// The app cache-busts on this hash as well as on generated_at: changing the
// allowlist alone leaves canonical untouched, and returning visitors would
// otherwise keep a cached copy missing the newly needed field.
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
metadata.client_dataset = {
  path: '/data/schools.client.json',
  schools: slim.length,
  bytes: Buffer.byteLength(output),
  sha256: crypto.createHash('sha256').update(output).digest('hex').slice(0, 12),
};
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

const before = fs.statSync(canonicalPath).size;
console.log(
  `Wrote ${outputPath}: ${slim.length} schools, ${(output.length / 1e6).toFixed(1)}MB`
  + ` (canonical ${(before / 1e6).toFixed(1)}MB)`,
);
