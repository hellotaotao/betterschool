/**
 * Visual themes for the SEO pages.
 *
 * The theme is a pure presentation switch: the HTML is identical in every
 * theme and only `<html data-theme>` changes, so crawlers see the same page
 * whichever one a visitor gets. It is resolved in the browser before first
 * paint rather than on the server, because reading a cookie there would force
 * every prerendered page into dynamic rendering.
 */

export const THEMES = ['bright', 'atlas', 'harbour'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'bright';

/** `?theme=` name and the localStorage key that remembers it. */
export const THEME_PARAM = 'theme';
export const THEME_STORAGE_KEY = 'bs-theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The query parameter wins so a link can show a specific theme; otherwise the
 * remembered choice; otherwise the default. Unknown values fall through rather
 * than erroring, since both inputs come from outside.
 */
export function resolveTheme({ query, stored }: { query?: string | null; stored?: string | null }): Theme {
  if (isTheme(query)) return query;
  if (isTheme(stored)) return stored;
  return DEFAULT_THEME;
}

/**
 * Inline script for `<head>`. It mirrors `resolveTheme` and is generated from
 * the same constants so the theme list lives in one place. Storage can throw
 * (private mode, blocked site data), in which case the server's default stands.
 */
export function themeBootScript(): string {
  const themes = JSON.stringify(THEMES);
  return `(function(){try{var t=${themes},q=new URLSearchParams(location.search).get(${JSON.stringify(
    THEME_PARAM,
  )}),k=${JSON.stringify(THEME_STORAGE_KEY)},s=null;try{s=localStorage.getItem(k)}catch(e){}var v=t.indexOf(q)>-1?q:(t.indexOf(s)>-1?s:null);if(v){document.documentElement.setAttribute('data-theme',v);if(v===q){try{localStorage.setItem(k,v)}catch(e){}}}}catch(e){}})();`;
}
