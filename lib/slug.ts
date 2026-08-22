import { School } from '@/types/school';
// Type-only: erased at build time, so this stays free of the message bundles.
import type { Locale } from './i18n';

/**
 * Lowercase ASCII slug. Apostrophes and '&' become separators rather than being
 * dropped, so "St Joseph's" reads as "st-joseph-s" consistently everywhere.
 */
export function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stateSlug(state: string): string {
  return state.toLowerCase();
}

export function suburbSlug(suburb: string): string {
  return slugify(suburb);
}

/** Base slug before any collision suffix. */
function baseSchoolSlug(school: School): string {
  return slugify(`${school.school_name} ${school.suburb}`);
}

/**
 * Build a stable slug per school, keyed by state.
 *
 * School names repeat heavily inside a state — NSW alone has 47 schools called
 * "St Joseph's Primary School" — so the suburb is part of the slug rather than
 * an afterthought. That resolves 11,033 of 11,034 schools uniquely. The one
 * remainder is a genuine duplicate in ACARA (two entities for Hubbard's School,
 * Milton QLD), and only those get an `-<acara_sml_id>` suffix, so a rename
 * elsewhere can never churn the other 11,032 URLs.
 */
export function buildSchoolSlugs(schools: School[]): Map<string, string> {
  const byKey = new Map<string, School[]>();
  for (const school of schools) {
    const key = `${stateSlug(school.state)}/${baseSchoolSlug(school)}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(school);
    else byKey.set(key, [school]);
  }

  const slugs = new Map<string, string>();
  for (const [, bucket] of byKey) {
    const unique = bucket.length === 1;
    for (const school of bucket) {
      slugs.set(school.id, unique ? baseSchoolSlug(school) : `${baseSchoolSlug(school)}-${school.acara_sml_id}`);
    }
  }
  return slugs;
}

/**
 * URL prefix per locale.
 *
 * English keeps the bare paths it already publishes — those URLs are in the
 * sitemap and must not move — and Chinese lives under /zh.
 */
export function localePrefix(locale: Locale = 'en'): string {
  return locale === 'zh' ? '/zh' : '';
}

export function schoolPath(state: string, slug: string, locale: Locale = 'en'): string {
  return `${localePrefix(locale)}/school/${stateSlug(state)}/${slug}`;
}

export function suburbPath(state: string, suburb: string, locale: Locale = 'en'): string {
  return `${localePrefix(locale)}/suburb/${stateSlug(state)}/${suburbSlug(suburb)}`;
}

export function catchmentPath(state: string, slug: string, locale: Locale = 'en'): string {
  return `${localePrefix(locale)}/catchment/${stateSlug(state)}/${slug}`;
}

export function browsePath(locale: Locale = 'en'): string {
  return `${localePrefix(locale)}/browse`;
}

export function stateIndexPath(state: string, locale: Locale = 'en'): string {
  return `${localePrefix(locale)}/suburb/${stateSlug(state)}`;
}

/**
 * The map app is a single client-rendered route shared by both locales — it
 * picks its own language, and search engines never see it, so a /zh twin would
 * add maintenance for no gain.
 */
export function mapPath(): string {
  return '/schools';
}

/**
 * Link into the map app.
 *
 * `locale` becomes ?lang=, which the app treats as an explicit instruction: a
 * reader who arrived on the Chinese page and taps "打开地图" should not be
 * handed back to English because their browser happens to be set that way.
 * robots.txt already keeps /schools? out of the index, so the extra parameter
 * costs nothing in search.
 */
export function mapUrl(options: {
  locale?: Locale;
  school?: number;
  catchment?: boolean;
  /** Open the map fitted to one suburb's schools. */
  suburb?: { state: string; suburb: string };
} = {}): string {
  const params = new URLSearchParams();
  if (Number.isFinite(options.school)) params.set('school', String(options.school));
  if (options.catchment) params.set('catchment', '1');
  if (options.suburb) {
    params.set('suburb', suburbSlug(options.suburb.suburb));
    params.set('state', stateSlug(options.suburb.state));
  }
  if (options.locale) params.set('lang', options.locale);
  const query = params.toString();
  return query ? `/schools?${query}` : '/schools';
}

/** Swap the locale prefix on an already-built path. */
export function toLocalePath(path: string, locale: Locale): string {
  const bare = path.startsWith('/zh/') ? path.slice(3) : path === '/zh' ? '/' : path;
  return `${localePrefix(locale)}${bare}`;
}

/**
 * Slug for a single school, resolved against the full set.
 *
 * The client only ever needs one school's URL at a time, so this avoids
 * building all 11,034 slugs up front just to link out of the detail panel.
 * Same rule as buildSchoolSlugs: the plain `<name>-<suburb>` slug unless
 * another school in the same state would collide with it.
 */
export function schoolSlugFor(school: School, allSchools: School[]): string {
  const base = baseSchoolSlug(school);
  const state = stateSlug(school.state);
  const collides = allSchools.some(
    other => other.id !== school.id
      && stateSlug(other.state) === state
      && baseSchoolSlug(other) === base,
  );
  return collides ? `${base}-${school.acara_sml_id}` : base;
}
