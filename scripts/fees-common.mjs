// Shared paths, scope and ledger helpers for the school fees layer.
//
// data/fees/processed/fees.json is both the data and the crawl ledger: one
// entry per school that has been attempted, whatever the outcome. A school
// missing from it has never been attempted, which is a different fact from
// "attempted and the school publishes nothing".

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { extractText, getDocumentProxy } from 'unpdf';

export const FEES_DIR = path.resolve('data/fees');
export const RAW_DIR = path.join(FEES_DIR, 'raw');
export const LEDGER_PATH = path.join(FEES_DIR, 'processed', 'fees.json');
const CANONICAL_PATH = path.resolve('public/data/schools.canonical.json');

/**
 * Outcome of the latest attempt at a school. Only `found` carries figures;
 * every other status is a reason there are none, kept so a re-run knows what
 * was already tried.
 */
export const STATUSES = {
  found: 'fee figures read from a source the school or its system publishes',
  fetched: 'pages fetched, figures not yet read',
  not_published: 'the website says fees are given on request, or shows enrolment charges only',
  not_found: 'website crawled, no fee figures on any page reached',
  not_extracted: 'figures exist but could not be read (script-rendered table, image)',
  blocked: 'the website refuses automated requests',
  unreachable: 'the website did not respond',
  no_website: 'no website in the ACARA record, and none found by lookup',
  // ACARA lists a sub-campus as its own location, without a website or an
  // enrolment count of its own: it is part of the school named by
  // rolled_school_id, which carries the website and the fee schedule.
  campus: 'a sub-campus; its website and fees are those of parent_acara_sml_id',
};

const siteOf = url => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * The parent school of a sub-campus that shares the parent's fee schedule:
 * one with no website of its own, or one listed under the parent's own site.
 * Null for anything else, including a campus with a separate site.
 */
export function parentSchoolId(school, byId) {
  const parent = Number(school.rolled_school_id);
  if (school.campus_type !== 'School Sub-Campus' || !Number.isFinite(parent) || parent === school.acara_sml_id) return null;
  if (!school.school_url) return parent;
  const parentUrl = byId?.get(parent)?.school_url;
  return parentUrl && siteOf(parentUrl) === siteOf(school.school_url) ? parent : null;
}

// Greater Sydney by postcode: the metropolitan ranges plus the Blue Mountains
// and Macarthur blocks. Close enough to pick a crawl batch; not a boundary
// any page states.
export function inSydney(school) {
  const code = Number(school.postcode);
  return (code >= 2000 && code <= 2249) || (code >= 2555 && code <= 2574) || (code >= 2740 && code <= 2786);
}

// Greater Melbourne by postcode, on the same terms as inSydney: the metropolitan
// block plus the Melton, Sunbury, Yarra Ranges, Mornington and Casey fringes.
export function inMelbourne(school) {
  const code = Number(school.postcode);
  return (code >= 3000 && code <= 3210) || (code >= 3335 && code <= 3341) || (code >= 3427 && code <= 3443)
    || (code >= 3750 && code <= 3811) || (code >= 3910 && code <= 3944) || (code >= 3975 && code <= 3978);
}

const nonGovSecondary = state => school =>
  school.state === state && school.sector !== 'Government'
  && school.school_type !== 'Primary' && school.school_type !== 'Special';

export const SCOPES = {
  'qld-secondary': nonGovSecondary('QLD'),
  'wa-secondary': nonGovSecondary('WA'),
  'melbourne-secondary': school =>
    school.state === 'VIC' && inMelbourne(school) && school.sector !== 'Government'
    && school.school_type !== 'Primary' && school.school_type !== 'Special',
  'sydney-secondary': school =>
    school.state === 'NSW' && inSydney(school) && school.sector !== 'Government'
    && school.school_type !== 'Primary' && school.school_type !== 'Special',
  'nsw-secondary': school =>
    school.state === 'NSW' && school.sector !== 'Government'
    && school.school_type !== 'Primary' && school.school_type !== 'Special',
};

export function loadSchools() {
  return JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
}

export function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { schools: {} };
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function saveLedger(ledger) {
  const sorted = Object.fromEntries(
    Object.entries(ledger.schools).sort(([a], [b]) => Number(a) - Number(b)),
  );
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify({ ...ledger, schools: sorted }, null, 1)}\n`);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Apply a new reading to a ledger entry while keeping past years.
 *
 * Figures for a different fee year push the outgoing ones, source URL and
 * all, onto fees_history; a re-read of the same year replaces them (it is a
 * correction, not history). A reading with no figures moves the current ones
 * to history rather than dropping them. Only figures and links are kept, never
 * the source documents: when a school replaces or removes its schedule, the
 * old link simply stops working.
 */
export function applyReading(entry, reading) {
  const { fees: incoming, ...rest } = reading;
  const history = [...(entry.fees_history ?? [])];
  const current = entry.fees;
  const retire = current && (!incoming || current.fee_year !== incoming.fee_year);
  if (retire) history.unshift({ ...current, superseded: today() });
  const next = { ...entry, ...rest };
  delete next.fees;
  delete next.note;
  if (incoming) next.fees = incoming;
  if (rest.note) next.note = rest.note;
  if (history.length > 0) next.fees_history = history;
  return next;
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

export async function fetchPage(url, { timeoutMs = 25000 } = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const type = response.headers.get('content-type') ?? '';
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, url: response.url, type, body };
}

export function isPdf(type, body) {
  return type.includes('pdf') || body.subarray(0, 4).toString() === '%PDF';
}

export async function pdfToText(body) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(body));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.slice(0, 30).join('\n');
  } catch (error) {
    return `[pdf error: ${error.message}]`;
  }
}

export function htmlToText(body) {
  const root = parseHtml(body.toString('utf8'));
  for (const node of root.querySelectorAll('script, style, noscript, svg')) node.remove();
  return root.structuredText.replace(/\n\s*\n+/g, '\n');
}

export function htmlLinks(baseUrl, body) {
  const root = parseHtml(body.toString('utf8'));
  const links = [];
  for (const anchor of root.querySelectorAll('a[href]')) {
    try {
      const href = new URL(anchor.getAttribute('href'), baseUrl);
      href.hash = '';
      if (href.protocol.startsWith('http')) links.push({ href: href.toString(), text: anchor.text.replace(/\s+/g, ' ').trim().slice(0, 80) });
    } catch {
      // Malformed href: nothing to follow.
    }
  }
  return links;
}

/** Collapse a page's text to one line, `|` between source lines. */
export function flatten(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).join('|').replace(/[ \t]+/g, ' ');
}

export function readRawPages(id) {
  const dir = path.join(RAW_DIR, String(id));
  const logPath = path.join(dir, '_log.json');
  if (!fs.existsSync(logPath)) return [];
  const seen = new Set();
  return JSON.parse(fs.readFileSync(logPath, 'utf8'))
    .filter(entry => entry.file && !seen.has(entry.url) && seen.add(entry.url))
    .map(entry => ({ ...entry, text: fs.readFileSync(path.join(dir, `${entry.file}.txt`), 'utf8') }));
}
