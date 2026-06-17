"use client";

import { RefObject } from 'react';
import { School } from '@/types/school';
import { getSectorLabel, formatMessage, Messages } from '@/lib/i18n';
import { hasLegacyScore } from '@/utils/schoolFilters';

type SortKey = 'name' | 'score' | 'icsea' | 'enrolments';

interface AreaSummary {
  scored: number;
  government: number;
  catholic: number;
  independent: number;
  averageIcsea: number | null;
}

interface SchoolListProps {
  schools: School[];
  selectedSchool: School | null;
  sortBy: SortKey;
  onSortChange: (v: SortKey) => void;
  onSchoolClick: (s: School) => void;
  areaSummary: AreaSummary;
  areaLabel: string;
  loading: boolean;
  geoReady: boolean;
  dictionary: Messages;
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
  geoReady,
  dictionary,
  selectedCardRef,
}: SchoolListProps) {
  return (
    <div className="w-full h-full bg-white/95 backdrop-blur-sm flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-gray-800">
          {areaLabel}
        </span>
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as SortKey)}
          className="text-xs text-gray-500 border-0 bg-transparent cursor-pointer focus:outline-none"
        >
          <option value="name">{dictionary.sidebar.sortByName}</option>
          <option value="score">{dictionary.sidebar.sortByScore}</option>
          <option value="icsea">{dictionary.sidebar.sortByIcsea}</option>
          <option value="enrolments">{dictionary.sidebar.sortByEnrolments}</option>
        </select>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 bg-indigo-50/70 text-[10px] text-indigo-950 leading-snug shrink-0 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>{formatMessage(dictionary.sidebar.visibleCount, { count: schools.length })}</div>
        <div>{formatMessage(dictionary.sidebar.scoredCount, { count: areaSummary.scored })}</div>
        <div>{formatMessage(dictionary.sidebar.sectorCounts, { government: areaSummary.government, catholic: areaSummary.catholic, independent: areaSummary.independent })}</div>
        <div>{formatMessage(dictionary.sidebar.averageIcsea, { value: areaSummary.averageIcsea ?? '—' })}</div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/70 text-[10px] text-amber-900 leading-snug shrink-0">
        <div className="font-semibold">{dictionary.dataNotice.title}</div>
        <div>{dictionary.dataNotice.body}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-8">{dictionary.sidebar.loading}</p>
        ) : !geoReady ? (
          <p className="text-center text-xs text-gray-400 py-8">{dictionary.sidebar.locating}</p>
        ) : schools.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">
            {dictionary.sidebar.emptyTitle}
            <br />
            <span className="text-gray-300">{dictionary.sidebar.emptyHint}</span>
          </p>
        ) : (
          schools.map((school) => {
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
                <div className="flex justify-between items-start gap-1">
                  <h3 className="text-xs font-semibold text-gray-900 leading-tight">
                    {school.school_name}
                  </h3>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {hasLegacyScore(school) ? school.legacy_score : dictionary.sidebar.profileOnly}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {school.suburb}, {school.state}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      school.sector === 'Government'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {getSectorLabel(school.sector, dictionary)}
                  </span>
                  {hasLegacyScore(school) ? (
                    <span className="text-[10px] text-gray-400">{dictionary.sidebar.legacyRank} #{school.legacy_rank}</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">{dictionary.sidebar.profileOnly}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
