import { describe, expect, it } from 'vitest';
import { toMapSchool } from './client-schools.mjs';

describe('toMapSchool', () => {
  const canonical = {
    id: 'acara-1-2-3',
    local_id: 'legacy-id',
    acara_sml_id: 1,
    location_age_id: 2,
    school_age_id: 3,
    school_name: 'Example Primary School',
    suburb: 'Example',
    state: 'NSW',
    postcode: '2000',
    lat: -33.8,
    lng: 151.2,
    sector: 'Government',
    legacy_metric_status: 'unavailable',
    religion_source: 'sector',
    source: { canonical_base: 'acara', metadata: '/data/schools.metadata.json', data_year: 2025 },
    catchments: [{
      geometry_url: '/data/catchment/nsw/2-primary.json',
      kind: 'primary',
      catch_type: 'PRIMARY',
      year_levels: ['K', '1'],
      source_school_code: '1234',
      data_year: 2027,
      source: 'NSW Department of Education',
      source_url: 'https://data.nsw.gov.au/',
    }],
  };

  it('keeps what the map reads and drops provenance the server pages carry', () => {
    const slim = toMapSchool(canonical);
    expect(slim).toMatchObject({ id: 'acara-1-2-3', acara_sml_id: 1, location_age_id: 2, lat: -33.8, sector: 'Government' });
    expect(slim).not.toHaveProperty('local_id');
    expect(slim).not.toHaveProperty('school_age_id');
    expect(slim).not.toHaveProperty('source');
    expect(slim.catchments).toEqual([{
      geometry_url: '/data/catchment/nsw/2-primary.json',
      kind: 'primary',
      year_levels: ['K', '1'],
      data_year: 2027,
    }]);
  });

  it('does not invent fields the canonical record lacks', () => {
    const slim = toMapSchool({ id: 'x', acara_sml_id: 9, legacy_metric_status: 'unavailable' });
    expect(slim).toEqual({ id: 'x', acara_sml_id: 9, legacy_metric_status: 'unavailable' });
  });
});
