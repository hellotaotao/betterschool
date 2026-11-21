// Where a state stands: ledger status counts, records answered (found or
// fee_free, plus campuses whose parent is answered) and the commonest reasons
// a record has no figures.
//
//   node scripts/fees-tools/gap-report.mjs <STATE>
import fs from 'node:fs';
import { loadLedger } from '../fees-common.mjs';

const state = (process.argv[2] ?? '').toUpperCase();
if (!state) throw new Error('Usage: gap-report.mjs <STATE>');
const ledger = loadLedger().schools;
const schools = JSON.parse(fs.readFileSync('public/data/schools.canonical.json', 'utf8'));
const answered = r => r && ['found', 'fee_free', 'described'].includes(r.status);
const status = {};
const reasons = {};
let total = 0;
let yes = 0;
for (const s of schools.schools ?? schools) {
  if (s.state !== state || s.sector === 'Government') continue;
  total += 1;
  const r = ledger[s.acara_sml_id];
  status[r?.status ?? 'never attempted'] = (status[r?.status ?? 'never attempted'] ?? 0) + 1;
  const ok = answered(r) || (r?.status === 'campus' && answered(ledger[r.parent_acara_sml_id]));
  if (ok) { yes += 1; continue; }
  const key = r?.status === 'campus' ? 'campus whose parent has no answer' : `${r?.status}: ${(r?.note ?? '').slice(0, 70)}`;
  reasons[key] = (reasons[key] ?? 0) + 1;
}
console.log(`${state}: ${total} non-government records, ${yes} answered (${Math.round((yes / total) * 100)}%)`);
console.log(status);
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(String(v).padStart(5), k);
