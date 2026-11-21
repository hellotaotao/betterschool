// Fees for Sydney Catholic Schools (the Archdiocese of Sydney system).
//
// Every school site on <code>.syd.catholic.edu.au renders its fee table from
// one plugin endpoint, keyed by the subdomain. The endpoint returns the
// first-to-fourth-child annual totals per year level; the school's own fee page
// states which year they are for, and a school whose page does not say is left
// unread rather than given a guessed year.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, applyReading, fetchPage, flatten, htmlToText, loadLedger, loadSchools, saveLedger, today } from './fees-common.mjs';

const SCS_HOST = /^https?:\/\/(?:www\.)?([a-z0-9-]+)\.syd\.catholic\.edu\.au/i;
const FEE_PAGE = 'enrolment/school-fees-and-assistance';
const SIBLING = '2nd child 10% off tuition, 3rd 35%, 4th 100%; building levy charged once per family (Sydney Catholic Schools)';

export function parseScsEntry(result) {
  const rows = result?.data?.fees ?? [];
  if (rows.length === 0 || !result.year || !result.feePage) return null;
  return {
    fee_year: result.year,
    billing_unit: 'per_student',
    basis: 'first child, annual, Sydney Catholic Schools total including building levy',
    by_year: rows.map(row => ({
      years: row.scholasticYear.replace(/^Year /, ''),
      total: row.firstChild,
      ...(Number.isFinite(row.secondChild) ? { child_2: row.secondChild } : {}),
      ...(Number.isFinite(row.thirdChild) ? { child_3: row.thirdChild } : {}),
      ...(Number.isFinite(row.fourthChild) ? { child_4: row.fourthChild } : {}),
    })),
    sibling_amounts_basis: 'per_child',
    sibling: SIBLING,
    source: 'scs_endpoint',
    source_url: result.feePage,
  };
}

async function readSchool(code) {
  const origin = `https://${code}.syd.catholic.edu.au`;
  const endpoint = `${origin}/wp-content/plugins/scs-school-fees/json.show-one.php?schoolCode=${code}`;
  const data = JSON.parse((await fetchPage(endpoint)).body.toString('utf8'));
  const page = await fetchPage(`${origin}/${FEE_PAGE}`);
  const text = page.status < 400 ? flatten(htmlToText(page.body)) : '';
  const year = text.match(/school fees for (\d{4})/i)?.[1];
  return { endpoint, data, feePage: page.status < 400 ? page.url : null, year: year ? Number(year) : null };
}

function applyParsed(ledger, school, fees, checked) {
  const id = school.acara_sml_id;
  ledger.schools[id] = applyReading(ledger.schools[id] ?? {}, {
    school_name: school.school_name,
    website: school.school_url,
    status: 'found',
    checked,
    fees,
  });
}

async function main() {
  const fromCache = process.argv.includes('--from-cache');
  const ledger = loadLedger();
  const dir = path.join(RAW_DIR, '_scs');
  const tally = {};

  if (fromCache) {
    if (!fs.existsSync(dir)) throw new Error(`No cached SCS directory at ${dir}`);
    const byId = new Map(loadSchools().map(school => [String(school.acara_sml_id), school]));
    const files = fs.readdirSync(dir)
      .filter(file => /^\d+\.json$/.test(file))
      .sort((a, b) => Number(a.replace('.json', '')) - Number(b.replace('.json', '')));
    for (const file of files) {
      const id = file.replace('.json', '');
      const school = byId.get(id);
      if (!school) continue;
      const result = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const fees = parseScsEntry(result);
      const rows = result?.data?.fees ?? [];
      const outcome = fees ? 'found' : rows.length === 0 ? 'not_found' : 'not_extracted';
      if (fees) applyParsed(ledger, school, fees, ledger.schools[id]?.checked ?? today());
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    }
    saveLedger(ledger);
    console.log(`${files.length} cached Sydney Catholic schools:`, tally);
    return;
  }

  const schools = loadSchools().filter(school => SCS_HOST.test(school.school_url ?? ''));
  fs.mkdirSync(dir, { recursive: true });
  for (const school of schools) {
    const code = school.school_url.match(SCS_HOST)[1].toLowerCase();
    const id = school.acara_sml_id;
    let outcome;
    try {
      const result = await readSchool(code);
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(result, null, 1));
      const rows = result.data.fees ?? [];
      const fees = parseScsEntry(result);
      if (rows.length === 0) outcome = 'not_found';
      else if (!fees) outcome = 'not_extracted';
      else {
        outcome = 'found';
        // A new fee year moves last year's figures and link into fees_history.
        applyParsed(ledger, school, fees, today());
      }
    } catch (error) {
      outcome = 'unreachable';
      console.log(`  ${id} ${school.school_name}: ${error.message}`);
    }
    if (outcome !== 'found' && ledger.schools[id]?.status !== 'found') {
      ledger.schools[id] = { ...ledger.schools[id], school_name: school.school_name, website: school.school_url, status: outcome, checked: today() };
    }
    tally[outcome] = (tally[outcome] ?? 0) + 1;
  }
  saveLedger(ledger);
  console.log(`${schools.length} Sydney Catholic schools:`, tally);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
