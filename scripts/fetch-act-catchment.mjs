// Fetch the pinned ACT ArcGIS item metadata and its full 2027 PEA GeoJSON.

import fs from 'node:fs';
import path from 'node:path';
import {
  DATASET_URL,
  DATA_YEAR,
  EXPECTED_SOURCE_FEATURES,
  ITEM_API_URL,
  ITEM_ID,
  LICENCE,
  PROCESSED_DIR,
  QUERY_URL,
  RAW_DIR,
  RAW_GEOJSON,
  RAW_ITEM,
  ensureDir,
  writeJson,
} from './act-catchment-common.mjs';

async function fetchJson(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${url} -> HTTP ${response.status}`);
  return { response, payload: await response.json() };
}

async function main() {
  ensureDir(RAW_DIR);
  const itemResult = await fetchJson(ITEM_API_URL);
  const item = itemResult.payload;
  if (item.id !== ITEM_ID || item.title !== 'ACTGOV Priority Enrolment Areas 2026') {
    throw new Error(`Pinned ACT ArcGIS item identity changed: ${item.id} / ${item.title}`);
  }
  if (!String(item.snippet).includes(`enrolment in ${DATA_YEAR}`)
    || !String(item.licenseInfo).includes('creativecommons.org/licenses/by/4.0')) {
    throw new Error('ACT item no longer states the 2027 enrolment year and CC BY 4.0 licence');
  }

  const query = new URL(QUERY_URL);
  query.searchParams.set('where', '1=1');
  query.searchParams.set('outFields', '*');
  query.searchParams.set('returnGeometry', 'true');
  query.searchParams.set('outSR', '4326');
  query.searchParams.set('f', 'geojson');
  const geoResult = await fetchJson(query.toString());
  const collection = geoResult.payload;
  if (collection.type !== 'FeatureCollection' || collection.features?.length !== EXPECTED_SOURCE_FEATURES) {
    throw new Error(
      `ACT query returned ${collection.features?.length ?? 0} features, expected ${EXPECTED_SOURCE_FEATURES}`,
    );
  }

  writeJson(path.join(RAW_DIR, RAW_ITEM), item);
  writeJson(path.join(RAW_DIR, RAW_GEOJSON), collection, { pretty: false });
  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    data_year: DATA_YEAR,
    dataset_page: DATASET_URL,
    item: {
      url: ITEM_API_URL,
      id: item.id,
      title: item.title,
      modified: item.modified,
      licence: LICENCE,
    },
    download: {
      url: query.toString(),
      bytes: fs.statSync(path.join(RAW_DIR, RAW_GEOJSON)).size,
      etag: geoResult.response.headers.get('etag') ?? null,
      last_modified: geoResult.response.headers.get('last-modified') ?? null,
    },
  });
  console.log(`Raw ACT ${DATA_YEAR} PEAs: ${collection.features.length} features`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
