import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLargestSuburbs, getStateRankings, getStateSummaries, getStateSummary, groupSuburbsByInitial } from '@/lib/schoolsData';
import { formatMessage } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, mapUrl, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';
import RankingLinks from '@/components/seo/RankingLinks';

export function stateIndexMetadata(locale: Locale, state: string): Metadata {
  const summary = getStateSummary(state);
  if (!summary) return {};

  const t = getSeo(locale).stateIndex;
  const values = {
    state: localeStateName(locale, summary.state),
    schools: summary.schools.toLocaleString(),
    suburbs: summary.suburbs.length.toLocaleString(),
    year: ACARA_DATA_YEAR,
  };

  return buildPageMetadata({
    locale,
    title: formatMessage(t.metaTitle, values),
    description: formatMessage(t.metaDescription, values),
    bareEnglishPath: stateIndexPath(summary.state),
  });
}

export default function StateIndexBody({ locale, state }: { locale: Locale; state: string }) {
  const summary = getStateSummary(state);
  if (!summary) notFound();

  const t = getSeo(locale).stateIndex;
  const shell = getSeo(locale).shell;
  const groups = groupSuburbsByInitial(summary.suburbs);
  const full = localeStateName(locale, summary.state);
  const largest = getLargestSuburbs(summary.state, 12);
  const siblings = getStateSummaries().filter(other => other.state !== summary.state);
  const rankings = getStateRankings(summary.state);

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={stateIndexPath(summary.state)}
      dataYear={ACARA_DATA_YEAR}
      crumbs={[{ label: shell.browseByState, href: browsePath(locale) }, { label: full }]}
    >
      <header className="bs-hero">
      <h1 className="bs-h1">
        {formatMessage(t.heading, { state: full })}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {formatMessage(t.counts, {
          schools: summary.schools.toLocaleString(),
          suburbs: summary.suburbs.length.toLocaleString(),
        })}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={mapUrl({ locale })}
          className="bs-btn"
        >
          {shell.openMap}
        </Link>
      </div>

      {summary.zoned > 0 ? (
        <p className="mt-6 max-w-2xl text-[15px] text-ink-2">
          {formatMessage(t.zonedNote, { count: summary.zoned.toLocaleString(), state: full })}
        </p>
      ) : (
        <p className="mt-6 max-w-2xl text-[15px] text-ink-2">
          {formatMessage(t.notCollectedNote, { state: full })}
        </p>
      )}
      </header>

      {rankings.length > 0 && (
        <section className="bs-section" aria-labelledby="rankings">
          <h2 id="rankings" className="bs-h2">
            {formatMessage(t.rankingsHeading, { state: full })}
          </h2>
          <p className="mt-1.5 text-sm text-muted">{t.rankingsHint}</p>
          <RankingLinks rankings={rankings} locale={locale} />
        </section>
      )}

      <section className="bs-section" aria-labelledby="largest">
        <h2 id="largest" className="bs-h2">
          {formatMessage(t.largestHeading, { state: full })}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {largest.map(group => (
            <li key={group.slug}>
              <Link
                href={suburbPath(group.state, group.suburb, locale)}
                className="bs-chip hover:text-link"
              >
                {group.suburb}
                <span className="text-xs text-muted">{group.schools.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bs-section" aria-labelledby="all-suburbs">
      <h2 id="all-suburbs" className="bs-h2">
        {formatMessage(t.allSuburbsHeading, { state: full })}
      </h2>

      <nav aria-label={t.jumpToLetter} className="mt-3 flex flex-wrap gap-1">
        {groups.map(([initial]) => (
          <a
            key={initial}
            href={`#letter-${initial}`}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-inner bg-soft px-2 text-sm font-semibold text-ink-2 hover:text-link"
          >
            {initial}
          </a>
        ))}
      </nav>

      {groups.map(([initial, suburbs]) => (
        <section key={initial} id={`letter-${initial}`} className="mt-6 scroll-mt-4">
          <h3 className="border-b border-line pb-1 font-display text-lg font-bold text-ink">{initial}</h3>
          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {suburbs.map(group => (
              <li key={group.slug} className="text-[15px]">
                <Link
                  href={suburbPath(group.state, group.suburb, locale)}
                  className="text-link hover:underline"
                >
                  {group.suburb}
                </Link>
                <span className="text-muted text-[13px]"> ({group.schools.length})</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </section>

      <section className="bs-section" aria-labelledby="other-states">
        <h2 id="other-states" className="bs-h2">{t.otherStatesHeading}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {siblings.map(other => (
            <li key={other.state}>
              <Link
                href={stateIndexPath(other.state, locale)}
                className="bs-chip hover:text-link"
              >
                {localeStateName(locale, other.state)}
                <span className="text-xs text-muted">{other.schools.toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
