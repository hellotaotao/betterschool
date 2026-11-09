import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { School } from '@/types/school';
import { getLatestYear12Year, getRelatedSuburbs, getSchoolSlug, getStateRankings, getSuburb, latestYear12 } from '@/lib/schoolsData';
import { formatMessage, getMessages, getSchoolTypeLabel, getSectorLabel } from '@/lib/i18n';
import { buildPageMetadata, getSeo, localeStateLabel, localeStateName, type Locale } from '@/lib/seoLocale';
import { browsePath, catchmentPath, mapUrl, schoolPath, stateIndexPath, suburbPath } from '@/lib/slug';
import { displayRanks, metricValue, sortByMetric } from '@/lib/schoolCompare';
import { sectorBadgeClass } from '@/utils/schoolFilters';
import { catchmentStateCodes, catchmentStateInfo, usesSchoolZone } from '@/lib/catchmentStates';
import PageShell from '@/components/seo/PageShell';
import SchoolLinkCard from '@/components/seo/SchoolLinkCard';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';
import RankingLinks from '@/components/seo/RankingLinks';

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
    description: formatMessage(values.count === 1 ? t.metaDescriptionOne : t.metaDescription, values),
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

  const st = getSeo(locale).school;
  const byType = groupByType(group.schools);
  // Only the rankings these schools appear in: their types, and VCE where one
  // of them published results.
  const resultsYear = getLatestYear12Year();
  const suburbRankings = getStateRankings(group.state).filter(ranking => ranking.sector === null && (
    ranking.schoolType === 'VCE'
      ? group.schools.some(school => latestYear12(school, resultsYear)?.median_study_score != null)
      : group.schools.some(school => school.school_type === ranking.schoolType)
  ));
  const ranked = sortByMetric(group.schools, 'icsea');
  const rankedPositions = displayRanks(ranked, 'icsea');
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
      dataYear={ACARA_DATA_YEAR}
      crumbs={[
        { label: shell.browseByState, href: browsePath(locale) },
        { label: full, href: stateIndexPath(group.state, locale) },
        { label: group.suburb },
      ]}
    >
      <header className="bs-hero">
      <h1 className="bs-h1">
        {formatMessage(t.heading, { suburb: group.suburb, state: full })}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {formatMessage(group.schools.length === 1 ? t.schoolCountOne : t.schoolCount, { count: group.schools.length })}
        {group.postcodes.length > 0 && ` · ${formatMessage(t.postcode, { postcodes: group.postcodes.join(', ') })}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(sectorCounts).map(([sector, count]) => (
          <span key={sector} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${sectorBadgeClass(sector)}`}>
            {count} {getSectorLabel(sector, dictionary)}
          </span>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href={mapUrl({ locale, suburb: { state: group.state, suburb: group.suburb } })}
          className="bs-btn"
        >
          {formatMessage(t.exploreOnMap, { suburb: group.suburb })}
        </Link>
      </div>
      </header>

      {ranked.length >= 2 && (
        <section className="bs-section" aria-labelledby="compare">
          <h2 id="compare" className="bs-h2">
            {formatMessage(t.compareHeading, { suburb: group.suburb })}
          </h2>
          <div className="mt-3 overflow-x-auto scroll-shadow-x">
            <table className="w-full min-w-[36rem] text-[15px]">
              <thead>
                <tr className="border-b border-line-strong text-left text-[13px] text-muted">
                  <th scope="col" className="w-8 py-2 pr-2 font-medium">#</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{st.compareColName}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{st.fieldType}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{st.fieldSector}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{st.fieldIcsea}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{st.statStudents}</th>
                  <th scope="col" className="py-2 text-right font-medium">{st.statRatio}</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((school, index) => {
                  const icsea = metricValue(school, 'icsea');
                  const students = metricValue(school, 'enrolments');
                  const ratio = metricValue(school, 'ratio');
                  return (
                    <tr key={school.id} className="border-b border-line">
                      <td className="py-2 pr-2 tabular-nums text-muted">{rankedPositions[index] ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Link href={schoolPath(school.state, getSchoolSlug(school), locale)} className="bs-link">
                          {school.school_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-ink-2">{school.school_type ? getSchoolTypeLabel(school.school_type, dictionary) : '—'}</td>
                      <td className="py-2 pr-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${sectorBadgeClass(school.sector)}`}>
                          {getSectorLabel(school.sector, dictionary)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{icsea ?? '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{students === null ? '—' : students.toLocaleString('en-AU')}</td>
                      <td className="py-2 text-right tabular-nums">{ratio === null ? '—' : ratio.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[13px] text-muted">{formatMessage(t.compareNote, { year: ACARA_DATA_YEAR })}</p>
        </section>
      )}

      {suburbRankings.length > 0 && (
        <section className="bs-section" aria-labelledby="rankings">
          <h2 id="rankings" className="bs-h2 text-xl">
            {formatMessage(t.rankingsHeading, { suburb: group.suburb, state: full })}
          </h2>
          <RankingLinks rankings={suburbRankings} locale={locale} />
        </section>
      )}

      {byType.map(([type, schools]) => (
        <section key={type} className="bs-section" aria-labelledby={`type-${type}`}>
          <h2 id={`type-${type}`} className="bs-h2">
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

      <section className="bs-section" aria-labelledby="zones">
        <h2 id="zones" className="bs-h2">{t.zonesHeading}</h2>
        {!zoneState ? (
          <p className="mt-2 text-[15px] text-ink-2">
            {formatMessage(t.zonesOtherState, { state: full, states: coveredStates })}
          </p>
        ) : zoned.length > 0 ? (
          <>
            <p className="mt-2 text-[15px] text-ink-2">
              {formatMessage(zoned.length === 1 ? t.zonesPresentOne : t.zonesPresent, { count: zoned.length, suburb: group.suburb })}
            </p>
            <ul className="mt-2 list-disc pl-5 text-[15px]">
              {zoned.map(school => (
                <li key={school.id}>
                  <Link
                    href={catchmentPath(school.state, getSchoolSlug(school), locale)}
                    className="bs-link"
                  >
                    {formatMessage(usesSchoolZone(school.state) ? t.catchmentLinkZone : t.catchmentLink, { school: school.school_name })}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-ink-2">
            {zoneState.complete
              ? formatMessage(t.zonesNone, { suburb: group.suburb })
              : formatMessage(t.zonesNonePartial, { suburb: group.suburb, state: full })}{' '}
            <Link
              href={mapUrl({ locale, suburb: { state: group.state, suburb: group.suburb } })}
              className="bs-link"
            >
              {t.zonesNoneCta}
            </Link>
          </p>
        )}
      </section>

      {related.length > 0 && (
        <section className="bs-section" aria-labelledby="related">
          <h2 id="related" className="bs-h2">{t.relatedHeading}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {formatMessage(t.relatedHint, { suburb: group.suburb })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map(({ group: other, km }) => (
              <li key={`${other.state}-${other.slug}`}>
                <Link
                  href={suburbPath(other.state, other.suburb, locale)}
                  className="bs-chip hover:text-link"
                >
                  {other.suburb}
                  <span className="text-xs text-muted">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
