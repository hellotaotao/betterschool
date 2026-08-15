import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import {
  getRelatedSuburbs,
  getSchoolSlug,
  getSchoolsDataset,
  getSuburb,
} from '@/lib/schoolsData';
import { stateSlug, suburbPath } from '@/lib/slug';
import { absoluteUrl, SITE_NAME, stateName } from '@/lib/site';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';

interface RouteParams {
  state: string;
  slug: string;
}

export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  const { suburbs } = getSchoolsDataset();
  return [...suburbs.values()].map(group => ({
    state: stateSlug(group.state),
    slug: group.slug,
  }));
}

/** Group order matches how a parent thinks about stages, not alphabetical. */
const TYPE_ORDER = ['Primary', 'Combined', 'Secondary', 'Special'];

function groupByType(schools: School[]): [string, School[]][] {
  const groups = new Map<string, School[]>();
  for (const school of schools) {
    const key = school.school_type || 'Other';
    const bucket = groups.get(key);
    if (bucket) bucket.push(school);
    else groups.set(key, [school]);
  }
  return [...groups.entries()].sort(
    (a, b) => (TYPE_ORDER.indexOf(a[0]) + 1 || 99) - (TYPE_ORDER.indexOf(b[0]) + 1 || 99),
  );
}

function describe(suburb: string, state: string, schools: School[]): string {
  const counts = schools.reduce<Record<string, number>>((acc, school) => {
    acc[school.sector] = (acc[school.sector] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts).map(([sector, count]) => `${count} ${sector.toLowerCase()}`);
  return `${schools.length} school${schools.length === 1 ? '' : 's'} in ${suburb}, ${state}`
    + (parts.length ? ` — ${parts.join(', ')}.` : '.')
    + ' Official ACARA profiles with sector, size and year levels. No ranking.';
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state, slug } = await params;
  const group = getSuburb(state, slug);
  if (!group) return {};

  const title = `Schools in ${group.suburb}, ${group.state}`;
  const canonical = suburbPath(group.state, group.suburb);

  return {
    title,
    description: describe(group.suburb, group.state, group.schools),
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: describe(group.suburb, group.state, group.schools),
      url: absoluteUrl(canonical),
      type: 'website',
    },
  };
}

export default async function SuburbPage({ params }: { params: Promise<RouteParams> }) {
  const { state, slug } = await params;
  const group = getSuburb(state, slug);
  if (!group) notFound();

  const byType = groupByType(group.schools);
  const related = getRelatedSuburbs(group);
  const sectorCounts = group.schools.reduce<Record<string, number>>((acc, school) => {
    acc[school.sector] = (acc[school.sector] ?? 0) + 1;
    return acc;
  }, {});
  const zoned = group.schools.filter(school => (school.catchments?.length ?? 0) > 0);

  return (
    <PageShell
      dataYear={2025}
      crumbs={[
        { label: 'Schools', href: '/schools' },
        { label: stateName(group.state), href: '/schools' },
        { label: group.suburb },
      ]}
    >
      <h1 className="text-2xl font-bold tracking-tight">
        Schools in {group.suburb}, {group.state}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {group.schools.length} school{group.schools.length === 1 ? '' : 's'}
        {group.postcodes.length > 0 && ` · postcode ${group.postcodes.join(', ')}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {Object.entries(sectorCounts).map(([sector, count]) => (
          <span key={sector} className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
            {count} {sector}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <Link
          href="/schools"
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Explore {group.suburb} on the map
        </Link>
      </div>

      {byType.map(([type, schools]) => (
        <section key={type} className="mt-8" aria-labelledby={`type-${type}`}>
          <h2 id={`type-${type}`} className="text-base font-semibold">
            {type} schools ({schools.length})
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {schools.map(school => (
              <SchoolLinkCard key={school.id} school={school} slug={getSchoolSlug(school)} />
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-8" aria-labelledby="zones">
        <h2 id="zones" className="text-base font-semibold">Intake zones</h2>
        {group.state !== 'NSW' ? (
          <p className="mt-2 text-sm text-gray-600">
            Intake zone data currently covers NSW government schools only, so none is shown for{' '}
            {stateName(group.state)}.
          </p>
        ) : zoned.length > 0 ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              {zoned.length} government school{zoned.length === 1 ? ' in' : 's in'} {group.suburb}{' '}
              {zoned.length === 1 ? 'publishes' : 'publish'} an intake zone. A zone is the area whose
              residents get a guaranteed place — it is set by address, and boundaries can run through
              the middle of a street, so check your own address rather than the suburb.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {zoned.map(school => (
                <li key={school.id}>
                  <Link
                    href={`/catchment/${stateSlug(school.state)}/${getSchoolSlug(school)}`}
                    className="text-indigo-700 hover:underline"
                  >
                    {school.school_name} catchment
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            No government school based in {group.suburb} publishes an intake zone. That does not mean
            the suburb is unzoned — it is very likely inside the zone of a school based elsewhere.{' '}
            <Link href="/schools" className="text-indigo-700 hover:underline">
              Look up a specific address on the map
            </Link>
            .
          </p>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-8" aria-labelledby="related">
          <h2 id="related" className="text-base font-semibold">Nearby suburbs</h2>
          <p className="mt-1 text-xs text-gray-500">Suburbs sharing a postcode with {group.suburb}.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map(other => (
              <li key={`${other.state}-${other.slug}`}>
                <Link
                  href={suburbPath(other.state, other.suburb)}
                  className="inline-block rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
                >
                  {other.suburb}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
