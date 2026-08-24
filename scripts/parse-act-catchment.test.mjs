import { describe, expect, it } from 'vitest';
import {
  effectiveActYearLevels,
  parseActYearLevels,
  readActZoneAttributes,
} from './parse-act-catchment.mjs';

describe('parseActYearLevels', () => {
  it('expands official secondary ranges', () => {
    expect(parseActYearLevels('7-10')).toEqual(['7', '8', '9', '10']);
    expect(parseActYearLevels('11-12')).toEqual(['11', '12']);
  });

  it('keeps ACT Preschool distinct from Kindergarten', () => {
    expect(parseActYearLevels('P-2')).toEqual(['Preschool', 'K', '1', '2']);
    expect(parseActYearLevels('K-6')).toEqual(['K', '1', '2', '3', '4', '5', '6']);
  });
});

describe('effectiveActYearLevels', () => {
  it('applies published 2027 transition years where the generic layer range is broader', () => {
    expect(effectiveActYearLevels('Aunty Agnes Shea High School', '7-10'))
      .toEqual(['7', '8', '9']);
    expect(effectiveActYearLevels('Whitlam Primary School (P-6)', 'P-6'))
      .toEqual(['Preschool', 'K', '1', '2']);
  });
});

describe('readActZoneAttributes', () => {
  it('maps official types to the shared kind contract', () => {
    expect(readActZoneAttributes({
      id: 23,
      SCHOOL_NAME: 'Shirley Smith High School',
      YEAR_LEVEL: '7-10',
      GOVERNMENT: 'Yes',
      TYPE: 'High',
    })).toMatchObject({
      source_school_code: '23',
      source_name: 'Shirley Smith High School',
      kind: 'secondary',
      catch_type: 'HIGH_PEA',
      year_levels: ['7', '8', '9', '10'],
    });
  });

  it('rejects records without exact identity and stage attributes', () => {
    expect(() => readActZoneAttributes({ SCHOOL_NAME: '', TYPE: 'High' }))
      .toThrow(/school name, type, year range or source id/i);
  });
});
