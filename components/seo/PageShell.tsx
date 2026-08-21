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
}: {
  locale: Locale;
  /** Unprefixed path of this page, used to build the language switch link. */
  bareEnglishPath: string;
  crumbs: Crumb[];
  children: React.ReactNode;
  dataYear?: number;
}) {
  const t = getSeo(locale).shell;
  const other: Locale = locale === 'zh' ? 'en' : 'zh';

  return (
    <div lang={htmlLang(locale)} className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
          <Link href={mapUrl({ locale })} className="text-sm font-bold text-indigo-700 hover:underline">
            {SITE_NAME}
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

      <nav aria-label={t.breadcrumb} className="mx-auto max-w-3xl px-4 pt-4">
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

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <footer className="border-t border-gray-200 mt-12">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-2 text-xs text-gray-500">
          <p>
            {t.footerData}
            {dataYear ? ` (${dataYear})` : ''}
          </p>
          <p className="flex flex-wrap gap-x-3">
            <a
              className="text-indigo-700 hover:underline"
              href="https://www.acara.edu.au/contact-us/acara-data-access"
              target="_blank"
              rel="noreferrer"
            >
              {t.acaraLinkText} →
            </a>
            <a
              className="text-indigo-700 hover:underline"
              href="https://data.nsw.gov.au/data/dataset/nsw-education-school-intake-zones-catchment-areas-for-nsw-government-schools"
              target="_blank"
              rel="noreferrer"
            >
              {t.nswLinkText} →
            </a>
          </p>
          <p>{t.footerStance}</p>
        </div>
      </footer>
    </div>
  );
}
