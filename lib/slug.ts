import { School } from '@/types/school';

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

export function schoolPath(state: string, slug: string): string {
  return `/school/${stateSlug(state)}/${slug}`;
}

export function suburbPath(state: string, suburb: string): string {
  return `/suburb/${stateSlug(state)}/${suburbSlug(suburb)}`;
}

export function catchmentPath(state: string, slug: string): string {
  return `/catchment/${stateSlug(state)}/${slug}`;
}
