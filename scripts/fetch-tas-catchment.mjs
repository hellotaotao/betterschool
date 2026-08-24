// Download and extract the official statewide LISTdata intake-area archive.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ARCHIVE_NAME,
  DATA_YEAR,
  DATASET_URL,
  LICENCE,
  METADATA_URL,
  PROCESSED_DIR,
  RAW_DIR,
  SHAPEFILE_BASE,
  ZIP_URL,
  ensureDir,
  writeJson,
} from './tas-catchment-common.mjs';

async function main() {
  ensureDir(RAW_DIR);
  const archivePath = path.join(RAW_DIR, ARCHIVE_NAME);
  const response = await fetch(ZIP_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${ZIP_URL} -> HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archivePath, buffer);
  execFileSync('unzip', ['-o', '-q', archivePath, '-d', RAW_DIR], { stdio: 'pipe' });

  const required = ['shp', 'dbf', 'prj', 'shx', 'xml']
    .map((extension) => path.join(RAW_DIR, `${SHAPEFILE_BASE}.${extension === 'xml' ? 'shp.xml' : extension}`));
  required.push(path.join(RAW_DIR, 'readme.txt'));
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Archive is missing expected members:\n  ${missing.join('\n  ')}`);
  }

  const readme = fs.readFileSync(path.join(RAW_DIR, 'readme.txt'), 'latin1');
  if (!readme.includes(LICENCE)) {
    throw new Error(`Archive README no longer states ${LICENCE}; review the source licence before publishing`);
  }

  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    current_data_year: DATA_YEAR,
    dataset_page: DATASET_URL,
    metadata_page: METADATA_URL,
    download: {
      url: ZIP_URL,
      bytes: buffer.length,
      etag: response.headers.get('etag') ?? null,
      last_modified: response.headers.get('last-modified') ?? null,
    },
  });

  console.log(`Raw TAS intake areas in ${RAW_DIR}: ${(buffer.length / 1e6).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
