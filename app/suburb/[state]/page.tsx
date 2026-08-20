import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStateSummaries, getStateSummary, groupSuburbsByInitial } from '@/lib/schoolsData';
import { suburbPath } from '@/lib/slug';
import { absoluteUrl, SITE_NAME, stateName } from '@/lib/site';
import PageShell from '@/components/seo/PageShell';

interface RouteParams {
  state: string;
}

// Only eight of these, and they are the entry points into the long-tail pages,
// so they are prerendered rather than generated on demand like the pages below.
export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  return getStateSummaries().map(summary => ({ state: summary.slug }));
}

function describe(state: string, schools: number, suburbs: number): string {
  return `Every suburb in ${state} with a school — ${schools.toLocaleString()} schools across `
    + `${suburbs.toLocaleString()} suburbs, from the official ACARA 2025 collection. No ranking.`;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state } = await params;
  const summary = getStateSummary(state);
  if (!summary) return {};

  const full = stateName(summary.state);
  const title = `Schools in ${full}, by suburb`;
  const description = describe(full, summary.schools, summary.suburbs.length);

  return {
    title,
    description,
    alternates: { canonical: `/suburb/${summary.slug}` },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/suburb/${summary.slug}`),
      type: 'website',
    },
  };
}

export default async function StateSuburbIndex({ params }: { params: Promise<RouteParams> }) {
  const { state } = await params;
  const summary = getStateSummary(state);
  if (!summary) notFound();

  const groups = groupSuburbsByInitial(summary.suburbs);
  const full = stateName(summary.state);

  return (
    <PageShell
      dataYear={2025}
      crumbs={[{ label: 'Browse', href: '/browse' }, { label: full }]}
    >
      <h1 className="text-2xl font-bold tracking-tight">Schools in {full}, by suburb</h1>
      <p className="mt-1 text-sm text-gray-500">
        {summary.schools.toLocaleString()} schools · {summary.suburbs.length.toLocaleString()} suburbs
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/schools"
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Open the map
        </Link>
      </div>

      {summary.zoned > 0 ? (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900">
          {summary.zoned.toLocaleString()} government schools in {full} publish an intake zone. A zone
          is set by address, and boundaries can run through the middle of a street — check the address
          itself rather than the suburb.
        </p>
      ) : (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          Intake zone boundaries are not collected for {full} yet — which is not the same as saying
          its government schools have none.
        </p>
      )}

      <nav aria-label="Jump to letter" className="mt-6 flex flex-wrap gap-1">
        {groups.map(([initial]) => (
          <a
            key={initial}
            href={`#letter-${initial}`}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:border-indigo-400 hover:text-indigo-700"
          >
            {initial}
          </a>
        ))}
      </nav>

      {groups.map(([initial, suburbs]) => (
        <section key={initial} id={`letter-${initial}`} className="mt-6 scroll-mt-4">
          <h2 className="text-base font-semibold border-b border-gray-100 pb-1">{initial}</h2>
          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {suburbs.map(group => (
              <li key={group.slug} className="text-sm">
                <Link
                  href={suburbPath(group.state, group.suburb)}
                  className="text-indigo-700 hover:underline"
                >
                  {group.suburb}
                </Link>
                <span className="text-gray-400 text-xs"> ({group.schools.length})</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
