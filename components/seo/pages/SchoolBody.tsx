import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import {
  getNearestSchools,
  getSchoolBySlug,
  getSizePool,
  getSuburb,
  getVceStateRank,
  latestYear12,
} from '@/lib/schoolsData';
import {
  percentBelow,
  schoolHighlights,
  type Highlight,
} from '@/lib/schoolInsights';
import { suburbSlug } from '@/lib/slug';
import { sectorBadgeClass } from '@/utils/schoolFilters';
import HeroMap from '@/components/seo/HeroMap';
import { contextFor, mapHref, mapLabels, zoneVariants } from '@/components/seo/mapParts';
import { buildHeroMap } from '@/lib/heroMapData';
import ComparisonSection from '@/components/seo/school/ComparisonSection';
import Year12Section from '@/components/seo/school/Year12Section';
import { safeSchoolWebsiteUrl } from '@/lib/schoolUrl';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel, ordinalNumber } from '@/lib/i18n';
import { buildPageMetadata, getSeo, htmlLang, localeKind, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { absoluteUrl } from '@/lib/site';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import { catchmentStateCodes, catchmentStateInfo, usesSchoolZone } from '@/lib/catchmentStates';
import PageShell from '@/components/seo/PageShell';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';

/** English reads "a primary school"; Chinese labels have no case to change. */
function typeLabel(locale: Locale, school: School): string {
  if (!school.school_type) return '';
  const label = getSchoolTypeLabel(school.school_type, getMessages(locale));
  return locale === 'en' ? label.toLowerCase() : label;
}

function describe(locale: Locale, school: School): string {
  const dictionary = getMessages(locale);
  const t = getSeo(locale).school;
  const hasProfile = Boolean(school.year_range) && Number.isFinite(school.total_enrolments);
  // The figures go first because they are what differs between two schools of
  // the same sector and type — without them 11,000 descriptions vary only by
  // suburb name.
  return formatMessage(hasProfile ? t.metaDescriptionFull : t.metaDescription, {
    sector: getSectorLabel(school.sector, dictionary),
    type: school.school_type ? getSchoolTypeLabel(school.school_type, dictionary) : '',
    suburb: school.suburb,
    state: localeStateLabel(locale, school.state),
    years: school.year_range ?? '',
    count: Number(school.total_enrolments).toLocaleString('en-AU'),
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

function Stat({ label, value, keyed = false, wide = false, children }: {
  label: string;
  value: React.ReactNode;
  /** The lead figure, filled in the bright theme. */
  keyed?: boolean;
  /** Spans the grid's row, so an odd count leaves no hole. */
  wide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`bs-stat flex flex-col ${keyed ? 'bs-stat-key' : ''} ${wide ? 'col-span-2' : ''}`}>
      <dt className="bs-label">{label}</dt>
      <dd className="mt-1.5">
        <span className="bs-figure block">{value}</span>
        {children}
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
  const catchments = school.catchments ?? [];
  const isGovernment = school.sector === 'Government';
  const schoolWebsiteUrl = safeSchoolWebsiteUrl(school.school_url);
  const zoneState = catchmentStateInfo(school.state);
  const coveredStates = catchmentStateCodes().map(code => localeStateLabel(locale, code)).join(', ');
  const full = localeStateName(locale, school.state);
  const stateLabel = localeStateLabel(locale, school.state);
  const sectorLabel = getSectorLabel(school.sector, dictionary);
  const number = (value: number) => value.toLocaleString('en-AU');

  const hasProfile = Boolean(school.year_range) && Number.isFinite(school.total_enrolments);
  const sizePool = getSizePool(school.state, school.school_type);
  const highlights = schoolHighlights(school, {
    suburbSchools: getSuburb(school.state, suburbSlug(school.suburb))?.schools ?? [school],
    sizePool,
  });

  const highlightText = (highlight: Highlight): string => {
    switch (highlight.kind) {
      case 'special': return t.hlSpecial;
      case 'girlsOnly': return formatMessage(t.hlGirlsOnly, { count: number(highlight.count) });
      case 'boysOnly': return formatMessage(t.hlBoysOnly, { count: number(highlight.count) });
      case 'onlySchoolInSuburb': return formatMessage(t.hlOnlySchoolInSuburb, { suburb: school.suburb });
      case 'onlySectorInSuburb':
        return formatMessage(t.hlOnlySectorInSuburb, { sector: sectorLabel, total: highlight.total, suburb: school.suburb });
      case 'entryYear':
        return formatMessage(t.hlEntryYear, { year: highlight.year, count: highlight.count, previous: highlight.previousCount });
      case 'large':
      case 'small':
        return formatMessage(highlight.kind === 'large' ? t.hlLarge : t.hlSmall, {
          percent: highlight.percent,
          pool: number(highlight.poolSize),
          type: typeLabel(locale, school),
          state: stateLabel,
        });
      case 'remote': return highlight.geolocation === 'Very Remote' ? t.hlVeryRemote : t.hlRemote;
      case 'lbote': return formatMessage(t.hlLbote, { percent: highlight.percent });
      case 'indigenous': return formatMessage(t.hlIndigenous, { percent: highlight.percent });
      case 'multiCampus': return t.hlMultiCampus;
    }
  };

  // The nearest schools join the frame so a rural school is not drawn as a
  // lone dot in an empty square.
  const variants = zoneVariants(locale, school);
  const heroMap = buildHeroMap({
    focus: [{ school, selected: true }],
    variants,
    context: contextFor(variants, school),
    fitAlso: getNearestSchools(school, 5).map(entry => ({ lat: Number(entry.school.lat), lng: Number(entry.school.lng) })),
  });

  const vce = latestYear12(school);
  const vceMedian = vce?.median_study_score ?? null;
  const vceRank = vceMedian !== null ? getVceStateRank(school) : null;
  const stats: { label: string; value: React.ReactNode; extra?: React.ReactNode }[] = [];
  if (vceMedian !== null) {
    stats.push({
      label: t.statVce,
      value: vceMedian,
      extra: vceRank && 'rank' in vceRank && (
        <span className="bs-pill-accent mt-2">
          {formatMessage(t.statVceRank, { rank: vceRank.rank, count: vceRank.of })}
        </span>
      ),
    });
  }
  if (hasProfile) {
    stats.push({
      label: t.statStudents,
      value: number(Number(school.total_enrolments)),
      extra: (
        <>
          {sizePool.length >= 20 && (
            <span className="mt-1 block text-[13px] text-muted">
              {formatMessage(t.statSizeContext, {
                percent: percentBelow(sizePool, Number(school.total_enrolments)),
                type: typeLabel(locale, school),
                state: stateLabel,
              })}
            </span>
          )}
        </>
      ),
    });
  }
  if (Number.isFinite(school.icsea)) {
    stats.push({
      label: t.fieldIcsea,
      value: school.icsea,
      extra: Number.isFinite(school.icsea_percentile) && (
        <span className="mt-1 block text-[13px] text-muted">
          {formatMessage(t.icseaPercentile, { value: ordinalNumber(Number(school.icsea_percentile), locale) })}
        </span>
      ),
    });
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'School',
    name: school.school_name,
    url: absoluteUrl(schoolPath(school.state, slug, locale)),
    inLanguage: htmlLang(locale),
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

  const hero = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${sectorBadgeClass(school.sector)}`}>{sectorLabel}</span>
        {school.school_type && (
          <span className="bs-chip">
            {getSchoolTypeLabel(school.school_type, dictionary)}
          </span>
        )}
        {school.year_range && <span className="bs-chip">{school.year_range}</span>}
      </div>
      <div>
        <h1 className="bs-h1">{school.school_name}</h1>
        <p className="mt-2 text-[15px] text-muted">
          {school.suburb}, {full} {school.postcode}
        </p>
      </div>
      <p className="text-[17px] leading-relaxed text-ink-2">
        {formatMessage(hasProfile ? t.lead : t.leadBasic, {
          school: school.school_name,
          type: typeLabel(locale, school),
          suburb: school.suburb,
          state: stateLabel,
          sector: sectorLabel,
          years: school.year_range ?? '',
          count: number(Number(school.total_enrolments)),
          year: ACARA_DATA_YEAR,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={mapUrl({ locale, school: school.acara_sml_id, catchment: catchments.length > 0 })}
          className="bs-btn"
        >
          {catchments.length > 0 ? t.checkOnMap : t.viewOnMap}
        </Link>
        {school.myschool_url && (
          <a
            href={school.myschool_url}
            target="_blank"
            rel="noreferrer"
            className="bs-btn-quiet"
          >
            {t.naplanLink} →
          </a>
        )}
        {schoolWebsiteUrl && (
          <a
            href={schoolWebsiteUrl}
            target="_blank"
            rel="noreferrer"
            className="bs-btn-quiet"
          >
            {t.websiteLink} →
          </a>
        )}
      </div>

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-3">
          {stats.map((stat, index) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} keyed={index === 0} wide={index === 0 && stats.length % 2 === 1}>
              {stat.extra}
            </Stat>
          ))}
        </dl>
      )}

      {highlights.length > 0 && (
        <section className="bs-note" aria-labelledby="highlights">
          <h2 id="highlights" className="text-[15px] font-bold">{t.highlightsHeading}</h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed">
            {highlights.map(highlight => (
              <li key={highlight.kind} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                <span>{highlightText(highlight)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={schoolPath(school.state, slug)}
      dataYear={ACARA_DATA_YEAR}
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
      split={{ side: hero, map: heroMap && (
        <HeroMap
          model={heroMap}
          labels={mapLabels(locale, formatMessage(t.mapTitle, { school: school.school_name }), { state: school.state, schoolName: school.school_name })}
          hrefFor={mapHref(locale)}
        />
      ) }}
    >
      {/* "<" escaped so a value can never close the script element early. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <ComparisonSection school={school} locale={locale} />

      <Year12Section school={school} locale={locale} />

      <section className="bs-section" aria-labelledby="zone">
        <h2 id="zone" className="bs-h2">{t.zoneHeading}</h2>
        {catchments.length > 0 ? (
          <div className="mt-3 rounded-inner bg-soft p-4">
            <ul className="space-y-1 text-[15px] text-ink">
              {catchments.map(catchment => (
                <li key={catchment.geometry_url}>
                  {catchment.year_levels.length > 0
                    ? formatMessage(t.zoneLine, {
                      kind: localeKind(locale, catchment.kind),
                      levels: catchment.year_levels.join(', '),
                    })
                    : formatMessage(t.zoneLineNoYears, { kind: localeKind(locale, catchment.kind) })}
                  <span className="text-muted">
                    {' ('}
                    {formatMessage(t.zoneDataYear, { year: catchment.data_year })}
                    {')'}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={catchmentPath(school.state, slug, locale)}
              className="bs-link mt-3 inline-block text-sm"
            >
              {formatMessage(usesSchoolZone(school.state) ? t.zoneLinkZone : t.zoneLink, { school: school.school_name })} →
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-[15px] text-ink-2">
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

    </PageShell>
  );
}
