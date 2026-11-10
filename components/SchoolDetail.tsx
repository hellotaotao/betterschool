"use client";

import { MapSchool, type MapSchoolCatchment } from '@/types/school';
import { coveredCatchmentStates, formatMessage, getReligionLabel, getSchoolTypeLabel, getSectorLabel, Locale, Messages } from '@/lib/i18n';
import { catchmentAbsenceKind, catchmentStateInfo } from '@/lib/catchmentStates';
import { hasLegacyScore, sectorBadgeClass } from '@/utils/schoolFilters';
import ZoneSwatch from './ZoneSwatch';

interface SchoolDetailProps {
  school: MapSchool;
  dictionary: Messages;
  locale: Locale;
  onClose: () => void;
  variant?: 'panel' | 'sheet';
  activeCatchmentUrl?: string;
  onToggleCatchment?: (catchment: MapSchoolCatchment) => void;
  catchmentError?: boolean;
  /** Link to this school's own page, when one can be built. */
  profileHref?: string;
  /** Distance from the viewport top to sit below the (wrapping) top bar. */
  topOffset?: number;
}

export default function SchoolDetail({
  school,
  dictionary,
  locale,
  onClose,
  variant = 'panel',
  activeCatchmentUrl,
  onToggleCatchment,
  catchmentError = false,
  profileHref,
  topOffset,
}: SchoolDetailProps) {
  const catchments = school.catchments ?? [];
  const zoneState = catchmentStateInfo(school.state);
  const finderUrl = zoneState?.finderUrl;
  const stateLabel = locale === 'zh' ? (dictionary.seo.states as Record<string, string>)[school.state] ?? school.state : school.state;
  const isGovernment = school.sector === 'Government';
  const absenceKind = catchmentAbsenceKind(school.state, school.sector);
  const isPanel = variant === 'panel';
  const wrapClass = isPanel
    ? 'absolute right-3 bottom-3 z-10 w-56 bg-surface/95 backdrop-blur-sm rounded-inner shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-surface';

  return (
    <div className={wrapClass} style={isPanel ? { top: topOffset ?? 56 } : undefined}>
      <div className="px-3 py-2.5 border-b border-line flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-link">{dictionary.details.title}</span>
        <button
          onClick={onClose}
          aria-label={dictionary.close}
          className="text-muted hover:text-ink text-base leading-none"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3">
          <h2 className="font-display text-base font-bold tracking-tight text-ink leading-tight">
            {school.school_name}
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            {school.suburb}, {school.state} {school.postcode}
          </p>
        </div>

        {/* The panel is a preview; the school's own page is the shareable,
            linkable version and the way into its suburb and catchment. It was
            previously a pale 11px strip between the title and the data table,
            which read as a divider rather than somewhere to go. */}
        {profileHref && (
          <a
            href={profileHref}
            className="mb-3 flex items-center justify-center gap-1 rounded-ctl bg-brand px-3 py-2 text-xs font-semibold text-on-brand shadow-sm hover:bg-brand-deep"
          >
            {dictionary.details.fullProfile}
            <span aria-hidden="true">→</span>
          </a>
        )}

        <div className="bg-soft rounded-inner p-2.5 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted">{dictionary.details.sector}</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                sectorBadgeClass(school.sector)
              }`}
            >
              {getSectorLabel(school.sector, dictionary)}
            </span>
          </div>
          <div className="border-t border-line" />
          <div className="flex justify-between items-center">
            <span className="text-muted">{dictionary.details.religiousAffiliation}</span>
            <span
              // Neutral tones only: purple sat next to the Catholic violet, and
              // hue on this app means sector.
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                school.is_religious === true
                  ? 'bg-soft-strong text-ink-2'
                  : school.is_religious === false
                    ? 'bg-soft text-ink-2'
                    : 'bg-soft text-muted'
              }`}
            >
              {getReligionLabel(school.religious_affiliation, dictionary)}
            </span>
          </div>
          {school.school_type && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.schoolType}</span>
                <span className="font-medium text-ink">
                  {getSchoolTypeLabel(school.school_type, dictionary)}
                </span>
              </div>
            </>
          )}
          {school.campus_type && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between gap-2">
                <span className="text-muted">{dictionary.details.campusType}</span>
                <span className="font-medium text-ink text-right">{school.campus_type}</span>
              </div>
            </>
          )}
          {school.year_range && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.yearRange}</span>
                <span className="font-medium text-ink">{school.year_range}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted" title={dictionary.details.icseaHint}>{dictionary.details.icsea}</span>
                <span className="font-medium text-ink">{school.icsea}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea_percentile) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.icseaPercentile}</span>
                <span className="font-medium text-ink">{school.icsea_percentile}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.total_enrolments) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.enrolments}</span>
                <span className="font-medium text-ink">{school.total_enrolments}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.girls) && Number.isFinite(school.boys) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.girlsBoys}</span>
                <span className="font-medium text-ink">{school.girls} / {school.boys}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.lbote_yes_percent) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.lbote}</span>
                <span className="font-medium text-ink">{school.lbote_yes_percent}%</span>
              </div>
            </>
          )}
          {Number.isFinite(school.indigenous_percent) && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.indigenous}</span>
                <span className="font-medium text-ink">{school.indigenous_percent}%</span>
              </div>
            </>
          )}
          <div className="border-t border-line" />
          <div className="flex justify-between">
            <span className="text-muted">{dictionary.details.postcode}</span>
            <span className="font-medium text-ink">{school.postcode}</span>
          </div>
          {school.governing_body && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between gap-2">
                <span className="text-muted">{dictionary.details.governingBody}</span>
                <span className="font-medium text-ink text-right">{school.governing_body}</span>
              </div>
            </>
          )}
          {school.school_url && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.website}</span>
                <a className="font-medium text-link hover:underline" href={school.school_url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </>
          )}
          {school.fees && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between items-center">
                <span className="text-muted">{dictionary.details.fees}</span>
                <span className="font-medium text-ink text-right">
                  {school.fees.band === 'free'
                    ? dictionary.details.feeFree
                    : Number.isFinite(school.fees.annual_aud_min)
                      ? `A$${school.fees.annual_aud_min}${Number.isFinite(school.fees.annual_aud_max) && school.fees.annual_aud_max !== school.fees.annual_aud_min ? `–${school.fees.annual_aud_max}` : ''}`
                      : dictionary.details.feeUnknown}
                </span>
              </div>
            </>
          )}
          {school.myschool_url && (
            <>
              <div className="border-t border-line" />
              <div className="flex justify-between">
                <span className="text-muted">{dictionary.details.naplan}</span>
                <a className="font-medium text-link hover:underline" href={school.myschool_url} target="_blank" rel="noreferrer">{dictionary.details.viewOnMySchool}</a>
              </div>
            </>
          )}
        </div>

        {/* Catchments are a statutory feature of government enrolment only. For
            every other sector the honest answer is not "no zone found" but
            "zones do not apply", which is a different statement. */}
        <div className="mt-2 rounded-inner border border-line bg-soft p-2.5 space-y-2 text-xs">
          <div className="text-[11px] font-semibold text-ink">{dictionary.catchment.title}</div>

          {catchments.length > 0 ? (
            <>
              {catchments.map(catchment => {
                const visible = activeCatchmentUrl === catchment.geometry_url;
                return (
                  <div key={catchment.geometry_url} className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted">
                        <ZoneSwatch kind={catchment.kind} />
                        {dictionary.catchment[catchment.kind]}
                      </span>
                      {catchment.year_levels.length > 0 && (
                        <span className="font-medium text-ink text-right">
                          {formatMessage(dictionary.catchment.years, { levels: catchment.year_levels.join(', ') })}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted">
                      {formatMessage(dictionary.catchment.dataYear, { year: catchment.data_year })}
                      {catchment.effective_year
                        ? ` · ${formatMessage(dictionary.catchment.effectiveFrom, { year: catchment.effective_year })}`
                        : ''}
                    </div>
                    {onToggleCatchment && (
                      <button
                        onClick={() => onToggleCatchment(catchment)}
                        className={`w-full rounded-ctl px-2 py-1 text-[11px] font-medium transition-colors ${
                          visible
                            ? 'bg-brand text-on-brand hover:bg-brand-deep'
                            : 'bg-surface text-link border border-line-strong hover:bg-soft'
                        }`}
                      >
                        {visible ? dictionary.catchment.hide : dictionary.catchment.show}
                      </button>
                    )}
                  </div>
                );
              })}

              {catchmentError && (
                <p className="text-[11px] text-red-600">{dictionary.catchment.loadError}</p>
              )}

              <p className="text-[11px] text-ink-2 leading-snug">
                {formatMessage(dictionary.catchment.disclaimer, { state: stateLabel })}
              </p>
              <a
                href={finderUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-[11px] font-medium text-link hover:underline"
              >
                {formatMessage(dictionary.catchment.officialLink, { state: stateLabel })} →
              </a>
            </>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted leading-snug">
                {absenceKind === 'non-government'
                  ? dictionary.catchment.nonGovernment
                  : absenceKind === 'not-published'
                    ? dictionary.catchment.notPublished
                    : absenceKind === 'partial-state'
                      ? formatMessage(dictionary.catchment.partialSchool, { state: stateLabel })
                      : formatMessage(dictionary.catchment.statesOnly, {
                        states: coveredCatchmentStates(dictionary, locale),
                      })}
              </p>
              {isGovernment && finderUrl && (
                <a
                  href={finderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[11px] font-medium text-link hover:underline"
                >
                  {formatMessage(dictionary.catchment.officialLink, { state: stateLabel })} →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Legacy import: opaque methodology, covers only ~8% of schools and is
            absent for entire states. Kept for the schools that have it, but
            demoted to the bottom and explicitly caveated. */}
        {hasLegacyScore(school) && (
          <div className="mt-2 rounded-inner border border-on-accent-soft/25 bg-accent-soft p-2.5 space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-on-accent-soft">
              {dictionary.details.legacySectionTitle}
            </div>
            <div className="flex justify-between">
              <span className="text-on-accent-soft/80">{dictionary.details.legacyScore}</span>
              <span className="font-medium text-on-accent-soft">{school.legacy_score}</span>
            </div>
            <div className="border-t border-on-accent-soft/20" />
            <div className="flex justify-between">
              <span className="text-on-accent-soft/80">{dictionary.details.datasetRank}</span>
              <span className="font-medium text-on-accent-soft">#{school.legacy_rank}</span>
            </div>
            <p className="text-[11px] text-on-accent-soft leading-snug">
              {dictionary.details.legacyCaveat}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
