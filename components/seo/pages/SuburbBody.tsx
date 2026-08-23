import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import { getRelatedSuburbs, getSchoolSlug, getSuburb } from '@/lib/schoolsData';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, catchmentPath, mapUrl, stateIndexPath, suburbPath } from '@/lib/slug';
import { catchmentStateCodes, catchmentStateInfo } from '@/lib/catchmentStates';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';

/** Group order matches how a parent thinks about stages, not alphabetical. */
const TYPE_ORDER = ['Primary', 'Combined', 'Secondary', 'Special'];

function groupByType(schools: School[]): [string, School[]][] {
  const groups = new Map<string, School[]>();
  for (const school of schools) {
    const key = school.school_type || 'Other';
    const bucket = groups.get(key);
    if (bucket) bucket.push(school);
    else groups.set(key, [school]);
  }
  return [...groups.entries()].sort(
    (a, b) => (TYPE_ORDER.indexOf(a[0]) + 1 || 99) - (TYPE_ORDER.indexOf(b[0]) + 1 || 99),
  );
}

export function suburbMetadata(locale: Locale, state: string, slug: string): Metadata {
  const group = getSuburb(state, slug);
  if (!group) return {};

  const t = getSeo(locale).suburb;
  const values = {
    suburb: group.suburb,
    state: localeStateLabel(locale, group.state),
    count: group.schools.length,
  };

  return buildPageMetadata({
    locale,
    title: formatMessage(t.metaTitle, values),
    description: formatMessage(t.metaDescription, values),
    bareEnglishPath: suburbPath(group.state, group.suburb),
  });
}

export default function SuburbBody({ locale, state, slug }: { locale: Locale; state: string; slug: string }) {
  const group = getSuburb(state, slug);
  if (!group) notFound();

  const t = getSeo(locale).suburb;
  const shell = getSeo(locale).shell;
  const dictionary = getMessages(locale);
  const full = localeStateName(locale, group.state);

  const byType = groupByType(group.schools);
  const related = getRelatedSuburbs(group);
  const sectorCounts = group.schools.reduce<Record<string, number>>((acc, school) => {
    acc[school.sector] = (acc[school.sector] ?? 0) + 1;
    return acc;
  }, {});
  const zoned = group.schools.filter(school => (school.catchments?.length ?? 0) > 0);
  const zoneState = catchmentStateInfo(group.state);
  const coveredStates = catchmentStateCodes().map(code => localeStateLabel(locale, code)).join(', ');

  return (
    <PageShell
      locale={locale}
      bareEnglishPath={suburbPath(group.state, group.suburb)}
      dataYear={2025}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(group.state, locale) },
        { label: group.suburb },
      ]}
    >
      <h1 className="text-2xl font-bold tracking-tight">
        {formatMessage(t.heading, { suburb: group.suburb, state: full })}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {formatMessage(t.schoolCount, { count: group.schools.length })}
        {group.postcodes.length > 0 && ` · ${formatMessage(t.postcode, { postcodes: group.postcodes.join(', ') })}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {Object.entries(sectorCounts).map(([sector, count]) => (
          <span key={sector} className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
            {count} {getSectorLabel(sector, dictionary)}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <Link
          href={mapUrl({ locale, suburb: { state: group.state, suburb: group.suburb } })}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          {formatMessage(t.exploreOnMap, { suburb: group.suburb })}
        </Link>
      </div>

      {byType.map(([type, schools]) => (
        <section key={type} className="mt-8" aria-labelledby={`type-${type}`}>
          <h2 id={`type-${type}`} className="text-base font-semibold">
            {formatMessage(t.typeHeading, {
              type: getSchoolTypeLabel(type, dictionary),
              count: schools.length,
            })}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {schools.map(school => (
              <SchoolLinkCard key={school.id} school={school} slug={getSchoolSlug(school)} locale={locale} />
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-8" aria-labelledby="zones">
        <h2 id="zones" className="text-base font-semibold">{t.zonesHeading}</h2>
        {!zoneState ? (
          <p className="mt-2 text-sm text-gray-600">
            {formatMessage(t.zonesOtherState, { state: full, states: coveredStates })}
          </p>
        ) : zoned.length > 0 ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              {formatMessage(t.zonesPresent, { count: zoned.length, suburb: group.suburb })}
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {zoned.map(school => (
                <li key={school.id}>
                  <Link
                    href={catchmentPath(school.state, getSchoolSlug(school), locale)}
                    className="text-indigo-700 hover:underline"
                  >
                    {formatMessage(t.catchmentLink, { school: school.school_name })}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            {zoneState.complete
              ? formatMessage(t.zonesNone, { suburb: group.suburb })
              : formatMessage(t.zonesNonePartial, { suburb: group.suburb, state: full })}{' '}
            <Link
              href={mapUrl({ locale, suburb: { state: group.state, suburb: group.suburb } })}
              className="text-indigo-700 hover:underline"
            >
              {t.zonesNoneCta}
            </Link>
          </p>
        )}
      </section>

      {related.length > 0 && (
        <section className="mt-8" aria-labelledby="related">
          <h2 id="related" className="text-base font-semibold">{t.relatedHeading}</h2>
          <p className="mt-1 text-xs text-gray-500">
            {formatMessage(t.relatedHint, { suburb: group.suburb })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map(({ group: other, km }) => (
              <li key={`${other.state}-${other.slug}`}>
                <Link
                  href={suburbPath(other.state, other.suburb, locale)}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
                >
                  {other.suburb}
                  <span className="text-[10px] text-gray-400">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
