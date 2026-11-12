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
import { getMarkerColor } from '@/utils/schoolFilters';
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

  // ICSEA bars share one fixed scale on every page, so a bar means the same
  // length everywhere; nearly every school sits between these two values.
  const BAR_MIN = 800;
  const BAR_MAX = 1250;
  const barWidth = (value: number) => `${Math.round(Math.max(0.04, Math.min(1, (value - BAR_MIN) / (BAR_MAX - BAR_MIN))) * 100)}%`;

  return (
    <section className="bs-section" aria-labelledby="compare">
      <h2 id="compare" className="bs-h2">
        {formatMessage(t.compareHeading, { school: school.school_name })}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {/* Students per teacher stays out: a school-wide average that moves by a
            point or two between schools tells a parent little. */}
        {rows.filter(row => row.metric !== 'ratio').map(row => (
          <li key={row.metric} className="bs-chip">
            <span className="text-muted">{label[row.metric]}</span>
            <span className="font-semibold text-ink">{row.nearby !== '—' ? row.nearby : row.state}</span>
          </li>
        ))}
      </ul>

      {listed.length >= 3 && (
        <ol className="mt-5 space-y-1">
          {listed.map((entry, index) => {
            const isSelf = entry.id === school.id;
            const slug = slugById.get(entry.id);
            const km = kmById.get(entry.id);
            const icsea = metricValue(entry, 'icsea');
            const students = metricValue(entry, 'enrolments');
            return (
              <li
                key={entry.id}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-inner px-2 py-2 sm:grid-cols-[1.5rem_minmax(0,1.3fr)_minmax(0,1fr)_4.5rem] ${isSelf ? 'bg-soft' : ''}`}
              >
                <span className="text-[13px] tabular-nums text-muted">{listRanks[index] ?? '—'}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getMarkerColor(entry.sector) }} />
                    {isSelf || !slug ? (
                      <span className="truncate font-semibold text-ink">{entry.school_name}</span>
                    ) : (
                      <Link href={schoolPath(entry.state, slug, locale)} className="truncate text-link hover:underline">
                        {entry.school_name}
                      </Link>
                    )}
                  </span>
                  <span className="block pl-[1.125rem] text-[13px] text-muted">
                    {isSelf ? t.compareThisSchool : km === undefined ? '' : formatMessage(t.diagramKm, { km: km.toFixed(1) })}
                    {' · '}{getSectorLabel(entry.sector, dictionary)}
                  </span>
                </span>
                <span className="col-span-2 col-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-auto" aria-label={`${t.fieldIcsea} ${icsea ?? '—'}`}>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft-strong">
                    {icsea !== null && (
                      <span className={`block h-full rounded-full ${isSelf ? 'bg-brand' : 'bg-data-2'}`} style={{ width: barWidth(icsea) }} />
                    )}
                  </span>
                  <span className={`w-10 text-right text-[13px] tabular-nums ${isSelf ? 'font-bold text-ink' : 'text-ink-2'}`}>{icsea ?? '—'}</span>
                </span>
                <span className="row-start-1 col-start-3 text-right text-[13px] tabular-nums text-muted sm:col-start-4">
                  {students === null ? '—' : formatMessage(t.compareStudentsShort, { count: number(students) })}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 text-[13px] text-muted">
        {showNearbyColumn && <>{formatMessage(t.compareIntroNearby, { count: group.length, type: noun, km: MAX_KM })} </>}
        {t.icseaNote}{' '}
        {formatMessage(t.compareSource, { year: ACARA_DATA_YEAR })}
      </p>
      {stateRanking && (
        <p className="mt-2 text-[13px]">
          <Link href={rankingPath(stateRanking.state, stateRanking.slug, locale)} className="text-link hover:underline">
            {formatMessage(t.compareRankingLink, {
              group: localeRankingGroup(locale, stateRanking.schoolType, null),
              state: stateLabel,
            })}{' '}→
          </Link>
        </p>
      )}
    </section>
  );
}
