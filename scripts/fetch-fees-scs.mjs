// Fees for Sydney Catholic Schools (the Archdiocese of Sydney system).
//
// Every school site on <code>.syd.catholic.edu.au renders its fee table from
// one plugin endpoint, keyed by the subdomain. The endpoint returns the
// first-to-fourth-child annual totals per year level; the school's own fee page
// states which year they are for, and a school whose page does not say is left
// unread rather than given a guessed year.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, fetchPage, flatten, htmlToText, loadLedger, loadSchools, saveLedger, today } from './fees-common.mjs';

const SCS_HOST = /^https?:\/\/(?:www\.)?([a-z0-9-]+)\.syd\.catholic\.edu\.au/i;
const FEE_PAGE = 'enrolment/school-fees-and-assistance';
const SIBLING = '2nd child 10% off tuition, 3rd 35%, 4th 100% (Sydney Catholic Schools)';

async function readSchool(code) {
  const origin = `https://${code}.syd.catholic.edu.au`;
  const endpoint = `${origin}/wp-content/plugins/scs-school-fees/json.show-one.php?schoolCode=${code}`;
  const data = JSON.parse((await fetchPage(endpoint)).body.toString('utf8'));
  const page = await fetchPage(`${origin}/${FEE_PAGE}`);
  const text = page.status < 400 ? flatten(htmlToText(page.body)) : '';
  const year = text.match(/school fees for (\d{4})/i)?.[1];
  return { endpoint, data, feePage: page.status < 400 ? page.url : null, year: year ? Number(year) : null };
}

async function main() {
  const ledger = loadLedger();
  const schools = loadSchools().filter(school => SCS_HOST.test(school.school_url ?? ''));
  const dir = path.join(RAW_DIR, '_scs');
  fs.mkdirSync(dir, { recursive: true });
  const tally = {};
  for (const school of schools) {
    const code = school.school_url.match(SCS_HOST)[1].toLowerCase();
    const id = school.acara_sml_id;
    let outcome;
    try {
      const result = await readSchool(code);
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(result, null, 1));
      const rows = result.data.fees ?? [];
      if (rows.length === 0) outcome = 'not_found';
      else if (!result.year || !result.feePage) outcome = 'not_extracted';
      else {
        outcome = 'found';
        ledger.schools[id] = {
          ...ledger.schools[id],
          school_name: school.school_name,
          website: school.school_url,
          status: 'found',
          checked: today(),
          fees: {
            fee_year: result.year,
            basis: 'first child, annual, Sydney Catholic Schools total including building levy',
            by_year: rows.map(row => ({ years: row.scholasticYear.replace(/^Year /, ''), total: row.firstChild })),
            sibling: SIBLING,
            source: 'scs_endpoint',
            source_url: result.feePage,
          },
        };
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

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
