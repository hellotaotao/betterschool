"use client";

import { School } from '@/types/school';
import { coveredCatchmentStates, formatMessage, getReligionLabel, getSchoolTypeLabel, getSectorLabel, Locale, Messages } from '@/lib/i18n';
import { catchmentAbsenceKind, catchmentStateInfo } from '@/lib/catchmentStates';
import { hasLegacyScore } from '@/utils/schoolFilters';
import ZoneSwatch from './ZoneSwatch';

interface SchoolDetailProps {
  school: School;
  dictionary: Messages;
  locale: Locale;
  onClose: () => void;
  variant?: 'panel' | 'sheet';
  catchmentVisible?: boolean;
  onToggleCatchment?: () => void;
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
  catchmentVisible = false,
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
    ? 'absolute right-3 bottom-3 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-white';

  return (
    <div className={wrapClass} style={isPanel ? { top: topOffset ?? 56 } : undefined}>
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-indigo-600">{dictionary.details.title}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-base leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* No headline score: a single number per school is the league-table
            framing this project deliberately avoids. */}
        <div className="mb-3">
          <h2 className="text-sm font-bold text-gray-900 leading-tight">
            {school.school_name}
          </h2>
          <p className="text-[10px] text-gray-400 mt-0.5">
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
            className="mb-3 flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {dictionary.details.fullProfile}
            <span aria-hidden="true">→</span>
          </a>
        )}

        <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{dictionary.details.sector}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                school.sector === 'Government'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {getSectorLabel(school.sector, dictionary)}
            </span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{dictionary.details.religiousAffiliation}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                school.is_religious === true
                  ? 'bg-purple-100 text-purple-700'
                  : school.is_religious === false
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-gray-50 text-gray-400'
              }`}
            >
              {getReligionLabel(school.religious_affiliation, dictionary)}
            </span>
          </div>
          {school.school_type && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.schoolType}</span>
                <span className="font-medium text-gray-800">
                  {getSchoolTypeLabel(school.school_type, dictionary)}
                </span>
              </div>
            </>
          )}
          {school.campus_type && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{dictionary.details.campusType}</span>
                <span className="font-medium text-gray-800 text-right">{school.campus_type}</span>
              </div>
            </>
          )}
          {school.year_range && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.yearRange}</span>
                <span className="font-medium text-gray-800">{school.year_range}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500" title={dictionary.details.icseaHint}>{dictionary.details.icsea}</span>
                <span className="font-medium text-gray-800">{school.icsea}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea_percentile) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.icseaPercentile}</span>
                <span className="font-medium text-gray-800">{school.icsea_percentile}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.total_enrolments) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.enrolments}</span>
                <span className="font-medium text-gray-800">{school.total_enrolments}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.girls) && Number.isFinite(school.boys) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.girlsBoys}</span>
                <span className="font-medium text-gray-800">{school.girls} / {school.boys}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.lbote_yes_percent) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.lbote}</span>
                <span className="font-medium text-gray-800">{school.lbote_yes_percent}%</span>
              </div>
            </>
          )}
          {Number.isFinite(school.indigenous_percent) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.indigenous}</span>
                <span className="font-medium text-gray-800">{school.indigenous_percent}%</span>
              </div>
            </>
          )}
          <div className="border-t border-gray-100" />
          <div className="flex justify-between">
            <span className="text-gray-500">{dictionary.details.postcode}</span>
            <span className="font-medium text-gray-800">{school.postcode}</span>
          </div>
          {school.governing_body && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{dictionary.details.governingBody}</span>
                <span className="font-medium text-gray-800 text-right">{school.governing_body}</span>
              </div>
            </>
          )}
          {school.school_url && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.website}</span>
                <a className="font-medium text-indigo-600 hover:underline" href={school.school_url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </>
          )}
          {school.fees && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{dictionary.details.fees}</span>
                <span className="font-medium text-gray-800 text-right">
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
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.naplan}</span>
                <a className="font-medium text-indigo-600 hover:underline" href={school.myschool_url} target="_blank" rel="noreferrer">{dictionary.details.viewOnMySchool}</a>
              </div>
            </>
          )}
        </div>

        {/* Catchments are a statutory feature of government enrolment only. For
            every other sector the honest answer is not "no zone found" but
            "zones do not apply", which is a different statement. */}
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2.5 space-y-2 text-xs">
          <div className="text-[10px] font-semibold text-blue-900">{dictionary.catchment.title}</div>

          {catchments.length > 0 ? (
            <>
              {catchments.map(catchment => (
                <div key={`${catchment.kind}-${catchment.catch_type}`} className="space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-blue-800/70">
                      <ZoneSwatch kind={catchment.kind} />
                      {dictionary.catchment[catchment.kind]}
                    </span>
                    {catchment.year_levels.length > 0 && (
                      <span className="font-medium text-blue-900 text-right">
                        {formatMessage(dictionary.catchment.years, { levels: catchment.year_levels.join(', ') })}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-blue-800/60">
                    {formatMessage(dictionary.catchment.dataYear, { year: catchment.data_year })}
                    {catchment.effective_year
                      ? ` · ${formatMessage(dictionary.catchment.effectiveFrom, { year: catchment.effective_year })}`
                      : ''}
                  </div>
                </div>
              ))}

              {onToggleCatchment && (
                <button
                  onClick={onToggleCatchment}
                  className={`w-full rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    catchmentVisible
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  {catchmentVisible ? dictionary.catchment.hide : dictionary.catchment.show}
                </button>
              )}

              {catchmentError && (
                <p className="text-[9px] text-red-600">{dictionary.catchment.loadError}</p>
              )}

              <p className="text-[9px] text-blue-800/80 leading-snug">
                {formatMessage(dictionary.catchment.disclaimer, { state: stateLabel })}
              </p>
              <a
                href={finderUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-[10px] font-medium text-blue-700 hover:underline"
              >
                {formatMessage(dictionary.catchment.officialLink, { state: stateLabel })} →
              </a>
            </>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[9px] text-blue-800/70 leading-snug">
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
                  className="block text-[10px] font-medium text-blue-700 hover:underline"
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
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 space-y-2 text-xs">
            <div className="text-[10px] font-semibold text-amber-900">
              {dictionary.details.legacySectionTitle}
            </div>
            <div className="flex justify-between">
              <span className="text-amber-800/70">{dictionary.details.legacyScore}</span>
              <span className="font-medium text-amber-900">{school.legacy_score}</span>
            </div>
            <div className="border-t border-amber-200/60" />
            <div className="flex justify-between">
              <span className="text-amber-800/70">{dictionary.details.datasetRank}</span>
              <span className="font-medium text-amber-900">#{school.legacy_rank}</span>
            </div>
            <p className="text-[9px] text-amber-800/80 leading-snug">
              {dictionary.details.legacyCaveat}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
