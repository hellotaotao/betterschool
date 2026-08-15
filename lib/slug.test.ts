import { describe, expect, it } from 'vitest';
import { School } from '@/types/school';
import { buildSchoolSlugs, slugify, suburbSlug } from './slug';

function school(overrides: Partial<School> & { id: string }): School {
  return {
    acara_sml_id: 1,
    school_name: 'Test School',
    suburb: 'Testville',
    state: 'NSW',
    postcode: '2000',
    sector: 'Government',
    school_type: 'Primary',
    lat: -33.8,
    lng: 151.2,
    legacy_metric_status: 'unavailable',
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases and joins on non-alphanumerics', () => {
    expect(slugify('Chatswood Public School')).toBe('chatswood-public-school');
  });

  it('turns apostrophes into separators rather than dropping them', () => {
    expect(slugify("St Joseph's Primary School")).toBe('st-joseph-s-primary-school');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Bondi Beach--  ')).toBe('bondi-beach');
  });

  it('strips diacritics instead of emitting empty segments', () => {
    expect(slugify('École Française')).toBe('ecole-francaise');
  });

  it('collapses runs of punctuation', () => {
    expect(slugify('Mount Saint Benedict — College & Campus')).toBe('mount-saint-benedict-college-campus');
  });
});

describe('suburbSlug', () => {
  it('handles multi-word suburbs', () => {
    expect(suburbSlug('North Sydney')).toBe('north-sydney');
  });
});

describe('buildSchoolSlugs', () => {
  it('includes the suburb so same-named schools stay distinct', () => {
    const a = school({ id: 'a', school_name: "St Joseph's Primary School", suburb: 'Taree' });
    const b = school({ id: 'b', school_name: "St Joseph's Primary School", suburb: 'Junee' });
    const slugs = buildSchoolSlugs([a, b]);

    expect(slugs.get('a')).toBe('st-joseph-s-primary-school-taree');
    expect(slugs.get('b')).toBe('st-joseph-s-primary-school-junee');
  });

  it('leaves the slug clean when a name is unique in the state', () => {
    const slugs = buildSchoolSlugs([school({ id: 'a', school_name: 'Chatswood Public School', suburb: 'Chatswood' })]);
    expect(slugs.get('a')).toBe('chatswood-public-school-chatswood');
  });

  it('does not collide across states', () => {
    const a = school({ id: 'a', school_name: 'Trinity College', suburb: 'Perth', state: 'WA' });
    const b = school({ id: 'b', school_name: 'Trinity College', suburb: 'Perth', state: 'TAS' });
    const slugs = buildSchoolSlugs([a, b]);
    // Same slug string is fine — the state is a separate path segment.
    expect(slugs.get('a')).toBe('trinity-college-perth');
    expect(slugs.get('b')).toBe('trinity-college-perth');
  });

  it('falls back to the ACARA id only for a genuine same-suburb duplicate', () => {
    const a = school({ id: 'a', acara_sml_id: 40701, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
    const b = school({ id: 'b', acara_sml_id: 53477, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
    const slugs = buildSchoolSlugs([a, b]);

    expect(slugs.get('a')).toBe('hubbard-s-school-milton-40701');
    expect(slugs.get('b')).toBe('hubbard-s-school-milton-53477');
  });

  it('leaves unrelated schools untouched when another pair collides', () => {
    const a = school({ id: 'a', acara_sml_id: 40701, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
    const b = school({ id: 'b', acara_sml_id: 53477, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
    const c = school({ id: 'c', acara_sml_id: 111, school_name: 'Milton State School', suburb: 'Milton', state: 'QLD' });
    const slugs = buildSchoolSlugs([a, b, c]);

    expect(slugs.get('c')).toBe('milton-state-school-milton');
  });

  it('assigns every school a slug', () => {
    const schools = [
      school({ id: 'a' }),
      school({ id: 'b', school_name: 'Another School' }),
      school({ id: 'c', school_name: 'Third School', state: 'VIC' }),
    ];
    const slugs = buildSchoolSlugs(schools);
    expect(slugs.size).toBe(3);
    for (const s of schools) expect(slugs.get(s.id)).toBeTruthy();
  });
});
