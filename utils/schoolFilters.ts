import { School, SchoolSector, SchoolType } from '@/types/school';

export type IcseaBucket = 'all' | '900' | '1000' | '1100' | '1200';
export type EnrolmentBucket = 'all' | 'small' | 'medium' | 'large';
export type ReligionFilter = 'all' | 'religious' | 'secular';
export type ZoneOverlayKind = 'off' | 'primary' | 'secondary';

export interface FilterState {
  sector: 'all' | SchoolSector;
  schoolType: 'all' | SchoolType;
  icsea: IcseaBucket;
  enrolments: EnrolmentBucket;
  religion: ReligionFilter;
}

export function hasLegacyScore(school: School): school is School & { legacy_score: number; legacy_rank: number } {
  return school.legacy_metric_status === 'available'
    && Number.isFinite(school.legacy_score)
    && Number.isFinite(school.legacy_rank);
}

/** Radius (px) used for schools whose enrolment count is not published. */
export const UNKNOWN_ENROLMENT_RADIUS = 5;

const MIN_RADIUS = 5;
const MAX_RADIUS = 18;
/** Enrolments at or above this map to MAX_RADIUS; sits between p90 (981) and p99 (2076). */
const ENROLMENT_CAP = 1200;

/**
 * Compute the marker radius (px) from total enrolments.
 *
 * Enrolments come from the official ACARA base and are present for ~90% of
 * schools, so size is a real, nationally consistent signal. Uses a square-root
 * curve so that *area* scales with enrolments — the perceptually correct
 * encoding for circles.
 *
 * Deliberately NOT driven by legacy_score: that metric covers only 8% of
 * schools and is absent for entire states (WA 0, NT 0, QLD 3), which made the
 * map read as "no good schools here" wherever the legacy import had no data.
 */
export function getMarkerRadius(enrolments: number | undefined): number {
  if (enrolments === undefined || !Number.isFinite(enrolments)) return UNKNOWN_ENROLMENT_RADIUS;
  const clamped = Math.max(0, Math.min(ENROLMENT_CAP, enrolments));
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(clamped / ENROLMENT_CAP);
}

/** Marker fill colors, keyed by the official ACARA sector. */
export const SECTOR_COLORS: Record<string, string> = {
  Government: '#16a34a',
  Catholic: '#7c3aed',
  Independent: '#ea580c',
};

/**
 * Catchment outline colours, deliberately outside the sector palette: on this
 * map hue means sector, so a zone boundary must not borrow one of those three.
 * Lives here rather than in SchoolMap because the detail and lookup panels name
 * these colours too, and SchoolMap is a dynamic ssr:false import.
 */
export const CATCHMENT_COLORS: Record<string, { color: string; dashArray?: string }> = {
  primary: { color: '#2563eb' },
  secondary: { color: '#db2777' },
  future: { color: '#64748b', dashArray: '6 4' },
};

const UNKNOWN_SECTOR_COLOR = '#6b7280';

/**
 * Compute the marker color from the official ACARA sector.
 *
 * Sector is present for 100% of schools and is a fact, not an inference, so it
 * is safe to use as the primary visual encoding.
 */
export function getMarkerColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? UNKNOWN_SECTOR_COLOR;
}

function matchesSector(schoolSector: string, filterSector: FilterState['sector']): boolean {
  if (filterSector === 'all') return true;
  return schoolSector === filterSector;
}

function matchesIcsea(school: School, bucket: IcseaBucket): boolean {
  if (bucket === 'all') return true;
  return Number.isFinite(school.icsea) && Number(school.icsea) >= Number(bucket);
}

function matchesEnrolmentBucket(school: School, bucket: EnrolmentBucket): boolean {
  if (bucket === 'all') return true;
  if (!Number.isFinite(school.total_enrolments)) return false;

  const enrolments = Number(school.total_enrolments);
  // UI bucket thresholds: small < 300, medium 300-999, large >= 1000 students.
  if (bucket === 'small') return enrolments < 300;
  if (bucket === 'medium') return enrolments >= 300 && enrolments < 1000;
  return enrolments >= 1000;
}

function matchesReligion(school: School, filter: ReligionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'religious') return school.is_religious === true;
  return school.is_religious === false; // 'secular'
}

/** Filter schools by the active controls. */
export function filterSchools(schools: School[], filters: FilterState): School[] {
  return schools.filter(school => {
    if (!matchesSector(school.sector, filters.sector)) return false;
    if (!matchesReligion(school, filters.religion)) return false;
    if (filters.schoolType !== 'all' && school.school_type !== filters.schoolType) return false;
    if (!matchesIcsea(school, filters.icsea)) return false;
    if (!matchesEnrolmentBucket(school, filters.enrolments)) return false;
    return true;
  });
}

export function schoolMatchesZoneOverlay(school: School, overlay: ZoneOverlayKind): boolean {
  if (overlay === 'off') return true;
  if (school.sector !== 'Government') return false;
  if (overlay === 'primary') {
    return school.school_type === 'Primary' || school.school_type === 'Combined';
  }
  return school.school_type === 'Secondary' || school.school_type === 'Combined';
}

/** Keep browse markers relevant without hiding Government schools that are unzoned. */
export function filterSchoolsForZoneOverlay(schools: School[], overlay: ZoneOverlayKind): School[] {
  if (overlay === 'off') return schools;
  return schools.filter(school => schoolMatchesZoneOverlay(school, overlay));
}
