import Link from 'next/link';
import type { School } from '@/types/school';
import { getComparisonGroup, getMetricPool, getRanking } from '@/lib/schoolsData';
import {
  COMPARE_METRICS,
  METRIC_ORDER,
  displayRanks,
  metricValue,
  rankAmong,
  sortByMetric,
  type CompareMetric,
  type Rank,
} from '@/lib/schoolCompare';
import { percentAbove, percentBelow } from '@/lib/schoolInsights';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel, ordinalNumber } from '@/lib/i18n';
import { getSeo, localeRankingGroup, localeStateLabel, type Locale } from '@/lib/seoLocale';
import { rankingPath, schoolPath } from '@/lib/slug';
import { rankingSlug, RANKING_TYPES, type RankingType } from '@/lib/rankings';
import { sectorBadgeClass } from '@/utils/schoolFilters';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';

const MAX_KM = 15;
const GROUP_SIZE = 10;
// A percentile over a handful of schools is noise; same floor as the size highlight.
const STATE_POOL_MIN = 20;

/** "secondary" inside an English sentence; Chinese needs 学校 after 综合 but not after 中学. */
function typeNoun(locale: Locale, schoolType: string): string {
  const label = getSchoolTypeLabel(schoolType, getMessages(locale));
  if (locale === 'en') return label.toLowerCase();
  return /学校?$/.test(label) ? label : `${label}学校`;
}

/**
 * The school set against its nearest same-type schools and against its state:
 * ICSEA, size and students per teacher, then the nearby group listed by ICSEA.
 * Renders nothing when there is nothing to compare with.
 */
export default function ComparisonSection({ school, locale }: { school: School; locale: Locale }) {
  if (!school.school_type) return null;

  const t = getSeo(locale).school;
  const dictionary = getMessages(locale);
  const stateLabel = localeStateLabel(locale, school.state);
  const noun = typeNoun(locale, school.school_type);
  const number = (value: number) => value.toLocaleString('en-AU');

  const neighbours = getComparisonGroup(school, GROUP_SIZE, MAX_KM);
  const group: School[] = [school, ...neighbours.map(entry => entry.school)];
  const hasNearby = group.length >= 3;
  const kmById = new Map(neighbours.map(entry => [entry.school.id, entry.km]));
  const slugById = new Map(neighbours.map(entry => [entry.school.id, entry.slug]));

  // First and last read as words ("Largest of 9", "Smallest of 9"); the
  // last place is named from the other end rather than "9th largest of 9".
  const rankText = (metric: CompareMetric, rank: Rank): string => {
    const [top, ordered, bottom] = metric === 'icsea'
      ? [t.compareTopHigh, t.compareRankHigh, t.compareTopLow]
      : metric === 'enrolments'
        ? [t.compareTopLarge, t.compareRankLarge, t.compareBottomLarge]
        : [t.compareTopLow, t.compareRankLow, t.compareTopHigh];
    if (rank.rank === 1) return formatMessage(top, { count: rank.of });
    if (rank.rank === rank.of) return formatMessage(bottom, { count: rank.of });
    return formatMessage(ordered, { rank: ordinalNumber(rank.rank, locale), count: rank.of });
  };

  // Said from whichever end the school is nearer, so a school low in its
  // state reads "Lower than 80%" rather than "Higher than 3%".
  const stateText = (metric: CompareMetric, value: number): string | null => {
    const pool = getMetricPool(school.state, school.school_type, metric);
    if (pool.length < STATE_POOL_MIN) return null;
    const below = percentBelow(pool, value);
    const above = percentAbove(pool, value);
    if (metric === 'icsea') {
      return below >= above ? formatMessage(t.comparePctHigher, { percent: below }) : formatMessage(t.comparePctLower, { percent: above });
    }
    if (metric === 'enrolments') {
      return below >= above ? formatMessage(t.comparePctLarger, { percent: below }) : formatMessage(t.comparePctSmaller, { percent: above });
    }
    return below >= above ? formatMessage(t.comparePctHigher, { percent: below }) : formatMessage(t.comparePctLower, { percent: above });
  };

  const label: Record<CompareMetric, string> = { icsea: t.fieldIcsea, enrolments: t.statStudents, ratio: t.statRatio };
  const rows = COMPARE_METRICS.flatMap(metric => {
    const value = metricValue(school, metric);
    if (value === null) return [];
    const nearby = hasNearby ? rankAmong(group.map(entry => metricValue(entry, metric)), value, METRIC_ORDER[metric]) : null;
    const state = stateText(metric, value);
    if (!nearby && !state) return [];
    return [{
      metric,
      value: metric === 'ratio' ? value.toFixed(1) : metric === 'icsea' ? String(value) : number(value),
      nearby: nearby ? rankText(metric, nearby) : '—',
      state: state ?? '—',
    }];
  });
  if (rows.length === 0) return null;

  const showNearbyColumn = rows.some(row => row.nearby !== '—');
  const stateRanking = (RANKING_TYPES as readonly string[]).includes(school.school_type)
    ? getRanking(school.state, rankingSlug({ schoolType: school.school_type as RankingType, sector: null }))
    : undefined;
  const listed = hasNearby ? sortByMetric(group, 'icsea') : [];
  const listRanks = displayRanks(listed, 'icsea');

  return (
    <section className="mt-10" aria-labelledby="compare">
      <h2 id="compare" className="text-lg font-semibold tracking-tight">
        {formatMessage(t.compareHeading, { school: school.school_name })}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th scope="col" className="py-2 pr-3 font-medium">{t.compareColMeasure}</th>
              <th scope="col" className="py-2 pr-3 font-medium">{t.compareColSchool}</th>
              {showNearbyColumn && <th scope="col" className="py-2 pr-3 font-medium">{t.compareColNearby}</th>}
              <th scope="col" className="py-2 font-medium">{formatMessage(t.compareColState, { state: stateLabel })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.metric} className="border-b border-gray-100">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-gray-600">{label[row.metric]}</th>
                <td className="py-2 pr-3 font-semibold tabular-nums">{row.value}</td>
                {showNearbyColumn && <td className="py-2 pr-3">{row.nearby}</td>}
                <td className="py-2">{row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {showNearbyColumn && <>{formatMessage(t.compareIntroNearby, { count: group.length, type: noun, km: MAX_KM })} </>}
        {formatMessage(t.compareIntroState, { type: noun, state: stateLabel })}{' '}
        {formatMessage(t.compareSource, { year: ACARA_DATA_YEAR })}
      </p>
      {stateRanking && (
        <p className="mt-2 text-xs">
          <Link href={rankingPath(stateRanking.state, stateRanking.slug, locale)} className="text-indigo-700 hover:underline">
            {formatMessage(t.compareRankingLink, {
              group: localeRankingGroup(locale, stateRanking.schoolType, null),
              state: stateLabel,
            })}{' '}→
          </Link>
        </p>
      )}

      {listed.length >= 3 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">
            {formatMessage(t.compareListHeading, { type: getSchoolTypeLabel(school.school_type, dictionary) })}
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th scope="col" className="w-8 py-2 pr-2 font-medium">#</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t.compareColName}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t.fieldSector}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t.compareColDistance}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t.fieldIcsea}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t.statStudents}</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((entry, index) => {
                  const isSelf = entry.id === school.id;
                  const slug = slugById.get(entry.id);
                  const km = kmById.get(entry.id);
                  const icsea = metricValue(entry, 'icsea');
                  const students = metricValue(entry, 'enrolments');
                  return (
                    <tr key={entry.id} className={`border-b border-gray-100 ${isSelf ? 'bg-slate-50 font-semibold' : ''}`}>
                      <td className="py-2 pr-2 tabular-nums text-gray-500">{listRanks[index] ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {isSelf || !slug ? (
                          <span>
                            {entry.school_name}
                            {isSelf && <span className="ml-1 text-xs font-normal text-gray-500">({t.compareThisSchool})</span>}
                          </span>
                        ) : (
                          <Link href={schoolPath(entry.state, slug, locale)} className="text-indigo-700 hover:underline">
                            {entry.school_name}
                          </Link>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sectorBadgeClass(entry.sector)}`}>
                          {getSectorLabel(entry.sector, dictionary)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                        {km === undefined ? '—' : formatMessage(t.diagramKm, { km: km.toFixed(1) })}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{icsea ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums">{students === null ? '—' : number(students)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">{t.icseaNote}</p>
        </>
      )}
    </section>
  );
}
