import { describe, expect, it } from 'vitest';
import { applyReading, parentSchoolId } from './fees-common.mjs';

const fees = (year, amount, url = `https://school.example/fees-${year}.pdf`) => ({
  fee_year: year,
  basis: 'tuition',
  by_year: [{ years: '7', tuition: amount }],
  source: 'school_website',
  source_url: url,
});

describe('applyReading', () => {
  it('moves the outgoing year, with its link, to history when a new year arrives', () => {
    const entry = { status: 'found', checked: '2026-11-12', fees: fees(2026, 20000) };
    const next = applyReading(entry, { status: 'found', checked: '2027-11-10', fees: fees(2027, 21000) });
    expect(next.fees.fee_year).toBe(2027);
    expect(next.fees_history).toHaveLength(1);
    expect(next.fees_history[0]).toMatchObject({ fee_year: 2026, source_url: 'https://school.example/fees-2026.pdf' });
    expect(next.fees_history[0].superseded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('replaces a re-read of the same year without adding history', () => {
    const entry = { status: 'found', checked: '2026-11-12', fees: fees(2026, 20000) };
    const next = applyReading(entry, { status: 'found', fees: fees(2026, 20500) });
    expect(next.fees.by_year[0].tuition).toBe(20500);
    expect(next.fees_history).toBeUndefined();
  });

  it('keeps the figures in history when a later reading finds none', () => {
    const entry = { status: 'found', checked: '2026-11-12', fees: fees(2026, 20000) };
    const next = applyReading(entry, { status: 'not_found', note: 'Fee page removed.' });
    expect(next.status).toBe('not_found');
    expect(next.fees).toBeUndefined();
    expect(next.note).toBe('Fee page removed.');
    expect(next.fees_history[0].fee_year).toBe(2026);
  });

  it('drops a stale note once figures are found', () => {
    const entry = { status: 'not_extracted', checked: '2026-11-12', note: 'PDF unreadable.' };
    const next = applyReading(entry, { status: 'found', fees: fees(2027, 9000) });
    expect(next.note).toBeUndefined();
    expect(next.fees_history).toBeUndefined();
  });

  it('stacks history newest first across years', () => {
    let entry = { status: 'found', fees: fees(2025, 18000) };
    entry = applyReading(entry, { status: 'found', fees: fees(2026, 19000) });
    entry = applyReading(entry, { status: 'found', fees: fees(2027, 20000) });
    expect(entry.fees_history.map(item => item.fee_year)).toEqual([2026, 2025]);
  });
});

describe('parentSchoolId', () => {
  const parent = { acara_sml_id: 1, school_url: 'https://www.school.example/' };
  const byId = new Map([[1, parent]]);
  const campus = extra => ({ acara_sml_id: 2, campus_type: 'School Sub-Campus', rolled_school_id: 1, ...extra });

  it('treats a sub-campus with no website, or with the parent\'s site, as the parent', () => {
    expect(parentSchoolId(campus({}), byId)).toBe(1);
    expect(parentSchoolId(campus({ school_url: 'http://school.example/campus' }), byId)).toBe(1);
  });

  it('leaves a campus with a separate site, or a whole school, alone', () => {
    expect(parentSchoolId(campus({ school_url: 'https://other.example/' }), byId)).toBeNull();
    expect(parentSchoolId({ acara_sml_id: 1, campus_type: 'School Single Entity', rolled_school_id: 1 }, byId)).toBeNull();
  });
});
