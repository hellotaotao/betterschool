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
