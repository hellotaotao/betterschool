import type { School } from '@/types/school';
import type { HeroMapLabels } from '@/components/seo/HeroMap';
import { featureFor, type ContextRule, type ZoneInput } from '@/lib/heroMapData';
import { compactYears } from '@/lib/heroMap';
import { formatMessage, getMessages, getSectorLabel } from '@/lib/i18n';
import { getSeo, localeKind, type Locale } from '@/lib/seoLocale';
import { schoolPath } from '@/lib/slug';
import type { MapDot } from '@/lib/heroMapData';

export function mapLabels(locale: Locale, title: string): HeroMapLabels {
  const t = getSeo(locale).map;
  const dictionary = getMessages(locale);
  return {
    title,
    zone: t.zone,
    neighbours: t.neighbours,
    variantSwitch: t.variantSwitch,
    sector: sector => getSectorLabel(sector, dictionary),
  };
}

export const mapHref = (locale: Locale) => (entry: MapDot) => schoolPath(entry.state, entry.slug, locale);

/**
 * A school's current boundaries as switchable map variants. A future zone is
 * not yet where the school draws from, so it stays off the picture.
 *
 * Variants of one kind are told apart by their years ("7, 8, 10, 12"); a
 * school with a primary and a secondary zone, by kind.
 */
export function zoneVariants(locale: Locale, school: School, { futureIfOnly = false } = {}): ZoneInput[] {
  const t = getSeo(locale).catchment;
  const all = school.catchments ?? [];
  const now = all.filter(catchment => catchment.kind !== 'future');
  // A zone page for a school whose only boundary is a future one still draws it.
  const current = now.length === 0 && futureIfOnly ? all : now;
  const oneKind = new Set(current.map(catchment => catchment.kind)).size === 1;
  return current.flatMap(catchment => {
    const feature = featureFor(school, catchment);
    if (!feature) return [];
    const years = catchment.year_levels.length > 0
      ? formatMessage(catchment.year_levels.length === 1 ? t.zoneYearOne : t.zoneYears, { levels: compactYears(catchment.year_levels) })
      : '';
    const kind = formatMessage(t.zoneKind, { kind: localeKind(locale, catchment.kind) });
    const label = oneKind ? years || kind : [kind, years].filter(Boolean).join(' · ');
    return [{ key: catchment.zone_id ?? catchment.geometry_url, label, feature }];
  });
}

/**
 * Neighbouring zones comparable with the first variant drawn. A school with no
 * zone of its own (non-government, selective, or simply none published) gets
 * the zones of its stage around it, outlined only: the families it draws from
 * live in those.
 */
export function contextFor(variants: ZoneInput[], school?: School): ContextRule | null {
  const first = variants[0]?.feature.properties;
  if (first) return { kind: first.kind, year: first.year_levels[0] };
  if (school?.school_type === 'Secondary') return { kind: 'secondary', year: '7' };
  if (school?.school_type === 'Primary' || school?.school_type === 'Combined') return { kind: 'primary' };
  return null;
}
