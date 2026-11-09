import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatchmentZoneSections, getSchoolBySlug } from '@/lib/schoolsData';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeKind, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';
import { catchmentStateInfo, usesSchoolZone } from '@/lib/catchmentStates';
import { mergeZoneSections } from '@/lib/zoneSections';

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
  const zone = usesSchoolZone(school.state);

  return buildPageMetadata({
    locale,
    title: formatMessage(zone ? t.metaTitleZone : t.metaTitle, values),
    description: formatMessage(zone ? t.metaDescriptionZone : t.metaDescription, values),
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
  const zones = mergeZoneSections(getCatchmentZoneSections(school), entry => entry.school.id);
  const full = localeStateName(locale, school.state);
  // Every state warns that a boundary can split a street, but only the
  // school's own department can settle an address.
  const finderUrl = catchmentStateInfo(school.state)?.finderUrl;
  const zone = usesSchoolZone(school.state);

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={catchmentPath(school.state, slug)}
      dataYear={dataYear}
      sourceLinks={[...new Map(catchments.map(catchment => [
        catchment.source_url,
        { url: catchment.source_url, label: catchment.source },
      ])).values()]}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(school.state, locale) },
        { label: school.suburb, href: suburbPath(school.state, school.suburb, locale) },
        { label: school.school_name, href: schoolPath(school.state, slug, locale) },
        { label: zone ? t.crumbZone : t.crumb },
      ]}
    >
      <header className="bs-hero">
      <h1 className="bs-h1">
        {formatMessage(zone ? t.headingZone : t.heading, { school: school.school_name })}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {school.suburb}, {full} {school.postcode}
      </p>

      <div className="mt-6">
        <Link
          href={mapUrl({ locale, school: school.acara_sml_id, catchment: true })}
          className="bs-btn"
        >
          {t.seeOnMap}
        </Link>
      </div>

      <section className="bs-note mt-6 max-w-2xl" aria-labelledby="check">
        <h2 id="check" className="text-base font-bold">{t.checkHeading}</h2>
        <p className="mt-1 text-[15px] leading-relaxed">
          {formatMessage(t.checkBody, { state: localeStateLabel(locale, school.state) })}
        </p>
        {finderUrl && (
          <a
            href={finderUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[15px] font-semibold underline"
          >
            {formatMessage(t.schoolFinderLink, { state: localeStateLabel(locale, school.state) })} →
          </a>
        )}
      </section>
      </header>

      <section className="bs-section" aria-labelledby="zone">
        <h2 id="zone" className="bs-h2">{t.zoneHeading}</h2>
        <dl className="mt-3">
          {catchments.map(catchment => {
            const changed = formatBoundaryDate(catchment.boundary_updated, locale);
            return (
              <div key={catchment.geometry_url} className="border-b border-line py-2.5 last:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
                <dt className="text-[13px] text-muted sm:col-span-1">
                  {formatMessage(t.zoneKind, { kind: localeKind(locale, catchment.kind) })}
                </dt>
                <dd className="text-[15px] font-semibold text-ink sm:col-span-2">
                  {catchment.year_levels.length > 0
                    ? formatMessage(t.zoneYears, { levels: catchment.year_levels.join(', ') })
                    : t.zoneYearsUnknown}
                  <span className="mt-0.5 block text-[13px] font-normal text-muted">
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
        {catchments.length > 1 && (
          <p className="mt-2 text-[13px] text-muted">
            {formatMessage(t.zoneVariantsNote, { count: catchments.length })}
          </p>
        )}
      </section>

      {zones.map(({ catchments: variants, kind, inside, suburbs, distinguishingYears }) => {
        const first = variants[0];
        const sectionId = `inside-${first.zone_id ?? first.geometry_url.replace(/[^a-z0-9]+/gi, '-')}`;
        return (
          <section key={first.geometry_url} className="bs-section" aria-labelledby={sectionId}>
            <h2 id={sectionId} className="bs-h2">
              {distinguishingYears?.length
                ? formatMessage(t.insideHeadingKindYears, {
                  kind: localeKind(locale, kind),
                  levels: distinguishingYears.join(', '),
                })
                : formatMessage(t.insideHeadingKind, { kind: localeKind(locale, kind) })}
            </h2>
            <p className="mt-1.5 text-sm text-muted">{t.insideHint}</p>
            {suburbs.length > 0 && (
              <p className="mt-2 text-[15px] text-ink-2">
                {formatMessage(t.insideSuburbs, { suburbs: suburbs.join(', ') })}{' '}
                <span className="text-muted">{t.insideSuburbsCaveat}</span>
              </p>
            )}
            {inside.length > 0 ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {inside.map(entry => (
                  <SchoolLinkCard key={entry.school.id} school={entry.school} slug={entry.slug} locale={locale} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[15px] text-ink-2">{t.insideNone}</p>
            )}
          </section>
        );
      })}

      <section className="bs-section">
        <h2 className="bs-h2">
          {formatMessage(t.aboutHeading, { school: school.school_name })}
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
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
          className="bs-link mt-2 inline-block text-[15px]"
        >
          {formatMessage(t.fullProfileLink, { school: school.school_name })} →
        </Link>
      </section>
    </PageShell>
  );
}
