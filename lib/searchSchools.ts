import type { MapSchool } from '@/types/school';

export type SearchResult =
  | { type: 'school'; school: MapSchool }
  | { type: 'place'; label: string; state: string; postcode?: string; schools: MapSchool[] };

const MAX_RESULTS = 8;
const RESERVED_PLACE_SLOTS = 3;

export function searchSchools(rawQuery: string, schools: MapSchool[]): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];

  if (/^\d+$/.test(query)) {
    const byPostcode = new Map<string, MapSchool[]>();
    for (const s of schools) {
      if (s.postcode && s.postcode.startsWith(query)) {
        const arr = byPostcode.get(s.postcode) ?? [];
        arr.push(s);
        byPostcode.set(s.postcode, arr);
      }
    }
    return [...byPostcode.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, MAX_RESULTS)
      .map(([postcode, group]) => ({
        type: 'place' as const,
        label: postcode,
        state: group[0].state,
        postcode,
        schools: group,
      }));
  }

  // School name matches, ranked: 0 startsWith, 1 word-boundary, 2 includes.
  const nameMatches: { school: MapSchool; rank: number }[] = [];
  for (const s of schools) {
    const name = s.school_name.toLowerCase();
    const idx = name.indexOf(query);
    if (idx === -1) continue;
    const rank = idx === 0 ? 0 : name[idx - 1] === ' ' ? 1 : 2;
    nameMatches.push({ school: s, rank });
  }
  nameMatches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aScored = a.school.legacy_metric_status === 'available' ? 0 : 1;
    const bScored = b.school.legacy_metric_status === 'available' ? 0 : 1;
    if (aScored !== bScored) return aScored - bScored;
    return a.school.school_name.localeCompare(b.school.school_name);
  });

  // Suburb matches grouped by suburb+state.
  const bySuburb = new Map<string, MapSchool[]>();
  for (const s of schools) {
    if (s.suburb && s.suburb.toLowerCase().includes(query)) {
      const key = `${s.suburb}|${s.state}`;
      const arr = bySuburb.get(key) ?? [];
      arr.push(s);
      bySuburb.set(key, arr);
    }
  }
  const placeResults: SearchResult[] = [...bySuburb.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, group]) => {
      const [suburb, state] = key.split('|');
      return { type: 'place', label: `${suburb}, ${state}`, state, schools: group };
    });

  const schoolResults: SearchResult[] = nameMatches.map(m => ({ type: 'school', school: m.school }));

  // Reserve up to RESERVED_PLACE_SLOTS for places so a suburb/postcode lookup
  // stays visible even when many schools share the query in their name
  // (e.g. "Parramatta" matches 11 school names plus the suburb).
  const reserved = Math.min(placeResults.length, RESERVED_PLACE_SLOTS);
  const schoolsShown = schoolResults.slice(0, MAX_RESULTS - reserved);
  const placesShown = placeResults.slice(0, MAX_RESULTS - schoolsShown.length);
  return [...schoolsShown, ...placesShown];
}
