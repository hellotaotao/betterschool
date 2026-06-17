import { describe, it, expect } from 'vitest';
import type { School } from '@/types/school';
import { searchSchools } from './searchSchools';

function make(partial: Partial<School>): School {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    acara_sml_id: 1,
    school_name: partial.school_name ?? 'Test School',
    suburb: partial.suburb ?? 'Testville',
    state: partial.state ?? 'SA',
    postcode: partial.postcode ?? '5000',
    sector: partial.sector ?? 'Government',
    lat: -34.9, lng: 138.6,
    legacy_metric_status: partial.legacy_metric_status ?? 'unavailable',
    ...partial,
  } as School;
}

const fixture: School[] = [
  make({ id: 'a', school_name: 'Glenunga International High School', suburb: 'Glenunga', state: 'SA', postcode: '5064', legacy_metric_status: 'available', legacy_score: 95 }),
  make({ id: 'b', school_name: 'Mount Glen Primary School', suburb: 'Glen Osmond', state: 'SA', postcode: '5064' }),
  make({ id: 'c', school_name: 'Adelaide High School', suburb: 'Adelaide', state: 'SA', postcode: '5000' }),
  make({ id: 'd', school_name: 'Richmond Primary School', suburb: 'Richmond', state: 'SA', postcode: '5033' }),
  make({ id: 'e', school_name: 'Richmond West Primary', suburb: 'Richmond', state: 'VIC', postcode: '3121' }),
];

describe('searchSchools', () => {
  it('returns [] for queries shorter than 2 chars', () => {
    expect(searchSchools('g', fixture)).toEqual([]);
    expect(searchSchools('', fixture)).toEqual([]);
  });

  it('ranks name startsWith above mid-word includes', () => {
    const r = searchSchools('glen', fixture);
    const schools = r.filter(x => x.type === 'school');
    expect(schools[0]).toMatchObject({ type: 'school', school: { id: 'a' } });
    expect(schools.map(s => s.type === 'school' && s.school.id)).toContain('b');
    expect(schools.findIndex(s => s.type === 'school' && s.school.id === 'a'))
      .toBeLessThan(schools.findIndex(s => s.type === 'school' && s.school.id === 'b'));
  });

  it('matches postcode by prefix as a place result', () => {
    const r = searchSchools('5064', fixture);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'place', label: '5064', state: 'SA' });
    expect(r[0].type === 'place' && r[0].schools).toHaveLength(2);
  });

  it('groups suburb matches into one place per suburb+state', () => {
    const r = searchSchools('richmond', fixture);
    const places = r.filter(x => x.type === 'place');
    const labels = places.map(p => p.type === 'place' && p.label);
    expect(labels).toContain('Richmond, SA');
    expect(labels).toContain('Richmond, VIC');
  });

  it('caps total results at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      make({ id: `m${i}`, school_name: `Zebra School ${i}` }));
    expect(searchSchools('zebra', many).length).toBeLessThanOrEqual(8);
  });
});
