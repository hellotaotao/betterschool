// Download the pinned Queensland school site and catchment KML resources.

import fs from 'node:fs';
import path from 'node:path';
import {
  CATCHMENT_DATASET_URL,
  DATASET_ID,
  DATA_YEAR,
  LAYERS,
  RAW_DIR,
  PROCESSED_DIR,
  ensureDir,
  writeJson,
} from './qld-catchment-common.mjs';

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${url} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return {
    url,
    bytes: buffer.length,
    etag: response.headers.get('etag') ?? null,
    last_modified: response.headers.get('last-modified') ?? null,
  };
}

async function main() {
  ensureDir(RAW_DIR);
  const downloads = {};

  for (const layer of LAYERS) {
    console.log(`Downloading Queensland ${layer.key} sites ...`);
    const sites = await download(layer.sites_url, path.join(RAW_DIR, layer.sites_file));
    console.log(`  ${(sites.bytes / 1e6).toFixed(2)} MB`);

    console.log(`Downloading Queensland ${layer.key} catchments ...`);
    const catchments = await download(layer.catchments_url, path.join(RAW_DIR, layer.catchments_file));
    console.log(`  ${(catchments.bytes / 1e6).toFixed(2)} MB`);

    downloads[layer.key] = { sites, catchments };
  }

  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    data_year: DATA_YEAR,
    dataset_page: CATCHMENT_DATASET_URL,
    dataset_id: DATASET_ID,
    resource_ids: Object.fromEntries(LAYERS.map((layer) => [layer.key, {
      sites: layer.sites_resource_id,
      catchments: layer.catchments_resource_id,
    }])),
    downloads,
  });
  console.log(`Raw data in ${RAW_DIR} (${DATA_YEAR})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
