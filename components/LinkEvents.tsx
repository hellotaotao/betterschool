"use client";

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { linkEvent } from '@/lib/analyticsEvents';

/**
 * Reports the clicks that show a reader going further (see linkEvent), with
 * the page's theme attached so the theme experiment's groups can be compared
 * even where Web Analytics does not pick the flag values up from the page.
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
      track(found.name, {
        ...found.data,
        theme: document.documentElement.getAttribute('data-theme') ?? 'unknown',
      });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
