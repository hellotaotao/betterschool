// Store fee text copied from a page read in a browser (sites that refuse the
// crawler, tables rendered by script) as evidence beside the crawl's pages.
// Paste the fee section verbatim into a file first; do not retype figures.
// The log URL gets "#browser" so it never collides with a crawled page.
//
//   node scripts/fees-tools/save-browser-text.mjs <acara_sml_id> <page-url> <text-file>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from '../fees-common.mjs';

const [id, url, textFile] = process.argv.slice(2);
if (!id || !url || !textFile) throw new Error('Usage: save-browser-text.mjs <id> <url> <text-file>');
const body = fs.readFileSync(textFile, 'utf8');
const dir = path.join(RAW_DIR, id);
fs.mkdirSync(dir, { recursive: true });
const file = `br-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 8)}`;
const label = 'page text read in a browser';
fs.writeFileSync(path.join(dir, `${file}.txt`), `URL: ${url}\nLINK: ${label}\n\n${body}`);
const logPath = path.join(dir, '_log.json');
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
if (!log.some(entry => entry.file === file)) log.push({ url: `${url}#browser`, link: label, file, pdf: false, chars: body.length });
fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
console.log(id, body.length);
