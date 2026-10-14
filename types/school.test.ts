import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LEGACY_METRIC_STATUSES,
  RELIGIOUS_AFFILIATIONS,
  SCHOOL_SECTORS,
  SCHOOL_TYPES,
  type MapSchool,
  type MapSchoolCatchment,
} from './school';
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

describe('School enums', () => {
  // The dataset is cast from JSON, so nothing else checks it against the types.
  const schools = JSON.parse(readFileSync('public/data/schools.canonical.json', 'utf8')) as Record<string, unknown>[];
  const outside = (field: string, allowed: readonly string[]) => [...new Set(
    schools.map(school => school[field]).filter(value => value !== undefined && !allowed.includes(value as string)),
  )];

  it('covers every value the canonical dataset ships', () => {
    expect(outside('sector', SCHOOL_SECTORS)).toEqual([]);
    expect(outside('school_type', SCHOOL_TYPES)).toEqual([]);
    expect(outside('legacy_metric_status', LEGACY_METRIC_STATUSES)).toEqual([]);
    expect(outside('religious_affiliation', RELIGIOUS_AFFILIATIONS)).toEqual([]);
  });
});
