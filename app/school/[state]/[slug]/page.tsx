import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import {
  getSchoolBySlug,
  getSchoolsDataset,
  getSuburbPeers,
  getSchoolSlug,
} from '@/lib/schoolsData';
import { catchmentPath, schoolPath, suburbPath } from '@/lib/slug';
import { absoluteUrl, SITE_NAME, stateName } from '@/lib/site';
import { safeSchoolWebsiteUrl } from '@/lib/schoolUrl';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';

interface RouteParams {
  state: string;
  slug: string;
}

export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams(): RouteParams[] {
  return [];
}

function describe(school: School): string {
  const bits = [
    school.sector,
    school.school_type?.toLowerCase(),
    'school',
    `in ${school.suburb}, ${school.state}`,
  ].filter(Boolean).join(' ');
  const size = Number.isFinite(school.total_enrolments) ? ` ${school.total_enrolments} students.` : '';
  const years = school.year_range ? ` Years ${school.year_range}.` : '';
  return `${bits}.${years}${size} Official ACARA profile, enrolment and location data — no ranking, no composite score.`;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state, slug } = await params;
  const school = getSchoolBySlug(state, slug);
  if (!school) return {};

  const title = `${school.school_name}, ${school.suburb} ${school.state}`;
  const canonical = schoolPath(school.state, slug);

  return {
    title,
    description: describe(school),
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: describe(school),
      url: absoluteUrl(canonical),
      type: 'article',
    },
  };
}

/** A labelled fact. `note` marks values that are inferred or absent rather than official. */
function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
      <dt className="text-xs text-gray-500 sm:col-span-1">{label}</dt>
      <dd className="text-sm text-gray-900 sm:col-span-2">
        {value}
        {note && <span className="block text-[11px] text-gray-400 mt-0.5">{note}</span>}
      </dd>
    </div>
  );
}

export default async function SchoolPage({ params }: { params: Promise<RouteParams> }) {
  const { state, slug } = await params;
  const school = getSchoolBySlug(state, slug);
  if (!school) notFound();

  const dataset = getSchoolsDataset();
  const peers = getSuburbPeers(school);
  const catchments = school.catchments ?? [];
  const isGovernment = school.sector === 'Government';
  const schoolWebsiteUrl = safeSchoolWebsiteUrl(school.school_url);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: school.school_name,
    url: absoluteUrl(schoolPath(school.state, slug)),
    ...(schoolWebsiteUrl ? { sameAs: [schoolWebsiteUrl] } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: school.suburb,
      addressRegion: school.state,
      postalCode: school.postcode,
      addressCountry: 'AU',
    },
    ...(Number.isFinite(school.lat) && Number.isFinite(school.lng)
      ? { geo: { '@type': 'GeoCoordinates', latitude: school.lat, longitude: school.lng } }
      : {}),
    ...(Number.isFinite(school.total_enrolments)
      ? { numberOfStudents: school.total_enrolments }
      : {}),
  };

  return (
    <PageShell
      dataYear={2025}
      crumbs={[
        { label: 'Schools', href: '/schools' },
        { label: stateName(school.state), href: `/schools` },
        { label: school.suburb, href: suburbPath(school.state, school.suburb) },
        { label: school.school_name },
      ]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="text-2xl font-bold tracking-tight">{school.school_name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {school.suburb}, {stateName(school.state)} {school.postcode}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/schools?school=${school.acara_sml_id}`}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          View on the map
        </Link>
        {school.myschool_url && (
          <a
            href={school.myschool_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            NAPLAN on My School →
          </a>
        )}
        {schoolWebsiteUrl && (
          <a
            href={schoolWebsiteUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            School website →
          </a>
        )}
      </div>

      <section className="mt-8" aria-labelledby="profile">
        <h2 id="profile" className="text-base font-semibold">Official profile</h2>
        <p className="mt-1 text-xs text-gray-500">
          From the ACARA Data Access Program, 2025 collection.
        </p>
        <dl className="mt-3 rounded-lg border border-gray-200 px-3">
          <Fact label="Sector" value={school.sector} />
          {school.school_type && <Fact label="School type" value={school.school_type} />}
          {school.year_range && <Fact label="Year levels" value={school.year_range} />}
          {school.campus_type && <Fact label="Campus" value={school.campus_type} />}
          {Number.isFinite(school.total_enrolments) && (
            <Fact
              label="Enrolments"
              value={`${school.total_enrolments} students`}
              note={
                Number.isFinite(school.girls) && Number.isFinite(school.boys)
                  ? `${school.girls} girls · ${school.boys} boys`
                  : undefined
              }
            />
          )}
          {Number.isFinite(school.icsea) && (
            <Fact
              label="ICSEA"
              value={
                <>
                  {school.icsea}
                  {Number.isFinite(school.icsea_percentile) && (
                    <span className="text-gray-500"> · {school.icsea_percentile}th percentile</span>
                  )}
                </>
              }
              note="Index of Community Socio-Educational Advantage: it describes the socio-educational background of the students, not how the school performs."
            />
          )}
          {Number.isFinite(school.lbote_yes_percent) && (
            <Fact label="Language other than English at home" value={`${school.lbote_yes_percent}%`} />
          )}
          {Number.isFinite(school.indigenous_percent) && (
            <Fact label="Indigenous students" value={`${school.indigenous_percent}%`} />
          )}
          {school.governing_body && <Fact label="Governing body" value={school.governing_body} />}
          <Fact
            label="Religious affiliation"
            value={school.religious_affiliation ?? 'Unknown'}
            note={
              school.religion_source === 'sector'
                ? 'Derived from the official ACARA sector.'
                : school.religion_source
                  ? `Inferred from the school's ${school.religion_source === 'governing_body' ? 'governing body' : 'name'} — not an official ACARA field.`
                  : 'Not determined. Left Unknown rather than guessed.'
            }
          />
          <Fact
            label="Tuition fees"
            value={school.fees?.band === 'free' ? 'No tuition fees' : 'Not collected yet'}
            note={
              school.fees?.band === 'free'
                ? 'Government school. Voluntary contributions may still apply.'
                : 'We publish a fee only with a dated source. Nothing is estimated.'
            }
          />
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="zone">
        <h2 id="zone" className="text-base font-semibold">Intake zone</h2>
        {catchments.length > 0 ? (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <ul className="space-y-1 text-sm">
              {catchments.map(catchment => (
                <li key={catchment.kind}>
                  <span className="font-medium capitalize">{catchment.kind}</span>
                  {' — Years '}
                  {catchment.year_levels.join(', ')}
                  <span className="text-gray-500"> ({catchment.data_year} enrolment year)</span>
                </li>
              ))}
            </ul>
            <Link
              href={catchmentPath(school.state, slug)}
              className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              See the catchment area for {school.school_name} →
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            {!isGovernment
              ? 'Non-government schools have no geographic intake zone. They admit on their own criteria — parish, siblings, or an entrance exam.'
              : school.state === 'NSW'
                ? 'No intake zone is published for this school.'
                : `Intake zone data currently covers NSW government schools only, so none is shown for ${stateName(school.state)}.`}
          </p>
        )}
      </section>

      {peers.length > 0 && (
        <section className="mt-8" aria-labelledby="nearby">
          <h2 id="nearby" className="text-base font-semibold">
            Other schools in {school.suburb}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {peers.map(peer => (
              <SchoolLinkCard key={peer.id} school={peer} slug={getSchoolSlug(peer)} />
            ))}
          </ul>
          <Link
            href={suburbPath(school.state, school.suburb)}
            className="mt-3 inline-block text-xs font-medium text-indigo-700 hover:underline"
          >
            All schools in {school.suburb} →
          </Link>
        </section>
      )}

      <section className="mt-8 rounded-lg bg-gray-50 p-3">
        <h2 className="text-sm font-semibold">What this page does not show</h2>
        <p className="mt-1 text-xs text-gray-600">
          No rank, no rating and no composite quality score — not for this school and not for any of
          the {dataset.schools.length.toLocaleString()} schools on this site. NAPLAN results are not
          republished here; the My School link above goes to the official source.
        </p>
      </section>
    </PageShell>
  );
}
