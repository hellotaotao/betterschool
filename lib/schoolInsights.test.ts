import { describe, expect, it } from 'vitest';
import type { School } from '@/types/school';
import {
  entryYear,
  gradeCohorts,
  gradeShortLabel,
  kmOffset,
  percentAbove,
  percentBelow,
  ringStepKm,
  schoolHighlights,
  studentsPerTeacher,
  type HighlightContext,
} from './schoolInsights';

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'acara-1-1-1',
    acara_sml_id: 1,
    school_name: 'Test School',
    suburb: 'Testville',
    state: 'NSW',
    postcode: '2000',
    sector: 'Government',
    school_type: 'Primary',
    lat: -33.9,
    lng: 151.2,
    legacy_metric_status: 'unavailable',
    ...overrides,
  };
}

const ordinaryContext: HighlightContext = {
  suburbSchools: [{ id: 'acara-1-1-1', sector: 'Government' }, { id: 'b', sector: 'Government' }],
  sizePool: [],
};

describe('gradeCohorts', () => {
  it('keeps teaching order and the offered-but-unpublished state', () => {
    const cohorts = gradeCohorts(school({
      grade_enrolments: { year_2: 30, one_year_before_year_1: 28, year_1: null },
    }));
    expect(cohorts).toEqual([
      { key: 'one_year_before_year_1', count: 28 },
      { key: 'year_1', count: null },
      { key: 'year_2', count: 30 },
    ]);
  });

  it('is empty when no grade record joined', () => {
    expect(gradeCohorts(school())).toEqual([]);
  });
});

describe('gradeShortLabel', () => {
  it("uses each state's own name for the year before Year 1", () => {
    expect(gradeShortLabel('one_year_before_year_1', 'NSW')).toBe('K');
    expect(gradeShortLabel('one_year_before_year_1', 'VIC')).toBe('Prep');
    expect(gradeShortLabel('one_year_before_year_1', 'WA')).toBe('PP');
    expect(gradeShortLabel('year_10', 'SA')).toBe('10');
  });

  it('leaves ungraded and pre-foundation years to the translated strings', () => {
    expect(gradeShortLabel('primary_ungraded', 'NSW')).toBeNull();
    expect(gradeShortLabel('two_years_before_year_1', 'NSW')).toBeNull();
  });
});

describe('studentsPerTeacher', () => {
  it('divides FTE by FTE to one decimal', () => {
    expect(studentsPerTeacher({ enrolments_fte: 929, staff: { teaching_fte: 63.3 } })).toBe(14.7);
  });

  it('returns null rather than a ratio built on a missing or zero side', () => {
    expect(studentsPerTeacher({ enrolments_fte: 929 })).toBeNull();
    expect(studentsPerTeacher({ enrolments_fte: 929, staff: { teaching_fte: 0 } })).toBeNull();
    expect(studentsPerTeacher({ staff: { teaching_fte: 10 } })).toBeNull();
  });
});

describe('percentBelow / percentAbove', () => {
  const pool = [10, 20, 20, 30, 40];

  it('counts strictly, so ties sit on neither side', () => {
    expect(percentBelow(pool, 20)).toBe(20);
    expect(percentAbove(pool, 20)).toBe(40);
  });

  it('handles the ends and an empty pool', () => {
    expect(percentBelow(pool, 50)).toBe(100);
    expect(percentAbove(pool, 5)).toBe(100);
    expect(percentBelow([], 5)).toBe(0);
  });
});

describe('entryYear', () => {
  it('finds the Year 7 intake at a K-12 school', () => {
    expect(entryYear([
      { key: 'year_5', count: 60 },
      { key: 'year_6', count: 62 },
      { key: 'year_7', count: 180 },
      { key: 'year_8', count: 178 },
    ])).toEqual({ year: 7, count: 180, previousCount: 62 });
  });

  it('ignores ordinary drift and gaps with no published count', () => {
    expect(entryYear([
      { key: 'year_1', count: 60 },
      { key: 'year_2', count: 75 },
      { key: 'year_3', count: null },
      { key: 'year_4', count: 200 },
    ])).toBeNull();
  });
});

describe('schoolHighlights', () => {
  it('returns nothing for an unremarkable school', () => {
    expect(schoolHighlights(school({ total_enrolments: 300, girls: 150, boys: 150 }), ordinaryContext)).toEqual([]);
  });

  it('reads single-sex only from a roll large enough not to be coincidence', () => {
    const girls = schoolHighlights(school({ total_enrolments: 929, girls: 929, boys: 0 }), ordinaryContext);
    expect(girls).toContainEqual({ kind: 'girlsOnly', count: 929 });

    const tiny = schoolHighlights(school({ total_enrolments: 12, girls: 0, boys: 12 }), ordinaryContext);
    expect(tiny).toEqual([]);
  });

  it('separates the only school in a suburb from the only one of its sector', () => {
    expect(schoolHighlights(school(), { suburbSchools: [{ id: 'acara-1-1-1', sector: 'Government' }], sizePool: [] }))
      .toEqual([{ kind: 'onlySchoolInSuburb' }]);

    expect(schoolHighlights(school({ sector: 'Catholic' }), {
      suburbSchools: [
        { id: 'acara-1-1-1', sector: 'Catholic' },
        { id: 'b', sector: 'Government' },
        { id: 'c', sector: 'Government' },
      ],
      sizePool: [],
    })).toEqual([{ kind: 'onlySectorInSuburb', total: 3 }]);
  });

  it('flags size only at the extremes of a pool large enough to mean something', () => {
    const pool = Array.from({ length: 100 }, (_, index) => (index + 1) * 10);
    expect(schoolHighlights(school({ total_enrolments: 995 }), { ...ordinaryContext, sizePool: pool }))
      .toEqual([{ kind: 'large', percent: 99, poolSize: 100 }]);
    expect(schoolHighlights(school({ total_enrolments: 15 }), { ...ordinaryContext, sizePool: pool }))
      .toEqual([{ kind: 'small', percent: 99, poolSize: 100 }]);
    expect(schoolHighlights(school({ total_enrolments: 500 }), { ...ordinaryContext, sizePool: pool })).toEqual([]);
    expect(schoolHighlights(school({ total_enrolments: 995 }), { ...ordinaryContext, sizePool: pool.slice(0, 5) }))
      .toEqual([]);
  });

  it('never carries a score or rank, whatever the school holds', () => {
    const highlights = schoolHighlights(
      school({ legacy_score: 99, legacy_rank: 1, icsea: 1250, icsea_percentile: 99 }),
      ordinaryContext,
    );
    expect(highlights).toEqual([]);
  });

  it('caps the list', () => {
    const highlights = schoolHighlights(school({
      school_type: 'Special',
      total_enrolments: 400,
      girls: 400,
      boys: 0,
      geolocation: 'Very Remote',
      lbote_yes_percent: 90,
      indigenous_percent: 80,
      campus_type: 'School Head Campus',
    }), { suburbSchools: [{ id: 'acara-1-1-1', sector: 'Government' }], sizePool: [] });
    expect(highlights).toHaveLength(4);
  });
});

describe('diagram geometry', () => {
  it('measures a degree of latitude as about 110.6 km, south positive', () => {
    const offset = kmOffset({ lat: -33, lng: 151 }, { lat: -34, lng: 151 });
    expect(offset.x).toBeCloseTo(0);
    expect(offset.y).toBeCloseTo(110.574);
  });

  it('shrinks a degree of longitude with latitude', () => {
    const offset = kmOffset({ lat: -33, lng: 151 }, { lat: -33, lng: 152 });
    expect(offset.x).toBeCloseTo(111.32 * Math.cos((33 * Math.PI) / 180));
  });

  it('picks ring steps that are round numbers', () => {
    expect(ringStepKm(3)).toBe(1);
    expect(ringStepKm(7)).toBe(2);
    expect(ringStepKm(14)).toBe(5);
    expect(ringStepKm(300)).toBe(100);
  });
});
