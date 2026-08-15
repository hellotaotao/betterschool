import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getSchoolBySlug,
  getSchoolSlug,
  getSchoolsInZone,
  getSchoolsWithCatchments,
  getZoneSuburbs,
  readCatchmentFeature,
} from '@/lib/schoolsData';
import { catchmentPath, schoolPath, stateSlug, suburbPath } from '@/lib/slug';
import { absoluteUrl, SITE_NAME, stateName } from '@/lib/site';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';

const SCHOOL_FINDER_URL = 'https://education.nsw.gov.au/school-finder';

/** Source ADD_DATE is a bare yyyymmdd string. Render it, don't dump it. */
function formatBoundaryDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface RouteParams {
  state: string;
  slug: string;
}

export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  return getSchoolsWithCatchments().map(school => ({
    state: stateSlug(school.state),
    slug: getSchoolSlug(school),
  })).filter(params => params.slug !== '');
}

function describe(name: string, suburb: string, state: string, years: string[]): string {
  const range = years.length > 0 ? ` Covers Years ${years.join(', ')}.` : '';
  return `The published intake zone for ${name}, ${suburb} ${state}.${range}`
    + ' Official NSW Department of Education boundary — check your exact address, zones can split a street.';
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state, slug } = await params;
  const school = getSchoolBySlug(state, slug);
  if (!school?.catchments?.length) return {};

  const years = [...new Set(school.catchments.flatMap(c => c.year_levels))];
  const title = `${school.school_name} catchment area, ${school.suburb} ${school.state}`;
  const canonical = catchmentPath(school.state, slug);

  return {
    title,
    description: describe(school.school_name, school.suburb, school.state, years),
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: describe(school.school_name, school.suburb, school.state, years),
      url: absoluteUrl(canonical),
      type: 'article',
    },
  };
}

export default async function CatchmentPage({ params }: { params: Promise<RouteParams> }) {
  const { state, slug } = await params;
  const school = getSchoolBySlug(state, slug);
  if (!school?.catchments?.length) notFound();

  const catchments = school.catchments;
  const dataYear = catchments[0]?.data_year;

  // One feature per zone kind; a Central School has both a primary and a
  // secondary zone with different boundaries.
  const zones = catchments
    .map(catchment => ({
      catchment,
      feature: readCatchmentFeature({
        location_age_id: Number(school.location_age_id),
        kind: catchment.kind,
      }),
    }))
    .filter((zone): zone is { catchment: typeof catchments[number]; feature: NonNullable<ReturnType<typeof readCatchmentFeature>> } => zone.feature !== null);

  const inside = zones.length > 0 ? getSchoolsInZone(zones[0].feature) : [];
  const zoneSuburbs = getZoneSuburbs(inside);

  return (
    <PageShell
      dataYear={dataYear}
      crumbs={[
        { label: 'Schools', href: '/schools' },
        { label: stateName(school.state), href: '/schools' },
        { label: school.suburb, href: suburbPath(school.state, school.suburb) },
        { label: school.school_name, href: schoolPath(school.state, slug) },
        { label: 'Catchment' },
      ]}
    >
      <h1 className="text-2xl font-bold tracking-tight">
        {school.school_name} catchment area
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {school.suburb}, {stateName(school.state)} {school.postcode}
      </p>

      <div className="mt-4">
        <Link
          href={`/schools?school=${school.acara_sml_id}&catchment=1`}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          See the zone on the map
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="zone">
        <h2 id="zone" className="text-base font-semibold">The zone</h2>
        <dl className="mt-3 rounded-lg border border-gray-200 px-3">
          {catchments.map(catchment => (
            <div key={catchment.kind} className="py-2 border-b border-gray-100 last:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
              <dt className="text-xs text-gray-500 capitalize sm:col-span-1">{catchment.kind} zone</dt>
              <dd className="text-sm text-gray-900 sm:col-span-2">
                Years {catchment.year_levels.join(', ')}
                <span className="block text-[11px] text-gray-400 mt-0.5">
                  {catchment.data_year} enrolment year
                  {catchment.effective_year ? ` · takes effect ${catchment.effective_year}` : ''}
                  {formatBoundaryDate(catchment.boundary_updated)
                    ? ` · boundary last changed ${formatBoundaryDate(catchment.boundary_updated)}`
                    : ''}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <h2 className="text-sm font-semibold text-amber-900">Check your own address</h2>
        <p className="mt-1 text-xs text-amber-900/80 leading-relaxed">
          A NSW public school reserves places for children living in its intake zone. Zones change as
          schools open, close and populations shift, and a boundary can run down the middle of a
          street — two houses opposite each other can be in different zones. This page is a guide,
          not an entitlement, and the NSW Department of Education accepts no responsibility where
          this data informs a property decision.
        </p>
        <a
          href={SCHOOL_FINDER_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-medium text-amber-900 underline"
        >
          Confirm an address on the official NSW School Finder →
        </a>
      </section>

      {inside.length > 0 && (
        <section className="mt-8" aria-labelledby="inside">
          <h2 id="inside" className="text-base font-semibold">Other schools inside this zone</h2>
          <p className="mt-1 text-xs text-gray-500">
            Schools whose own address falls within the boundary — including non-government schools,
            which do not use zones themselves but are an option for families living here.
          </p>
          {zoneSuburbs.length > 0 && (
            <p className="mt-2 text-sm text-gray-700">
              Suburbs represented: {zoneSuburbs.join(', ')}.{' '}
              <span className="text-gray-500">
                These are the suburbs of the schools inside the boundary, which is a sample of the
                area rather than a list of every suburb the zone touches.
              </span>
            </p>
          )}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {inside.map(entry => (
              <SchoolLinkCard key={entry.school.id} school={entry.school} slug={entry.slug} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold">About {school.school_name}</h2>
        <p className="mt-2 text-sm text-gray-700">
          {school.sector} {school.school_type?.toLowerCase()} school
          {school.year_range ? `, Years ${school.year_range}` : ''}
          {Number.isFinite(school.total_enrolments) ? `, ${school.total_enrolments} students` : ''}.
        </p>
        <Link
          href={schoolPath(school.state, slug)}
          className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:underline"
        >
          Full profile for {school.school_name} →
        </Link>
      </section>
    </PageShell>
  );
}
