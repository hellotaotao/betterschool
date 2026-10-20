import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRanking, getRankingGroups, getStateRankings, latestYear12, type RankingGroup } from '@/lib/schoolsData';
import { metricValue } from '@/lib/schoolCompare';
import { RANKING_SECTORS, RANKING_VIEWS, VCE_MIN_STUDENTS, rankingSlug } from '@/lib/rankings';
import type { TableMetric, TableRow, Weights } from '@/lib/rankingTable';
import RankingTable, { type RankingTableLabels } from '@/components/seo/RankingTable';
import { formatMessage, getMessages } from '@/lib/i18n';
import {
  buildPageMetadata,
  capitalize,
  getSeo,
  localeRankingGroup,
  localeStateLabel,
  localeStateName,
  type Locale,
} from '@/lib/seoLocale';
import { browsePath, rankingPath, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';

const MY_SCHOOL_URL = 'https://www.myschool.edu.au/';
/** Rows rendered before "show all"; the server renders these for crawlers. */
const DEFAULT_ROWS = 100;
const VCE_WEIGHTS: Weights = { vce_median: 50, vce_40: 30, icsea: 20 };
const ICSEA_WEIGHTS: Weights = { icsea: 100 };

function tableRows(ranking: RankingGroup, locale: Locale): TableRow[] {
  return ranking.members.map(({ school, slug, smallCohort }) => {
    const results = latestYear12(school, ranking.resultsYear ?? null);
    return {
      id: school.id,
      name: school.school_name,
      href: schoolPath(school.state, slug, locale),
      suburb: school.suburb,
      suburbHref: suburbPath(school.state, school.suburb, locale),
      sector: school.sector,
      ...(smallCohort ? { smallCohort } : {}),
      values: {
        vce_median: results?.median_study_score ?? null,
        vce_40: results?.pct_study_scores_40_plus ?? null,
        icsea: metricValue(school, 'icsea'),
        enrolments: metricValue(school, 'enrolments'),
        ratio: metricValue(school, 'ratio'),
      },
    };
  });
}

export function rankingMetadata(locale: Locale, state: string, slug: string): Metadata {
  const ranking = getRanking(state, slug);
  if (!ranking) return {};

  const t = getSeo(locale).ranking;
  const isVce = ranking.schoolType === 'VCE';
  const values = {
    state: localeStateLabel(locale, ranking.state),
    group: localeRankingGroup(locale, ranking.schoolType, ranking.sector),
    shown: Math.min(ranking.ranked, DEFAULT_ROWS),
    ranked: ranking.ranked.toLocaleString('en-AU'),
    year: isVce ? ranking.resultsYear ?? ACARA_DATA_YEAR : ACARA_DATA_YEAR,
  };

  return buildPageMetadata({
    locale,
    title: formatMessage(isVce ? t.metaTitleVce : t.metaTitle, values),
    description: formatMessage(isVce ? t.metaDescriptionVce : t.metaDescription, values),
    bareEnglishPath: rankingPath(ranking.state, ranking.slug),
  });
}

function Pill({ href, active, children }: { href?: string; active: boolean; children: React.ReactNode }) {
  const base = 'rounded-full border px-3 py-1 text-xs';
  if (active) return <span className={`${base} border-slate-700 bg-slate-700 text-white`}>{children}</span>;
  if (!href) return <span className={`${base} border-gray-100 text-gray-300`}>{children}</span>;
  return (
    <Link href={href} className={`${base} border-gray-200 text-gray-700 hover:border-indigo-400 hover:text-indigo-700`}>
      {children}
    </Link>
  );
}

export default function RankingBody({ locale, state, slug }: { locale: Locale; state: string; slug: string }) {
  const ranking = getRanking(state, slug);
  if (!ranking) notFound();

  const t = getSeo(locale).ranking;
  const st = getSeo(locale).school;
  const shell = getSeo(locale).shell;
  const dictionary = getMessages(locale);
  const isVce = ranking.schoolType === 'VCE';
  const full = localeStateName(locale, ranking.state);
  const group = localeRankingGroup(locale, ranking.schoolType, ranking.sector);
  const stateRankings = getStateRankings(ranking.state);
  const available = new Set(stateRankings.map(entry => entry.slug));
  const pathIfExists = (candidate: string) => (available.has(candidate) ? rankingPath(ranking.state, candidate, locale) : undefined);
  const otherStates = getRankingGroups().filter(entry => entry.slug === ranking.slug && entry.state !== ranking.state);
  const [naplanBefore, naplanAfter] = t.naplan.split('{link}');
  const resultsYear = ranking.resultsYear ?? ACARA_DATA_YEAR;
  const values = {
    state: full,
    group,
    ranked: ranking.ranked.toLocaleString('en-AU'),
    shown: Math.min(ranking.ranked, DEFAULT_ROWS),
    year: resultsYear,
    min: VCE_MIN_STUDENTS,
  };

  const rows = tableRows(ranking, locale);
  // A column is offered only when some school in this table has the figure.
  const columns = (['vce_median', 'vce_40', 'icsea', 'enrolments', 'ratio'] as TableMetric[])
    .filter(metric => rows.some(row => row.values[metric] !== null));
  const labels: RankingTableLabels = {
    rank: '#',
    school: st.compareColName,
    suburb: t.colSuburb,
    sector: st.fieldSector,
    columns: {
      vce_median: t.colVceMedian,
      vce_40: t.colVce40,
      icsea: st.fieldIcsea,
      enrolments: st.statStudents,
      ratio: st.statRatio,
    },
    sortBy: t.sortBy,
    sortMix: t.sortMix,
    mixScore: t.mixScore,
    weightsHint: t.weightsHint,
    includeSmall: ranking.smallCohort > 0 ? formatMessage(t.includeSmall, values) : undefined,
    showAll: t.showAll,
    showTop: t.showTop,
    sectors: {
      Government: dictionary.filters.government,
      Catholic: dictionary.filters.catholic,
      Independent: dictionary.filters.independent,
    },
  };

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={rankingPath(ranking.state, ranking.slug)}
      dataYear={ACARA_DATA_YEAR}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(ranking.state, locale) },
        { label: t.crumb },
      ]}
    >
      <h1 className="text-2xl font-bold tracking-tight">{capitalize(formatMessage(isVce ? t.headingVce : t.heading, values))}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {isVce
          ? formatMessage(t.introVce, values)
          : formatMessage(ranking.ranked > DEFAULT_ROWS ? t.introTop : t.introAll, values)}
        {ranking.unranked > 0 && <> {formatMessage(t.unranked, { count: ranking.unranked })}</>}
        {ranking.smallCohort > 0 && <> {formatMessage(t.smallCohort, { ...values, count: ranking.smallCohort })}</>}
        {ranking.earlyOnly > 0 && <> {formatMessage(t.earlyOnly, { ...values, count: ranking.earlyOnly })}</>}
      </p>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-gray-500">{t.filterView}</span>
          {RANKING_VIEWS.map(view => {
            const href = pathIfExists(rankingSlug({ schoolType: view, sector: ranking.sector }))
              ?? pathIfExists(rankingSlug({ schoolType: view, sector: null }));
            // A view this state has no data for is left out rather than shown dead.
            if (!href && view !== ranking.schoolType) return null;
            return (
              <Pill key={view} active={view === ranking.schoolType} href={href}>
                {view === 'VCE' ? t.viewVce : capitalize(t[`type${view}`])}
              </Pill>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-gray-500">{t.filterSector}</span>
          {[null, ...RANKING_SECTORS].map(sector => (
            <Pill
              key={sector ?? 'all'}
              active={sector === ranking.sector}
              href={pathIfExists(rankingSlug({ schoolType: ranking.schoolType, sector }))}
            >
              {sector ? capitalize(t[`sector${sector}`]) : t.allSectors}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <RankingTable
          rows={rows}
          columns={columns}
          defaultSort={isVce ? 'vce_median' : 'icsea'}
          defaultWeights={isVce ? VCE_WEIGHTS : ICSEA_WEIGHTS}
          showSector={ranking.sector === null}
          labels={labels}
          limit={DEFAULT_ROWS}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {isVce
          ? formatMessage(t.methodVce, { year: resultsYear, acaraYear: ACARA_DATA_YEAR })
          : formatMessage(t.method, { ...values, year: ACARA_DATA_YEAR })}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {naplanBefore}
        <a href={MY_SCHOOL_URL} rel="noopener" className="text-indigo-700 hover:underline">{t.naplanLink}</a>
        {naplanAfter}
      </p>

      {otherStates.length > 0 && (
        <section className="mt-10 border-t border-gray-100 pt-5" aria-labelledby="other-states">
          <h2 id="other-states" className="text-base font-semibold">{t.otherStatesHeading}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {otherStates.map(other => (
              <li key={other.state}>
                <Link
                  href={rankingPath(other.state, other.slug, locale)}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
                >
                  {localeStateName(locale, other.state)}
                  <span className="text-[10px] text-gray-400">{other.ranked.toLocaleString('en-AU')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
