import { describe, expect, it } from 'vitest';
import { GEO_COOKIE, geoCookieValue, readGeoCookie } from './ipGeo';

const headers = (values: Record<string, string>) => new Headers(values);

describe('geoCookieValue', () => {
  it('rounds an Australian edge position to about a kilometre', () => {
    expect(geoCookieValue(headers({
      'x-vercel-ip-country': 'AU',
      'x-vercel-ip-latitude': '-33.86785',
      'x-vercel-ip-longitude': '151.20732',
    }))).toBe('-33.87,151.21');
  });

  it('sets nothing outside Australia or without coordinates', () => {
    expect(geoCookieValue(headers({
      'x-vercel-ip-country': 'NZ', 'x-vercel-ip-latitude': '-36.85', 'x-vercel-ip-longitude': '174.76',
    }))).toBeNull();
    expect(geoCookieValue(headers({ 'x-vercel-ip-country': 'AU' }))).toBeNull();
    expect(geoCookieValue(headers({}))).toBeNull();
  });
});

describe('readGeoCookie', () => {
  it('reads the position among other cookies', () => {
    expect(readGeoCookie(`a=1; ${GEO_COOKIE}=-33.87%2C151.21; b=2`)).toEqual([-33.87, 151.21]);
  });

  it('ignores a missing or tampered value', () => {
    expect(readGeoCookie('a=1')).toBeNull();
    expect(readGeoCookie(`${GEO_COOKIE}=51.5,-0.12`)).toBeNull();
    expect(readGeoCookie(`${GEO_COOKIE}=nonsense`)).toBeNull();
  });
});
