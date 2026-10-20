import { describe, expect, it } from 'vitest';
import { acaraNameKey, locateColumns, parseFlag, parseValue, vcaaNameKey } from './vcaa-common.mjs';
import { matchYear } from './match-vcaa-acara.mjs';

describe('parseValue', () => {
  it('reads numbers, including numbers stored as padded text', () => {
    expect(parseValue(31)).toEqual({ value: 31 });
    expect(parseValue('   7.0')).toEqual({ value: 7 });
  });

  it('keeps every VCAA placeholder as null with its reason, never zero', () => {
    expect(parseValue('I/D')).toEqual({ value: null, reason: 'insufficient_data' });
    expect(parseValue('< 4')).toEqual({ value: null, reason: 'fewer_than_4' });
    expect(parseValue('-')).toEqual({ value: null, reason: 'not_applicable' });
    expect(parseValue(null)).toEqual({ value: null, reason: 'blank' });
  });
});

describe('parseFlag', () => {
  it('treats the asterisk as set and a blank cell as unset', () => {
    expect(parseFlag('*')).toBe(true);
    expect(parseFlag(null)).toBe(false);
  });
});

describe('locateColumns', () => {
  it('finds columns by header text wherever VCAA put them', () => {
    const header = ['School', 'Small School', 'Locality', 'Number of students enrolled in at least one VCE unit',
      'Percentage of VCE students applying for tertiary places', 'Percentage of satisfactory VCE completions',
      'Median VCE study score', 'Percentage of study scores of 40 and over'];
    const { headerRow, columns } = locateColumns([['Title'], header, ['A School']]);
    expect(headerRow).toBe(1);
    expect(columns.median_study_score).toBe(6);
    expect(columns.adult_school).toBeUndefined();
  });

  it('refuses a workbook missing a required column', () => {
    expect(() => locateColumns([['School', 'Locality']])).toThrow(/small_school/);
  });
});

describe('vcaaNameKey', () => {
  it("expands VCAA's truncated words to ACARA's", () => {
    expect(vcaaNameKey('Flinders Christian Comm College')).toBe(acaraNameKey('Flinders Christian Community College'));
    expect(vcaaNameKey('Australian Internatl Academy')).toBe('australian international academy');
  });
});

describe('matchYear', () => {
  const location = (id, school_name, suburb, latitude, longitude) => ({ acara_sml_id: id, school_name, suburb, latitude, longitude });
  const row = (school, locality) => ({ school, locality, withheld: {} });
  const locations = [
    location(1, 'Nossal High School', 'Berwick', -38.04, 145.34),
    location(2, 'Mill Park Secondary College', 'Mill Park', -37.66, 145.06),
    location(3, 'Epping Secondary College', 'Epping', -37.64, 145.03),
    location(4, "St Margaret's School", 'East Geelong', -38.15, 144.37),
  ];

  it('matches an exact name and locality', () => {
    const { matches } = matchYear([row('Nossal High School', 'BERWICK')], locations);
    expect(matches.get(1).method).toBe('exact_name_and_locality');
  });

  it('accepts a unique name in a neighbouring suburb', () => {
    const { matches } = matchYear([row('Mill Park Secondary College', 'EPPING')], locations);
    expect(matches.get(2).method).toBe('exact_name_unique_both_sides');
  });

  it('rejects a unique name far from the VCAA locality', () => {
    const { matches, unmatched } = matchYear([row("St Margaret's School", 'BERWICK')], locations);
    expect(matches.size).toBe(0);
    expect(unmatched[0].reason).toBe('same_name_too_far');
  });

  it('rejects both rows when two claim the same school', () => {
    const aliases = { aliases: { 'Nossal High|BERWICK': 1 } };
    const { matches, unmatched } = matchYear([row('Nossal High School', 'BERWICK'), row('Nossal High', 'BERWICK')], locations, aliases);
    expect(matches.size).toBe(0);
    expect(unmatched.map(entry => entry.reason)).toEqual(['two_rows_one_school', 'two_rows_one_school']);
  });

  it('records a provider listed as not a school', () => {
    const { unmatched } = matchYear([row('Bendigo TAFE', 'BENDIGO')], locations, { not_schools: { 'Bendigo TAFE|BENDIGO': 'TAFE' } });
    expect(unmatched[0].reason).toBe('not_an_acara_school');
  });
});
