export type SchoolSector = 'Government' | 'Catholic' | 'Independent' | string;

export type SchoolType = 'Primary' | 'Combined' | 'Secondary' | 'Special' | string;

export type LegacyMetricStatus = 'available' | 'unavailable' | 'ambiguous_unmatched' | string;

export type ReligiousAffiliation =
  | 'Catholic' | 'Anglican' | 'Lutheran' | 'Islamic' | 'Jewish' | 'Christian'
  | 'Adventist' | 'Baptist' | 'Uniting' | 'Presbyterian' | 'Orthodox'
  | 'Secular' | 'Unknown' | string;

export type ReligionSource = 'sector' | 'governing_body' | 'name_explicit' | 'manual';

export interface SchoolFees {
  /** 'exact' when annual_aud_* are real figures; 'band' when only a bucket is known. */
  fee_precision: 'exact' | 'band';
  annual_aud_min?: number | null;
  annual_aud_max?: number | null;
  band: 'free' | 'low' | 'medium' | 'high' | 'premium' | 'unknown';
  fee_year?: number;
  fee_source: 'government_free' | 'diocese_schedule' | 'school_website' | 'manual';
  source_url?: string;
}

export type CatchmentKind = 'primary' | 'secondary' | 'future';

/**
 * A government school's intake zone. Government schools only — non-government
 * schools admit on their own criteria (parish, siblings, entrance exam) and have
 * no geographic zone at all.
 */
export interface SchoolCatchment {
  /** Static GeoJSON Feature, fetched on demand — geometry never ships in the canonical file. */
  geometry_url: string;
  /** Stable identity for one distinct boundary variant. */
  zone_id?: string;
  kind: CatchmentKind;
  /** The source's own zone label. '+' joined when exact merged rows carry several labels. */
  catch_type: string;
  /**
   * Year levels this zone applies to, e.g. ['K','1',…,'6'].
   *
   * Read from the source's own per-zone flags, never inferred from catch_type
   * or from the school's year range. Empty where the source publishes no
   * per-zone year levels at all — South Australia does not, and six SA schools
   * hold both a primary and a secondary zone, so borrowing the school's
   * designation would claim the primary zone runs to Year 12.
   */
  year_levels: string[];
  /** Future zones only: the year the zone takes effect. */
  effective_year?: number;
  /** The publishing department's own school identifier: NSW USE_ID, SA org_num, or VIC ENTITY_CODE. */
  source_school_code: string;
  /** Enrolment year the boundary applies to. */
  data_year: number;
  source: string;
  source_url: string;
  /** Source ADD_DATE (yyyymmdd) — when the boundary itself last changed. */
  boundary_updated?: string;
}

export interface School {
  /** Canonical deterministic app ID based on ACARA IDs. */
  id: string;
  /** Legacy BetterSchool ID, present only when matched. */
  local_id?: string;
  acara_sml_id: number;
  location_age_id?: number | null;
  school_age_id?: number | null;
  rolled_school_id?: number | null;
  school_name: string;
  suburb: string;
  state: string;
  postcode: string;
  sector: SchoolSector;
  school_type?: SchoolType;
  campus_type?: string;
  year_range?: string;
  special_school?: number;
  geolocation?: string;
  lat: number;
  lng: number;
  icsea?: number;
  icsea_percentile?: number;
  total_enrolments?: number;
  girls?: number;
  boys?: number;
  enrolments_fte?: number;
  lbote_yes_percent?: number;
  lbote_no_percent?: number;
  lbote_not_stated_percent?: number;
  indigenous_percent?: number;
  school_url?: string;
  /** Deep link to the school's My School page (NAPLAN etc.); built from acara_sml_id. */
  myschool_url?: string;
  governing_body?: string;
  governing_body_url?: string;
  /** Religious affiliation (denomination), 'Secular', or 'Unknown'. Inferred — not official ACARA data. */
  religious_affiliation?: ReligiousAffiliation;
  /** true = faith-based, false = secular (Government), null = Unknown. */
  is_religious?: boolean | null;
  /** How religious_affiliation was determined. Absent when Unknown. */
  religion_source?: ReligionSource;
  /** Tuition fees: precise amount preferred, else band; always carries a source. */
  fees?: SchoolFees;
  /** Intake zones. Absent means "no catchment data", not "no catchment". */
  catchments?: SchoolCatchment[];
  /** Optional legacy imported score; not official ACARA data. */
  legacy_score?: number;
  /** Optional legacy imported rank; not official ACARA data. */
  legacy_rank?: number;
  legacy_metric_status: LegacyMetricStatus;
  match_method?: string;
  source?: {
    canonical_base: string;
    metric_layer?: string;
    metadata: string;
    data_year: number;
  };
}

/** The catchment fields the map app reads. Attribution stays on the zone page. */
export type MapSchoolCatchment = Pick<
  SchoolCatchment,
  'geometry_url' | 'zone_id' | 'kind' | 'year_levels' | 'effective_year' | 'data_year'
>;

/**
 * A school as the map app receives it: `/data/schools.client.json`, projected
 * from canonical by scripts/client-schools.mjs. Keep the two in step — a field
 * the app starts reading has to be added to that allowlist too, or it arrives
 * undefined. A full `School` is assignable to this, so shared helpers typed on
 * it serve the server pages as well.
 */
export type MapSchool = Pick<
  School,
  | 'id' | 'acara_sml_id' | 'location_age_id' | 'school_name' | 'suburb' | 'state'
  | 'postcode' | 'lat' | 'lng' | 'sector' | 'school_type' | 'campus_type' | 'year_range'
  | 'icsea' | 'icsea_percentile' | 'total_enrolments' | 'girls' | 'boys'
  | 'lbote_yes_percent' | 'indigenous_percent' | 'school_url' | 'myschool_url'
  | 'governing_body' | 'religious_affiliation' | 'is_religious' | 'fees'
  | 'legacy_score' | 'legacy_rank' | 'legacy_metric_status'
> & { catchments?: MapSchoolCatchment[] };
