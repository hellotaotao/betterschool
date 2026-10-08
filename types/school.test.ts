import { describe, expect, it } from 'vitest';
import type { MapSchool, MapSchoolCatchment } from './school';
import { MAP_CATCHMENT_FIELDS, MAP_SCHOOL_FIELDS } from '@/scripts/client-schools.mjs';

// `satisfies` makes the compiler reject a key missing from, or extra to, the
// type; the assertions then tie that same key set to the build allowlist. A
// field added to one side only fails here rather than arriving undefined.
const MAP_SCHOOL_KEYS = {
  id: true, acara_sml_id: true, location_age_id: true, school_name: true, suburb: true,
  state: true, postcode: true, lat: true, lng: true, sector: true, school_type: true,
  campus_type: true, year_range: true, icsea: true, icsea_percentile: true,
  total_enrolments: true, girls: true, boys: true, lbote_yes_percent: true,
  indigenous_percent: true, school_url: true, myschool_url: true, governing_body: true,
  religious_affiliation: true, is_religious: true, fees: true, catchments: true,
  legacy_score: true, legacy_rank: true, legacy_metric_status: true,
} satisfies Record<keyof MapSchool, true>;

const MAP_CATCHMENT_KEYS = {
  geometry_url: true, zone_id: true, kind: true, year_levels: true, effective_year: true, data_year: true,
} satisfies Record<keyof MapSchoolCatchment, true>;

describe('MapSchool', () => {
  it('matches the fields scripts/client-schools.mjs ships', () => {
    expect([...MAP_SCHOOL_FIELDS].sort()).toEqual(Object.keys(MAP_SCHOOL_KEYS).sort());
    expect([...MAP_CATCHMENT_FIELDS].sort()).toEqual(Object.keys(MAP_CATCHMENT_KEYS).sort());
  });
});
