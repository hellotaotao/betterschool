/**
 * Canonical origin for absolute URLs (metadata, sitemap, JSON-LD).
 *
 * Vercel exposes the deployment host but not the production domain, so the
 * production value is pinned here and only overridden explicitly.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://betterschool.au').replace(/\/$/, '');

export const SITE_NAME = 'BetterSchool.au';

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/** Full state names, for prose and page titles. */
export const STATE_NAMES: Record<string, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
};

export function stateName(state: string): string {
  return STATE_NAMES[state] ?? state;
}
