import type { Metadata } from 'next';
import Link from 'next/link';
import { getLargestSuburbs, getSchoolsDataset, getStateRankings, getStateSummaries } from '@/lib/schoolsData';
import { coveredCatchmentStates, formatMessage, getMessages } from '@/lib/i18n';
import { catchmentStateCodes } from '@/lib/catchmentStates';
import { buildPageMetadata, getSeo, localeStateName, type Locale } from '@/lib/seoLocale';
import { mapUrl, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';
import RankingLinks from '@/components/seo/RankingLinks';

const BARE_PATH = '/browse';

export function browseMetadata(locale: Locale): Metadata {
  const t = getSeo(locale).browse;
  const dataset = getSchoolsDataset();

  return buildPageMetadata({
    locale,
    title: t.metaTitle,
    description: formatMessage(t.metaDescription, {
      schools: dataset.schools.length.toLocaleString(),
      states: coveredCatchmentStates(getMessages(locale), locale),
    }),
    bareEnglishPath: BARE_PATH,
  });
}

export default function BrowseBody({ locale }: { locale: Locale }) {
  const t = getSeo(locale).browse;
  const states = getStateSummaries();
  const dataset = getSchoolsDataset();
  const largest = getLargestSuburbs(null, 24);
  // Both lists come from the catchment registry, so the note cannot fall
  // behind the data again (it once said "NSW only" with six states built).
  const collected = new Set(catchmentStateCodes());
  const uncovered = states
    .filter(summary => !collected.has(summary.state))
    .map(summary => (locale === 'zh' ? localeStateName(locale, summary.state) : summary.state))
    .join(locale === 'zh' ? '、' : ', ');

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={BARE_PATH}
      dataYear={ACARA_DATA_YEAR}
      crumbs={[{ label: t.heading }]}
    >
      <header className="bs-hero">
      <h1 className="bs-h1">{t.heading}</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-2">
        {formatMessage(t.intro, {
          schools: dataset.schools.length.toLocaleString(),
          suburbs: dataset.suburbs.size.toLocaleString(),
          year: ACARA_DATA_YEAR,
        })}
      </p>

      <div className="mt-6">
        <Link
          href={mapUrl({ locale })}
          className="bs-btn"
        >
          {getSeo(locale).shell.openMap}
        </Link>
      </div>
      </header>

      <section className="bs-section" aria-labelledby="states">
        <h2 id="states" className="bs-h2">{t.statesHeading}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {states.map(summary => (
            <li key={summary.slug}>
              <Link
                href={stateIndexPath(summary.state, locale)}
                className="bs-tile h-full"
              >
                <span className="block font-display text-lg font-bold tracking-tight text-ink">
                  {localeStateName(locale, summary.state)}
                </span>
                <span className="block text-[13px] text-muted mt-0.5">
                  {formatMessage(t.stateMeta, {
                    schools: summary.schools.toLocaleString(),
                    suburbs: summary.suburbs.length.toLocaleString(),
                  })}
                  {summary.zoned > 0 && ` · ${formatMessage(t.stateZoned, { count: summary.zoned.toLocaleString() })}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bs-section" aria-labelledby="rankings">
        <h2 id="rankings" className="bs-h2">{t.rankingsHeading}</h2>
        <p className="mt-1.5 text-sm text-muted">{t.rankingsHint}</p>
        <div className="mt-2 space-y-3">
          {states.map(summary => {
            // All-sector views only: the sector cuts are one click away on each page.
            const rankings = getStateRankings(summary.state).filter(ranking => ranking.sector === null);
            if (rankings.length === 0) return null;
            return (
              <div key={summary.slug}>
                <h3 className="bs-label">{localeStateName(locale, summary.state)}</h3>
                <RankingLinks rankings={rankings} locale={locale} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="bs-section" aria-labelledby="largest">
        <h2 id="largest" className="bs-h2">{t.largestHeading}</h2>
        <p className="mt-1.5 text-sm text-muted">{t.largestHint}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {largest.map(group => (
            <li key={`${group.state}-${group.slug}`}>
              <Link
                href={suburbPath(group.state, group.suburb, locale)}
                className="bs-chip hover:text-link"
              >
                {group.suburb}
                <span className="text-xs text-muted">{group.state} · {group.schools.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bs-section">
        <h2 className="bs-h2 text-xl">{t.zonesHeading}</h2>
        <p className="mt-1.5 text-[15px] text-ink-2">
          {formatMessage(t.zonesBody, { covered: coveredCatchmentStates(getMessages(locale), locale) })}
          {uncovered && `${locale === 'zh' ? '' : ' '}${formatMessage(t.zonesUncovered, { uncovered })}`}
        </p>
      </section>
    </PageShell>
  );
}
