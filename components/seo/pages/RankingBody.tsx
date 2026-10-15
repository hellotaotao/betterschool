import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRanking, getRankingGroups, getStateRankings } from '@/lib/schoolsData';
import { metricValue } from '@/lib/schoolCompare';
import { RANKING_SECTORS, RANKING_TYPES, rankingSlug } from '@/lib/rankings';
import { formatMessage, getMessages, getSectorLabel } from '@/lib/i18n';
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
import { sectorBadgeClass } from '@/utils/schoolFilters';
import PageShell from '@/components/seo/PageShell';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';

const MY_SCHOOL_URL = 'https://www.myschool.edu.au/';

export function rankingMetadata(locale: Locale, state: string, slug: string): Metadata {
  const ranking = getRanking(state, slug);
  if (!ranking) return {};

  const t = getSeo(locale).ranking;
  const values = {
    state: localeStateLabel(locale, ranking.state),
    group: localeRankingGroup(locale, ranking.schoolType, ranking.sector),
    shown: ranking.rows.length,
    ranked: ranking.ranked.toLocaleString('en-AU'),
    year: ACARA_DATA_YEAR,
  };

  return buildPageMetadata({
    locale,
    title: formatMessage(t.metaTitle, values),
    description: formatMessage(t.metaDescription, values),
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
  const full = localeStateName(locale, ranking.state);
  const group = localeRankingGroup(locale, ranking.schoolType, ranking.sector);
  const available = new Set(getStateRankings(ranking.state).map(entry => entry.slug));
  const pathIfExists = (candidate: string) => (available.has(candidate) ? rankingPath(ranking.state, candidate, locale) : undefined);
  const otherStates = getRankingGroups().filter(entry => entry.slug === ranking.slug && entry.state !== ranking.state);
  const showSector = ranking.sector === null;
  const [naplanBefore, naplanAfter] = t.naplan.split('{link}');
  const values = { state: full, group, ranked: ranking.ranked.toLocaleString('en-AU'), shown: ranking.rows.length };

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
      <h1 className="text-2xl font-bold tracking-tight">{capitalize(formatMessage(t.heading, values))}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {formatMessage(ranking.rows.length < ranking.ranked ? t.introTop : t.introAll, values)}
        {ranking.unranked > 0 && <> {formatMessage(t.unranked, { count: ranking.unranked })}</>}
      </p>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-gray-500">{t.filterType}</span>
          {RANKING_TYPES.map(type => (
            <Pill
              key={type}
              active={type === ranking.schoolType}
              href={pathIfExists(rankingSlug({ schoolType: type, sector: ranking.sector }))
                ?? pathIfExists(rankingSlug({ schoolType: type, sector: null }))}
            >
              {capitalize(t[`type${type}`])}
            </Pill>
          ))}
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

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[36rem]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 [&>th]:whitespace-nowrap">
              <th scope="col" className="w-10 py-2 pr-2 font-medium">#</th>
              <th scope="col" className="py-2 pr-3 font-medium">{st.compareColName}</th>
              <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{t.colSuburb}</th>
              {showSector && <th scope="col" className="py-2 pr-3 font-medium">{st.fieldSector}</th>}
              <th scope="col" className="py-2 pr-3 text-right font-medium">{st.fieldIcsea}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{st.statStudents}</th>
              <th scope="col" className="py-2 text-right font-medium">{st.statRatio}</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map(({ school, slug: schoolSlug, rank }) => {
              const students = metricValue(school, 'enrolments');
              const ratio = metricValue(school, 'ratio');
              return (
                <tr key={school.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 tabular-nums text-gray-500">{rank}</td>
                  <td className="py-2 pr-3">
                    <Link href={schoolPath(school.state, schoolSlug, locale)} className="text-indigo-700 hover:underline">
                      {school.school_name}
                    </Link>
                    {/* Narrow screens fold the suburb under the name so ICSEA stays in view. */}
                    <span className="block text-xs text-gray-500 sm:hidden">{school.suburb}</span>
                  </td>
                  <td className="hidden py-2 pr-3 sm:table-cell">
                    <Link href={suburbPath(school.state, school.suburb, locale)} className="text-gray-600 hover:text-indigo-700 hover:underline">
                      {school.suburb}
                    </Link>
                  </td>
                  {showSector && (
                    <td className="py-2 pr-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${sectorBadgeClass(school.sector)}`}>
                        {getSectorLabel(school.sector, dictionary)}
                      </span>
                    </td>
                  )}
                  <td className="py-2 pr-3 text-right tabular-nums">{metricValue(school, 'icsea')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{students === null ? '—' : students.toLocaleString('en-AU')}</td>
                  <td className="py-2 text-right tabular-nums">{ratio === null ? '—' : ratio.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">{formatMessage(t.method, { ...values, year: ACARA_DATA_YEAR })}</p>
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
