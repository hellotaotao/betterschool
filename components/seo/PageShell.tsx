import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
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
 * max-width document layout with explicit colours — `globals.css` flips the
 * body to a dark palette under `prefers-color-scheme`, which would otherwise
 * leave dark text on a dark ground here.
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
}) {
  const t = getSeo(locale).shell;
  const width = wide ? 'max-w-6xl' : 'max-w-3xl';
  const other: Locale = locale === 'zh' ? 'en' : 'zh';

  return (
    <div lang={htmlLang(locale)} className="min-h-screen bg-white font-sans text-gray-900 antialiased">
      <header className="border-b border-gray-200">
        <div className={`mx-auto ${width} px-4 py-3 flex items-center justify-between gap-4`}>
          <Link href={mapUrl({ locale })} className="text-sm font-bold text-indigo-700 hover:underline">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-4">
            <Link href={browsePath(locale)} className="text-xs text-gray-500 hover:text-indigo-700 hover:underline">
              {t.browseByState}
            </Link>
            <Link href={mapUrl({ locale })} className="text-xs text-gray-500 hover:text-indigo-700 hover:underline">
              {t.openMap} →
            </Link>
            <Link
              href={toLocalePath(bareEnglishPath, other)}
              hrefLang={htmlLang(other)}
              className="text-xs font-medium text-indigo-700 hover:underline"
            >
              {t.otherLanguage}
            </Link>
          </div>
        </div>
      </header>

      <nav aria-label={t.breadcrumb} className={`mx-auto ${width} px-4 pt-4`}>
        <ol className="flex flex-wrap gap-1 text-xs text-gray-500">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <span aria-hidden="true">/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-indigo-700 hover:underline">{crumb.label}</Link>
              ) : (
                <span className="text-gray-700">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <main className={`mx-auto ${width} px-4 py-6`}>{children}</main>

      <footer className="border-t border-gray-200 mt-12">
        {/*
          Identity first: a footer is read as "whose site is this", so a bare
          list of government domains reads as if we were one of them. The
          source line stays because the state catchment layers are CC BY.
        */}
        <div className={`mx-auto ${width} px-4 py-6 space-y-1 text-xs text-gray-400`}>
          <p className="text-gray-500">
            © {new Date().getFullYear()} BetterSchool.au
          </p>
          <p className="flex flex-wrap gap-x-2">
            <span>{t.footerLabel}</span>
            <a
              className="hover:text-gray-600 hover:underline"
              href="https://www.acara.edu.au/contact-us/acara-data-access"
              target="_blank"
              rel="noreferrer"
            >
              {t.acaraLinkText}{dataYear ? ` ${dataYear}` : ''}
            </a>
            {sourceLinks.map(source => (
              <a
                key={source.url}
                className="before:mr-2 before:content-['·'] hover:text-gray-600 hover:underline"
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
