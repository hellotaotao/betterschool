import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import { getNearbySchools, getSchoolBySlug, getSchoolsDataset, getSchoolSlug, getSuburbPeers } from '@/lib/schoolsData';
import { safeSchoolWebsiteUrl } from '@/lib/schoolUrl';
import { formatMessage, getMessages, getReligionLabel, getSchoolTypeLabel, getSectorLabel } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeKind, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { absoluteUrl } from '@/lib/site';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import { catchmentStateCodes, catchmentStateInfo } from '@/lib/catchmentStates';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';

function describe(locale: Locale, school: School): string {
  const dictionary = getMessages(locale);
  return formatMessage(getSeo(locale).school.metaDescription, {
    sector: getSectorLabel(school.sector, dictionary),
    type: school.school_type ? getSchoolTypeLabel(school.school_type, dictionary) : '',
    suburb: school.suburb,
    state: localeStateLabel(locale, school.state),
  }).replace(/\s{2,}/g, ' ');
}

export function schoolMetadata(locale: Locale, state: string, slug: string): Metadata {
  const school = getSchoolBySlug(state, slug);
  if (!school) return {};

  return buildPageMetadata({
    locale,
    title: formatMessage(getSeo(locale).school.metaTitle, {
      school: school.school_name,
      suburb: school.suburb,
      state: localeStateLabel(locale, school.state),
    }),
    description: describe(locale, school),
    bareEnglishPath: schoolPath(school.state, slug),
    type: 'article',
  });
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

export default function SchoolBody({ locale, state, slug }: { locale: Locale; state: string; slug: string }) {
  const school = getSchoolBySlug(state, slug);
  if (!school) notFound();

  const t = getSeo(locale).school;
  const shell = getSeo(locale).shell;
  const dictionary = getMessages(locale);
  const dataset = getSchoolsDataset();
  const peers = getSuburbPeers(school);
  const nearby = getNearbySchools(school);
  const catchments = school.catchments ?? [];
  const isGovernment = school.sector === 'Government';
  const schoolWebsiteUrl = safeSchoolWebsiteUrl(school.school_url);
  const zoneState = catchmentStateInfo(school.state);
  const coveredStates = catchmentStateCodes().map(code => localeStateLabel(locale, code)).join(', ');
  const full = localeStateName(locale, school.state);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: school.school_name,
    url: absoluteUrl(schoolPath(school.state, slug, locale)),
    inLanguage: locale === 'zh' ? 'zh-Hans' : 'en-AU',
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
    ...(Number.isFinite(school.total_enrolments) ? { numberOfStudents: school.total_enrolments } : {}),
  };

  const religionNote = school.religion_source === 'sector'
    ? t.religionFromSector
    : school.religion_source === 'governing_body'
      ? t.religionInferredBody
      : school.religion_source
        ? t.religionInferredName
        : t.religionUnknownNote;

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={schoolPath(school.state, slug)}
      dataYear={2025}
      sourceLinks={[...new Map(catchments.map(catchment => [
        catchment.source_url,
        { url: catchment.source_url, label: catchment.source },
      ])).values()]}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(school.state, locale) },
        { label: school.suburb, href: suburbPath(school.state, school.suburb, locale) },
        { label: school.school_name },
      ]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="text-2xl font-bold tracking-tight">{school.school_name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {school.suburb}, {full} {school.postcode}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={mapUrl({ locale, school: school.acara_sml_id })}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          {t.viewOnMap}
        </Link>
        {school.myschool_url && (
          <a
            href={school.myschool_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            {t.naplanLink} →
          </a>
        )}
        {schoolWebsiteUrl && (
          <a
            href={schoolWebsiteUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            {t.websiteLink} →
          </a>
        )}
      </div>

      <section className="mt-8" aria-labelledby="profile">
        <h2 id="profile" className="text-base font-semibold">{t.profileHeading}</h2>
        <p className="mt-1 text-xs text-gray-500">{t.profileSource}</p>
        <dl className="mt-3 rounded-lg border border-gray-200 px-3">
          <Fact label={t.fieldSector} value={getSectorLabel(school.sector, dictionary)} />
          {school.school_type && (
            <Fact label={t.fieldType} value={getSchoolTypeLabel(school.school_type, dictionary)} />
          )}
          {school.year_range && <Fact label={t.fieldYearLevels} value={school.year_range} />}
          {school.campus_type && <Fact label={t.fieldCampus} value={school.campus_type} />}
          {Number.isFinite(school.total_enrolments) && (
            <Fact
              label={t.fieldEnrolments}
              value={formatMessage(t.enrolmentsValue, { count: Number(school.total_enrolments) })}
              note={
                Number.isFinite(school.girls) && Number.isFinite(school.boys)
                  ? formatMessage(t.enrolmentsSplit, { girls: Number(school.girls), boys: Number(school.boys) })
                  : undefined
              }
            />
          )}
          {Number.isFinite(school.icsea) && (
            <Fact
              label={t.fieldIcsea}
              value={
                <>
                  {school.icsea}
                  {Number.isFinite(school.icsea_percentile) && (
                    <span className="text-gray-500">
                      {' · '}
                      {formatMessage(t.icseaPercentile, { value: Number(school.icsea_percentile) })}
                    </span>
                  )}
                </>
              }
              note={t.icseaNote}
            />
          )}
          {Number.isFinite(school.lbote_yes_percent) && (
            <Fact label={t.fieldLbote} value={`${school.lbote_yes_percent}%`} />
          )}
          {Number.isFinite(school.indigenous_percent) && (
            <Fact label={t.fieldIndigenous} value={`${school.indigenous_percent}%`} />
          )}
          {school.governing_body && <Fact label={t.fieldGoverningBody} value={school.governing_body} />}
          <Fact
            label={t.fieldReligion}
            value={getReligionLabel(school.religious_affiliation, dictionary)}
            note={religionNote}
          />
          <Fact
            label={t.fieldFees}
            value={school.fees?.band === 'free' ? t.feesFree : t.feesNotCollected}
            note={school.fees?.band === 'free' ? t.feesFreeNote : t.feesNotCollectedNote}
          />
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="zone">
        <h2 id="zone" className="text-base font-semibold">{t.zoneHeading}</h2>
        {catchments.length > 0 ? (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <ul className="space-y-1 text-sm">
              {catchments.map(catchment => (
                <li key={catchment.geometry_url}>
                  {catchment.year_levels.length > 0
                    ? formatMessage(t.zoneLine, {
                      kind: localeKind(locale, catchment.kind),
                      levels: catchment.year_levels.join(', '),
                    })
                    : formatMessage(t.zoneLineNoYears, { kind: localeKind(locale, catchment.kind) })}
                  <span className="text-gray-500">
                    {' ('}
                    {formatMessage(t.zoneDataYear, { year: catchment.data_year })}
                    {')'}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={catchmentPath(school.state, slug, locale)}
              className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              {formatMessage(t.zoneLink, { school: school.school_name })} →
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            {/* Three different absences, and the page must not blur them: zones
                do not apply, none was published for a school in a state that
                zones everything, or the state only zones part of its system so
                the silence means very little. */}
            {!isGovernment
              ? t.zoneNonGovernment
              : !zoneState
                ? formatMessage(t.zoneOtherState, { state: full, states: coveredStates })
                : zoneState.complete
                  ? t.zoneNotPublished
                  : formatMessage(t.zonePartialState, { state: full })}
          </p>
        )}
      </section>

      {peers.length > 0 && (
        <section className="mt-8" aria-labelledby="nearby">
          <h2 id="nearby" className="text-base font-semibold">
            {formatMessage(t.peersHeading, { suburb: school.suburb })}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {peers.map(peer => (
              <SchoolLinkCard key={peer.id} school={peer} slug={getSchoolSlug(peer)} locale={locale} />
            ))}
          </ul>
          <Link
            href={suburbPath(school.state, school.suburb, locale)}
            className="mt-3 inline-block text-xs font-medium text-indigo-700 hover:underline"
          >
            {formatMessage(t.peersAll, { suburb: school.suburb })} →
          </Link>
        </section>
      )}

      {nearby.length > 0 && (
        <section className="mt-8" aria-labelledby="nearby-schools">
          <h2 id="nearby-schools" className="text-base font-semibold">
            {formatMessage(t.nearbyHeading, { suburb: school.suburb })}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {formatMessage(t.nearbyHint, { suburb: school.suburb })}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {nearby.map(entry => (
              <SchoolLinkCard
                key={entry.school.id}
                school={entry.school}
                slug={entry.slug}
                locale={locale}
                distance={formatMessage(t.nearbyDistance, {
                  km: entry.km < 10 ? entry.km.toFixed(1) : Math.round(entry.km),
                  school: school.school_name,
                })}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-lg bg-gray-50 p-3">
        <h2 className="text-sm font-semibold">{t.notShownHeading}</h2>
        <p className="mt-1 text-xs text-gray-600">
          {formatMessage(t.notShownBody, { total: dataset.schools.length.toLocaleString() })}
        </p>
      </section>
    </PageShell>
  );
}
