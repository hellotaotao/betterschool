"use client";

import { RefObject } from 'react';
import { MapSchool } from '@/types/school';
import { getSchoolTypeLabel, getSectorLabel, formatMessage, Locale, Messages } from '@/lib/i18n';
import DirectoryLinks from './DirectoryLinks';
import { sectorBadgeClass } from '@/utils/schoolFilters';

type SortKey = 'name' | 'icsea' | 'enrolments';

/** Upper bound on list cards kept in the DOM at once. */
const MAX_RENDERED = 150;

interface AreaSummary {
  government: number;
  catholic: number;
  independent: number;
  averageIcsea: number | null;
}

interface SchoolListProps {
  schools: MapSchool[];
  selectedSchool: MapSchool | null;
  sortBy: SortKey;
  onSortChange: (v: SortKey) => void;
  onSchoolClick: (s: MapSchool) => void;
  areaSummary: AreaSummary;
  areaLabel: string;
  loading: boolean;
  dictionary: Messages;
  locale: Locale;
  selectedCardRef: RefObject<HTMLDivElement | null>;
}

export default function SchoolList({
  schools,
  selectedSchool,
  sortBy,
  onSortChange,
  onSchoolClick,
  areaSummary,
  areaLabel,
  loading,
  dictionary,
  locale,
  selectedCardRef,
}: SchoolListProps) {
  // The viewport can legitimately contain every school in the country — the map
  // opens at a whole-of-Australia view before geolocation moves it. Rendering
  // 11,034 cards there costs far more than it tells anyone, so cap the DOM and
  // say plainly that the list is truncated.
  const rendered = schools.slice(0, MAX_RENDERED);
  const truncated = schools.length - rendered.length;

  return (
    <div className="w-full h-full bg-white/95 backdrop-blur-sm flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-gray-800">
          {areaLabel}
        </span>
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as SortKey)}
          aria-label={dictionary.sidebar.sortLabel}
          className="text-xs text-gray-500 border-0 bg-transparent cursor-pointer focus:outline-none"
        >
          <option value="name">{dictionary.sidebar.sortByName}</option>
          <option value="icsea">{dictionary.sidebar.sortByIcsea}</option>
          <option value="enrolments">{dictionary.sidebar.sortByEnrolments}</option>
        </select>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 bg-indigo-50/70 text-[10px] text-indigo-950 leading-snug shrink-0 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>{formatMessage(dictionary.sidebar.visibleCount, { count: schools.length })}</div>
        <div>{formatMessage(dictionary.sidebar.averageIcsea, { value: areaSummary.averageIcsea ?? '—' })}</div>
        <div className="col-span-2">{formatMessage(dictionary.sidebar.sectorCounts, { government: areaSummary.government, catholic: areaSummary.catholic, independent: areaSummary.independent })}</div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/70 text-[10px] text-amber-900 leading-snug shrink-0">
        <div className="font-semibold">{dictionary.dataNotice.title}</div>
        <div>{dictionary.dataNotice.body}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-8">{dictionary.sidebar.loading}</p>
        ) : schools.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">
            {dictionary.sidebar.emptyTitle}
            <br />
            <span className="text-gray-300">{dictionary.sidebar.emptyHint}</span>
          </p>
        ) : (
          rendered.map((school) => {
            const sid = school.id;
            const isSelected = !!selectedSchool && selectedSchool.id === sid;
            return (
              <div
                key={sid}
                ref={isSelected ? selectedCardRef : null}
                onClick={() => onSchoolClick(school)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-indigo-50 border border-indigo-400 shadow-sm'
                    : 'bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <h3 className="text-xs font-semibold text-gray-900 leading-tight">
                  {school.school_name}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {school.suburb}, {school.state}
                </p>
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${sectorBadgeClass(school.sector)}`}
                  >
                    {getSectorLabel(school.sector, dictionary)}
                  </span>
                  {school.school_type && (
                    <span className="text-[10px] text-gray-400">
                      {getSchoolTypeLabel(school.school_type, dictionary)}
                    </span>
                  )}
                  {Number.isFinite(school.total_enrolments) && (
                    <span className="text-[10px] text-gray-400">
                      {formatMessage(dictionary.sidebar.studentsShort, { count: Number(school.total_enrolments) })}
                    </span>
                  )}
                  {Number.isFinite(school.icsea) && (
                    <span className="text-[10px] text-gray-400">ICSEA {school.icsea}</span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {truncated > 0 && (
          <p className="text-center text-[10px] text-gray-400 py-3">
            {formatMessage(dictionary.sidebar.listTruncated, { shown: rendered.length, total: schools.length })}
          </p>
        )}
      </div>

      <DirectoryLinks locale={locale} dictionary={dictionary} />
    </div>
  );
}
