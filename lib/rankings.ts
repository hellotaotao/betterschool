import { displayRanks, metricValue, sortByMetric } from './schoolCompare';

// State-wide ranking pages: one school type, optionally one sector, ranked by
// ICSEA. Types follow ACARA's school_type so a ranking agrees with the state
// percentage on each school's own page, which uses the same pools.

export const RANKING_TYPES = ['Primary', 'Secondary', 'Combined'] as const;
export type RankingType = typeof RANKING_TYPES[number];

export const RANKING_SECTORS = ['Government', 'Catholic', 'Independent'] as const;
export type RankingSector = typeof RANKING_SECTORS[number];

/** Same floor as the state percentage on school pages: below it a rank is noise. */
export const RANKING_MIN_SCHOOLS = 20;
/** Rows listed per page; ties at the cut-off are all kept. */
export const RANKING_LIMIT = 100;

export interface RankingKey {
  schoolType: RankingType;
  /** null = every sector. */
  sector: RankingSector | null;
}

/** `primary`, `primary-government`, … */
export function rankingSlug({ schoolType, sector }: RankingKey): string {
  return sector ? `${schoolType}-${sector}`.toLowerCase() : schoolType.toLowerCase();
}

export function parseRankingSlug(slug: string): RankingKey | null {
  const [typePart, sectorPart, ...rest] = slug.split('-');
  if (rest.length > 0) return null;
  const schoolType = RANKING_TYPES.find(type => type.toLowerCase() === typePart);
  if (!schoolType) return null;
  if (sectorPart === undefined) return { schoolType, sector: null };
  const sector = RANKING_SECTORS.find(entry => entry.toLowerCase() === sectorPart);
  return sector ? { schoolType, sector } : null;
}

type Rankable = Parameters<typeof sortByMetric>[0][number];

export interface RankedRow<T> {
  school: T;
  rank: number;
}

/**
 * Schools with an ICSEA value, highest first, cut at `limit` by rank rather
 * than by row so a tie straddling the cut-off is not split. Returns null when
 * fewer than `minSchools` have a value.
 */
export function topByIcsea<T extends Rankable>(
  schools: readonly T[],
  limit = RANKING_LIMIT,
  minSchools = RANKING_MIN_SCHOOLS,
): { rows: RankedRow<T>[]; ranked: number } | null {
  const withValue = schools.filter(school => metricValue(school, 'icsea') !== null);
  if (withValue.length < minSchools) return null;
  const sorted = sortByMetric(withValue, 'icsea');
  const ranks = displayRanks(sorted, 'icsea');
  const rows: RankedRow<T>[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const rank = ranks[index] as number;
    if (rank > limit) break;
    rows.push({ school: sorted[index], rank });
  }
  return { rows, ranked: withValue.length };
}
