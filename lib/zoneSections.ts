/**
 * Groups a school's published zone variants by the schools they contain.
 *
 * VIC publishes a separate secondary boundary per year level, and QLD splits
 * junior from senior. The boundaries differ, but usually not by enough to move
 * any school across them, so one list per variant printed the same cards two
 * or three times under the same heading. Variants of one kind that hold exactly
 * the same schools share a section; variants that hold different schools keep
 * their own, labelled by year so their headings no longer collide.
 */

export interface ZoneSectionInput<C extends ZoneVariant, S> {
  catchment: C;
  inside: S[];
  suburbs: string[];
}

export interface ZoneVariant {
  kind: string;
  year_levels: string[];
}

export interface MergedZoneSection<C extends ZoneVariant, S> {
  kind: string;
  catchments: C[];
  inside: S[];
  suburbs: string[];
  /** Year levels across the merged variants, set only when another section of the same kind exists. */
  distinguishingYears: string[] | null;
}

export function mergeZoneSections<C extends ZoneVariant, S>(
  sections: ZoneSectionInput<C, S>[],
  schoolKey: (school: S) => string,
): MergedZoneSection<C, S>[] {
  const merged: MergedZoneSection<C, S>[] = [];
  const byKey = new Map<string, MergedZoneSection<C, S>>();

  for (const section of sections) {
    const key = `${section.catchment.kind}\u0000${section.inside.map(schoolKey).sort().join('\u0000')}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.catchments.push(section.catchment);
      continue;
    }
    const entry: MergedZoneSection<C, S> = {
      kind: section.catchment.kind,
      catchments: [section.catchment],
      inside: section.inside,
      suburbs: section.suburbs,
      distinguishingYears: null,
    };
    byKey.set(key, entry);
    merged.push(entry);
  }

  const perKind = new Map<string, number>();
  for (const entry of merged) perKind.set(entry.kind, (perKind.get(entry.kind) ?? 0) + 1);
  for (const entry of merged) {
    if ((perKind.get(entry.kind) ?? 0) < 2) continue;
    const years = new Set(entry.catchments.flatMap(catchment => catchment.year_levels));
    entry.distinguishingYears = [...years].sort(compareYearLevels);
  }

  return merged;
}

function compareYearLevels(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na)) return 1;
  if (Number.isFinite(nb)) return -1;
  return a.localeCompare(b);
}
