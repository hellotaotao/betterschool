// Download the NSW catchment shapefiles and the school master dataset.
//
// Kept separate from parsing so that an upstream URL change fails loudly here,
// rather than surfacing later as mysteriously empty parse output. Raw downloads
// are gitignored; only processed artefacts are committed.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CATCHMENT_ZIP_URL,
  CATCHMENT_DATASET_URL,
  MASTER_DATASET_URL,
  MASTER_DATASET_PAGE,
  RAW_DIR,
  PROCESSED_DIR,
  ensureDir,
  writeJson,
} from './nsw-catchment-common.mjs';

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${url} → HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);

  return {
    url,
    bytes: buffer.length,
    etag: response.headers.get('etag') ?? null,
    last_modified: response.headers.get('last-modified') ?? null,
  };
}

function unzip(zipPath, targetDir) {
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', targetDir], { stdio: 'pipe' });
  } catch (error) {
    throw new Error(
      `Could not extract ${zipPath}. This script needs the 'unzip' command on PATH. (${error.message})`,
    );
  }
}

async function main() {
  ensureDir(RAW_DIR);

  const zipPath = path.join(RAW_DIR, 'catchments.zip');
  const csvPath = path.join(RAW_DIR, 'master_dataset.csv');

  console.log(`Downloading catchment shapefiles …`);
  const zipMeta = await download(CATCHMENT_ZIP_URL, zipPath);
  console.log(`  ${(zipMeta.bytes / 1e6).toFixed(1)} MB`);

  console.log(`Downloading NSW school master dataset …`);
  const csvMeta = await download(MASTER_DATASET_URL, csvPath);
  console.log(`  ${(csvMeta.bytes / 1e6).toFixed(1)} MB`);

  unzip(zipPath, RAW_DIR);

  // Ships alongside the shapefiles and states which enrolment year the
  // boundaries apply to. Everything downstream stamps this onto each record so
  // stale boundaries are visible rather than silent.
  const infoPath = path.join(RAW_DIR, 'catchment_sf_info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  if (!Number.isFinite(info.current_enrolment_year)) {
    throw new Error('catchment_sf_info.json is missing current_enrolment_year — upstream format changed');
  }

  const manifestPath = writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    current_enrolment_year: info.current_enrolment_year,
    sources: {
      catchments: { ...zipMeta, dataset_page: CATCHMENT_DATASET_URL },
      master_dataset: { ...csvMeta, dataset_page: MASTER_DATASET_PAGE },
    },
  });

  console.log(`Enrolment year: ${info.current_enrolment_year}`);
  console.log(`Wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
