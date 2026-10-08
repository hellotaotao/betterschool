/**
 * The map app's slice of the canonical dataset.
 *
 * The map downloads every school before it can draw one, so each field here
 * costs every visitor on every visit; the canonical file keeps everything for
 * the server-rendered pages, which read it off disk. An allowlist rather than a
 * denylist: a field added to canonical stays out of the download until the app
 * actually reads it, instead of shipping by default.
 *
 * Keep in step with `MapSchool` in types/school.ts.
 */
export const MAP_SCHOOL_FIELDS = [
  'id',
  'acara_sml_id',
  'location_age_id',
  'school_name',
  'suburb',
  'state',
  'postcode',
  'lat',
  'lng',
  'sector',
  'school_type',
  'campus_type',
  'year_range',
  'icsea',
  'icsea_percentile',
  'total_enrolments',
  'girls',
  'boys',
  'lbote_yes_percent',
  'indigenous_percent',
  'school_url',
  'myschool_url',
  'governing_body',
  'religious_affiliation',
  'is_religious',
  'fees',
  'catchments',
  'legacy_score',
  'legacy_rank',
  'legacy_metric_status',
];

/** What the detail panel and the zone toggle read; attribution lives on the zone page. */
export const MAP_CATCHMENT_FIELDS = [
  'geometry_url',
  'zone_id',
  'kind',
  'year_levels',
  'effective_year',
  'data_year',
];

function pick(record, fields) {
  const out = {};
  for (const field of fields) {
    if (record[field] !== undefined) out[field] = record[field];
  }
  return out;
}

export function toMapSchool(school) {
  const slim = pick(school, MAP_SCHOOL_FIELDS);
  if (Array.isArray(school.catchments)) {
    slim.catchments = school.catchments.map(catchment => pick(catchment, MAP_CATCHMENT_FIELDS));
  }
  return slim;
}
