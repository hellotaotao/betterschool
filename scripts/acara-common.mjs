import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

export const ACARA_SOURCE_URL = 'https://www.acara.edu.au/contact-us/acara-data-access';
export const ACARA_DATA_YEAR = 2025;
export const RAW_DIR = 'data/acara/raw';
export const PROCESSED_DIR = 'data/acara/processed';

export function ensureProcessedDir() {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

export function readWorksheetRows(fileName, preferredSheetName) {
  const filePath = path.join(RAW_DIR, fileName);
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = preferredSheetName ?? workbook.SheetNames.find((name) => name !== 'DataDictionary');
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error(`Could not find worksheet ${preferredSheetName ?? '<data sheet>'} in ${fileName}`);
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  if (rows.length < 2) throw new Error(`No data rows found in ${fileName}:${sheetName}`);
  const headers = rows[0].map((header) => String(header ?? '').trim());
  return rows.slice(1)
    .filter((row) => row.some((value) => value !== null && value !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

export function writeJson(fileName, payload) {
  ensureProcessedDir();
  const outputPath = path.join(PROCESSED_DIR, fileName);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return outputPath;
}

export function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function toPostcode(value) {
  const text = toStringOrNull(value);
  if (!text) return null;
  return text.padStart(4, '0');
}

export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function toIntegerOrNull(value) {
  const number = toNumberOrNull(value);
  return number === null ? null : Math.trunc(number);
}

export function toBooleanOffered(value) {
  const number = toNumberOrNull(value);
  if (number === 1) return true;
  if (number === 0) return false;
  if (typeof value === 'boolean') return value;
  return null;
}

export function sourceMeta(sourceFile, generatedAt) {
  return {
    source_file: sourceFile,
    source_url: ACARA_SOURCE_URL,
    data_year: ACARA_DATA_YEAR,
    generated_at: generatedAt,
  };
}

export function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(st)\b/g, 'saint')
    .replace(/\b(ps)\b/g, 'primary school')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableCandidate(record) {
  return {
    acara_sml_id: record.acara_sml_id,
    location_age_id: record.location_age_id,
    school_age_id: record.school_age_id,
    school_name: record.school_name,
    suburb: record.suburb,
    state: record.state,
    postcode: record.postcode,
    sector: record.sector,
    school_type: record.school_type,
    campus_type: record.campus_type,
  };
}
