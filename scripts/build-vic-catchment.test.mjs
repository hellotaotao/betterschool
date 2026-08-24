import { describe, expect, it } from 'vitest';
import { resolveEntityMatch } from './build-vic-catchment.mjs';

const square = {
  type: 'Polygon',
  coordinates: [[[144.9, -37.9], [145.1, -37.9], [145.1, -37.7], [144.9, -37.7], [144.9, -37.9]]],
};

const school = (school_name, location_age_id, longitude = 145, latitude = -37.8) => ({
  school_name,
  location_age_id,
  longitude,
  latitude,
});

describe('resolveEntityMatch', () => {
  it('uses the exact campus identity and polygon containment', () => {
    const match = resolveEntityMatch({
      source_name: 'Kurnai College',
      campus_name: 'Churchill Campus',
      geometries: [square],
      site: { School_Name: 'Kurnai College' },
      acaraSchools: [
        school('Kurnai College', 1),
        school('Kurnai College - Churchill Campus', 2),
      ],
    });
    expect(match.school.location_age_id).toBe(2);
    expect(match.method).toBe('exact_campus_name_and_containment');
  });

  it('accepts an exact official-site rename, never a fuzzy source-name guess', () => {
    const match = resolveEntityMatch({
      source_name: 'Old Park Primary School',
      campus_name: 'Old Park Primary School',
      geometries: [square],
      site: { School_Name: 'New Park Primary School' },
      acaraSchools: [school('New Park Primary School', 3)],
    });
    expect(match.school.location_age_id).toBe(3);
    expect(match.method).toBe('exact_base_name_and_containment');
  });

  it('rejects a name match whose coordinates fall outside the zone', () => {
    expect(resolveEntityMatch({
      source_name: 'Example Primary School',
      campus_name: 'Example Primary School',
      geometries: [square],
      site: { School_Name: 'Example Primary School' },
      acaraSchools: [school('Example Primary School', 4, 146, -37.8)],
    })).toMatchObject({ school: null, reason: 'no_exact_acara_candidate_inside_zone' });
  });

  it('rejects ambiguity instead of choosing the nearest candidate', () => {
    expect(resolveEntityMatch({
      source_name: 'Example College',
      campus_name: 'North Campus',
      geometries: [square],
      site: { School_Name: 'Example College' },
      acaraSchools: [
        school('Example College - North Campus', 5, 145.00),
        school('Example College-North Campus', 6, 145.01),
      ],
    })).toMatchObject({ school: null, reason: 'several_exact_acara_candidates_inside_zone' });
  });

  it('can use the exact source name when the older site register has no row', () => {
    const match = resolveEntityMatch({
      source_name: 'Devenish Primary School',
      campus_name: 'Devenish Primary School',
      geometries: [square],
      site: null,
      acaraSchools: [school('Devenish Primary School', 7)],
    });
    expect(match.school.location_age_id).toBe(7);
    expect(match.method).toBe('exact_campus_name_and_containment');
  });
});
