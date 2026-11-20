// Show the text around the first match of a pattern in each saved page of a
// school, to check a fee year, a column header or a row the evidence card cut.
//
//   node scripts/fees-tools/grep-raw.mjs <acara_sml_id> "<regex>" [chars]
import { flatten, readRawPages } from '../fees-common.mjs';

const [id, pattern, chars = '700'] = process.argv.slice(2);
const re = new RegExp(pattern, 'i');
for (const page of readRawPages(id)) {
  const text = flatten(page.text.split('\n').slice(3).join('\n'));
  const at = text.search(re);
  if (at < 0) continue;
  const half = Number(chars) / 2;
  console.log(`  ${page.url}\n  ${text.slice(Math.max(0, at - half), at + half)}`);
}
