"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  detectBrowserLocale,
  formatMessage,
  getMessages,
  Locale,
} from '@/lib/i18n';
import { School } from '@/types/school';
import { FilterState, filterSchools, hasLegacyScore } from '@/utils/schoolFilters';
import { useMediaQuery } from '@/lib/useMediaQuery';
import schoolsMetadata from '@/public/data/schools.metadata.json';

import SchoolDetail from '../../components/SchoolDetail';
import SchoolList from '../../components/SchoolList';
import FilterBar from '../../components/FilterBar';
import SearchBox from '../../components/SearchBox';
import BottomSheet, { SheetSnap } from '../../components/BottomSheet';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
});

// Cache-bust the static dataset whenever it is rebuilt. /data/* is served with a
// long max-age, so without a version query returning users would keep stale data
// for up to a day after each data update. generated_at changes on every rebuild.
const DATA_VERSION = String(schoolsMetadata.generated_at ?? '').replace(/\D/g, '') || 'v1';

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
    religion: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [placeFocus, setPlaceFocus] = useState<School[] | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'icsea' | 'enrolments'>('name');
  const [geoReady, setGeoReady] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const dictionary = useMemo(() => getMessages(locale), [locale]);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    fetch(`/data/schools.canonical.json?v=${DATA_VERSION}`)
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
    const isDeselect = !!selectedSchool && schoolId(selectedSchool) === schoolId(school);
    setSelectedSchool(isDeselect ? null : school);
    if (!isDeselect && isMobile) setSheetSnap('expanded');
  }

  function handleMapClick() {
    setSelectedSchool(null);
  }

  const handlePickSchool = useCallback((s: School) => {
    setPlaceFocus(null);
    setSelectedSchool(s);
    if (isMobile) setSheetSnap('expanded');
  }, [isMobile]);

  const handlePickPlace = useCallback((schools: School[]) => {
    setSelectedSchool(null);
    setPlaceFocus(schools);
  }, []);

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
            fitToSchools={placeFocus}
            onGeoReady={handleGeoReady}
          />
        )}
      </div>

      {isMobile ? (
        <>
          <div className="absolute top-2 left-2 right-2 z-30 space-y-2 pointer-events-none">
            <div className="pointer-events-auto">
              <SearchBox
                allSchools={allSchools}
                dictionary={dictionary}
                onPickSchool={handlePickSchool}
                onPickPlace={handlePickPlace}
              />
            </div>
            <div className="pointer-events-auto">
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} variant="scroll" />
            </div>
          </div>

          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
            {selectedSchool ? (
              <SchoolDetail
                school={selectedSchool}
                dictionary={dictionary}
                onClose={handleMapClick}
                variant="sheet"
              />
            ) : (
              <SchoolList
                schools={displayedSchools}
                selectedSchool={selectedSchool}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onSchoolClick={handleSchoolClick}
                areaSummary={areaSummary}
                areaLabel={areaLabel}
                loading={loading}
                geoReady={geoReady}
                dictionary={dictionary}
                selectedCardRef={selectedCardRef}
              />
            )}
          </BottomSheet>
        </>
      ) : (
        <>
          <div className="absolute top-3 left-3 right-3 z-30 flex gap-2 flex-wrap items-center pointer-events-none">
            <div className="pointer-events-auto w-64 shrink-0">
              <SearchBox
                allSchools={allSchools}
                dictionary={dictionary}
                onPickSchool={handlePickSchool}
                onPickPlace={handlePickPlace}
              />
            </div>
            <div className="pointer-events-auto">
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} />
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
              <div className="w-full rounded-xl shadow-xl overflow-hidden flex">
                <SchoolList
                  schools={displayedSchools}
                  selectedSchool={selectedSchool}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onSchoolClick={handleSchoolClick}
                  areaSummary={areaSummary}
                  areaLabel={areaLabel}
                  loading={loading}
                  geoReady={geoReady}
                  dictionary={dictionary}
                  selectedCardRef={selectedCardRef}
                />
              </div>
            )}
          </div>

          {selectedSchool && (
            <SchoolDetail
              school={selectedSchool}
              dictionary={dictionary}
              onClose={handleMapClick}
            />
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
        </>
      )}
    </div>
  );
}
