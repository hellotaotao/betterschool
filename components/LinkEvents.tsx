"use client";

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { experimentGroup, linkEvent } from '@/lib/analyticsEvents';
import { THEME_EXPERIMENT } from '@/lib/theme';

/**
 * Reports the clicks that show a reader going further (see linkEvent). For a
 * visitor in the theme experiment the event also carries their group as
 * `theme`, a second copy of what Web Analytics reads from the flag values;
 * a visitor outside it, a `?theme=` preview included, carries none.
 * One delegated listener: the links are rendered by server components that
 * cannot carry click handlers.
 */
export default function LinkEvents() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      const found = linkEvent(window.location.pathname, target.pathname);
      if (!found) return;
      const group = THEME_EXPERIMENT
        ? experimentGroup(document.querySelector('script[data-flag-values]')?.textContent, THEME_EXPERIMENT.flag)
        : null;
      track(found.name, group ? { ...found.data, theme: group } : found.data);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
