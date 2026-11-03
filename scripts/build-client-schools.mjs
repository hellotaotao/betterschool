import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { toMapSchool } from './client-schools.mjs';

// Derived from the canonical file rather than built alongside it, so it can be
// regenerated without the ACARA inputs that canonical:build needs.
const canonicalPath = 'public/data/schools.canonical.json';
const outputDir = 'public/data';
const partPrefix = 'schools.client.';
const metadataPath = 'public/data/schools.metadata.json';

// The map parses the whole dataset before it draws a marker. As one 9MB file
// that was a single ~40ms parse, which Lighthouse's 4x CPU slowdown scored as
// a ~170ms long task. Separate files parse as separate tasks, each well under
// the 50ms line; the app concatenates them in this order.
const PART_COUNT = 6;

const schools = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const slim = schools.map(toMapSchool);

// A rebuild with fewer parts must not leave an old one behind to be served.
for (const name of fs.readdirSync(outputDir)) {
  if (name.startsWith(partPrefix) && name.endsWith('.json')) fs.unlinkSync(path.join(outputDir, name));
}

const hash = crypto.createHash('sha256');
const parts = [];
let bytes = 0;
const perPart = Math.ceil(slim.length / PART_COUNT);
for (let i = 0; i < PART_COUNT; i++) {
  const output = JSON.stringify(slim.slice(i * perPart, (i + 1) * perPart));
  const name = `${partPrefix}${i}.json`;
  fs.writeFileSync(path.join(outputDir, name), output);
  hash.update(output);
  bytes += Buffer.byteLength(output);
  parts.push(`/data/${name}`);
}

// The app cache-busts on this hash as well as on generated_at: changing the
// allowlist alone leaves canonical untouched, and returning visitors would
// otherwise keep a cached copy missing the newly needed field.
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
metadata.client_dataset = {
  parts,
  schools: slim.length,
  bytes,
  sha256: hash.digest('hex').slice(0, 12),
};
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

const before = fs.statSync(canonicalPath).size;
console.log(
  `Wrote ${parts.length} parts to ${outputDir}/${partPrefix}*.json: ${slim.length} schools,`
  + ` ${(bytes / 1e6).toFixed(1)}MB (canonical ${(before / 1e6).toFixed(1)}MB)`,
);
