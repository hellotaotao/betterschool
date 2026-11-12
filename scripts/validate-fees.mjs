// Check the fees ledger: valid statuses, plausible figures, and every figure
// present in the text it was read from. Raw text is not in git, so a machine
// without it checks the structure only and says how many figures it could not
// trace.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, STATUSES, loadLedger, loadSchools, readRawPages } from './fees-common.mjs';

const SOURCES = new Set(['school_website', 'scs_endpoint', 'diocese_schedule']);
const errors = [];
const fail = (id, message) => errors.push(`${id}: ${message}`);

const schools = new Map(loadSchools().map(school => [String(school.acara_sml_id), school]));
const ledger = loadLedger();
let traced = 0;
let untraceable = 0;

function sourceDigits(id) {
  const scs = path.join(RAW_DIR, '_scs', `${id}.json`);
  const parts = readRawPages(id).map(page => page.text);
  const cspd = path.join(RAW_DIR, '_cspd', `${id}.txt`);
  if (fs.existsSync(cspd)) parts.push(fs.readFileSync(cspd, 'utf8'));
  if (fs.existsSync(scs)) {
    // Endpoint figures are bare numbers; give them the same "$" form as page text.
    const data = JSON.parse(fs.readFileSync(scs, 'utf8')).data;
    parts.push((data.fees ?? []).map(row => `$${row.firstChild}`).join(' '));
  }
  if (parts.length === 0) return null;
  const text = parts.join(' ');
  // Digits and "$" only, so "$4|2,730" from a split PDF line still matches 42730.
  return { digits: text.replace(/[^0-9$]/g, ''), text };
}

// Some schedules print "$" once in the column header and bare "40,600" in the
// cells, so a bare figure counts when it appears whole, with its thousands comma.
function inSource(source, value) {
  if (source.digits.includes(`$${value}`) || source.digits.includes(`$${value}00`)) return true;
  const formatted = value.toLocaleString('en-AU');
  return new RegExp(`(^|[^0-9,.])${formatted.replace(/,/g, ',\\s?')}(?![0-9])`).test(source.text);
}

for (const [id, entry] of Object.entries(ledger.schools)) {
  if (!schools.has(id)) fail(id, 'not an ACARA school');
  if (!STATUSES[entry.status]) fail(id, `unknown status ${entry.status}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked ?? '')) fail(id, 'missing checked date');
  if (entry.status !== 'found') {
    if (entry.fees?.by_year) fail(id, `status ${entry.status} but carries figures`);
    continue;
  }
  const fees = entry.fees ?? {};
  // A page that shows current figures without naming the year gets a null year
  // and says so; the checked date is then the only dating there is.
  if (fees.fee_year === null) {
    if (!fees.year_note) fail(id, 'fee_year null without year_note');
  } else if (!Number.isInteger(fees.fee_year) || fees.fee_year < 2025 || fees.fee_year > 2028) fail(id, `fee_year ${fees.fee_year}`);
  if (!SOURCES.has(fees.source)) fail(id, `source ${fees.source}`);
  if (!fees.source_url) fail(id, 'no source_url');
  if (!Array.isArray(fees.by_year) || fees.by_year.length === 0) fail(id, 'found without by_year');
  const source = sourceDigits(id);
  const amounts = [
    // A school that publishes only a per-term figure and states the number of
    // terms keeps both as published; the annual sum is the reader's arithmetic.
    ...(fees.by_year ?? []).flatMap(row => [row.tuition, row.total, row.per_term]),
    ...(fees.one_off ?? []).map(item => item.aud),
  ].filter(value => value != null);
  for (const row of fees.by_year ?? []) {
    if (!row.years) fail(id, 'row without years');
    if (row.tuition == null && row.total == null && row.per_term == null) fail(id, `row ${row.years} has no figure`);
    if (row.per_term != null && !Number.isInteger(row.terms)) fail(id, `row ${row.years} per_term without terms`);
  }
  for (const value of amounts) {
    if (!Number.isFinite(value) || value <= 0 || value > 100000) fail(id, `implausible amount ${value}`);
    if (source === null) untraceable += 1;
    else if (inSource(source, value)) traced += 1;
    else fail(id, `amount ${value} not in the source text`);
  }
}

const bySector = {};
for (const [id, entry] of Object.entries(ledger.schools)) {
  const sector = schools.get(id)?.sector ?? '?';
  bySector[sector] ??= {};
  bySector[sector][entry.status] = (bySector[sector][entry.status] ?? 0) + 1;
}
console.log(`${Object.keys(ledger.schools).length} schools attempted`);
for (const [sector, counts] of Object.entries(bySector)) console.log(`  ${sector}:`, counts);
console.log(`amounts traced to source text: ${traced}; without raw text to check: ${untraceable}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problems:\n${errors.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('fees ledger OK');
