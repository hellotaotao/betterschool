// Fees for Catholic Schools Parramatta Diocese, and any other NSW Catholic
// system on the same site template.
//
// Those school sites publish /enrolment/school-fees as one block per year
// level: "Year 7 | 1st Child … | Diocesan Tuition Fee | $x … | Total | $y",
// under "Fees Payable at <school> for <year>". A page that does not match the
// template exactly is left alone: other dioceses publish differently, so a
// miss here says nothing about whether the school publishes fees.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, fetchPage, flatten, htmlToText, loadLedger, loadSchools, saveLedger, today } from './fees-common.mjs';

const BLOCK = /\|((?:Year \d{1,2})|Kindergarten|Kinder)\|\1 1st Child 2nd Child 3rd Child 4th\+ Child\|(.*?)\|Total\|\$([\d,]+)\|/g;
const amount = text => Number(text.replace(/,/g, ''));

export function parseTemplate(flat) {
  const year = flat.match(/Fees Payable at .{3,120}? for (\d{4})\|/)?.[1];
  if (!year || !flat.includes('Diocesan Building Levy')) return null;
  const rows = [];
  for (const [, level, body, total] of flat.matchAll(BLOCK)) {
    const tuition = body.match(/Diocesan Tuition Fee\|\$([\d,]+)/)?.[1];
    rows.push({ years: level.replace(/^Year /, '').replace(/^Kinder(garten)?$/, 'K'), ...(tuition ? { tuition: amount(tuition) } : {}), total: amount(total) });
  }
  return rows.length > 0 ? { fee_year: Number(year), by_year: rows } : null;
}

async function main() {
  const ledger = loadLedger();
  const dir = path.join(RAW_DIR, '_cspd');
  fs.mkdirSync(dir, { recursive: true });
  const schools = loadSchools().filter(school =>
    school.state === 'NSW' && school.sector === 'Catholic' && school.school_url
    && !/syd\.catholic\.edu\.au/.test(school.school_url) && ledger.schools[school.acara_sml_id]?.status !== 'found');
  let found = 0;
  const work = schools.slice();
  async function worker() {
    while (work.length > 0) {
      const school = work.shift();
      const origin = new URL(school.school_url.replace(/^http:/, 'https:')).origin;
      try {
        const page = await fetchPage(`${origin}/enrolment/school-fees`);
        if (page.status >= 400) continue;
        const flat = flatten(htmlToText(page.body));
        const parsed = parseTemplate(flat);
        if (!parsed) continue;
        fs.writeFileSync(path.join(dir, `${school.acara_sml_id}.txt`), `URL: ${page.url}\n\n${flat}`);
        ledger.schools[school.acara_sml_id] = {
          ...ledger.schools[school.acara_sml_id],
          school_name: school.school_name,
          website: school.school_url,
          status: 'found',
          checked: today(),
          fees: {
            ...parsed,
            basis: 'first child, annual, diocesan published total (tuition, building levy, school charges)',
            sibling: 'diocesan tuition reduced for 2nd and 3rd child, free from the 4th',
            source: 'diocese_schedule',
            source_url: page.url,
          },
        };
        found += 1;
      } catch {
        // Unreachable or not the template: the general crawl covers it.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  saveLedger(ledger);
  console.log(`${schools.length} NSW Catholic schools probed, ${found} on the diocesan fee template`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
