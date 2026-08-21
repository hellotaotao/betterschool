import type { Metadata } from 'next';
import Link from 'next/link';
import { getSchoolsDataset, getStateSummaries } from '@/lib/schoolsData';
import { formatMessage } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeStateName, type Locale } from '@/lib/seoLocale';
import { mapUrl, stateIndexPath } from '@/lib/slug';
import PageShell from '@/components/seo/PageShell';

const BARE_PATH = '/browse';

export function browseMetadata(locale: Locale): Metadata {
  const t = getSeo(locale).browse;
  const dataset = getSchoolsDataset();

  return buildPageMetadata({
    locale,
    title: t.metaTitle,
    description: formatMessage(t.metaDescription, { schools: dataset.schools.length.toLocaleString() }),
    bareEnglishPath: BARE_PATH,
  });
}

export default function BrowseBody({ locale }: { locale: Locale }) {
  const t = getSeo(locale).browse;
  const states = getStateSummaries();
  const dataset = getSchoolsDataset();

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={BARE_PATH}
      dataYear={2025}
      crumbs={[{ label: t.heading }]}
    >
      <h1 className="text-2xl font-bold tracking-tight">{t.heading}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {formatMessage(t.intro, {
          schools: dataset.schools.length.toLocaleString(),
          suburbs: dataset.suburbs.size.toLocaleString(),
        })}
      </p>

      <div className="mt-4">
        <Link
          href={mapUrl({ locale })}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          {getSeo(locale).shell.openMap}
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="states">
        <h2 id="states" className="text-base font-semibold">{t.statesHeading}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {states.map(summary => (
            <li key={summary.slug}>
              <Link
                href={stateIndexPath(summary.state, locale)}
                className="block rounded-lg border border-gray-200 p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
              >
                <span className="block text-sm font-semibold text-gray-900">
                  {localeStateName(locale, summary.state)}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
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

      <section className="mt-8 rounded-lg bg-gray-50 p-3">
        <h2 className="text-sm font-semibold">{t.zonesHeading}</h2>
        <p className="mt-1 text-xs text-gray-600">{t.zonesBody}</p>
      </section>
    </PageShell>
  );
}
