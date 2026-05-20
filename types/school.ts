export type SchoolSector = 'Government' | 'Catholic' | 'Independent' | string;

export type SchoolType = 'Primary' | 'Combined' | 'Secondary' | 'Special' | string;

export type LegacyMetricStatus = 'available' | 'unavailable' | 'ambiguous_unmatched' | string;

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
  governing_body?: string;
  governing_body_url?: string;
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
