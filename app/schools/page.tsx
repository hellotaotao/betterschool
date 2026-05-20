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
import { FilterState, filterSchools, hasLegacyScore } from '@/utils/schoolFilters';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
});

export default function SchoolsPage() {
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<Locale>('en');
  const [filters, setFilters] = useState<FilterState>({
    sector: 'all',
    schoolType: 'all',
    legacyMetric: 'all',
    icsea: 'all',
    enrolments: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'icsea' | 'enrolments'>('name');
  const [geoReady, setGeoReady] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const dictionary = useMemo(() => getMessages(locale), [locale]);

  const legacyMetricOptions: { label: string; value: FilterState['legacyMetric'] }[] = useMemo(() => [
    { label: dictionary.filters.allOfficial, value: 'all' },
    { label: dictionary.filters.withLegacyScore, value: 'scored' },
    { label: dictionary.filters.profileOnly, value: 'profile' },
  ], [dictionary]);

  const sectorOptions: { label: string; value: FilterState['sector'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.government, value: 'Government' },
    { label: dictionary.filters.catholic, value: 'Catholic' },
    { label: dictionary.filters.independent, value: 'Independent' },
  ], [dictionary]);

  const icseaOptions: { label: string; value: FilterState['icsea'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.icsea900, value: '900' },
    { label: dictionary.filters.icsea1000, value: '1000' },
    { label: dictionary.filters.icsea1100, value: '1100' },
    { label: dictionary.filters.icsea1200, value: '1200' },
  ], [dictionary]);

  const enrolmentOptions: { label: string; value: FilterState['enrolments'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.enrolmentSmall, value: 'small' },
    { label: dictionary.filters.enrolmentMedium, value: 'medium' },
    { label: dictionary.filters.enrolmentLarge, value: 'large' },
  ], [dictionary]);

  const typeOptions: { label: string; value: FilterState['schoolType'] }[] = useMemo(() => [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.primary, value: 'Primary' },
    { label: dictionary.filters.combined, value: 'Combined' },
    { label: dictionary.filters.secondary, value: 'Secondary' },
    { label: dictionary.filters.special, value: 'Special' },
  ], [dictionary]);

  useEffect(() => {
    fetch('/data/schools.canonical.json')
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

    window.setTimeout(() => setLocale(detectBrowserLocale(languages)), 0);
  }, []);

  const filteredSchools = useMemo(
    () => filterSchools(allSchools, filters),
    [allSchools, filters]
  );

  const displayedSchools = useMemo(() => {
    return [...visibleSchools].sort((a, b) => {
      if (sortBy === 'name') return a.school_name.localeCompare(b.school_name);
      if (sortBy === 'score') {
        const aScore = hasLegacyScore(a) ? a.legacy_score : Number.NEGATIVE_INFINITY;
        const bScore = hasLegacyScore(b) ? b.legacy_score : Number.NEGATIVE_INFINITY;
        return bScore - aScore || a.school_name.localeCompare(b.school_name);
      }
      if (sortBy === 'icsea') {
        const aIcsea = Number.isFinite(a.icsea) ? Number(a.icsea) : Number.NEGATIVE_INFINITY;
        const bIcsea = Number.isFinite(b.icsea) ? Number(b.icsea) : Number.NEGATIVE_INFINITY;
        return bIcsea - aIcsea || a.school_name.localeCompare(b.school_name);
      }
      const aEnrolments = Number.isFinite(a.total_enrolments) ? Number(a.total_enrolments) : Number.NEGATIVE_INFINITY;
      const bEnrolments = Number.isFinite(b.total_enrolments) ? Number(b.total_enrolments) : Number.NEGATIVE_INFINITY;
      return bEnrolments - aEnrolments || a.school_name.localeCompare(b.school_name);
    });
  }, [visibleSchools, sortBy]);

  useEffect(() => {
    if (selectedSchool && selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSchool]);

  const handleGeoReady = useCallback(() => setGeoReady(true), []);

  function schoolId(s: School) {
    return s.id;
  }

  function handleSchoolClick(school: School) {
    setSelectedSchool(prev =>
      prev && schoolId(prev) === schoolId(school) ? null : school
    );
  }

  function handleMapClick() {
    setSelectedSchool(null);
  }

  const areaSummary = useMemo(() => {
    const scored = visibleSchools.filter(hasLegacyScore).length;
    const government = visibleSchools.filter(school => school.sector === 'Government').length;
    const catholic = visibleSchools.filter(school => school.sector === 'Catholic').length;
    const independent = visibleSchools.filter(school => school.sector === 'Independent').length;
    const icseaValues = visibleSchools
      .map(school => school.icsea)
      .filter((value): value is number => Number.isFinite(value));
    const averageIcsea = icseaValues.length > 0
      ? Math.round(icseaValues.reduce((sum, value) => sum + value, 0) / icseaValues.length)
      : null;

    return { scored, government, catholic, independent, averageIcsea };
  }, [visibleSchools]);

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
            {legacyMetricOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, legacyMetric: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.legacyMetric === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            {icseaOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, icsea: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.icsea === opt.value
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
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {enrolmentOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, enrolments: opt.value }))}
                title={opt.value === 'small' ? dictionary.filters.enrolmentSmallHint : opt.value === 'medium' ? dictionary.filters.enrolmentMediumHint : opt.value === 'large' ? dictionary.filters.enrolmentLargeHint : undefined}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.enrolments === opt.value
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
                onChange={e => setSortBy(e.target.value as 'name' | 'score' | 'icsea' | 'enrolments')}
                className="text-xs text-gray-500 border-0 bg-transparent cursor-pointer focus:outline-none"
              >
                <option value="name">{dictionary.sidebar.sortByName}</option>
                <option value="score">{dictionary.sidebar.sortByScore}</option>
                <option value="icsea">{dictionary.sidebar.sortByIcsea}</option>
                <option value="enrolments">{dictionary.sidebar.sortByEnrolments}</option>
              </select>
            </div>

            <div className="px-3 py-2 border-b border-gray-100 bg-indigo-50/70 text-[10px] text-indigo-950 leading-snug shrink-0 grid grid-cols-2 gap-x-3 gap-y-1">
              <div>{formatMessage(dictionary.sidebar.visibleCount, { count: displayedSchools.length })}</div>
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
                <div className="text-lg font-black leading-none">{hasLegacyScore(selectedSchool) ? selectedSchool.legacy_score : '—'}</div>
                <div className="text-[8px] font-normal">{hasLegacyScore(selectedSchool) ? dictionary.details.legacyScore : dictionary.details.profileOnly}</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.legacyScore}</span>
                <span className="font-bold text-gray-800">{hasLegacyScore(selectedSchool) ? selectedSchool.legacy_score : '—'}</span>
              </div>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.datasetRank}</span>
                <span className="font-bold text-gray-800">{hasLegacyScore(selectedSchool) ? `#${selectedSchool.legacy_rank}` : '—'}</span>
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
              {selectedSchool.campus_type && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">{dictionary.details.campusType}</span>
                    <span className="font-medium text-gray-800 text-right">{selectedSchool.campus_type}</span>
                  </div>
                </>
              )}
              {selectedSchool.year_range && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.yearRange}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.year_range}</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.icsea) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.icsea}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.icsea}</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.icsea_percentile) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.icseaPercentile}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.icsea_percentile}</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.total_enrolments) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.enrolments}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.total_enrolments}</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.girls) && Number.isFinite(selectedSchool.boys) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.girlsBoys}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.girls} / {selectedSchool.boys}</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.lbote_yes_percent) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.lbote}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.lbote_yes_percent}%</span>
                  </div>
                </>
              )}
              {Number.isFinite(selectedSchool.indigenous_percent) && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.indigenous}</span>
                    <span className="font-medium text-gray-800">{selectedSchool.indigenous_percent}%</span>
                  </div>
                </>
              )}
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.postcode}</span>
                <span className="font-medium text-gray-800">{selectedSchool.postcode}</span>
              </div>
              {selectedSchool.governing_body && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">{dictionary.details.governingBody}</span>
                    <span className="font-medium text-gray-800 text-right">{selectedSchool.governing_body}</span>
                  </div>
                </>
              )}
              {selectedSchool.school_url && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dictionary.details.website}</span>
                    <a className="font-medium text-indigo-600 hover:underline" href={selectedSchool.school_url} target="_blank" rel="noreferrer">Open</a>
                  </div>
                </>
              )}
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
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 border border-white inline-block shrink-0 opacity-75"></span>
          {dictionary.legend.profileOnlySchools}
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
