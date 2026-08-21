import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStateSummary, groupSuburbsByInitial } from '@/lib/schoolsData';
import { formatMessage } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, mapUrl, stateIndexPath, suburbPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';

export function stateIndexMetadata(locale: Locale, state: string): Metadata {
  const summary = getStateSummary(state);
  if (!summary) return {};

  const t = getSeo(locale).stateIndex;
  const values = {
    state: localeStateName(locale, summary.state),
    schools: summary.schools.toLocaleString(),
    suburbs: summary.suburbs.length.toLocaleString(),
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

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={stateIndexPath(summary.state)}
      dataYear={2025}
      crumbs={[{ label: shell.browseByState, href: browsePath(locale) }, { label: full }]}
    >
      <h1 className="text-2xl font-bold tracking-tight">
        {formatMessage(t.heading, { state: full })}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {formatMessage(t.counts, {
          schools: summary.schools.toLocaleString(),
          suburbs: summary.suburbs.length.toLocaleString(),
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={mapUrl({ locale })}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          {shell.openMap}
        </Link>
      </div>

      {summary.zoned > 0 ? (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900">
          {formatMessage(t.zonedNote, { count: summary.zoned.toLocaleString(), state: full })}
        </p>
      ) : (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          {formatMessage(t.notCollectedNote, { state: full })}
        </p>
      )}

      <nav aria-label={t.jumpToLetter} className="mt-6 flex flex-wrap gap-1">
        {groups.map(([initial]) => (
          <a
            key={initial}
            href={`#letter-${initial}`}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:border-indigo-400 hover:text-indigo-700"
          >
            {initial}
          </a>
        ))}
      </nav>

      {groups.map(([initial, suburbs]) => (
        <section key={initial} id={`letter-${initial}`} className="mt-6 scroll-mt-4">
          <h2 className="text-base font-semibold border-b border-gray-100 pb-1">{initial}</h2>
          <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {suburbs.map(group => (
              <li key={group.slug} className="text-sm">
                <Link
                  href={suburbPath(group.state, group.suburb, locale)}
                  className="text-indigo-700 hover:underline"
                >
                  {group.suburb}
                </Link>
                <span className="text-gray-400 text-xs"> ({group.schools.length})</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
