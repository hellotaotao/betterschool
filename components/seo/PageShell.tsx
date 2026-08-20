import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Document chrome for the prerendered pages.
 *
 * These are read-first pages, not the map app, so they get an ordinary
 * max-width document layout with explicit colours — `globals.css` flips the
 * body to a dark palette under `prefers-color-scheme`, which would otherwise
 * leave dark text on a dark ground here.
 */
export default function PageShell({
  crumbs,
  children,
  dataYear,
}: {
  crumbs: Crumb[];
  children: React.ReactNode;
  dataYear?: number;
}) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/schools" className="text-sm font-bold text-indigo-700 hover:underline">
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/browse" className="text-xs text-gray-500 hover:text-indigo-700 hover:underline">
              Browse by state
            </Link>
            <Link href="/schools" className="text-xs text-gray-500 hover:text-indigo-700 hover:underline">
              Open the map →
            </Link>
          </div>
        </div>
      </header>

      <nav aria-label="Breadcrumb" className="mx-auto max-w-3xl px-4 pt-4">
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
            School identity, location and profile data comes from the{' '}
            <a
              className="text-indigo-700 hover:underline"
              href="https://www.acara.edu.au/contact-us/acara-data-access"
              target="_blank"
              rel="noreferrer"
            >
              ACARA Data Access Program
            </a>
            {dataYear ? ` (${dataYear})` : ''}. NSW intake zones come from{' '}
            <a
              className="text-indigo-700 hover:underline"
              href="https://data.nsw.gov.au/data/dataset/nsw-education-school-intake-zones-catchment-areas-for-nsw-government-schools"
              target="_blank"
              rel="noreferrer"
            >
              Data.NSW
            </a>{' '}
            (CC-BY, NSW Department of Education).
          </p>
          <p>
            {SITE_NAME} publishes no school ranking and no composite quality score. Where a value is
            inferred rather than official, the page says so; where it is not collected, the page says
            that too rather than showing a blank.
          </p>
        </div>
      </footer>
    </div>
  );
}
