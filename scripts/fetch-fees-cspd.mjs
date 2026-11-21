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
import { RAW_DIR, applyReading, fetchPage, flatten, htmlToText, loadLedger, loadSchools, saveLedger, today } from './fees-common.mjs';

// Two layouts of the same template: "Year 7|Year 7 1st Child 2nd Child …" and
// "Year 7|Fee components Child 1 Child 2 …". In the second, a level can carry a
// second block with an introductory discount applied; only the first, the
// full-rate block, follows the level label, so the match takes that one.
const BLOCK = /\|((?:Year \d{1,2})|Kindergarten|Kinder)\|(?:\1 1st Child 2nd Child 3rd Child 4th\+ Child|Fee components Child\s1 Child\s2 Child\s3 Child\s4\+)\|(.*?)\|Total\|((?:\$[\d,]+(?:\.\d\d)?)(?:\|\$[\d,]+(?:\.\d\d)?)*)(?=\|)/g;
const amount = text => Number(text.replace(/[$,]/g, ''));
const SIBLING = 'Diocesan tuition reduced for 2nd and 3rd child, free from 4th child; building levy charged once per family; school resource and activity fees apply per child.';

const gradeNumber = years => (years === 'K' ? 0 : /^\d+$/.test(years) ? Number(years) : null);
const isConsecutiveGrade = (prev, next) => {
  const a = gradeNumber(prev);
  const b = gradeNumber(next);
  return a !== null && b !== null && b === a + 1;
};

function parseComponentTokens(body) {
  const tokens = body.split('|').filter(Boolean);
  const items = [];
  let index = 0;
  while (index < tokens.length) {
    const rawLabel = tokens[index].replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawLabel || rawLabel.startsWith('$')) {
      index += 1;
      continue;
    }
    index += 1;
    const values = [];
    while (index < tokens.length && /^\$[\d,]+(?:\.\d\d)?$/.test(tokens[index].trim())) {
      values.push(amount(tokens[index].trim()));
      index += 1;
    }
    if (values.length > 0) {
      const unit = /one per family/i.test(rawLabel) ? 'per_family' : 'per_student';
      const name = rawLabel.replace(/\s*\(one per family\)\s*/i, '').trim();
      items.push({ name, unit, amount: values[0] });
    }
  }
  return items;
}

function buildComponents(perRowItems, rows) {
  const grouped = new Map();
  perRowItems.forEach((items, rowIndex) => {
    for (const item of items) {
      const key = `${item.name}::${item.unit}`;
      if (!grouped.has(key)) grouped.set(key, { name: item.name, unit: item.unit, entries: [] });
      grouped.get(key).entries.push({ rowIndex, years: rows[rowIndex].years, amount: item.amount });
    }
  });

  const components = [];
  for (const { name, unit, entries } of grouped.values()) {
    const uniform = entries.length === rows.length && entries.every(entry => entry.amount === entries[0].amount);
    if (uniform) {
      components.push({ name, unit, amount: entries[0].amount });
      continue;
    }
    const runs = [];
    for (const entry of entries) {
      const prev = runs[runs.length - 1];
      if (
        prev
        && entry.rowIndex === prev.lastRowIndex + 1
        && entry.amount === prev.amount
        && isConsecutiveGrade(prev.endYears, entry.years)
      ) {
        prev.endYears = entry.years;
        prev.lastRowIndex = entry.rowIndex;
      } else {
        runs.push({
          startYears: entry.years,
          endYears: entry.years,
          lastRowIndex: entry.rowIndex,
          amount: entry.amount,
        });
      }
    }
    components.push({
      name,
      unit,
      by_year: runs.map(run => ({
        years: run.startYears === run.endYears ? run.startYears : `${run.startYears}-${run.endYears}`,
        amount: run.amount,
      })),
    });
  }
  return components;
}

export function parseTemplate(flat) {
  const year = flat.match(/Fees Payable at .{3,120}? for (\d{4}) ?\|/)?.[1];
  if (!year || !flat.includes('Diocesan Building Levy')) return null;
  const rows = [];
  const perRowItems = [];
  for (const [, level, body, totalsText] of flat.matchAll(BLOCK)) {
    const totals = totalsText.split('|').map(amount);
    const items = parseComponentTokens(body);
    const tuition = items.find(item => item.name === 'Diocesan Tuition Fee')?.amount;
    const [total, child2, child3, child4] = totals;
    rows.push({
      years: level.replace(/^Year /, '').replace(/^Kinder(garten)?$/, 'K'),
      ...(tuition != null ? { tuition } : {}),
      total,
      ...(child2 != null ? { child_2: child2 } : {}),
      ...(child3 != null ? { child_3: child3 } : {}),
      ...(child4 != null ? { child_4: child4 } : {}),
    });
    perRowItems.push(items);
  }
  if (rows.length === 0) return null;
  const components = buildComponents(perRowItems, rows);
  const hasSiblingCols = rows.some(row => row.child_2 != null || row.child_3 != null || row.child_4 != null);
  return {
    fee_year: Number(year),
    billing_unit: 'per_student',
    by_year: rows,
    ...(components.length > 0 ? { components } : {}),
    ...(hasSiblingCols ? { sibling_amounts_basis: 'per_child' } : {}),
  };
}

function applyParsed(ledger, school, parsed, url, checked) {
  const id = school.acara_sml_id;
  const existing = ledger.schools[id];
  const discount = existing?.fees?.fee_year === parsed.fee_year && existing?.fees?.discount
    ? existing.fees.discount
    : undefined;
  ledger.schools[id] = applyReading(existing ?? {}, {
    school_name: school.school_name,
    website: school.school_url,
    status: 'found',
    checked,
    fees: {
      ...parsed,
      basis: 'first child, annual, diocesan published total (tuition, building levy, school charges)',
      sibling: SIBLING,
      source: 'diocese_schedule',
      source_url: url,
      ...(discount ? { discount } : {}),
    },
  });
}

async function main() {
  const fromCache = process.argv.includes('--from-cache');
  const ledger = loadLedger();
  const dir = path.join(RAW_DIR, '_cspd');

  if (fromCache) {
    if (!fs.existsSync(dir)) throw new Error(`No cached CSPD directory at ${dir}`);
    const byId = new Map(loadSchools().map(school => [String(school.acara_sml_id), school]));
    const files = fs.readdirSync(dir)
      .filter(file => /^\d+\.txt$/.test(file))
      .sort((a, b) => Number(a.replace('.txt', '')) - Number(b.replace('.txt', '')));
    let found = 0;
    for (const file of files) {
      const id = file.replace('.txt', '');
      const school = byId.get(id);
      if (!school) continue;
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const lines = raw.split('\n');
      const url = lines[0].startsWith('URL: ') ? lines[0].slice(5).trim() : ledger.schools[id]?.fees?.source_url;
      const flat = lines.slice(1).join('\n');
      const parsed = parseTemplate(flat);
      if (!parsed || !url) continue;
      applyParsed(ledger, school, parsed, url, ledger.schools[id]?.checked ?? today());
      found += 1;
    }
    saveLedger(ledger);
    console.log(`${files.length} cached CSPD files parsed, ${found} updated`);
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  const schools = loadSchools().filter(school =>
    school.state === 'NSW' && school.sector === 'Catholic' && school.school_url
    && !/syd\.catholic\.edu\.au/.test(school.school_url)
    // Re-read schools this template supplied before, so next year's schedule replaces this year's.
    && (ledger.schools[school.acara_sml_id]?.status !== 'found'
      || ledger.schools[school.acara_sml_id]?.fees?.source === 'diocese_schedule'));
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
        applyParsed(ledger, school, parsed, page.url, today());
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
