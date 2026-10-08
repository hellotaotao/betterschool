/**
 * Approximate visitor position for the map's opening view.
 *
 * The edge already knows roughly where a request came from — Vercel stamps
 * x-vercel-ip-* on every request — so proxy.ts copies it into a short-lived
 * cookie and the map reads that. This replaces calling three third-party IP
 * lookup services from the browser, each of which received the visitor's IP
 * address before the visitor had done anything.
 */
export const GEO_COOKIE = 'bs_ip_geo';

/** About 1 km: enough to centre a city-level view, no finer. */
const PRECISION = 2;

/**
 * Cookie value for a request's edge geolocation, or null to set none.
 *
 * Only Australian positions are kept. An overseas visitor centred on their own
 * city would see a map with no schools on it, which is worse than the default
 * whole-of-Australia view.
 */
export function geoCookieValue(headers: Pick<Headers, 'get'>): string | null {
  if (headers.get('x-vercel-ip-country') !== 'AU') return null;
  const lat = Number(headers.get('x-vercel-ip-latitude'));
  const lng = Number(headers.get('x-vercel-ip-longitude'));
  if (!isAustralian(lat, lng)) return null;
  return `${lat.toFixed(PRECISION)},${lng.toFixed(PRECISION)}`;
}

/** [lat, lng] from a document.cookie string, or null when absent or malformed. */
export function readGeoCookie(cookie: string): [number, number] | null {
  const entry = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${GEO_COOKIE}=`));
  if (!entry) return null;
  const [lat, lng] = decodeURIComponent(entry.slice(GEO_COOKIE.length + 1)).split(',').map(Number);
  return isAustralian(lat, lng) ? [lat, lng] : null;
}

/** Inside the mainland-plus-Tasmania envelope the dataset's coordinates use. */
export function isAustralian(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -44.5 && lat <= -9 && lng >= 112 && lng <= 154;
}
