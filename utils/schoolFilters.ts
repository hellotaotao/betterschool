import { School } from '@/types/school';

export interface FilterState {
  sector: 'all' | 'Government' | 'Non-government';
  minScore: 'all' | '80' | '90' | '95';
  schoolType: 'all' | 'Primary' | 'Combined' | 'Secondary';
}

/**
 * 根据 score 计算地图圆点半径（px）。
 * score 60 → radius 5; score 100 → radius 18
 */
export function getMarkerRadius(score: number): number {
  const clamped = Math.max(60, Math.min(100, score));
  return 5 + ((clamped - 60) / 40) * 13;
}

/**
 * 按筛选条件过滤学校列表。
 */
export function filterSchools(schools: School[], filters: FilterState): School[] {
  return schools.filter(school => {
    if (filters.sector !== 'all' && school.sector !== filters.sector) return false;
    if (filters.minScore !== 'all' && school.score < parseInt(filters.minScore)) return false;
    if (filters.schoolType !== 'all' && school.school_type !== filters.schoolType) return false;
    return true;
  });
}
