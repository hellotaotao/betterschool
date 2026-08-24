// Download the pinned Victorian school-zone archive and official school sites.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CATCHMENT_DATASET_URL,
  CATCHMENT_RESOURCE_ID,
  CATCHMENT_ZIP_URL,
  SITES_DATASET_URL,
  SITES_RESOURCE_ID,
  SITES_CSV_URL,
  DATA_YEAR,
  LAYERS,
  RAW_DIR,
  PROCESSED_DIR,
  SITES_CSV,
  ensureDir,
  writeJson,
} from './vic-catchment-common.mjs';

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${url} → HTTP ${response.status}`);
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
    throw new Error(`Could not extract ${zipPath}. The 'unzip' command is required. (${error.message})`);
  }
}

async function main() {
  ensureDir(RAW_DIR);
  const zonesDir = path.join(RAW_DIR, 'zones');
  ensureDir(zonesDir);

  const zipPath = path.join(RAW_DIR, 'school-zones-2027.zip');
  const sitesPath = path.join(RAW_DIR, SITES_CSV);
  console.log('Downloading Victorian 2027 school zones …');
  const zones = await download(CATCHMENT_ZIP_URL, zipPath);
  unzip(zipPath, zonesDir);
  console.log(`  ${(zones.bytes / 1e6).toFixed(2)} MB`);

  console.log('Downloading Victorian 2025 school locations …');
  const sites = await download(SITES_CSV_URL, sitesPath);
  console.log(`  ${(sites.bytes / 1e3).toFixed(0)} KB`);

  const missing = LAYERS
    .map((layer) => path.join(zonesDir, layer.file))
    .filter((file) => !fs.existsSync(file));
  if (!fs.existsSync(sitesPath)) missing.push(sitesPath);
  if (missing.length > 0) {
    throw new Error(
      `Downloaded resources are missing expected files:\n  ${missing.join('\n  ')}\n`
      + 'The pinned resource may have changed.',
    );
  }

  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    current_enrolment_year: DATA_YEAR,
    dataset_pages: {
      zones: CATCHMENT_DATASET_URL,
      school_locations: SITES_DATASET_URL,
    },
    resource_ids: {
      zones: CATCHMENT_RESOURCE_ID,
      school_locations: SITES_RESOURCE_ID,
    },
    downloads: { zones, school_locations: sites },
  });

  console.log(`Raw data in ${RAW_DIR} (enrolment year ${DATA_YEAR})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
