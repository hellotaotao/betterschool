import { NextResponse, type NextRequest } from 'next/server';
import { GEO_COOKIE, geoCookieValue } from './lib/ipGeo';

/**
 * Hands the map its opening position from the edge's own geolocation.
 *
 * Scoped to /schools: it is the only page that centres on the visitor, and
 * every other route stays untouched static output. The page itself is still
 * prerendered; this only adds a cookie to the response.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const value = geoCookieValue(request.headers);
  if (value) {
    response.cookies.set(GEO_COOKIE, value, {
      path: '/schools',
      maxAge: 60 * 60,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }
  return response;
}

export const config = {
  matcher: '/schools',
};
