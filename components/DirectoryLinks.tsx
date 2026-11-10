"use client";

import Link from 'next/link';
import { Locale, Messages } from '@/lib/i18n';
import { browsePath, stateIndexPath } from '@/lib/slug';

/** States in school-count order, matching how /browse lists them. */
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'] as const;

/**
 * The map app's crawlable way into the directory.
 *
 * /schools is a client route, but Next.js still server-renders client
 * components into the initial HTML, and `locale` is 'en' on that first pass by
 * design — so these hrefs land on the unprefixed English paths a crawler should
 * follow, and only swap to /zh once the reader's language resolves. Without
 * this block every directory URL is reachable from sitemap.xml alone, which
 * announces that a page exists but passes it no link weight.
 *
 * It is a real, visible control rather than a hidden one: links a crawler can
 * see but a reader cannot are the definition of the pattern search engines
 * penalise.
 */
export default function DirectoryLinks({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Messages;
}) {
  return (
    <div className="shrink-0 border-t border-line bg-soft/90 px-3 py-2.5">
      <Link
        href={browsePath(locale)}
        className="block text-xs font-semibold text-link hover:underline"
      >
        {dictionary.directory.browseAll} →
      </Link>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{dictionary.directory.hint}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-muted">{dictionary.directory.byState}</span>
        {STATES.map(state => (
          <Link
            key={state}
            href={stateIndexPath(state, locale)}
            className="text-[11px] font-medium text-ink-2 hover:text-link hover:underline"
          >
            {state}
          </Link>
        ))}
      </div>
    </div>
  );
}
