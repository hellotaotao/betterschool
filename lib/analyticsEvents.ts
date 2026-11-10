/**
 * Which clicks count as the reader going further, for comparing the theme
 * experiment's groups. Pure functions; the listener lives in
 * components/LinkEvents.tsx.
 */

export type PageKind = 'map' | 'school' | 'suburb' | 'catchment' | 'ranking' | 'browse' | 'state' | 'other';

/** The family a path belongs to, with the /zh prefix ignored. */
export function pageKind(pathname: string): PageKind {
  const parts = pathname.replace(/^\/zh(?=\/|$)/, '').split('/').filter(Boolean);
  const [first, , third] = parts;
  if (first === 'schools') return 'map';
  if (first === 'school' || first === 'catchment' || first === 'ranking' || first === 'browse') return first;
  if (first === 'suburb') return third ? 'suburb' : 'state';
  return 'other';
}

export interface LinkEvent {
  name: 'map_open' | 'profile_open';
  data: { from: PageKind; to: PageKind };
}

/**
 * The two steps that matter: a reading page sending the reader into the map,
 * and the map sending them to a full profile or zone page. Ordinary
 * navigation between reading pages is already in the page views.
 */
export function linkEvent(fromPath: string, toPath: string): LinkEvent | null {
  const from = pageKind(fromPath);
  const to = pageKind(toPath);
  if (to === 'map' && from !== 'map') return { name: 'map_open', data: { from, to } };
  if (from === 'map' && (to === 'school' || to === 'catchment' || to === 'suburb')) {
    return { name: 'profile_open', data: { from, to } };
  }
  return null;
}
