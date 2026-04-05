export interface School {
  school_name: string;
  suburb: string;
  state: string;
  postcode: string;
  rank: number;
  sector: string;
  score: number;
  lat: number;
  lng: number;
  address_suburb?: string;
  address_state?: string;
  school_type?: string;
}
