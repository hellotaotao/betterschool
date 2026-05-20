import { School, SchoolSector, SchoolType } from '@/types/school';

export interface FilterState {
  sector: 'all' | SchoolSector | 'Non-government';
  minScore: 'all' | '80' | '90' | '95';
  schoolType: 'all' | SchoolType;
  dataLayer: 'all' | 'scored';
}

export function hasLegacyScore(school: School): school is School & { legacy_score: number; legacy_rank: number } {
  return school.legacy_metric_status === 'available'
    && Number.isFinite(school.legacy_score)
    && Number.isFinite(school.legacy_rank);
}

/**
 * Compute the marker radius from legacy score in pixels.
 * Uses a quadratic curve so higher legacy scores stand out more clearly.
 * score 60 -> radius 4; score 100 -> radius 32
 */
export function getMarkerRadius(score: number | undefined): number {
  if (score === undefined || !Number.isFinite(score)) return 5;
  const clamped = Math.max(60, Math.min(100, score));
  const t = (clamped - 60) / 40;
  return 4 + t * t * 28;
}

/** Linearly interpolate between two hex colors. */
function interpolateHex(color1: string, color2: string, t: number): string {
  const parse = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(color1);
  const [r2, g2, b2] = parse(color2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Compute the marker color from optional legacy score and official ACARA sector. */
export function getMarkerColor(score: number | undefined, sector: string): string {
  if (score === undefined || !Number.isFinite(score)) return '#9ca3af';
  const t = Math.max(0, Math.min(1, (score - 60) / 40));
  return sector === 'Government'
    ? interpolateHex('#86efac', '#15803d', t)
    : interpolateHex('#fed7aa', '#c2410c', t);
}

function matchesSector(schoolSector: string, filterSector: FilterState['sector']): boolean {
  if (filterSector === 'all') return true;
  if (filterSector === 'Non-government') return schoolSector !== 'Government';
  return schoolSector === filterSector;
}

/** Filter schools by the active controls. */
export function filterSchools(schools: School[], filters: FilterState): School[] {
  return schools.filter(school => {
    if (!matchesSector(school.sector, filters.sector)) return false;
    if (filters.dataLayer === 'scored' && !hasLegacyScore(school)) return false;
    if (filters.minScore !== 'all' && (!hasLegacyScore(school) || school.legacy_score < parseInt(filters.minScore))) return false;
    if (filters.schoolType !== 'all' && school.school_type !== filters.schoolType) return false;
    return true;
  });
}
