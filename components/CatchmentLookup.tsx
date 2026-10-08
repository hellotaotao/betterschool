"use client";

import { MapSchool } from '@/types/school';
import ZoneSwatch from './ZoneSwatch';
import { coveredCatchmentStates, formatMessage, Locale, Messages } from '@/lib/i18n';
import { catchmentStateInfo } from '@/lib/catchmentStates';
import { zoneKey, type CatchmentFeature } from '@/lib/catchmentLookup';

interface CatchmentLookupProps {
  results: CatchmentFeature[] | null;
  /** State slug inferred from the collected zone envelopes for an empty result. */
  lookupState: string | null;
  schoolsByLocationAgeId: Map<number, MapSchool>;
  loading: boolean;
  error: boolean;
  dictionary: Messages;
  locale: Locale;
  onClear: () => void;
  onPickSchool: (school: MapSchool) => void;
  variant?: 'panel' | 'sheet';
  /** Distance from the viewport top to sit below the (wrapping) top bar. */
  topOffset?: number;
}

export default function CatchmentLookup({
  results,
  lookupState,
  schoolsByLocationAgeId,
  loading,
  error,
  dictionary,
  locale,
  onClear,
  onPickSchool,
  variant = 'panel',
  topOffset,
}: CatchmentLookupProps) {
  const isPanel = variant === 'panel';
  const wrapClass = isPanel
    ? 'absolute right-3 bottom-3 z-20 w-64 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-white';

  // Primary before secondary before future — the order a parent reads them in.
  const order = { primary: 0, secondary: 1, future: 2 } as const;
  const sorted = [...(results ?? [])].sort((a, b) => order[a.properties.kind] - order[b.properties.kind]);
  // Two zones of one kind over a single address is normal here, not an error —
  // single-sex highs cover the same ground, and senior campuses sit on top of
  // 7-12 schools. Say so, rather than leaving the reader to guess.
  const overlapping = (['primary', 'secondary', 'future'] as const)
    .some(kind => sorted.filter(f => f.properties.kind === kind).length > 1);

  // A point sits in one state, so the first result that resolves to a school
  // settles which department's finder is the authoritative one to link.
  const resultState = sorted
    .map(feature => schoolsByLocationAgeId.get(feature.properties.location_age_id)?.state)
    .find(Boolean) ?? lookupState;
  const stateInfo = resultState ? catchmentStateInfo(resultState) : null;
  const finderUrl = stateInfo?.finderUrl;
  const stateLabel = stateInfo
    ? (locale === 'zh' ? (dictionary.seo.states as Record<string, string>)[stateInfo.state] ?? stateInfo.state : stateInfo.state)
    : '';

  return (
    <div className={wrapClass} style={isPanel ? { top: topOffset ?? 56 } : undefined}>
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-indigo-600">{dictionary.lookup.title}</span>
        <button onClick={onClear} aria-label={dictionary.close} className="text-gray-400 hover:text-gray-700 text-base leading-none">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <p className="text-xs text-gray-400 py-4 text-center">{dictionary.lookup.searching}</p>}

        {!loading && error && <p className="text-xs text-red-600 py-4 text-center">{dictionary.lookup.error}</p>}

        {!loading && !error && sorted.length === 0 && (
          <div className="py-4 space-y-2">
            <p className="text-xs text-gray-500 text-center">{dictionary.lookup.noResults}</p>
            <p className="text-[10px] text-gray-400 text-center">
              {stateInfo
                ? formatMessage(
                  stateInfo.complete
                    ? dictionary.catchment.notPublishedAtPoint
                    : dictionary.catchment.partialAtPoint,
                  { state: stateLabel },
                )
                : formatMessage(dictionary.catchment.statesOnly, {
                  states: coveredCatchmentStates(dictionary, locale),
                })}
            </p>
            {finderUrl && (
              <a
                href={finderUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-[10px] font-medium text-indigo-600 hover:underline"
              >
                {formatMessage(dictionary.catchment.officialLink, { state: stateLabel })} →
              </a>
            )}
          </div>
        )}

        {!loading && !error && overlapping && (
          <p className="rounded-md bg-blue-50/70 px-2.5 py-2 text-[10px] leading-snug text-blue-900">
            {dictionary.catchment.overlapNote}
          </p>
        )}

        {!loading && !error && sorted.map(feature => {
          const school = schoolsByLocationAgeId.get(feature.properties.location_age_id);
          return (
            <button
              key={zoneKey(feature)}
              onClick={() => school && onPickSchool(school)}
              disabled={!school}
              className="w-full text-left p-2.5 rounded-lg bg-white border border-gray-100 hover:border-indigo-300 hover:shadow-sm transition-all disabled:cursor-default"
            >
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-600">
                <ZoneSwatch kind={feature.properties.kind} />
                {dictionary.catchment[feature.properties.kind]}
              </div>
              <div className="text-xs font-semibold text-gray-900 leading-tight mt-0.5">
                {feature.properties.school_name}
              </div>
              {school && (
                <div className="text-[10px] text-gray-400 mt-0.5">{school.suburb}, {school.state}</div>
              )}
              {feature.properties.year_levels.length > 0 && (
                <div className="text-[10px] text-gray-400 mt-1">
                  {formatMessage(dictionary.catchment.years, { levels: feature.properties.year_levels.join(', ') })}
                </div>
              )}
              <div className="text-[9px] text-gray-400">
                {formatMessage(dictionary.catchment.dataYear, { year: feature.properties.data_year })}
              </div>
            </button>
          );
        })}

        {!loading && !error && sorted.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <p className="text-[9px] text-gray-500 leading-snug">
              {formatMessage(dictionary.catchment.disclaimer, { state: stateLabel })}
            </p>
            {finderUrl && (
              <a
                href={finderUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-[10px] font-medium text-indigo-600 hover:underline"
              >
                {formatMessage(dictionary.catchment.officialLink, { state: stateLabel })} →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
