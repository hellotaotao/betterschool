import { describe, expect, it } from 'vitest';
import { School } from '@/types/school';
import {
  filterSchoolsForZoneOverlay,
  filterSchools,
  getMarkerColor,
  getMarkerRadius,
  SECTOR_COLORS,
  UNKNOWN_ENROLMENT_RADIUS,
  type FilterState,
} from './schoolFilters';

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
    lat: -33.8,
    lng: 151.2,
    legacy_metric_status: 'unavailable',
    ...overrides,
  };
}

const noFilters: FilterState = {
  sector: 'all',
  schoolType: 'all',
  icsea: 'all',
  enrolments: 'all',
  religion: 'all',
};

describe('getMarkerRadius', () => {
  it('falls back to the unknown radius when enrolments are not published', () => {
    expect(getMarkerRadius(undefined)).toBe(UNKNOWN_ENROLMENT_RADIUS);
    expect(getMarkerRadius(Number.NaN)).toBe(UNKNOWN_ENROLMENT_RADIUS);
  });

  it('grows monotonically with enrolments', () => {
    const radii = [0, 50, 107, 295, 573, 981].map(getMarkerRadius);
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    }
  });

  it('scales area, not radius, with enrolments', () => {
    // Quadrupling enrolments should roughly double the radius delta above the
    // floor, which is what a sqrt curve gives.
    const base = getMarkerRadius(0);
    const at300 = getMarkerRadius(300) - base;
    const at1200 = getMarkerRadius(1200) - base;
    expect(at1200 / at300).toBeCloseTo(2, 1);
  });

  it('clamps at the top so no marker becomes a blob', () => {
    expect(getMarkerRadius(1200)).toBe(18);
    expect(getMarkerRadius(6248)).toBe(18);
  });
});

describe('getMarkerColor', () => {
  it('encodes the official ACARA sector', () => {
    expect(getMarkerColor('Government')).toBe(SECTOR_COLORS.Government);
    expect(getMarkerColor('Catholic')).toBe(SECTOR_COLORS.Catholic);
    expect(getMarkerColor('Independent')).toBe(SECTOR_COLORS.Independent);
  });

  it('gives every sector a distinct colour', () => {
    const colors = Object.values(SECTOR_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('falls back to neutral grey for an unrecognised sector', () => {
    expect(getMarkerColor('Something Else')).toBe('#6b7280');
  });
});

describe('marker encoding is independent of legacy_score', () => {
  // Regression guard. legacy_score covers ~8% of schools and is absent for
  // entire states (WA 0, NT 0, QLD 3), so encoding it into the map made whole
  // regions read as "no good schools here". Markers must depend only on
  // official ACARA fields.
  it('renders identically whether or not a legacy score is attached', () => {
    const scored = school({
      total_enrolments: 500,
      legacy_score: 96,
      legacy_rank: 27,
      legacy_metric_status: 'available',
    });
    const unscored = school({ total_enrolments: 500 });

    expect(getMarkerRadius(scored.total_enrolments)).toBe(getMarkerRadius(unscored.total_enrolments));
    expect(getMarkerColor(scored.sector)).toBe(getMarkerColor(unscored.sector));
  });

  it('keeps a WA profile-only school as visible as a scored NSW school', () => {
    const nsw = school({
      state: 'NSW',
      total_enrolments: 400,
      legacy_score: 98,
      legacy_rank: 3,
      legacy_metric_status: 'available',
    });
    const wa = school({ state: 'WA', total_enrolments: 400 });

    expect(getMarkerRadius(wa.total_enrolments)).toBe(getMarkerRadius(nsw.total_enrolments));
  });
});

describe('filterSchools', () => {
  const schools = [
    school({ id: 'a', sector: 'Government', school_type: 'Primary', icsea: 1145, total_enrolments: 527, is_religious: false }),
    school({ id: 'b', sector: 'Catholic', school_type: 'Secondary', icsea: 1050, total_enrolments: 1200, is_religious: true }),
    school({ id: 'c', sector: 'Independent', school_type: 'Combined', icsea: 950, total_enrolments: 180, is_religious: null }),
    school({ id: 'd', sector: 'Independent', school_type: 'Primary', is_religious: null }),
  ];

  const ids = (filters: Partial<FilterState>) =>
    filterSchools(schools, { ...noFilters, ...filters }).map(s => s.id);

  it('returns everything when no filter is active', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by sector', () => {
    expect(ids({ sector: 'Independent' })).toEqual(['c', 'd']);
  });

  it('filters by school type', () => {
    expect(ids({ schoolType: 'Primary' })).toEqual(['a', 'd']);
  });

  it('filters by ICSEA floor and excludes schools without ICSEA', () => {
    expect(ids({ icsea: '1000' })).toEqual(['a', 'b']);
  });

  it('treats religion Unknown as neither religious nor secular', () => {
    expect(ids({ religion: 'religious' })).toEqual(['b']);
    expect(ids({ religion: 'secular' })).toEqual(['a']);
  });

  it('filters by enrolment bucket and excludes schools without enrolments', () => {
    expect(ids({ enrolments: 'small' })).toEqual(['c']);
    expect(ids({ enrolments: 'medium' })).toEqual(['a']);
    expect(ids({ enrolments: 'large' })).toEqual(['b']);
  });

  it('combines filters conjunctively', () => {
    expect(ids({ sector: 'Independent', schoolType: 'Primary' })).toEqual(['d']);
  });
});

describe('filterSchoolsForZoneOverlay', () => {
  const primaryCatchment = {
    geometry_url: '/data/catchment/nsw/primary.json',
    kind: 'primary' as const,
    catch_type: 'PRIMARY',
    year_levels: ['K', '1', '2', '3', '4', '5', '6'],
    source_school_code: '1001',
    data_year: 2026,
    source: 'NSW Department of Education',
    source_url: 'https://education.nsw.gov.au/',
  };
  const secondaryCatchment = {
    ...primaryCatchment,
    geometry_url: '/data/catchment/nsw/secondary.json',
    kind: 'secondary' as const,
    catch_type: 'SECONDARY',
  };
  const schools = [
    school({ id: 'government-primary', catchments: [primaryCatchment] }),
    school({ id: 'government-secondary', school_type: 'Secondary', catchments: [secondaryCatchment] }),
    school({ id: 'government-combined', school_type: 'Combined', catchments: [primaryCatchment, secondaryCatchment] }),
    school({ id: 'government-unzoned', school_type: 'Primary' }),
    school({ id: 'catholic-primary', sector: 'Catholic', catchments: [primaryCatchment] }),
    school({ id: 'independent-secondary', sector: 'Independent', catchments: [secondaryCatchment] }),
  ];

  const ids = (overlay: 'off' | 'primary' | 'secondary') =>
    filterSchoolsForZoneOverlay(schools, overlay).map(s => s.id);

  it('does not narrow schools when the zone overlay is off', () => {
    expect(ids('off')).toEqual(schools.map(s => s.id));
  });

  it('shows only Government schools with a primary zone in primary mode', () => {
    expect(ids('primary')).toEqual(['government-primary', 'government-combined']);
  });

  it('shows only Government schools with a secondary zone in secondary mode', () => {
    expect(ids('secondary')).toEqual(['government-secondary', 'government-combined']);
  });
});
