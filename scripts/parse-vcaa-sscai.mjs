// VCAA SSCAI workbooks → one processed JSON per results year.

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { writeJson } from './catchment-common.mjs';
import { NUMERIC_FIELDS, PROCESSED_DIR, RAW_DIR, YEARS, locateColumns, parseFlag, parseValue } from './vcaa-common.mjs';

function parseYear(year) {
  const file = path.join(RAW_DIR, `${year}-sscai.xlsx`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}; run npm run vcaa:fetch`);
  const workbook = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, blankrows: false, defval: null });
  const { headerRow, columns } = locateColumns(rows);

  const records = [];
  for (const row of rows.slice(headerRow + 1)) {
    const school = String(row[columns.school] ?? '').trim();
    if (!school) continue;
    const record = {
      school,
      locality: String(row[columns.locality] ?? '').trim(),
      small_school: parseFlag(row[columns.small_school]),
      adult_school: columns.adult_school === undefined ? null : parseFlag(row[columns.adult_school]),
    };
    const withheld = {};
    for (const field of NUMERIC_FIELDS) {
      const { value, reason } = parseValue(row[columns[field]]);
      record[field] = value;
      if (reason) withheld[field] = reason;
    }
    record.withheld = withheld;
    records.push(record);
  }
  return { year, columns, records };
}

for (const year of YEARS) {
  const parsed = parseYear(year);
  const medians = parsed.records.filter(record => record.median_study_score !== null).length;
  writeJson(path.join(PROCESSED_DIR, `sscai-${year}.json`), {
    source_file: `${year}-sscai.xlsx`,
    results_year: year,
    record_count: parsed.records.length,
    records: parsed.records,
  });
  console.log(`${year}: ${parsed.records.length} rows, ${medians} with a median study score`);
}
