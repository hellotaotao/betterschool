import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatchmentZoneSections, getSchoolBySlug } from '@/lib/schoolsData';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeKind, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';
import { catchmentStateInfo } from '@/lib/catchmentStates';

/** Source ADD_DATE is a bare yyyymmdd string. Render it, don't dump it. */
function formatBoundaryDate(raw: string | undefined, locale: Locale): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function catchmentMetadata(locale: Locale, state: string, slug: string): Metadata {
  const school = getSchoolBySlug(state, slug);
  if (!school?.catchments?.length) return {};

  const t = getSeo(locale).catchment;
  const values = {
    school: school.school_name,
    suburb: school.suburb,
    state: localeStateLabel(locale, school.state),
  };

  return buildPageMetadata({
    locale,
    title: formatMessage(t.metaTitle, values),
    description: formatMessage(t.metaDescription, values),
    bareEnglishPath: catchmentPath(school.state, slug),
    type: 'article',
  });
}

export default function CatchmentBody({ locale, state, slug }: { locale: Locale; state: string; slug: string }) {
  const school = getSchoolBySlug(state, slug);
  if (!school?.catchments?.length) notFound();

  const t = getSeo(locale).catchment;
  const shell = getSeo(locale).shell;
  const dictionary = getMessages(locale);
  const catchments = school.catchments;
  const dataYear = catchments[0]?.data_year;
  const zones = getCatchmentZoneSections(school);
  const full = localeStateName(locale, school.state);
  // Every state warns that a boundary can split a street, but only the
  // school's own department can settle an address.
  const finderUrl = catchmentStateInfo(school.state)?.finderUrl;

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={catchmentPath(school.state, slug)}
      dataYear={dataYear}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(school.state, locale) },
        { label: school.suburb, href: suburbPath(school.state, school.suburb, locale) },
        { label: school.school_name, href: schoolPath(school.state, slug, locale) },
        { label: t.crumb },
      ]}
    >
      <h1 className="text-2xl font-bold tracking-tight">
        {formatMessage(t.heading, { school: school.school_name })}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {school.suburb}, {full} {school.postcode}
      </p>

      <div className="mt-4">
        <Link
          href={mapUrl({ locale, school: school.acara_sml_id, catchment: true })}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          {t.seeOnMap}
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="zone">
        <h2 id="zone" className="text-base font-semibold">{t.zoneHeading}</h2>
        <dl className="mt-3 rounded-lg border border-gray-200 px-3">
          {catchments.map(catchment => {
            const changed = formatBoundaryDate(catchment.boundary_updated, locale);
            return (
              <div key={catchment.kind} className="py-2 border-b border-gray-100 last:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
                <dt className="text-xs text-gray-500 sm:col-span-1">
                  {formatMessage(t.zoneKind, { kind: localeKind(locale, catchment.kind) })}
                </dt>
                <dd className="text-sm text-gray-900 sm:col-span-2">
                  {catchment.year_levels.length > 0
                    ? formatMessage(t.zoneYears, { levels: catchment.year_levels.join(', ') })
                    : t.zoneYearsUnknown}
                  <span className="block text-[11px] text-gray-400 mt-0.5">
                    {formatMessage(t.zoneDataYear, { year: catchment.data_year })}
                    {catchment.effective_year
                      ? ` · ${formatMessage(t.zoneEffective, { year: catchment.effective_year })}`
                      : ''}
                    {changed ? ` · ${formatMessage(t.zoneUpdated, { date: changed })}` : ''}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <h2 className="text-sm font-semibold text-amber-900">{t.checkHeading}</h2>
        <p className="mt-1 text-xs text-amber-900/80 leading-relaxed">
          {formatMessage(t.checkBody, { state: localeStateLabel(locale, school.state) })}
        </p>
        {finderUrl && (
          <a
            href={finderUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-medium text-amber-900 underline"
          >
            {formatMessage(t.schoolFinderLink, { state: localeStateLabel(locale, school.state) })} →
          </a>
        )}
      </section>

      {zones.map(({ catchment, inside, suburbs }) => (
        <section key={catchment.kind} className="mt-8" aria-labelledby={`inside-${catchment.kind}`}>
          <h2 id={`inside-${catchment.kind}`} className="text-base font-semibold">
            {formatMessage(t.insideHeadingKind, { kind: localeKind(locale, catchment.kind) })}
          </h2>
          <p className="mt-1 text-xs text-gray-500">{t.insideHint}</p>
          {suburbs.length > 0 && (
            <p className="mt-2 text-sm text-gray-700">
              {formatMessage(t.insideSuburbs, { suburbs: suburbs.join(', ') })}{' '}
              <span className="text-gray-500">{t.insideSuburbsCaveat}</span>
            </p>
          )}
          {inside.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {inside.map(entry => (
                <SchoolLinkCard key={entry.school.id} school={entry.school} slug={entry.slug} locale={locale} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-700">{t.insideNone}</p>
          )}
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-base font-semibold">
          {formatMessage(t.aboutHeading, { school: school.school_name })}
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          {formatMessage(t.aboutBody, {
            sector: getSectorLabel(school.sector, dictionary),
            type: school.school_type ? getSchoolTypeLabel(school.school_type, dictionary) : '',
            years: school.year_range ? formatMessage(t.aboutYears, { range: school.year_range }) : '',
            enrolments: Number.isFinite(school.total_enrolments)
              ? formatMessage(t.aboutEnrolments, { count: Number(school.total_enrolments) })
              : '',
          }).replace(/\s{2,}/g, ' ')}
        </p>
        <Link
          href={schoolPath(school.state, slug, locale)}
          className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:underline"
        >
          {formatMessage(t.fullProfileLink, { school: school.school_name })} →
        </Link>
      </section>
    </PageShell>
  );
}
