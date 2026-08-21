import { describe, expect, it } from 'vitest';
import { School } from '@/types/school';
import {
  browsePath,
  buildSchoolSlugs,
  catchmentPath,
  mapPath,
  schoolPath,
  schoolSlugFor,
  slugify,
  stateIndexPath,
  suburbPath,
  suburbSlug,
  toLocalePath,
} from './slug';

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

describe('schoolSlugFor', () => {
  const hubbardA = school({ id: 'a', acara_sml_id: 40701, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
  const hubbardB = school({ id: 'b', acara_sml_id: 53477, school_name: "Hubbard's School", suburb: 'Milton', state: 'QLD' });
  const chatswood = school({ id: 'c', acara_sml_id: 41316, school_name: 'Chatswood Public School', suburb: 'Chatswood' });
  const all = [hubbardA, hubbardB, chatswood];

  it('agrees with buildSchoolSlugs for a unique name', () => {
    expect(schoolSlugFor(chatswood, all)).toBe(buildSchoolSlugs(all).get('c'));
  });

  it('agrees with buildSchoolSlugs for a colliding pair', () => {
    const bulk = buildSchoolSlugs(all);
    expect(schoolSlugFor(hubbardA, all)).toBe(bulk.get('a'));
    expect(schoolSlugFor(hubbardB, all)).toBe(bulk.get('b'));
  });

  it('does not treat a same-named school in another state as a collision', () => {
    const wa = school({ id: 'd', acara_sml_id: 1, school_name: 'Trinity College', suburb: 'Perth', state: 'WA' });
    const tas = school({ id: 'e', acara_sml_id: 2, school_name: 'Trinity College', suburb: 'Perth', state: 'TAS' });
    expect(schoolSlugFor(wa, [wa, tas])).toBe('trinity-college-perth');
  });
});

describe('locale-aware paths', () => {
  const nsw = school({ id: 'a', school_name: 'Chatswood Public School', suburb: 'Chatswood' });

  it('leaves English paths unprefixed so published URLs do not move', () => {
    expect(schoolPath('NSW', 'chatswood-public-school-chatswood')).toBe('/school/nsw/chatswood-public-school-chatswood');
    expect(suburbPath('NSW', 'Chatswood')).toBe('/suburb/nsw/chatswood');
    expect(catchmentPath('NSW', 'x')).toBe('/catchment/nsw/x');
    expect(browsePath()).toBe('/browse');
    expect(stateIndexPath('NSW')).toBe('/suburb/nsw');
  });

  it('prefixes Chinese paths with /zh', () => {
    expect(schoolPath(nsw.state, 'chatswood-public-school-chatswood', 'zh'))
      .toBe('/zh/school/nsw/chatswood-public-school-chatswood');
    expect(suburbPath('NSW', 'Chatswood', 'zh')).toBe('/zh/suburb/nsw/chatswood');
    expect(catchmentPath('NSW', 'x', 'zh')).toBe('/zh/catchment/nsw/x');
    expect(browsePath('zh')).toBe('/zh/browse');
    expect(stateIndexPath('NSW', 'zh')).toBe('/zh/suburb/nsw');
  });

  it('shares one map route between locales', () => {
    expect(mapPath()).toBe('/schools');
  });

  it('swaps the prefix on an existing path in both directions', () => {
    expect(toLocalePath('/school/nsw/x', 'zh')).toBe('/zh/school/nsw/x');
    expect(toLocalePath('/zh/school/nsw/x', 'en')).toBe('/school/nsw/x');
    expect(toLocalePath('/zh/school/nsw/x', 'zh')).toBe('/zh/school/nsw/x');
    expect(toLocalePath('/browse', 'en')).toBe('/browse');
  });
});
