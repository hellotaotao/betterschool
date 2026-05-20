export type SchoolSector = 'Government' | 'Non-government';

export type SchoolType = 'Primary' | 'Combined' | 'Secondary';

export interface School {
  /** Stable deterministic local ID from school_name + postcode + state; future ACARA mapping can attach here. */
  local_id: string;
  school_name: string;
  suburb: string;
  state: string;
  postcode: string;
  /** Legacy imported rank. Treat as rank within the current foundation dataset, not a national rank. */
  rank: number;
  sector: SchoolSector;
  /** Legacy imported score. Treat as a current-dataset reference value, not an authoritative national score. */
  score: number;
  lat: number;
  lng: number;
  address_suburb?: string;
  address_state?: string;
  school_type?: SchoolType;
}
