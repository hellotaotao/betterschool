import { describe, expect, it } from 'vitest';
import { resolveTasMatches } from './build-tas-catchment.mjs';

const square = {
  type: 'Polygon',
  coordinates: [[[147, -43], [148, -43], [148, -42], [147, -42], [147, -43]]],
};

const school = (school_name, location_age_id, longitude = 147.5, latitude = -42.5) => ({
  school_name,
  location_age_id,
  longitude,
  latitude,
});

describe('resolveTasMatches', () => {
  it('requires one exact ACARA name inside the published polygon', () => {
    expect(resolveTasMatches({
      record: { source_name: 'Cygnet Primary School', source_school_code: '057', geometry: square },
      acaraSchools: [school('Cygnet Primary School', 1)],
    })).toMatchObject({ method: 'exact_name_and_containment', schools: [{ location_age_id: 1 }] });
  });

  it('supports only checked-in official rename aliases', () => {
    expect(resolveTasMatches({
      record: { source_name: 'Dover District High School', source_school_code: '073', geometry: square },
      acaraSchools: [school('Dover District School', 2)],
    })).toMatchObject({ method: 'audited_exact_alias_and_containment', schools: [{ location_age_id: 2 }] });
  });

  it('attaches the explicitly shared source zone to both named schools', () => {
    const result = resolveTasMatches({
      record: {
        source_name: 'Sandy Bay Infant and Waimea Heights (Shared)',
        source_school_code: 'S01',
        geometry: square,
      },
      acaraSchools: [
        school('Sandy Bay Infant School', 3),
        school('Waimea Heights Primary School', 4),
      ],
    });
    expect(result.method).toBe('audited_shared_zone_and_containment');
    expect(result.schools.map((item) => item.location_age_id)).toEqual([3, 4]);
  });

  it('does not take an exact name outside the polygon', () => {
    expect(resolveTasMatches({
      record: { source_name: 'Cygnet Primary School', source_school_code: '057', geometry: square },
      acaraSchools: [school('Cygnet Primary School', 5, 149, -42.5)],
    })).toMatchObject({ reason: 'no_exact_acara_candidate_inside_zone', schools: [] });
  });
});
