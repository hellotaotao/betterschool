import type { School } from '@/types/school';
import { annualFigure, type FeeRecord, type FeeRow } from '@/lib/feesData';
import { gradeCohorts, gradeShortLabel, studentsPerTeacher } from '@/lib/schoolInsights';
import { formatMessage, getMessages, getReligionLabel, ordinalNumber } from '@/lib/i18n';
import { getSeo, type Locale } from '@/lib/seoLocale';
import { ACARA_DATA_YEAR } from '@/lib/dataYear';

/**
 * The school's profile as a set of small pictures rather than a column of
 * "field: value" rows. Each panel answers one question a parent brings — how
 * much, how big each year is, girls and boys, who the students are, how many
 * teachers — and is drawn only when its figures exist, so a thin record makes
 * a short section instead of a page of dashes.
 */

type Copy = ReturnType<typeof getSeo>['school'];

const money = (value: number) => `$${value.toLocaleString('en-AU')}`;
const pct = (value: number, max: number) => `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bs-stat">
      <h3 className="bs-label">{title}</h3>
      {children}
    </div>
  );
}

function yearsLabel(t: Copy, years: string): string {
  const pretty = years.replace('-', '–');
  return /^\d/.test(years) ? formatMessage(t.feesYear, { years: pretty }) : pretty;
}

function FeesPanel({ t, locale, school, record }: { t: Copy; locale: Locale; school: School; record: FeeRecord }) {
  if (school.sector === 'Government') {
    return (
      <Panel title={t.feesHeading}>
        <p className="mt-2 text-2xl font-bold text-ink">{t.feesFree}</p>
        <p className="mt-1 text-[13px] text-muted">{t.feesFreeNote}</p>
      </Panel>
    );
  }
  if (record.status !== 'found') {
    return (
      <Panel title={t.feesHeading}>
        <p className="mt-2 text-[15px] text-ink-2">
          {record.status === 'not_published' ? t.feesNotPublished : t.feesNotCollected}
        </p>
      </Panel>
    );
  }

  const { fees } = record;
  const max = Math.max(...fees.by_year.map(row => annualFigure(row) ?? 0));
  const shown = (row: FeeRow) => (row.per_term != null && row.terms != null && row.total == null && row.tuition == null
    ? formatMessage(t.feesPerTerm, { amount: money(row.per_term), terms: row.terms })
    : money(annualFigure(row) ?? 0));
  const hasTotal = fees.by_year.some(row => row.total != null);

  return (
    <Panel title={t.feesHeading}>
      <p className="mt-1 text-[13px] text-muted">
        {fees.fee_year
          ? formatMessage(t.feesYearLabel, { year: fees.fee_year })
          : formatMessage(t.feesNoYear, { date: record.checked })}
      </p>
      <ul className="mt-3 space-y-2">
        {fees.by_year.map(row => (
          <li key={row.years} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
            <span className="text-[13px] font-semibold text-ink-2">{yearsLabel(t, row.years)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand" style={{ width: pct(annualFigure(row) ?? 0, max) }} />
            </span>
            <span className="text-right text-[15px] font-semibold tabular-nums text-ink">{shown(row)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-muted">
        {hasTotal ? t.feesBasisTotal : t.feesBasisTuition}
        {/* The ledger's notes are written in English; a Chinese page keeps the localised line only. */}
        {locale === 'en' && fees.other_compulsory ? ` ${fees.other_compulsory}.` : ''}
      </p>
      {/* nofollow: the source is cited for the reader, not endorsed for ranking. */}
      <a href={fees.source_url} target="_blank" rel="nofollow noopener noreferrer" className="bs-link mt-1 inline-block text-[13px]">
        {fees.source === 'school_website' ? t.feesSourceSchool : t.feesSourceSystem} →
      </a>
    </Panel>
  );
}

function CohortPanel({ t, school }: { t: Copy; school: School }) {
  const bars = gradeCohorts(school).map(cohort => ({
    ...cohort,
    label: gradeShortLabel(cohort.key, school.state)
      ?? (cohort.key === 'two_years_before_year_1' ? t.gradePre
        : cohort.key === 'primary_ungraded' ? t.gradeUngradedPrimary : t.gradeUngradedSecondary),
  }));
  if (bars.length < 2) return null;
  const max = Math.max(...bars.map(bar => bar.count ?? 0));
  return (
    <Panel title={t.cohortHeading}>
      <ol className="mt-3 flex h-28 items-end gap-1">
        {bars.map(bar => (
          <li key={bar.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="text-[11px] tabular-nums text-muted">{bar.count ?? '–'}</span>
            <span
              className="mt-0.5 w-full max-w-9 rounded-t-sm bg-data-3"
              style={{ height: bar.count ? pct(bar.count, max) : '0' }}
            />
            <span className="mt-1 w-full truncate text-center text-[11px] font-semibold text-ink-2" title={bar.label}>
              {bar.label.length > 4 ? bar.label.slice(0, 3) : bar.label}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function GenderPanel({ t, school }: { t: Copy; school: School }) {
  const girls = Number(school.girls);
  const boys = Number(school.boys);
  if (!Number.isFinite(girls) || !Number.isFinite(boys) || girls + boys === 0) return null;
  if (girls === 0 || boys === 0) {
    return (
      <Panel title={t.genderHeading}>
        <p className="mt-2 text-2xl font-bold text-ink">{boys === 0 ? t.genderGirlsOnly : t.genderBoysOnly}</p>
      </Panel>
    );
  }
  const share = Math.round((girls / (girls + boys)) * 100);
  return (
    <Panel title={t.genderHeading}>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
        <span className="bg-data-2" style={{ width: `${share}%` }} />
        <span className="bg-data-4" style={{ width: `${100 - share}%` }} />
      </div>
      <dl className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px]">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-data-2" />
          <dt className="text-muted">{t.genderGirls}</dt>
          <dd className="font-semibold tabular-nums text-ink">{girls.toLocaleString('en-AU')} · {share}%</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-data-4" />
          <dt className="text-muted">{t.genderBoys}</dt>
          <dd className="font-semibold tabular-nums text-ink">{boys.toLocaleString('en-AU')} · {100 - share}%</dd>
        </div>
      </dl>
    </Panel>
  );
}

function Meter({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-data-3" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function BackgroundPanel({ t, locale, school }: { t: Copy; locale: Locale; school: School }) {
  const sea = school.sea_quarters;
  const quarters = sea
    ? [
      { label: t.seaBottom, value: sea.bottom_percent, tone: 'bg-data-1' },
      { label: t.seaLowerMiddle, value: sea.lower_middle_percent, tone: 'bg-data-2' },
      { label: t.seaUpperMiddle, value: sea.upper_middle_percent, tone: 'bg-data-3' },
      { label: t.seaTop, value: sea.top_percent, tone: 'bg-data-4' },
    ].filter((quarter): quarter is { label: string; value: number; tone: string } => Number.isFinite(quarter.value))
    : [];
  // A partial set would read as a whole distribution with a piece missing.
  const showSea = quarters.length === 4;
  const hasIcsea = Number.isFinite(school.icsea);
  const percentile = Number(school.icsea_percentile);
  const meters = [
    { label: t.fieldLbote, value: Number(school.lbote_yes_percent) },
    { label: t.fieldIndigenous, value: Number(school.indigenous_percent) },
  ].filter(meter => Number.isFinite(meter.value));
  if (!hasIcsea && !showSea && meters.length === 0) return null;

  return (
    <Panel title={t.backgroundHeading}>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          {hasIcsea && (
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-ink">{school.icsea}</span>
                <span className="text-[13px] text-muted">
                  ICSEA
                  {Number.isFinite(percentile) && ` · ${formatMessage(t.icseaPercentile, { value: ordinalNumber(percentile, locale) })}`}
                </span>
              </p>
              {Number.isFinite(percentile) && (
                <div className="relative mt-2 h-1.5 rounded-full bg-line" aria-hidden="true">
                  <span className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-sm bg-ink" style={{ left: `calc(${percentile}% - 2px)` }} />
                </div>
              )}
            </div>
          )}
          {meters.map(meter => <Meter key={meter.label} label={meter.label} percent={meter.value} />)}
        </div>
        {showSea && (
          <div>
            <p className="text-[13px] text-muted">{t.seaHeading}</p>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              {quarters.map(quarter => (
                <span key={quarter.label} className={quarter.tone} style={{ width: `${quarter.value}%` }} />
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-1">
              {quarters.map(quarter => (
                <div key={quarter.label}>
                  <dd className="flex items-center gap-1 text-[15px] font-semibold tabular-nums text-ink">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${quarter.tone}`} />
                    {quarter.value}%
                  </dd>
                  <dt className="text-[11px] leading-tight text-muted">{quarter.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <p className="mt-3 text-[13px] text-muted">{t.icseaNote}</p>
    </Panel>
  );
}

function RatioPanel({ t, school }: { t: Copy; school: School }) {
  const ratio = studentsPerTeacher(school);
  if (ratio === null) return null;
  return (
    <Panel title={t.ratioHeading}>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{ratio}</p>
      <p className="mt-1 text-[13px] text-muted">
        {formatMessage(t.ratioNote, { teachers: Number(school.staff?.teaching_fte) })}
      </p>
    </Panel>
  );
}

function BasicsPanel({ t, locale, school }: { t: Copy; locale: Locale; school: School }) {
  const rows = [
    school.religious_affiliation && school.religious_affiliation !== 'Unknown'
      ? { label: t.fieldReligion, value: getReligionLabel(school.religious_affiliation, getMessages(locale)) }
      : null,
    school.governing_body ? { label: t.fieldGoverningBody, value: school.governing_body } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  if (rows.length === 0) return null;
  return (
    <Panel title={t.basicsHeading}>
      <dl className="mt-2 space-y-2 text-[15px]">
        {rows.map(row => (
          <div key={row.label}>
            <dt className="text-[13px] text-muted">{row.label}</dt>
            <dd className="font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default function OverviewSection({ school, locale, fees }: { school: School; locale: Locale; fees: FeeRecord }) {
  const t = getSeo(locale).school;
  return (
    <section className="bs-section" aria-labelledby="overview">
      <h2 id="overview" className="bs-h2">{t.ovHeading}</h2>
      <p className="mt-1.5 text-sm text-muted">{formatMessage(t.ovSource, { year: ACARA_DATA_YEAR })}</p>
      {/* Two fixed columns rather than one flowing grid: the charts differ in
          height by a factor of three, and a flowing grid left holes beside the
          tall ones. The small facts stack in the narrow column. */}
      <div className="mt-5 grid items-start gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <FeesPanel t={t} locale={locale} school={school} record={fees} />
          <CohortPanel t={t} school={school} />
          <BackgroundPanel t={t} locale={locale} school={school} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <GenderPanel t={t} school={school} />
          <RatioPanel t={t} school={school} />
          <BasicsPanel t={t} locale={locale} school={school} />
        </div>
      </div>
    </section>
  );
}
