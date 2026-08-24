import { describe, expect, it } from 'vitest';
import { expandQldSchoolName } from './qld-catchment-common.mjs';
import { resolveSiteMatch, resolveSourceIdentityMatch } from './build-qld-catchment.mjs';

const square = {
  type: 'Polygon',
  coordinates: [[[152.9, -27.6], [153.2, -27.6], [153.2, -27.3], [152.9, -27.3], [152.9, -27.6]]],
};

const school = (school_name, location_age_id, longitude = 153, latitude = -27.5) => ({
  school_name,
  location_age_id,
  longitude,
  latitude,
});

describe('expandQldSchoolName', () => {
  it('expands only official source abbreviations', () => {
    expect(expandQldSchoolName('Albany Creek SHS')).toBe('Albany Creek State High School');
    expect(expandQldSchoolName('Allora P-10 SS')).toBe('Allora P-10 State School');
    expect(expandQldSchoolName('Camp Hill SIPS')).toBe('Camp Hill State Infants and Primary School');
    expect(expandQldSchoolName('Mornington Island COM S')).toBe('Mornington Island Community School');
    expect(expandQldSchoolName('Cloncurry SS P-12')).toBe('Cloncurry State School P-12');
    expect(expandQldSchoolName('Herberton SS - Primary Campus')).toBe('Herberton State School - Primary Campus');
  });
});

describe('resolveSiteMatch', () => {
  it('requires one exact expanded name within the distance bound and inside the zone', () => {
    const result = resolveSiteMatch({
      site: { source_name: 'Albany Creek SHS', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [school('Albany Creek State High School', 1)],
    });
    expect(result.school.location_age_id).toBe(1);
    expect(result.method).toBe('exact_expanded_name_distance_and_containment');
  });

  it('rejects exact names beyond the site-distance limit', () => {
    expect(resolveSiteMatch({
      site: { source_name: 'Example SS', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [school('Example State School', 2, 154, -27.5)],
    })).toMatchObject({ school: null, reason: 'no_exact_acara_candidate_within_distance_and_zone' });
  });

  it('rejects ambiguity rather than selecting the nearest school', () => {
    expect(resolveSiteMatch({
      site: { source_name: 'Example SS', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [
        school('Example State School', 3, 153, -27.5),
        school('Example State School', 4, 153.01, -27.5),
      ],
    })).toMatchObject({ school: null, reason: 'several_exact_acara_candidates_within_distance_and_zone' });
  });

  it('uses the exact source catchment name when the site label adds a campus', () => {
    const result = resolveSiteMatch({
      source_name: 'Pallara SS',
      source_school_code: '0831',
      site: { source_name: 'Pallara State School Senior Campus', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [school('Pallara State School', 5)],
    });
    expect(result.school.location_age_id).toBe(5);
    expect(result.method).toBe('exact_expanded_name_distance_and_containment');
  });

  it('falls back to the exact base identity only when no usable campus record exists', () => {
    const result = resolveSiteMatch({
      source_name: 'Herberton SS - Primary Campus',
      source_school_code: '6140',
      site: { source_name: 'Herberton SS - Primary Campus', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [school('Herberton State School', 6)],
    });
    expect(result.school.location_age_id).toBe(6);
    expect(result.method).toBe('exact_base_name_distance_and_containment');
  });

  it('supports a checked-in audited official campus rename', () => {
    const result = resolveSiteMatch({
      source_name: 'Northern Peninsula Area College - Injinoo Junior',
      source_school_code: '5704',
      site: { source_name: 'Northern Peninsula Area College - Injinoo Junior', longitude: 153, latitude: -27.5 },
      geometries: [square],
      acaraSchools: [school('Northern Peninsula Area College - Ama Mary Eseli Injinoo Campus', 7)],
    });
    expect(result.school.location_age_id).toBe(7);
    expect(result.method).toBe('audited_exact_alias_distance_and_containment');
  });
});

describe('resolveSourceIdentityMatch', () => {
  it('allows one exact source identity inside the zone when the site resource omits the umbrella code', () => {
    const result = resolveSourceIdentityMatch({
      source_name: 'Roma State College',
      geometries: [square],
      acaraSchools: [school('Roma State College', 8)],
    });
    expect(result.school.location_age_id).toBe(8);
    expect(result.method).toBe('exact_source_name_and_containment_without_site_row');
  });
});
