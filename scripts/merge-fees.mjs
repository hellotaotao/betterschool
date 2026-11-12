// Merge readings taken off the evidence cards (fees-cards.mjs) into the ledger.
//
//   node scripts/merge-fees.mjs readings.json [more.json ...]
//
// Each file maps acara_sml_id to a reading: { status, fees?, note?, admissions? }.
// applyReading keeps past years in fees_history, so a new year's schedule or a
// school that stops publishing never erases what an earlier reading found.

import fs from 'node:fs';
import { STATUSES, applyReading, loadLedger, saveLedger } from './fees-common.mjs';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('Pass one or more readings files');

const ledger = loadLedger();
let merged = 0;
for (const file of files) {
  for (const [id, reading] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
    const entry = ledger.schools[id];
    if (!entry) throw new Error(`${id} has not been crawled; run fees:fetch first`);
    if (!STATUSES[reading.status]) throw new Error(`${id}: unknown status ${reading.status}`);
    if (reading.status === 'found' && !reading.fees) throw new Error(`${id}: found without fees`);
    ledger.schools[id] = applyReading(entry, reading);
    merged += 1;
  }
}
saveLedger(ledger);
console.log(`merged ${merged} readings`);
