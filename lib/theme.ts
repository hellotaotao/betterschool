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

/**
 * The running theme experiment, or null when none is.
 *
 * A visitor with no theme of their own is given one at random by these
 * weights and keeps it. The page then carries `{ [flag]: theme }` as Vercel
 * flag values, so Web Analytics attaches the theme to every page view and
 * custom event and the groups can be compared. Changing `id` starts a new
 * draw for everyone; setting this to null ends the test, and every visitor
 * without a manual choice falls back to the default.
 */
export const THEME_EXPERIMENT: { id: string; flag: string; weights: Record<Theme, number> } | null = {
  id: 'theme-ab-2026-11',
  flag: 'theme',
  weights: { bright: 1, atlas: 1, harbour: 1 },
};
/** Holds `<experiment id>:<theme>` for a visitor drawn into the experiment. */
export const EXPERIMENT_STORAGE_KEY = 'bs-theme-ab';

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
 * Inline script for `<head>`, generated from the same constants as the rest
 * of this file so the theme list and experiment live in one place.
 *
 * Order: `?theme=` (remembered, and it takes the visitor out of the
 * experiment, so previews never land in the data) → a remembered manual
 * choice → an earlier draw in the current experiment → a new draw. A visitor
 * whose storage throws gets the server's default and is left out: without
 * storage every page would draw again and the theme would change per page.
 */
export function themeBootScript(): string {
  const experiment = THEME_EXPERIMENT;
  const config = JSON.stringify({
    themes: THEMES,
    param: THEME_PARAM,
    key: THEME_STORAGE_KEY,
    abKey: EXPERIMENT_STORAGE_KEY,
    ab: experiment && {
      id: experiment.id,
      flag: experiment.flag,
      weights: THEMES.map(theme => experiment.weights[theme]),
    },
  });
  return `(function(){try{var c=${config},t=c.themes,d=document.documentElement,q=new URLSearchParams(location.search).get(c.param),ls=null,s=null,a=null,v=null,inAb=false;try{ls=localStorage;s=ls.getItem(c.key);a=ls.getItem(c.abKey)}catch(e){ls=null}if(t.indexOf(q)>-1){v=q;if(ls){try{ls.setItem(c.key,q);ls.removeItem(c.abKey)}catch(e){}}}else if(t.indexOf(s)>-1){v=s}else if(c.ab&&ls){var p=c.ab.id+':',g=a&&a.indexOf(p)===0?a.slice(p.length):null;if(t.indexOf(g)<0){var w=c.ab.weights,n=0,i;for(i=0;i<w.length;i++)n+=w[i];var r=Math.random()*n;g=t[t.length-1];for(i=0;i<w.length;i++){r-=w[i];if(r<0){g=t[i];break}}try{ls.setItem(c.abKey,p+g)}catch(e){g=null}}if(g){v=g;inAb=true}}if(v)d.setAttribute('data-theme',v);if(inAb){var f=document.createElement('script'),o={};o[c.ab.flag]=v;f.type='application/json';f.setAttribute('data-flag-values','');f.textContent=JSON.stringify(o);document.head.appendChild(f)}}catch(e){}})();`;
}
