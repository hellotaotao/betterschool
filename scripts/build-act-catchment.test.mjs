import { describe, expect, it } from 'vitest';
import { resolveActMatches } from './build-act-catchment.mjs';

const square = {
  type: 'Polygon',
  coordinates: [[[149, -35.5], [149.3, -35.5], [149.3, -35.1], [149, -35.1], [149, -35.5]]],
};
const school = (school_name, location_age_id, longitude = 149.15, latitude = -35.3) => ({
  school_name,
  location_age_id,
  longitude,
  latitude,
});

describe('resolveActMatches', () => {
  it('strips only the official stage suffix and requires containment', () => {
    expect(resolveActMatches({
      record: { source_name: 'Amaroo School (7-10)', source_year_range: '7-10', geometry: square },
      acaraSchools: [school('Amaroo School', 1)],
    })).toMatchObject({ method: 'exact_base_name_and_containment', schools: [{ location_age_id: 1 }] });
  });

  it('supports a checked-in exact ACT/ACARA rename', () => {
    expect(resolveActMatches({
      record: { source_name: 'Canberra College', source_year_range: '11-12', geometry: square },
      acaraSchools: [school('The Canberra College', 2)],
    })).toMatchObject({ method: 'audited_exact_alias_and_containment', schools: [{ location_age_id: 2 }] });
  });

  it('maps the Melba 7-10 stage to both published ACARA campuses it serves', () => {
    const result = resolveActMatches({
      record: {
        source_name: 'Melba Copland Secondary School (7-10)',
        source_year_range: '7-10',
        geometry: square,
      },
      acaraSchools: [
        school('Melba Copland Secondary School Copland Campus Years 7 - 9', 3),
        school('Melba Copland Secondary School Copland Campus Years 10 - 12', 4),
      ],
    });
    expect(result.method).toBe('audited_stage_to_campuses_and_containment');
    expect(result.schools.map((item) => item.location_age_id)).toEqual([3, 4]);
  });

  it('leaves a future school unmatched when ACARA has no location_age_id', () => {
    expect(resolveActMatches({
      record: { source_name: 'Strathnairn Primary School', source_year_range: 'P-6', geometry: square },
      acaraSchools: [school('Strathnairn School', null)],
    })).toMatchObject({ schools: [], reason: 'exact_acara_identity_has_no_location_age_id' });
  });
});
