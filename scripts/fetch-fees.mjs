// Crawl each school's own website for fee and admissions pages, keep the text
// under data/fees/raw/<acara_sml_id>/, and record the attempt in the ledger.
//
//   node scripts/fetch-fees.mjs --scope sydney-secondary [--stale-days 180] [--concurrency 6]
//   node scripts/fetch-fees.mjs --ids 43681,43217 --force
//
// Reading the figures out of the text is a separate step (fees-cards.mjs);
// this only fetches, so a re-run never overwrites figures already read.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  RAW_DIR, SCOPES, fetchPage, htmlLinks, htmlToText, isPdf, loadLedger, loadSchools, parentSchoolId, pdfToText, saveLedger, today,
} from './fees-common.mjs';

const MAX_PAGES = 16;
const RELEVANT = /fee|tuition|enrol|admission|scholarship|apply|application|entrance|cost/i;
// A fee schedule beats an "apply now" form when the page budget runs out.
const STRONG = /fee|tuition|scholarship|entrance|schedule/i;

function args() {
  const out = { scope: null, ids: null, staleDays: 180, concurrency: 6, force: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scope') out.scope = argv[++i];
    else if (argv[i] === '--ids') out.ids = new Set(argv[++i].split(',').map(Number));
    else if (argv[i] === '--stale-days') out.staleDays = Number(argv[++i]);
    else if (argv[i] === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (argv[i] === '--force') out.force = true;
  }
  if (!out.scope && !out.ids) throw new Error(`Pass --scope (${Object.keys(SCOPES).join(', ')}) or --ids`);
  if (out.scope && !SCOPES[out.scope]) throw new Error(`Unknown scope ${out.scope}`);
  return out;
}

const sameSite = (a, b) => {
  const host = url => new URL(url).hostname.replace(/^www\./, '');
  try {
    const [x, y] = [host(a), host(b)];
    return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
  } catch {
    return false;
  }
};

async function crawl(school) {
  const dir = path.join(RAW_DIR, String(school.acara_sml_id));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const home = school.school_url.replace(/^http:/, 'https:');
  const queue = [{ url: home, text: 'home', depth: 0 }];
  const tried = new Set();
  const saved = new Set();
  const log = [];
  let homeStatus = null;
  while (queue.length > 0 && tried.size < MAX_PAGES) {
    const { url, text, depth } = queue.shift();
    if (tried.has(url)) continue;
    tried.add(url);
    let page;
    try {
      page = await fetchPage(url, { timeoutMs: depth === 0 ? 40000 : 25000 });
    } catch (error) {
      log.push({ url, error: error.cause?.code ?? error.name ?? 'error' });
      // Some small-school sites still serve plain http only.
      if (depth === 0 && url !== school.school_url && !tried.has(school.school_url)) {
        queue.unshift({ url: school.school_url, text: 'home (as listed)', depth: 0 });
        continue;
      }
      if (depth === 0) homeStatus = 'unreachable';
      continue;
    }
    if (depth === 0) homeStatus = page.status;
    if (page.status >= 400) {
      log.push({ url, error: `HTTP ${page.status}` });
      // ACARA lists some sites by a deep path that no longer exists; the root may.
      const root = `${new URL(url).origin}/`;
      if (depth === 0 && page.status === 404 && url !== root && !tried.has(root)) queue.unshift({ url: root, text: 'home (site root)', depth: 0 });
      continue;
    }
    if (saved.has(page.url)) continue;
    saved.add(page.url);
    const pdf = isPdf(page.type, page.body);
    const body = pdf ? await pdfToText(page.body) : htmlToText(page.body);
    const file = crypto.createHash('sha1').update(page.url).digest('hex').slice(0, 10);
    fs.writeFileSync(path.join(dir, `${file}.txt`), `URL: ${page.url}\nLINK: ${text}\n\n${body}`);
    log.push({ url: page.url, link: text, file, pdf, chars: body.length });
    if (!pdf && depth < 2) {
      const links = htmlLinks(page.url, page.body)
        .filter(link => RELEVANT.test(link.href) || RELEVANT.test(link.text))
        .filter(link => sameSite(link.href, home) || /\.pdf($|\?)/i.test(link.href))
        .sort((a, b) => Number(!STRONG.test(a.href + a.text)) - Number(!STRONG.test(b.href + b.text)));
      for (const link of links) if (!tried.has(link.href)) queue.push({ url: link.href, text: link.text, depth: depth + 1 });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  fs.writeFileSync(path.join(dir, '_log.json'), JSON.stringify(log, null, 1));
  const pages = log.filter(entry => entry.file).length;
  const status = pages > 0 ? 'fetched' : homeStatus === 403 ? 'blocked' : 'unreachable';
  // Why the home page failed, so a later pass knows whether the listed URL is stale.
  const homeError = pages > 0 ? null : log.find(entry => entry.error)?.error ?? null;
  return { status, pages, errors: log.length - pages, homeError };
}

async function main() {
  const options = args();
  const ledger = loadLedger();
  const cutoff = Date.now() - options.staleDays * 86400e3;
  const targets = loadSchools()
    .filter(school => (options.ids ? options.ids.has(school.acara_sml_id) : SCOPES[options.scope](school)))
    .filter(school => {
      const entry = ledger.schools[school.acara_sml_id];
      return options.force || !entry?.checked || Date.parse(entry.checked) < cutoff;
    });
  console.log(`${targets.length} schools to fetch`);
  const byId = new Map(loadSchools().map(school => [school.acara_sml_id, school]));

  let done = 0;
  const work = targets.slice();
  async function worker() {
    while (work.length > 0) {
      const school = work.shift();
      const id = school.acara_sml_id;
      const previous = ledger.schools[id] ?? {};
      // ACARA leaves some websites blank; one found and verified by hand is kept
      // in the ledger as website_source "lookup" and stands in for it.
      const website = school.school_url ?? (previous.website_source === 'lookup' ? previous.website : null);
      const base = { school_name: school.school_name, website };
      const parent = parentSchoolId(school);
      if (!website && parent && byId.has(parent)) {
        // A campus inherits nothing from an earlier crawl or note of its own.
        const kept = { ...previous };
        delete kept.crawl;
        delete kept.note;
        ledger.schools[id] = {
          ...kept, ...base, status: 'campus', checked: today(),
          parent_acara_sml_id: parent,
          parent_name: byId.get(parent).school_name,
          website: byId.get(parent).school_url ?? null,
          website_source: 'parent_school',
        };
      } else if (!website) {
        ledger.schools[id] = { ...previous, ...base, status: 'no_website', checked: today() };
      } else {
        const result = await crawl({ ...school, school_url: website });
        // Figures already read stay until the extraction step replaces them.
        const status = previous.status === 'found' && result.status === 'fetched' ? 'found' : result.status;
        ledger.schools[id] = {
          ...previous, ...base, status, checked: today(),
          crawl: { pages: result.pages, errors: result.errors, ...(result.homeError ? { home_error: result.homeError } : {}) },
        };
      }
      done += 1;
      if (done % 10 === 0) saveLedger(ledger);
      console.log(`${done}/${targets.length} ${id} ${school.school_name} → ${ledger.schools[id].status}`);
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  saveLedger(ledger);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
