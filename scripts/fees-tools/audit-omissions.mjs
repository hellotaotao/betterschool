// Audit `found` entries in the fees ledger for likely source-omission or
// classification gaps against cached raw pages.
//
//   npm run fees:audit -- [--state NSW] [--category levies] [--ids 45749] [--limit 20]

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, loadLedger, loadSchools, readRawPages } from '../fees-common.mjs';

const CATEGORIES = ['levies', 'sibling', 'billing_unit', 'tuition_total', 'concession', 'boarding'];

const LEVY_MENTION = /(?:building|capital|resource|student|technology|ict|curriculum|composite)\s+(?:levy|fee)/i;
const SIBLING_MENTION = /2nd child|second child|sibling discount|family discount|2 children|two children/i;
const PER_FAMILY_BASIS = /charged per family, not per child|annual diocesan tuition, charged per family|annual family fee|ceo tuition \(per family\)/i;
const INCLUSIVE_BASIS = /\b(?:all[- ]inclusive|published total|includes\b[^;]*(?:levy|levies|charges|fees))\b/i;
const CONCESSION_MENTION = /concession(?:al)?\s+fee|health care card|csef/i;
const BOARDING_MENTION = /boarding\s+fee|boarder/i;
const BOARDING_DOLLAR = /boarding[^|\n]{0,80}\$\s?\d|\$\s?[\d,]+[^|\n]{0,40}board/i;

function parseArgs() {
  const out = { state: null, category: 'all', ids: null, limit: 20 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--state') out.state = argv[++i].toUpperCase();
    else if (argv[i] === '--category') out.category = argv[++i];
    else if (argv[i] === '--ids') out.ids = new Set(argv[++i].split(',').map(Number));
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]);
  }
  if (out.category !== 'all' && !CATEGORIES.includes(out.category)) {
    throw new Error(`Unknown category ${out.category}; expected all or ${CATEGORIES.join(', ')}`);
  }
  return out;
}

function loadRawTexts(id) {
  const pages = readRawPages(id).map(page => page.text);
  const cspd = path.join(RAW_DIR, '_cspd', `${id}.txt`);
  if (fs.existsSync(cspd)) pages.push(fs.readFileSync(cspd, 'utf8'));
  const scs = path.join(RAW_DIR, '_scs', `${id}.json`);
  if (fs.existsSync(scs)) pages.push(fs.readFileSync(scs, 'utf8'));
  return pages;
}

function main() {
  const options = parseArgs();
  const schoolById = new Map(loadSchools().map(school => [String(school.acara_sml_id), school]));
  const ledger = loadLedger().schools;

  const overall = Object.fromEntries(CATEGORIES.map(category => [category, []]));
  const filtered = Object.fromEntries(CATEGORIES.map(category => [category, []]));
  let totalFound = 0;
  let stateFound = 0;

  for (const [id, entry] of Object.entries(ledger)) {
    if (entry.status !== 'found' || !entry.fees) continue;
    const school = schoolById.get(id);
    const state = school?.state ?? '?';
    totalFound += 1;
    const matchesFilter = (!options.state || state === options.state)
      && (!options.ids || options.ids.has(Number(id)));
    if (matchesFilter) stateFound += 1;

    const fees = entry.fees;
    const pages = loadRawTexts(id);
    const rawCombined = pages.join('\n');
    const name = entry.school_name ?? school?.school_name ?? id;

    const pushHit = (category, reason) => {
      const item = { id, name, state, reason };
      overall[category].push(item);
      if (matchesFilter) filtered[category].push(item);
    };

    const hasTotal = (fees.by_year ?? []).some(row => row.total != null);
    const allTotal = (fees.by_year ?? []).every(row => row.total != null);
    const hasChild2 = (fees.by_year ?? []).some(row => row.child_2 != null);

    // 1. levies
    if (!fees.components?.length && !fees.other_compulsory && !hasTotal) {
      const levyPage = pages.find(text => LEVY_MENTION.test(text) && /\$\s?\d/.test(text));
      if (levyPage) {
        const match = levyPage.match(LEVY_MENTION);
        pushHit('levies', `raw mentions "${match?.[0]}" with $ figures, but no components, other_compulsory, or total`);
      }
    }

    // 2. sibling
    if (!fees.sibling && !hasChild2 && !/sibling|2nd|second|multi|family fee|per family/i.test(fees.basis ?? '')) {
      const match = rawCombined.match(SIBLING_MENTION);
      if (match) pushHit('sibling', `raw mentions "${match[0]}", but no sibling note or child_2..4 columns`);
    }

    // 3. billing_unit
    if (PER_FAMILY_BASIS.test(fees.basis ?? '') && fees.billing_unit !== 'per_family') {
      pushHit('billing_unit', `basis states per-family tuition ("${fees.basis.slice(0, 80)}"), but billing_unit is ${fees.billing_unit ?? 'unset'}`);
    }

    // 4. tuition_total
    if ((!hasTotal && INCLUSIVE_BASIS.test(fees.basis ?? '')) || (hasTotal && !allTotal)) {
      pushHit(
        'tuition_total',
        hasTotal
          ? 'by_year mixes rows with total and rows without total'
          : `stored in tuition without total while basis says "${fees.basis.slice(0, 80)}"`,
      );
    }

    // 5. concession
    if (!fees.concession) {
      const match = rawCombined.match(CONCESSION_MENTION);
      if (match) pushHit('concession', `raw mentions "${match[0]}", but fees.concession is absent`);
    }

    // 6. boarding
    const basisAndOther = `${fees.basis ?? ''} ${fees.other_compulsory ?? ''}`;
    if (!fees.boarding && !/board/i.test(basisAndOther)) {
      const match = rawCombined.match(BOARDING_MENTION);
      if (match && BOARDING_DOLLAR.test(rawCombined)) {
        pushHit('boarding', `raw mentions "${match[0]}" with $ figures, but fees.boarding is absent`);
      }
    }
  }

  console.log(`Audited ${totalFound} found schools (${options.state ? `${options.state}: ${stateFound}` : 'all states'})`);
  for (const category of CATEGORIES) {
    const line = options.state
      ? `  ${category.padEnd(14)} ${String(filtered[category].length).padStart(4)} in ${options.state} (${overall[category].length} overall)`
      : `  ${category.padEnd(14)} ${String(overall[category].length).padStart(4)}`;
    console.log(line);
  }

  const targetCategories = options.category === 'all' ? CATEGORIES : [options.category];
  for (const category of targetCategories) {
    const items = filtered[category];
    if (items.length === 0) continue;
    console.log(`\n[${category}] showing ${Math.min(options.limit, items.length)} of ${items.length}:`);
    for (const item of items.slice(0, options.limit)) {
      console.log(`  ${item.id} ${item.name} (${item.state}) — ${item.reason}`);
    }
  }
}

main();
