// Download the SA zone shapefiles and the government education sites layer.
//
// Kept separate from parsing so that an upstream URL change fails loudly here,
// rather than surfacing later as mysteriously empty parse output. Raw downloads
// are gitignored; only processed artefacts are committed.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PRIMARY_ZIP_URL,
  HIGH_ZIP_URL,
  SITES_ZIP_URL,
  PRIMARY_DATASET_URL,
  HIGH_DATASET_URL,
  SITES_DATASET_URL,
  DATA_YEAR,
  LAYERS,
  SITES_GEOJSON,
  RAW_DIR,
  PROCESSED_DIR,
  ensureDir,
  writeJson,
} from './sa-catchment-common.mjs';

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
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

  const downloads = {};

  for (const [label, url, dir] of [
    ['primary_zones', PRIMARY_ZIP_URL, 'primary'],
    ['high_zones', HIGH_ZIP_URL, 'high'],
    ['education_sites', SITES_ZIP_URL, 'sites'],
  ]) {
    const zipPath = path.join(RAW_DIR, `${label}.zip`);
    console.log(`Downloading ${label} …`);
    downloads[label] = await download(url, zipPath);
    console.log(`  ${(downloads[label].bytes / 1e3).toFixed(0)} KB`);
    unzip(zipPath, path.join(RAW_DIR, dir));
  }

  // Fail here, not three scripts later, if the archives did not hold what the
  // pinned resource ids promised.
  const missing = [];
  for (const { dir, base } of LAYERS) {
    for (const ext of ['shp', 'dbf']) {
      const file = path.join(RAW_DIR, dir, `${base}.${ext}`);
      if (!fs.existsSync(file)) missing.push(file);
    }
  }
  const sitesFile = path.join(RAW_DIR, 'sites', SITES_GEOJSON);
  if (!fs.existsSync(sitesFile)) missing.push(sitesFile);

  if (missing.length > 0) {
    throw new Error(
      `Extracted archives are missing expected members:\n  ${missing.join('\n  ')}\n`
      + 'The pinned resource ids in sa-catchment-common.mjs may point at a different enrolment year.',
    );
  }

  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    current_enrolment_year: DATA_YEAR,
    dataset_pages: {
      primary_zones: PRIMARY_DATASET_URL,
      high_zones: HIGH_DATASET_URL,
      education_sites: SITES_DATASET_URL,
    },
    downloads,
  });

  console.log(`Raw data in ${RAW_DIR} (enrolment year ${DATA_YEAR})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
