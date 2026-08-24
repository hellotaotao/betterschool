import { describe, expect, it } from 'vitest';
import * as parser from './parse-vic-catchment.mjs';
import * as common from './vic-catchment-common.mjs';

describe('readZoneAttributes', () => {
  it('reads source attributes case-insensitively and preserves the campus identity', () => {
    expect(parser.readZoneAttributes({
      school_name: 'Kurnai College',
      CAMPUS_NAME: 'University Campus',
      entity_code: 1871606,
      Year_Level: '11',
      boundary_year: '2027',
    })).toEqual({
      source_school_code: '1871606',
      school_number: '8716',
      source_name: 'Kurnai College',
      campus_name: 'University Campus',
      year_levels: ['11'],
    });
  });

  it('rejects blank identity and year-level fields', () => {
    expect(() => parser.readZoneAttributes({ ENTITY_CODE: '', School_Name: '', Year_Level: '' }))
      .toThrow(/entity_code|school name|year level/i);
  });
});

describe('parseVicYearLevels', () => {
  it('parses the primary and published secondary ranges without inference', () => {
    expect(common.parseVicYearLevels('P6')).toEqual(['P', '1', '2', '3', '4', '5', '6']);
    expect(common.parseVicYearLevels('7 to 9')).toEqual(['7', '8', '9']);
    expect(common.parseVicYearLevels('11 to 12')).toEqual(['11', '12']);
    expect(common.parseVicYearLevels(10)).toEqual(['10']);
  });

  it('rejects an unknown range instead of guessing', () => {
    expect(() => common.parseVicYearLevels('middle years')).toThrow(/year level/i);
  });
});

describe('schoolNumberFromEntityCode', () => {
  it('decodes the deterministic entity type + school number + campus suffix', () => {
    expect(common.schoolNumberFromEntityCode('1074401')).toBe('744');
    expect(common.schoolNumberFromEntityCode('1871606')).toBe('8716');
  });

  it('rejects malformed codes', () => {
    expect(() => common.schoolNumberFromEntityCode('8716')).toThrow(/entity code/i);
  });
});

describe('groupExactGeometryVariants', () => {
  const polygon = (east) => ({
    type: 'Polygon',
    coordinates: [[[144, -38], [east, -38], [east, -37], [144, -38]]],
  });

  it('coalesces identical boundaries and unions only their published year levels', () => {
    const result = common.groupExactGeometryVariants([
      { geometry: polygon(145), year_levels: ['7'], catch_type: 'SECONDARY', source_school_code: '1000001' },
      { geometry: polygon(145), year_levels: ['8'], catch_type: 'SECONDARY', source_school_code: '1000001' },
      { geometry: polygon(146), year_levels: ['9'], catch_type: 'SECONDARY', source_school_code: '1000001' },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map(variant => variant.year_levels)).toEqual([['7', '8'], ['9']]);
    expect(result[0].geometry).toEqual(polygon(145));
  });
});
