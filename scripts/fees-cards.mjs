// Print a compact evidence card per fetched school: the stretch of each page
// where fee rows sit, plus the test providers its pages name. Figures are read
// off these cards by hand into the ledger; the card keeps the source URL beside
// every excerpt so each figure can be traced.
//
//   node scripts/fees-cards.mjs [--status fetched] [--ids 1,2] [--limit 20] [--offset 0] [--chars 900]

import fs from 'node:fs';
import { flatten, loadLedger, readRawPages } from './fees-common.mjs';

const ROW = /(?:Year|Years|Yr|YR|Kindergarten|Kindy|Stage|Prep)\b[^$|]{0,40}\|?\s?\$\s?\d{1,2},?\d{3}/g;
const PROVIDERS = [
  ['AAS', /Academic Assessment Services|\bAAS\b/],
  ['ACER', /\bACER\b|Cooperative Scholarship/],
  ['Edutest', /Edutest/i],
  ['HAST', /\bHAST\b/],
  ['entrance exam', /entrance (exam|test)/i],
];

function args() {
  const out = { status: 'fetched', ids: null, limit: 20, offset: 0, chars: 900, exclude: new Set() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--status') out.status = argv[++i];
    else if (argv[i] === '--ids') out.ids = new Set(argv[++i].split(',').map(Number));
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]);
    else if (argv[i] === '--offset') out.offset = Number(argv[++i]);
    else if (argv[i] === '--chars') out.chars = Number(argv[++i]);
    // Records read but not yet merged into the ledger, so a batch is not shown twice.
    else if (argv[i] === '--exclude-file') {
      for (const id of Object.keys(JSON.parse(fs.readFileSync(argv[++i], 'utf8')))) out.exclude.add(Number(id));
    }
  }
  return out;
}

function feeExcerpt(flat, chars) {
  const hits = [...flat.matchAll(ROW)].map(match => match.index);
  if (hits.length < 2) return null;
  // The densest run of rows is the table; a stray "Year 12 formal $85" is not.
  let best = { start: hits[0], count: 0 };
  for (const start of hits) {
    const count = hits.filter(index => index >= start && index < start + chars).length;
    if (count > best.count) best = { start, count };
  }
  return { rows: best.count, text: flat.slice(Math.max(0, best.start - 160), best.start + chars) };
}

const options = args();
const ledger = loadLedger();
const entries = Object.entries(ledger.schools)
  .filter(([id, entry]) => (options.ids ? options.ids.has(Number(id)) : entry.status === options.status && !options.exclude.has(Number(id))))
  .slice(options.offset, options.offset + options.limit);

for (const [id, entry] of entries) {
  const pages = readRawPages(id);
  console.log(`\n#### ${id} ${entry.school_name} (${pages.length} pages)`);
  const excerpts = pages
    .map(page => {
      const flat = flatten(page.text.split('\n').slice(3).join('\n'));
      // The fee year has to come from the page, so show the years it names beside fee words.
      const years = [...new Set([...`${page.url} ${flat}`.matchAll(/(?:fee|schedule|tuition)[^|]{0,40}?(202[5-8])|(202[5-8])[^|]{0,40}?(?:fee|schedule|tuition)/gi)]
        .map(match => match[1] ?? match[2]))];
      return { url: page.url, years, ...feeExcerpt(flat, options.chars) };
    })
    .filter(excerpt => excerpt.rows)
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 2);
  for (const excerpt of excerpts) console.log(`  [${excerpt.rows} rows; fee years named: ${excerpt.years.join(',') || 'none'}] ${excerpt.url}\n  ${excerpt.text}`);
  if (excerpts.length === 0) {
    // Column-laid PDFs put the year labels and the amounts in separate runs;
    // show the densest run of amounts instead and read the labels around it.
    const dense = pages
      .filter(page => !/international|overseas/i.test(page.url))
      .map(page => {
        const flat = flatten(page.text.split('\n').slice(3).join('\n'));
        const hits = [...flat.matchAll(/\$\s?\d{1,2},\d{3}/g)].map(match => match.index);
        let best = { start: 0, count: 0 };
        for (const start of hits) {
          const count = hits.filter(index => index >= start && index < start + options.chars).length;
          if (count > best.count) best = { start, count };
        }
        return { url: page.url, count: best.count, text: flat.slice(Math.max(0, best.start - 400), best.start + options.chars) };
      })
      .filter(entry => entry.count >= 3)
      .sort((a, b) => b.count - a.count)[0];
    if (dense) console.log(`  [no rows; ${dense.count} amounts] ${dense.url}\n  ${dense.text}`);
    else {
      const candidates = pages.filter(page => /fee|tuition/i.test(page.url)).map(page => page.url);
      console.log(`  no fee figures; fee-like pages: ${candidates.slice(0, 4).join(' ') || 'none'}`);
    }
  }
  const named = PROVIDERS.filter(([, pattern]) => pages.some(page => pattern.test(page.text))).map(([name]) => name);
  if (named.length > 0) console.log(`  tests named: ${named.join(', ')}`);
}
