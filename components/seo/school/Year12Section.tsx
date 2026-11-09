import Link from 'next/link';
import type { School } from '@/types/school';
import { getLatestYear12Year, getVceStateRank } from '@/lib/schoolsData';
import { VCE_MIN_STUDENTS } from '@/lib/rankings';
import { formatMessage, ordinalNumber } from '@/lib/i18n';
import { getSeo, localeStateLabel, type Locale } from '@/lib/seoLocale';
import { rankingPath } from '@/lib/slug';

const dash = (value: number | null, suffix = '') => (value === null ? '—' : `${value}${suffix}`);

/**
 * The school's published VCE results, newest year first, with where the
 * latest year places it in the state ranking. Renders nothing for a school
 * VCAA reports no results for.
 */
export default function Year12Section({ school, locale }: { school: School; locale: Locale }) {
  const results = school.year12;
  if (!results || results.length === 0) return null;

  const t = getSeo(locale).school;
  const stateLabel = localeStateLabel(locale, school.state);
  const latestYear = getLatestYear12Year();
  const latest = results[0].year === latestYear ? results[0] : null;
  const placement = latest ? getVceStateRank(school) : null;
  const stateRank = placement && 'rank' in placement ? placement : null;
  const excluded = placement && 'excluded' in placement ? placement.excluded : null;
  const anyWithheld = results.some(result => Object.keys(result.withheld ?? {}).length > 0);

  return (
    <section className="bs-section" aria-labelledby="year12">
      <h2 id="year12" className="bs-h2">{t.y12Heading}</h2>
      {stateRank && (
        <p className="mt-2 text-sm text-ink-2">
          {formatMessage(t.y12Rank, {
            rank: ordinalNumber(stateRank.rank, locale),
            count: stateRank.of,
            year: latest!.year,
            min: VCE_MIN_STUDENTS,
          })}
        </p>
      )}
      {latest && excluded && (
        <p className="mt-2 text-sm text-ink-2">
          {formatMessage(excluded === 'early_only' ? t.y12EarlyOnly : t.y12Small, { year: latest.year, min: VCE_MIN_STUDENTS })}
        </p>
      )}
      <div className="mt-3 overflow-x-auto scroll-shadow-x">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-[13px] text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t.y12ColYear}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{t.y12ColMedian}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{t.y12Col40}</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{t.y12ColStudents}</th>
              <th scope="col" className="py-2 text-right font-medium">{t.y12ColCompletion}</th>
            </tr>
          </thead>
          <tbody>
            {results.map(result => (
              <tr key={result.year} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">{result.year}</th>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">{dash(result.median_study_score)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{dash(result.pct_study_scores_40_plus, '%')}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{dash(result.vce_students)}</td>
                <td className="py-2 text-right tabular-nums">{dash(result.vce_completion_pct, '%')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {anyWithheld && <>{t.y12Withheld} </>}
        {t.y12Source}
      </p>
      {stateRank && (
        <p className="mt-2 text-[13px]">
          <Link href={rankingPath(school.state, stateRank.slug, locale)} className="text-link hover:underline">
            {formatMessage(t.y12Link, { state: stateLabel })} →
          </Link>
        </p>
      )}
    </section>
  );
}
