// Check the fees ledger: valid statuses, plausible figures, and every figure
// present in the text it was read from. Raw text is not in git, so a machine
// without it checks the structure only and says how many figures it could not
// trace.

import fs from 'node:fs';
import path from 'node:path';
import {
  BILLING_UNITS, COMPONENT_PERIODS, PRICING_MODELS, RAW_DIR, SIBLING_BASES, STATUSES, loadLedger, loadSchools, readRawPages,
} from './fees-common.mjs';

const SOURCES = new Set(['school_website', 'scs_endpoint', 'diocese_schedule']);
const DOLLAR_AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;
const errors = [];
const fail = (id, message) => errors.push(`${id}: ${message}`);

const schools = new Map(loadSchools().map(school => [String(school.acara_sml_id), school]));
const ledger = loadLedger();
let traced = 0;
let untraceable = 0;
let rechecked = 0;
let freeTraced = 0;
let describedCount = 0;

function sourceDigits(id) {
  const scs = path.join(RAW_DIR, '_scs', `${id}.json`);
  const parts = readRawPages(id).map(page => page.text);
  const cspd = path.join(RAW_DIR, '_cspd', `${id}.txt`);
  if (fs.existsSync(cspd)) parts.push(fs.readFileSync(cspd, 'utf8'));
  if (fs.existsSync(scs)) {
    // Endpoint figures are bare numbers across all four child tiers (including $0 for 4th child);
    // give them the same "$" form as page text.
    const data = JSON.parse(fs.readFileSync(scs, 'utf8')).data;
    parts.push(
      (data.fees ?? [])
        .flatMap(row => [row.firstChild, row.secondChild, row.thirdChild, row.fourthChild])
        .filter(value => Number.isFinite(value))
        .map(value => `$${value}`)
        .join(' '),
    );
  }
  if (parts.length === 0) return null;
  const text = parts.join(' ');
  // Digits and "$" only, so "$4|2,730" from a split PDF line still matches 42730.
  return { digits: text.replace(/[^0-9$]/g, ''), text };
}

// Some schedules print "$" once in the column header and bare "40,600" in the
// cells, so a bare figure counts when it appears whole, with its thousands comma.
function inSource(source, value) {
  // A few schedules print cents ("5831.50"); match the figure as printed.
  if (!Number.isInteger(value)) return new RegExp(`(^|[^0-9,.])\\$?\\s?${value.toFixed(2).replace('.', '\\.')}(?![0-9])`).test(source.text.replace(/(\d),(\d{3})/g, '$1$2'));
  if (source.digits.includes(`$${value}`) || source.digits.includes(`$${value}00`)) return true;
  const formatted = value.toLocaleString('en-AU');
  if (new RegExp(`(^|[^0-9,.])${formatted.replace(/,/g, ',\\s?')}(?![0-9])`).test(source.text)) return true;
  // Some tables print four-figure amounts with no comma at all ("8193 1150 267 9610").
  return new RegExp(`(^|[^0-9,.$])${value}(?![0-9,])`).test(source.text);
}

for (const [id, entry] of Object.entries(ledger.schools)) {
  if (!schools.has(id)) fail(id, 'not an ACARA school');
  if (!STATUSES[entry.status]) fail(id, `unknown status ${entry.status}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked ?? '')) fail(id, 'missing checked date');
  if (entry.status === 'campus') {
    const parent = String(entry.parent_acara_sml_id);
    if (!schools.has(parent) || parent === id) fail(id, `campus with parent ${entry.parent_acara_sml_id}`);
    else if (schools.get(id)?.rolled_school_id != null && String(schools.get(id).rolled_school_id) !== parent) {
      fail(id, `campus parent ${parent} is not ACARA's rolled_school_id`);
    }
  }
  if (entry.website_source === 'lookup' && !entry.website_note) fail(id, 'looked-up website without website_note');
  // Past years keep their figures and links only; the documents are not kept,
  // so they are checked for shape, not traced to source text.
  for (const past of entry.fees_history ?? []) {
    if (past.fee_year === null ? !past.year_note : !Number.isInteger(past.fee_year)) fail(id, `history fee_year ${past.fee_year}`);
    if (!Array.isArray(past.by_year) || past.by_year.length === 0) fail(id, 'history entry without by_year');
    if (!past.source_url) fail(id, 'history entry without source_url');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(past.superseded ?? '')) fail(id, 'history entry without superseded date');
  }
  if (entry.status === 'fee_free') {
    const free = entry.free ?? {};
    if (!free.statement || !free.source_url) fail(id, 'fee_free without statement and source_url');
    else {
      const source = sourceDigits(id);
      const squash = text => text.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').toLowerCase();
      if (source === null) untraceable += 1;
      else if (squash(source.text).includes(squash(free.statement))) freeTraced += 1;
      else fail(id, 'fee_free statement not in the source text');
    }
  }
  if (entry.status === 'described') {
    describedCount += 1;
    const desc = entry.fees_description;
    if (!desc || typeof desc !== 'object') {
      fail(id, 'described without fees_description');
    } else {
      if (desc.fee_year === null) {
        if (!desc.year_note) fail(id, 'fees_description fee_year null without year_note');
      } else if (!Number.isInteger(desc.fee_year) || desc.fee_year < 2025 || desc.fee_year > 2028) {
        fail(id, `fees_description fee_year ${desc.fee_year}`);
      }
      if (!PRICING_MODELS.has(desc.pricing_model)) fail(id, `fees_description pricing_model ${desc.pricing_model}`);
      if (typeof desc.summary !== 'string' || desc.summary.trim().length < 20) fail(id, 'fees_description summary must be at least 20 chars');
      if (!SOURCES.has(desc.source)) fail(id, `fees_description source ${desc.source}`);
      if (!desc.source_url) fail(id, 'fees_description without source_url');
      if (desc.ocr_unconfirmed && !desc.read_via) fail(id, 'fees_description ocr_unconfirmed without read_via');
      const source = sourceDigits(id);
      const recheckedByEye = new Set(desc.read_via ? desc.ocr_unconfirmed ?? [] : []);
      for (const match of (desc.summary ?? '').matchAll(DOLLAR_AMOUNT)) {
        const raw = `${match[1].replace(/,/g, '')}${match[2] ? `.${match[2]}` : ''}`;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 100000) fail(id, `implausible described amount ${value}`);
        else if (source === null) untraceable += 1;
        else if (inSource(source, value)) traced += 1;
        else if (recheckedByEye.has(value)) rechecked += 1;
        else fail(id, `described amount ${value} not in the source text`);
      }
    }
  }
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
  if (fees.billing_unit != null && !BILLING_UNITS.has(fees.billing_unit)) fail(id, `billing_unit ${fees.billing_unit}`);
  if (!SOURCES.has(fees.source)) fail(id, `source ${fees.source}`);
  if (!fees.source_url) fail(id, 'no source_url');
  if (fees.discount != null && (typeof fees.discount !== 'string' || fees.discount.length < 20)) fail(id, 'discount must be a sentence');
  for (const field of ['sibling', 'concession', 'boarding', 'notes']) {
    if (fees[field] != null && (typeof fees[field] !== 'string' || fees[field].trim().length === 0)) {
      fail(id, `${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(fees.by_year) || fees.by_year.length === 0) fail(id, 'found without by_year');
  const hasChildCols = (fees.by_year ?? []).some(row => row.child_2 != null || row.child_3 != null || row.child_4 != null);
  if (hasChildCols && !SIBLING_BASES.has(fees.sibling_amounts_basis)) fail(id, 'child_2/3/4 rows require sibling_amounts_basis');
  if (!hasChildCols && fees.sibling_amounts_basis != null) fail(id, 'sibling_amounts_basis without child_2/3/4 rows');
  for (const row of fees.by_year ?? []) {
    if (!row.years) fail(id, 'row without years');
    if (row.tuition == null && row.total == null && row.per_term == null) fail(id, `row ${row.years} has no figure`);
    if (row.per_term != null && !Number.isInteger(row.terms)) fail(id, `row ${row.years} per_term without terms`);
  }
  if (fees.components != null) {
    if (!Array.isArray(fees.components) || fees.components.length === 0) fail(id, 'components must be a non-empty array');
    else {
      for (const comp of fees.components) {
        if (!comp || typeof comp.name !== 'string' || comp.name.trim().length === 0) fail(id, 'component without name');
        if (!BILLING_UNITS.has(comp?.unit)) fail(id, `component ${comp?.name ?? '?'} invalid unit ${comp?.unit}`);
        if (comp?.period != null && !COMPONENT_PERIODS.has(comp.period)) fail(id, `component ${comp?.name ?? '?'} invalid period ${comp.period}`);
        if (comp?.period === 'per_term' && comp?.terms != null && (!Number.isInteger(comp.terms) || comp.terms < 1)) {
          fail(id, `component ${comp?.name ?? '?'} invalid terms ${comp.terms}`);
        }
        if (comp?.note != null && (typeof comp.note !== 'string' || comp.note.trim().length === 0)) {
          fail(id, `component ${comp?.name ?? '?'} note must be a non-empty string`);
        }
        const hasFlat = comp?.amount != null;
        const hasByYear = Array.isArray(comp?.by_year) && comp.by_year.length > 0;
        if (!hasFlat && !hasByYear) fail(id, `component ${comp?.name ?? '?'} needs amount or by_year`);
        if (hasByYear) {
          for (const item of comp.by_year) {
            if (!item || typeof item.years !== 'string' || item.years.trim().length === 0 || item.amount == null) {
              fail(id, `component ${comp?.name ?? '?'} has malformed by_year row`);
            }
          }
        }
      }
    }
  }
  if (fees.one_off != null) {
    if (!Array.isArray(fees.one_off)) fail(id, 'one_off must be an array');
    else {
      for (const item of fees.one_off) {
        if (!item || typeof item.item !== 'string' || item.item.trim().length === 0 || item.aud == null) {
          fail(id, 'one_off item needs item name and aud');
        }
      }
    }
  }
  const source = sourceDigits(id);
  const amounts = [
    // A school that publishes only a per-term figure and states the number of
    // terms keeps both as published; the annual sum is the reader's arithmetic.
    ...(fees.by_year ?? []).flatMap(row => [row.tuition, row.total, row.per_term]),
    ...(fees.components ?? []).flatMap(comp => [
      comp?.amount,
      ...(Array.isArray(comp?.by_year) ? comp.by_year.map(item => item?.amount) : []),
    ]),
    ...(fees.one_off ?? []).map(item => item?.aud),
  ].filter(value => value != null);
  const childAmounts = (fees.by_year ?? [])
    .flatMap(row => [row.child_2, row.child_3, row.child_4])
    .filter(value => value != null);
  // An image-only schedule is read by the model and checked against local OCR.
  // OCR misreads small or low-contrast scans, so an amount it cannot confirm
  // passes only when the reading lists it as re-checked against the image.
  const recheckedByEye = new Set(fees.read_via ? fees.ocr_unconfirmed ?? [] : []);
  if (fees.ocr_unconfirmed && !fees.read_via) fail(id, 'ocr_unconfirmed without read_via');
  for (const value of amounts) {
    if (!Number.isFinite(value) || value <= 0 || value > 100000) fail(id, `implausible amount ${value}`);
    else if (source === null) untraceable += 1;
    else if (inSource(source, value)) traced += 1;
    else if (recheckedByEye.has(value)) rechecked += 1;
    else fail(id, `amount ${value} not in the source text`);
  }
  for (const value of childAmounts) {
    // 4th+ child tuition/total can genuinely be $0 (e.g. SCS 53221).
    if (!Number.isFinite(value) || value < 0 || value > 100000) fail(id, `implausible child amount ${value}`);
    else if (source === null) untraceable += 1;
    else if (inSource(source, value)) traced += 1;
    else if (recheckedByEye.has(value)) rechecked += 1;
    else fail(id, `child amount ${value} not in the source text`);
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
console.log(`amounts traced to source text: ${traced}; re-checked by eye where OCR failed: ${rechecked}; fee-free statements traced: ${freeTraced}; described records: ${describedCount}; without raw text to check: ${untraceable}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problems:\n${errors.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('fees ledger OK');
