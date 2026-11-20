// Fetch one page or document into a school's raw folder and register it in
// _log.json, so validate-fees can trace figures read from it. For pages the
// crawler missed: a schedule linked from a page it did not reach, a Google
// Drive file (pass the uc?export=download URL), a fee PDF found in a browser.
//
//   node scripts/fees-tools/save-page.mjs <acara_sml_id> <url> [label]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, docxToText, fetchPage, htmlToText, isDocx, isPdf, pdfToText } from '../fees-common.mjs';

const [id, url, label = 'saved by hand'] = process.argv.slice(2);
if (!id || !url) throw new Error('Usage: save-page.mjs <id> <url> [label]');
const page = await fetchPage(url);
if (page.status >= 400) throw new Error(`HTTP ${page.status}; nothing saved`);
const pdf = isPdf(page.type, page.body);
const docx = !pdf && isDocx(page.type, page.body);
const body = pdf ? await pdfToText(page.body) : docx ? docxToText(page.body) : htmlToText(page.body);
const dir = path.join(RAW_DIR, id);
fs.mkdirSync(dir, { recursive: true });
const file = crypto.createHash('sha1').update(page.url).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(dir, `${file}.txt`), `URL: ${page.url}\nLINK: ${label}\n\n${body}`);
const logPath = path.join(dir, '_log.json');
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
if (!log.some(entry => entry.file === file)) log.push({ url: page.url, link: label, file, pdf, ...(docx ? { docx } : {}), chars: body.length });
fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
console.log(id, page.status, `${body.length} chars`, path.join(dir, `${file}.txt`));
