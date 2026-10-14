/**
 * Canonical origin for absolute URLs (metadata, sitemap, JSON-LD).
 *
 * Vercel exposes the deployment host but not the production domain, so the
 * production value is pinned here and only overridden explicitly. It must be
 * the host Vercel serves rather than redirects: www is the primary domain and
 * the apex 308s to it, so an apex canonical would point every page at a
 * redirect.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.betterschool.au').replace(/\/$/, '');

export const SITE_NAME = 'BetterSchool.au';

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
