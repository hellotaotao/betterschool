import Image from 'next/image';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';
import { getSeo, htmlLang, type Locale } from '@/lib/seoLocale';
import { browsePath, mapUrl, toLocalePath } from '@/lib/slug';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Document chrome for the SEO pages.
 *
 * These are read-first pages, not the map app, so they get an ordinary
 * max-width document layout. Every colour and font comes from the theme tokens
 * (`bs-page` and the semantic utilities in globals.css), never the body's
 * `prefers-color-scheme` palette, which would leave dark text on a dark ground.
 *
 * `lang` sits on this wrapper rather than on <html>: only the root layout can
 * render <html>, and reading the locale there would force every page out of
 * static rendering. An element-level lang still scopes correctly for screen
 * readers, and hreflang is what search engines target on.
 */
export default function PageShell({
  locale,
  bareEnglishPath,
  crumbs,
  children,
  dataYear,
  sourceLinks = [],
  wide = false,
  split,
}: {
  locale: Locale;
  /** Unprefixed path of this page, used to build the language switch link. */
  bareEnglishPath: string;
  crumbs: Crumb[];
  children: React.ReactNode;
  dataYear?: number;
  sourceLinks?: { url: string; label: string }[];
  /** For a page whose body is one wide table: the reading measure would wrap every school name onto three lines. */
  wide?: boolean;
  /**
   * Map-first title band, full width above the body: `side` is the title
   * block and gets the breadcrumb, `map` is drawn beside it.
   */
  split?: { map: React.ReactNode; side: React.ReactNode };
}) {
  const t = getSeo(locale).shell;
  const width = wide ? 'max-w-6xl' : 'max-w-4xl';
  const other: Locale = locale === 'zh' ? 'en' : 'zh';

  return (
    <div lang={htmlLang(locale)} className="bs-page min-h-screen antialiased">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto ${width} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3`}>
          <Link href={mapUrl({ locale })} className="inline-flex items-center gap-2 text-ink">
            <Image src="/brand/mark.svg" width={28} height={28} alt="" unoptimized />
            <span className="font-display text-xl font-bold tracking-tight">{SITE_NAME}</span>
          </Link>
          <nav aria-label={t.mainNav} className="flex items-center gap-5 text-sm font-semibold">
            <Link href={browsePath(locale)} className="text-ink-2 hover:text-link">
              {t.browseByState}
            </Link>
            <Link href={mapUrl({ locale })} className="text-ink-2 hover:text-link">
              {t.openMap} →
            </Link>
            <Link href={toLocalePath(bareEnglishPath, other)} hrefLang={htmlLang(other)} className="text-link">
              {t.otherLanguage}
            </Link>
          </nav>
        </div>
      </header>

      {split ? (
        <div className="bs-split">
          <div className="bs-split-side">
            <Breadcrumbs label={t.breadcrumb} crumbs={crumbs} />
            {split.side}
          </div>
          {split.map}
        </div>
      ) : (
        <div className={`mx-auto ${width} px-4 pt-5`}>
          <Breadcrumbs label={t.breadcrumb} crumbs={crumbs} />
        </div>
      )}

      <main className={`bs-main mx-auto ${width} px-4 ${split ? 'pt-6' : 'pt-4'} pb-12`}>{children}</main>

      <footer className="border-t border-line bg-surface">
        {/*
          Identity first: a footer is read as "whose site is this", so a bare
          list of government domains reads as if we were one of them. The
          source line stays because the state catchment layers are CC BY.
        */}
        <div className={`mx-auto ${width} space-y-1 px-4 py-6 text-sm text-muted`}>
          <p className="font-display text-base font-bold text-ink">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
          <p className="flex flex-wrap gap-x-2">
            <span>{t.footerLabel}</span>
            <a
              className="hover:text-link hover:underline"
              href="https://www.acara.edu.au/contact-us/acara-data-access"
              target="_blank"
              rel="noreferrer"
            >
              {t.acaraLinkText}{dataYear ? ` ${dataYear}` : ''}
            </a>
            {sourceLinks.map(source => (
              <a
                key={source.url}
                className="before:mr-2 before:content-['·'] hover:text-link hover:underline"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.label}
              </a>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}

function Breadcrumbs({ label, crumbs }: { label: string; crumbs: Crumb[] }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap gap-1.5 text-sm text-muted">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">›</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-link hover:underline">{crumb.label}</Link>
            ) : (
              <span className="text-ink-2">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
