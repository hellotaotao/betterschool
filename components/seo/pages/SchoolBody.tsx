import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import {
  getNearbySchools,
  getNearestSchools,
  getSchoolBySlug,
  getSchoolSlug,
  getSizePool,
  getSuburb,
  getSuburbPeers,
  getVceStateRank,
  latestYear12,
} from '@/lib/schoolsData';
import {
  gradeCohorts,
  gradeShortLabel,
  percentBelow,
  schoolHighlights,
  studentsPerTeacher,
  type Highlight,
} from '@/lib/schoolInsights';
import { suburbSlug } from '@/lib/slug';
import { sectorBadgeClass } from '@/utils/schoolFilters';
import EnrolmentChart, { type CohortBar } from '@/components/seo/school/EnrolmentChart';
import HeroMap from '@/components/seo/HeroMap';
import { contextFor, mapHref, mapLabels, zoneVariants } from '@/components/seo/mapParts';
import { buildHeroMap } from '@/lib/heroMapData';
import ComparisonSection from '@/components/seo/school/ComparisonSection';
import Year12Section from '@/components/seo/school/Year12Section';
import { safeSchoolWebsiteUrl } from '@/lib/schoolUrl';
import { formatMessage, getMessages, getReligionLabel, getSchoolTypeLabel, getSectorLabel, ordinalNumber } from '@/lib/i18n';
import { buildPageMetadata, getSeo, htmlLang, localeKind, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { absoluteUrl } from '@/lib/site';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import { catchmentStateCodes, catchmentStateInfo, usesSchoolZone } from '@/lib/catchmentStates';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';
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

/** A labelled fact. `note` marks values that are inferred or absent rather than official. */
function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-line py-2.5 last:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
      <dt className="text-sm text-muted sm:col-span-1">{label}</dt>
      <dd className="text-[15px] text-ink sm:col-span-2">
        {value}
        {note && <span className="mt-0.5 block text-[13px] text-muted">{note}</span>}
      </dd>
    </div>
  );
}

function Stat({ label, value, keyed = false, children }: {
  label: string;
  value: React.ReactNode;
  /** The lead figure, filled in the bright theme. */
  keyed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={keyed ? 'bs-stat bs-stat-key flex flex-col' : 'bs-stat flex flex-col'}>
      <dt className="bs-label">{label}</dt>
      <dd className="mt-1.5">
        <span className="bs-figure block">{value}</span>
        {children}
      </dd>
    </div>
  );
}

/** A share out of 100 as a labelled bar. Brand tone, never a sector hue. */
function Meter({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{percent}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft-strong" aria-hidden="true">
        <div className="h-full rounded-full bg-data-3" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

export default function SchoolBody({ locale, state, slug }: { locale: Locale; state: string; slug: string }) {
  const school = getSchoolBySlug(state, slug);
  if (!school) notFound();

  const t = getSeo(locale).school;
  const shell = getSeo(locale).shell;
  const dictionary = getMessages(locale);
  const peers = getSuburbPeers(school);
  const nearby = getNearbySchools(school);
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
  const ratio = studentsPerTeacher(school);
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

  const cohortBars: CohortBar[] = gradeCohorts(school).map(cohort => ({
    ...cohort,
    label: gradeShortLabel(cohort.key, school.state)
      ?? (cohort.key === 'two_years_before_year_1'
        ? t.gradePre
        : cohort.key === 'primary_ungraded' ? t.gradeUngradedPrimary : t.gradeUngradedSecondary),
  }));

  const sea = school.sea_quarters;
  const seaSegments = sea
    ? [
      { label: t.seaBottom, percent: sea.bottom_percent, tone: 'bg-data-1' },
      { label: t.seaLowerMiddle, percent: sea.lower_middle_percent, tone: 'bg-data-2' },
      { label: t.seaUpperMiddle, percent: sea.upper_middle_percent, tone: 'bg-data-3' },
      { label: t.seaTop, percent: sea.top_percent, tone: 'bg-data-4' },
    ].filter((segment): segment is { label: string; percent: number; tone: string } => Number.isFinite(segment.percent))
    : [];
  // Drawn only as a complete set: three of four quarters would look like a
  // whole distribution with a piece silently missing.
  const showSea = seaSegments.length === 4;
  const showBackground = showSea
    || Number.isFinite(school.lbote_yes_percent)
    || Number.isFinite(school.indigenous_percent);

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
          {Number.isFinite(school.girls) && Number.isFinite(school.boys) && (
            <span className="mt-1 block text-[13px] text-muted">
              {formatMessage(t.enrolmentsSplit, { girls: number(Number(school.girls)), boys: number(Number(school.boys)) })}
            </span>
          )}
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
  if (ratio !== null) {
    stats.push({
      label: t.statRatio,
      value: ratio.toFixed(1),
      extra: (
        <span className="mt-1 block text-[13px] text-muted">
          {formatMessage(t.statRatioNote, { teachers: Number(school.staff?.teaching_fte) })}
        </span>
      ),
    });
  }
  // Year levels are already in the chips; they fill the grid only when the
  // VCE figure has not taken the slot.
  if (vceMedian === null && school.year_range) {
    stats.push({
      label: t.statYears,
      value: school.year_range,
      extra: school.school_type && (
        <span className="mt-1 block text-[13px] text-muted">{getSchoolTypeLabel(school.school_type, dictionary)}</span>
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

  const religionNote = school.religion_source === 'sector'
    ? t.religionFromSector
    : school.religion_source === 'governing_body'
      ? t.religionInferredBody
      : school.religion_source
        ? t.religionInferredName
        : t.religionUnknownNote;

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
            <Stat key={stat.label} label={stat.label} value={stat.value} keyed={index === 0}>
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
          labels={mapLabels(locale, formatMessage(t.mapTitle, { school: school.school_name }))}
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

      {cohortBars.length > 1 && (
        <section className="bs-section" aria-labelledby="cohorts">
          <h2 id="cohorts" className="bs-h2">{t.cohortHeading}</h2>
          <p className="mt-1.5 text-sm text-muted">{formatMessage(t.cohortSource, { year: ACARA_DATA_YEAR })}</p>
          <EnrolmentChart
            bars={cohortBars}
            color="var(--bs-brand)"
            caption={formatMessage(t.cohortCaption, { school: school.school_name })}
          />
          {cohortBars.some(bar => bar.count === null) && (
            <p className="mt-2 text-[13px] text-muted">{t.cohortUnpublished}</p>
          )}
          {cohortBars.some(bar => bar.key === 'two_years_before_year_1') && (
            <p className="mt-1 text-[13px] text-muted">{t.cohortPreNote}</p>
          )}
        </section>
      )}

      {showBackground && (
        <section className="bs-section" aria-labelledby="background">
          <h2 id="background" className="bs-h2">{t.backgroundHeading}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">{t.icseaNote}</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {showSea && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink">{t.seaHeading}</h3>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                  {seaSegments.map(segment => (
                    <div key={segment.label} className={segment.tone} style={{ width: `${segment.percent}%` }} />
                  ))}
                </div>
                <dl className="mt-2 grid grid-cols-4 gap-2">
                  {seaSegments.map(segment => (
                    <div key={segment.label}>
                      <dd className="flex items-center gap-1.5 text-base font-semibold tabular-nums text-ink">
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${segment.tone}`} />
                        {segment.percent}%
                      </dd>
                      <dt className="text-[13px] leading-tight text-muted">{segment.label}</dt>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[13px] text-muted">{t.seaNote}</p>
              </div>
            )}
            <div className="space-y-4">
              {Number.isFinite(school.lbote_yes_percent) && (
                <Meter label={t.fieldLbote} percent={Number(school.lbote_yes_percent)} />
              )}
              {Number.isFinite(school.indigenous_percent) && (
                <Meter label={t.fieldIndigenous} percent={Number(school.indigenous_percent)} />
              )}
            </div>
          </div>
        </section>
      )}

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

      {peers.length > 0 && (
        <section className="bs-section" aria-labelledby="nearby">
          <h2 id="nearby" className="bs-h2">
            {formatMessage(t.peersHeading, { suburb: school.suburb })}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {peers.map(peer => (
              <SchoolLinkCard key={peer.id} school={peer} slug={getSchoolSlug(peer)} locale={locale} />
            ))}
          </ul>
          <Link
            href={suburbPath(school.state, school.suburb, locale)}
            className="bs-link mt-3 inline-block text-sm"
          >
            {formatMessage(t.peersAll, { suburb: school.suburb })} →
          </Link>
        </section>
      )}

      {nearby.length > 0 && (
        <section className="bs-section" aria-labelledby="nearby-schools">
          <h2 id="nearby-schools" className="bs-h2">
            {formatMessage(t.nearbyHeading, { suburb: school.suburb })}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
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

      <section className="bs-section" aria-labelledby="profile">
        <h2 id="profile" className="bs-h2">{t.profileHeading}</h2>
        <p className="mt-1.5 text-sm text-muted">{formatMessage(t.profileSource, { year: ACARA_DATA_YEAR })}</p>
        <dl className="mt-3">
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
                    <span className="text-muted">
                      {' · '}
                      {formatMessage(t.icseaPercentile, { value: ordinalNumber(Number(school.icsea_percentile), locale) })}
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
          {school.geolocation && <Fact label={t.fieldGeolocation} value={school.geolocation} />}
          {Number.isFinite(school.staff?.teaching) && Number.isFinite(school.staff?.teaching_fte) && (
            <Fact
              label={t.fieldTeachingStaff}
              value={formatMessage(t.staffValue, {
                count: Number(school.staff?.teaching),
                fte: Number(school.staff?.teaching_fte),
              })}
            />
          )}
          {Number.isFinite(school.staff?.non_teaching) && Number.isFinite(school.staff?.non_teaching_fte) && (
            <Fact
              label={t.fieldNonTeachingStaff}
              value={formatMessage(t.staffValue, {
                count: Number(school.staff?.non_teaching),
                fte: Number(school.staff?.non_teaching_fte),
              })}
            />
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
    </PageShell>
  );
}
