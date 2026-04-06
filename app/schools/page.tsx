"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  detectBrowserLocale,
  formatMessage,
  getMessages,
  getSchoolTypeLabel,
  getSectorLabel,
  Locale,
} from '@/lib/i18n';
import { School } from '@/types/school';
import { FilterState, filterSchools } from '@/utils/schoolFilters';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
});

export default function SchoolsPage() {
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<Locale>('en');
  const [filters, setFilters] = useState<FilterState>({
    sector: 'all',
    minScore: 'all',
    schoolType: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [sortBy, setSortBy] = useState<'rank' | 'score'>('rank');
  const [geoReady, setGeoReady] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const dictionary = useMemo(() => getMessages(locale), [locale]);

  const sectorOptions: { label: string; value: FilterState['sector'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.government, value: 'Government' },
    { label: dictionary.filters.nonGovernment, value: 'Non-government' },
  ], [dictionary]);

  const scoreOptions: { label: string; value: FilterState['minScore'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.score80, value: '80' },
    { label: dictionary.filters.score90, value: '90' },
    { label: dictionary.filters.score95, value: '95' },
  ], [dictionary]);

  const typeOptions: { label: string; value: FilterState['schoolType'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.primary, value: 'Primary' },
    { label: dictionary.filters.combined, value: 'Combined' },
    { label: dictionary.filters.secondary, value: 'Secondary' },
  ], [dictionary]);

  useEffect(() => {
    fetch('/data/schools.json')
      .then(res => res.json())
      .then((data: School[]) => {
        setAllSchools(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const languages = navigator.languages?.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];

    setLocale(detectBrowserLocale(languages));
  }, []);

  const filteredSchools = useMemo(
    () => filterSchools(allSchools, filters),
    [allSchools, filters]
  );

  const displayedSchools = useMemo(() => {
    return [...visibleSchools].sort((a, b) =>
      sortBy === 'rank' ? a.rank - b.rank : b.score - a.score
    );
  }, [visibleSchools, sortBy]);

  useEffect(() => {
    if (selectedSchool && selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSchool]);

  const handleGeoReady = useCallback(() => setGeoReady(true), []);

  function schoolId(s: School) {
    return `${s.school_name}-${s.postcode}`;
  }

  function handleSchoolClick(school: School) {
    setSelectedSchool(prev =>
      prev && schoolId(prev) === schoolId(school) ? null : school
    );
  }

  function handleMapClick() {
    setSelectedSchool(null);
  }

  const areaLabel = geoReady
    ? formatMessage(dictionary.sidebar.areaCount, { count: displayedSchools.length })
    : dictionary.sidebar.locating;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gray-100">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            {dictionary.loadingMap}
          </div>
        ) : (
          <SchoolMap
            schools={filteredSchools}
            selectedSchool={selectedSchool}
            onSchoolClick={handleSchoolClick}
            onBoundsChange={setVisibleSchools}
            onMapClick={handleMapClick}
            flyToSchool={selectedSchool}
            onGeoReady={handleGeoReady}
          />
        )}
      </div>

      <div className="absolute top-3 left-3 right-3 z-10 flex gap-2 flex-wrap items-center pointer-events-none">
        <div className="pointer-events-auto flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {sectorOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, sector: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.sector === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {scoreOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, minScore: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.minScore === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {typeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, schoolType: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.schoolType === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`absolute top-14 left-3 bottom-3 z-10 flex transition-all duration-300 ${
          leftPanelOpen ? 'w-72' : 'w-8'
        }`}
      >
        <button
          onClick={() => setLeftPanelOpen(o => !o)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-12 bg-white rounded-r-md shadow-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
          title={leftPanelOpen ? dictionary.sidebar.collapseList : dictionary.sidebar.expandList}
        >
          {leftPanelOpen ? '‹' : '›'}
        </button>

        {leftPanelOpen && (
          <div className="w-full bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-gray-800">
                {areaLabel}
              </span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'rank' | 'score')}
                className="text-xs text-gray-500 border-0 bg-transparent cursor-pointer focus:outline-none"
              >
                <option value="rank">{dictionary.sidebar.sortByRank}</option>
                <option value="score">{dictionary.sidebar.sortByScore}</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <p className="text-center text-xs text-gray-400 py-8">{dictionary.sidebar.loading}</p>
              ) : !geoReady ? (
                <p className="text-center text-xs text-gray-400 py-8">{dictionary.sidebar.locating}</p>
              ) : displayedSchools.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">
                  {dictionary.sidebar.emptyTitle}
                  <br />
                  <span className="text-gray-300">{dictionary.sidebar.emptyHint}</span>
                </p>
              ) : (
                displayedSchools.map((school) => {
                  const sid = schoolId(school);
                  const isSelected = !!selectedSchool && schoolId(selectedSchool) === sid;
                  return (
                    <div
                      key={sid}
                      ref={isSelected ? selectedCardRef : null}
                      onClick={() => handleSchoolClick(school)}
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
                          {school.score}
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
                        <span className="text-[10px] text-gray-400">#{school.rank}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {selectedSchool && (
        <div className="absolute top-14 right-3 bottom-3 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-indigo-600">{dictionary.details.title}</span>
            <button
              onClick={handleMapClick}
              className="text-gray-400 hover:text-gray-700 text-base leading-none"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex justify-between items-start gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900 leading-tight">
                  {selectedSchool.school_name}
                </h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {selectedSchool.suburb}, {selectedSchool.state} {selectedSchool.postcode}
                </p>
              </div>
              <div className="shrink-0 bg-indigo-600 text-white text-center rounded-lg px-2 py-1">
                <div className="text-lg font-black leading-none">{selectedSchool.score}</div>
                <div className="text-[8px] font-normal">{dictionary.details.score}</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.nationalRank}</span>
                <span className="font-bold text-gray-800">#{selectedSchool.rank}</span>
              </div>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{dictionary.details.sector}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    selectedSchool.sector === 'Government'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {getSectorLabel(selectedSchool.sector, dictionary)}
                </span>
              </div>
              {selectedSchool.school_type && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.schoolType}</span>
                    <span className="font-medium text-gray-800">
                      {getSchoolTypeLabel(selectedSchool.school_type, dictionary)}
                    </span>
                  </div>
                </>
              )}
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.postcode}</span>
                <span className="font-medium text-gray-800">{selectedSchool.postcode}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-[10px] text-gray-600 space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 border border-white inline-block shrink-0"></span>
          {dictionary.legend.governmentSchools}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 border border-white inline-block shrink-0"></span>
          {dictionary.legend.nonGovernmentSchools}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex gap-0.5 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-gray-400 inline-block"></span>
          </span>
          <span>{dictionary.legend.sizeEqualsScore}</span>
        </div>
      </div>
    </div>
  );
}
