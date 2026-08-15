"use client";

import { School } from '@/types/school';
import { formatMessage, Messages } from '@/lib/i18n';
import type { CatchmentFeature } from '@/lib/catchmentLookup';

const SCHOOL_FINDER_URL = 'https://education.nsw.gov.au/school-finder';

interface CatchmentLookupProps {
  results: CatchmentFeature[] | null;
  schoolsByLocationAgeId: Map<number, School>;
  loading: boolean;
  error: boolean;
  dictionary: Messages;
  onClear: () => void;
  onPickSchool: (school: School) => void;
  variant?: 'panel' | 'sheet';
}

export default function CatchmentLookup({
  results,
  schoolsByLocationAgeId,
  loading,
  error,
  dictionary,
  onClear,
  onPickSchool,
  variant = 'panel',
}: CatchmentLookupProps) {
  const wrapClass = variant === 'panel'
    ? 'absolute top-14 right-3 z-20 w-64 max-h-[calc(100vh-5rem)] bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-white';

  // Primary before secondary before future — the order a parent reads them in.
  const order = { primary: 0, secondary: 1, future: 2 } as const;
  const sorted = [...(results ?? [])].sort((a, b) => order[a.properties.kind] - order[b.properties.kind]);

  return (
    <div className={wrapClass}>
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-indigo-600">{dictionary.lookup.title}</span>
        <button onClick={onClear} className="text-gray-400 hover:text-gray-700 text-base leading-none">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <p className="text-xs text-gray-400 py-4 text-center">{dictionary.lookup.searching}</p>}

        {!loading && error && <p className="text-xs text-red-600 py-4 text-center">{dictionary.lookup.error}</p>}

        {!loading && !error && sorted.length === 0 && (
          <div className="py-4 space-y-2">
            <p className="text-xs text-gray-500 text-center">{dictionary.lookup.noResults}</p>
            <p className="text-[10px] text-gray-400 text-center">{dictionary.catchment.nswOnly}</p>
          </div>
        )}

        {!loading && !error && sorted.map(feature => {
          const school = schoolsByLocationAgeId.get(feature.properties.location_age_id);
          return (
            <button
              key={`${feature.properties.location_age_id}-${feature.properties.kind}`}
              onClick={() => school && onPickSchool(school)}
              disabled={!school}
              className="w-full text-left p-2.5 rounded-lg bg-white border border-gray-100 hover:border-indigo-300 hover:shadow-sm transition-all disabled:cursor-default"
            >
              <div className="text-[9px] font-semibold uppercase tracking-wide text-indigo-600">
                {dictionary.catchment[feature.properties.kind]}
              </div>
              <div className="text-xs font-semibold text-gray-900 leading-tight mt-0.5">
                {feature.properties.school_name}
              </div>
              {school && (
                <div className="text-[10px] text-gray-400 mt-0.5">{school.suburb}, {school.state}</div>
              )}
              <div className="text-[10px] text-gray-400 mt-1">
                {formatMessage(dictionary.catchment.years, { levels: feature.properties.year_levels.join(', ') })}
              </div>
              <div className="text-[9px] text-gray-400">
                {formatMessage(dictionary.catchment.dataYear, { year: feature.properties.data_year })}
              </div>
            </button>
          );
        })}

        {!loading && !error && sorted.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <p className="text-[9px] text-gray-500 leading-snug">{dictionary.catchment.disclaimer}</p>
            <a
              href={SCHOOL_FINDER_URL}
              target="_blank"
              rel="noreferrer"
              className="block text-[10px] font-medium text-indigo-600 hover:underline"
            >
              {dictionary.catchment.officialLink} →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
