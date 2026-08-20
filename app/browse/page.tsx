import type { Metadata } from 'next';
import Link from 'next/link';
import { getSchoolsDataset, getStateSummaries } from '@/lib/schoolsData';
import { absoluteUrl, SITE_NAME, stateName } from '@/lib/site';
import PageShell from '@/components/seo/PageShell';

const DESCRIPTION =
  'Browse every Australian school by state and suburb: official ACARA profiles for 11,034 schools '
  + 'plus NSW government intake zones. No ranking, no composite score.';

export const metadata: Metadata = {
  title: 'Browse Australian schools by state and suburb',
  description: DESCRIPTION,
  alternates: { canonical: '/browse' },
  openGraph: {
    title: `Browse Australian schools | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/browse'),
    type: 'website',
  },
};

export default function BrowsePage() {
  const states = getStateSummaries();
  const dataset = getSchoolsDataset();
  const totalSuburbs = dataset.suburbs.size;

  return (
    <PageShell dataYear={2025} crumbs={[{ label: 'Browse' }]}>
      <h1 className="text-2xl font-bold tracking-tight">Browse Australian schools</h1>
      <p className="mt-2 text-sm text-gray-600">
        {dataset.schools.length.toLocaleString()} schools across {totalSuburbs.toLocaleString()} suburbs,
        from the official ACARA 2025 collection. Pick a state to see its suburbs, or go straight to the
        map to search by address.
      </p>

      <div className="mt-4">
        <Link
          href="/schools"
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Open the map
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="states">
        <h2 id="states" className="text-base font-semibold">States and territories</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {states.map(summary => (
            <li key={summary.slug}>
              <Link
                href={`/suburb/${summary.slug}`}
                className="block rounded-lg border border-gray-200 p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
              >
                <span className="block text-sm font-semibold text-gray-900">
                  {stateName(summary.state)}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {summary.schools.toLocaleString()} schools · {summary.suburbs.length.toLocaleString()} suburbs
                  {summary.zoned > 0 && ` · ${summary.zoned.toLocaleString()} with an intake zone`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg bg-gray-50 p-3">
        <h2 className="text-sm font-semibold">Intake zones</h2>
        <p className="mt-1 text-xs text-gray-600">
          Zone boundaries currently cover NSW government schools only. Zones apply to government
          schools alone — Catholic and Independent schools admit on their own criteria and have no
          geographic zone. Other states are not yet collected, which is different from having none.
        </p>
      </section>
    </PageShell>
  );
}
