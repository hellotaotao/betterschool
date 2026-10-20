// Download the pinned VCAA SSCAI workbooks, one per results year.

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson } from './catchment-common.mjs';
import { PROCESSED_DIR, RAW_DIR, SOURCE_PAGE_URL, SSCAI_FILES } from './vcaa-common.mjs';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${url} → HTTP ${response.status}`);
  // A moved file comes back as an HTML error page with status 200.
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith(XLSX_TYPE)) throw new Error(`Not a workbook: ${url} → ${type}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return { url, bytes: buffer.length, last_modified: response.headers.get('last-modified') ?? null };
}

async function main() {
  ensureDir(RAW_DIR);
  const files = {};
  for (const [year, url] of Object.entries(SSCAI_FILES)) {
    const destination = path.join(RAW_DIR, `${year}-sscai.xlsx`);
    files[year] = await download(url, destination);
    console.log(`${year}: ${(files[year].bytes / 1e3).toFixed(0)} KB`);
  }
  writeJson(path.join(PROCESSED_DIR, 'fetch-manifest.json'), {
    fetched_at: new Date().toISOString(),
    source_page: SOURCE_PAGE_URL,
    files,
  });
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
