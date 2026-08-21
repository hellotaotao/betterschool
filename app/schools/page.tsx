"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  formatMessage,
  getMessages,
  Locale,
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
} from '@/lib/i18n';
import { School } from '@/types/school';
import { FilterState, filterSchools, SECTOR_COLORS } from '@/utils/schoolFilters';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { schoolPath, schoolSlugFor } from '@/lib/slug';
import schoolsMetadata from '@/public/data/schools.metadata.json';

import type { CatchmentFeature } from '@/lib/catchmentLookup';
import { loadCatchmentsForSchool, lookupCatchmentsAt } from '@/lib/catchmentClient';

import SchoolDetail from '../../components/SchoolDetail';
import SchoolList from '../../components/SchoolList';
import FilterBar from '../../components/FilterBar';
import SearchBox from '../../components/SearchBox';
import CatchmentLookup from '../../components/CatchmentLookup';
import BottomSheet, { SheetSnap } from '../../components/BottomSheet';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
});

// Cache-bust the static dataset whenever it is rebuilt. /data/* is served with a
// long max-age, so without a version query returning users would keep stale data
// for up to a day after each data update. generated_at changes on every rebuild.
const DATA_VERSION = String(schoolsMetadata.generated_at ?? '').replace(/\D/g, '') || 'v1';

/**
 * Manual language switch.
 *
 * The app guesses from navigator.languages, and that guess is often wrong for
 * this audience — plenty of Chinese-speaking parents in Australia run an
 * English browser, and vice versa. The choice is remembered, so it only has to
 * be made once.
 */
function LanguageToggle({ locale, onChange }: { locale: Locale; onChange: (next: Locale) => void }) {
  return (
    <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-1 py-1 shadow-md shrink-0">
      {(['en', 'zh'] as const).map(option => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={locale === option}
          lang={option === 'zh' ? 'zh-Hans' : 'en'}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
            locale === option ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {option === 'en' ? 'EN' : '中文'}
        </button>
      ))}
    </div>
  );
}

/** Toolbar toggle that arms map-click catchment lookup. */
function LookupButton({
  active,
  dictionary,
  onClick,
}: {
  active: boolean;
  dictionary: ReturnType<typeof getMessages>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-md whitespace-nowrap transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white/90 backdrop-blur-sm text-gray-700 hover:bg-gray-100'
      }`}
    >
      {active ? dictionary.lookup.cancel : `◎ ${dictionary.lookup.button}`}
    </button>
  );
}

export default function SchoolsPage() {
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<Locale>('en');
  const [filters, setFilters] = useState<FilterState>({
    sector: 'all',
    schoolType: 'all',
    icsea: 'all',
    enrolments: 'all',
    religion: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [placeFocus, setPlaceFocus] = useState<School[] | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'icsea' | 'enrolments'>('name');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  // Catchment display for the selected school. Tagged with the school it belongs
  // to so selecting another school makes it stale by construction — no reset
  // effect, and a slow fetch that lands after the user moved on is ignored.
  const [catchmentState, setCatchmentState] = useState<{
    schoolId: string;
    visible: boolean;
    features: CatchmentFeature[] | null;
    error: boolean;
  } | null>(null);
  // "Which schools is this location zoned for?" lookup.
  const [pickMode, setPickMode] = useState(false);
  const [lookupPin, setLookupPin] = useState<[number, number] | null>(null);
  const [lookupResults, setLookupResults] = useState<CatchmentFeature[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  // A deep link decides the initial view; IP geolocation must not override it.
  const [deepLinked, setDeepLinked] = useState(false);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarBottom, setTopBarBottom] = useState(56);
  const dictionary = useMemo(() => getMessages(locale), [locale]);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    fetch(`/data/schools.canonical.json?v=${DATA_VERSION}`)
      .then(res => res.json())
      .then((data: School[]) => {
        setAllSchools(data);
        setLoading(false);
        // Deep link from a prerendered school or catchment page:
        // /schools?school=<acara_sml_id>[&catchment=1]. Read from location
        // rather than useSearchParams so this client-only route keeps
        // prerendering without a Suspense bailout.
        const query = new URLSearchParams(window.location.search);
        const requested = Number(query.get('school'));
        if (!Number.isFinite(requested) || requested === 0) return;
        const match = data.find(school => school.acara_sml_id === requested);
        if (!match) return;
        setSelectedSchool(match);
        setDeepLinked(true);
        if (query.get('catchment') !== '1' || !match.catchments?.length) return;

        setCatchmentState({ schoolId: match.id, visible: true, features: null, error: false });
        loadCatchmentsForSchool(Number(match.location_age_id), match.catchments.map(c => c.kind))
          .then(features => setCatchmentState(current => (
            current?.schoolId === match.id ? { ...current, features } : current
          )))
          .catch(() => setCatchmentState(current => (
            current?.schoolId === match.id ? { ...current, visible: false, error: true } : current
          )));
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const languages = navigator.languages?.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // Private browsing and blocked storage both throw; the guess still works.
    }

    const query = new URLSearchParams(window.location.search).get('lang');
    // Deferred a tick so the first paint matches the server-rendered shell.
    window.setTimeout(() => setLocale(resolveInitialLocale({ query, stored, languages })), 0);
  }, []);

  const handleLocaleChange = useCallback((next: Locale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the switch still applies for this visit.
    }
  }, []);

  // The desktop top bar (search + filters) wraps to a variable number of rows
  // depending on viewport width and locale, so track its bottom edge and offset
  // the list panel below it. Otherwise wrapped filter rows overlap the panel header.
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const update = () => {
      const bottom = Math.round(el.getBoundingClientRect().bottom);
      setTopBarBottom(prev => (prev !== bottom ? bottom : prev));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  const filteredSchools = useMemo(
    () => filterSchools(allSchools, filters),
    [allSchools, filters]
  );

  const displayedSchools = useMemo(() => {
    return [...visibleSchools].sort((a, b) => {
      if (sortBy === 'name') return a.school_name.localeCompare(b.school_name);
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

  const activeCatchment = catchmentState && catchmentState.schoolId === selectedSchool?.id
    ? catchmentState
    : null;
  const catchmentVisible = activeCatchment?.visible ?? false;
  const schoolCatchments = activeCatchment?.features ?? null;
  const catchmentError = activeCatchment?.error ?? false;

  const handleToggleCatchment = useCallback(() => {
    const school = selectedSchool;
    if (!school?.catchments?.length || !Number.isFinite(school.location_age_id)) return;

    if (catchmentVisible) {
      setCatchmentState({ schoolId: school.id, visible: false, features: schoolCatchments, error: false });
      return;
    }

    setCatchmentState({ schoolId: school.id, visible: true, features: schoolCatchments, error: false });
    if (schoolCatchments) return; // already fetched for this school

    loadCatchmentsForSchool(Number(school.location_age_id), school.catchments.map(c => c.kind))
      .then(features => {
        setCatchmentState(current => (
          current?.schoolId === school.id ? { ...current, features } : current
        ));
      })
      .catch(() => {
        setCatchmentState(current => (
          current?.schoolId === school.id ? { ...current, visible: false, error: true } : current
        ));
      });
  }, [catchmentVisible, schoolCatchments, selectedSchool]);

  const clearLookup = useCallback(() => {
    setPickMode(false);
    setLookupPin(null);
    setLookupResults(null);
    setLookupError(false);
    setLookupLoading(false);
  }, []);

  const handlePickLocation = useCallback(([lat, lng]: [number, number]) => {
    setPickMode(false);
    setSelectedSchool(null);
    setLookupPin([lat, lng]);
    setLookupResults([]);
    setLookupError(false);
    setLookupLoading(true);
    if (isMobile) setSheetSnap('expanded');

    // GeoJSON is [lng, lat]; Leaflet hands us [lat, lng].
    lookupCatchmentsAt([lng, lat])
      .then(features => {
        setLookupResults(features);
        setLookupLoading(false);
      })
      .catch(() => {
        setLookupError(true);
        setLookupLoading(false);
      });
  }, [isMobile]);

  const schoolsByLocationAgeId = useMemo(() => {
    const map = new Map<number, School>();
    for (const school of allSchools) {
      if (Number.isFinite(school.location_age_id)) map.set(Number(school.location_age_id), school);
    }
    return map;
  }, [allSchools]);

  // The lookup result and a school's own zone are mutually exclusive views.
  const mapCatchments = lookupResults?.length
    ? lookupResults
    : catchmentVisible
      ? schoolCatchments
      : null;

  const areaSummary = useMemo(() => {
    const government = visibleSchools.filter(school => school.sector === 'Government').length;
    const catholic = visibleSchools.filter(school => school.sector === 'Catholic').length;
    const independent = visibleSchools.filter(school => school.sector === 'Independent').length;
    const icseaValues = visibleSchools
      .map(school => school.icsea)
      .filter((value): value is number => Number.isFinite(value));
    const averageIcsea = icseaValues.length > 0
      ? Math.round(icseaValues.reduce((sum, value) => sum + value, 0) / icseaValues.length)
      : null;

    return { government, catholic, independent, averageIcsea };
  }, [visibleSchools]);

  const areaLabel = formatMessage(dictionary.sidebar.areaCount, { count: displayedSchools.length });

  // Link the detail panel at the school's own page, so the prerendered pages are
  // reachable from the app rather than only from search results.
  const profileHref = useMemo(() => {
    if (!selectedSchool || allSchools.length === 0) return undefined;
    // Follow the reader into their own language: the app picks its locale from
    // the browser, and the school page exists in both.
    return schoolPath(selectedSchool.state, schoolSlugFor(selectedSchool, allSchools), locale);
  }, [selectedSchool, allSchools, locale]);

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
            catchmentFeatures={mapCatchments}
            autoLocate={!deepLinked}
            pickMode={pickMode}
            onPickLocation={handlePickLocation}
            lookupPin={lookupPin}
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
            <div className="pointer-events-auto flex gap-2 items-center">
              <LookupButton
                active={pickMode}
                dictionary={dictionary}
                onClick={() => (pickMode ? clearLookup() : setPickMode(true))}
              />
              <LanguageToggle locale={locale} onChange={handleLocaleChange} />
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} variant="scroll" />
            </div>
            {pickMode && (
              <div className="pointer-events-none rounded-lg bg-indigo-600/95 px-3 py-2 text-[11px] text-white shadow-md">
                {dictionary.lookup.hint}
              </div>
            )}
          </div>

          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
            {lookupPin && !selectedSchool ? (
              <CatchmentLookup
                results={lookupResults}
                schoolsByLocationAgeId={schoolsByLocationAgeId}
                loading={lookupLoading}
                error={lookupError}
                dictionary={dictionary}
                onClear={clearLookup}
                onPickSchool={handlePickSchool}
                variant="sheet"
              />
            ) : selectedSchool ? (
              <SchoolDetail
                school={selectedSchool}
                dictionary={dictionary}
                onClose={handleMapClick}
                variant="sheet"
                catchmentVisible={catchmentVisible}
                onToggleCatchment={handleToggleCatchment}
                catchmentError={catchmentError}
                profileHref={profileHref}
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
                dictionary={dictionary}
                selectedCardRef={selectedCardRef}
              />
            )}
          </BottomSheet>
        </>
      ) : (
        <>
          <div
            ref={topBarRef}
            className="absolute top-3 left-3 right-3 z-30 flex gap-2 flex-wrap items-center pointer-events-none"
          >
            <div className="pointer-events-auto w-64 shrink-0">
              <SearchBox
                allSchools={allSchools}
                dictionary={dictionary}
                onPickSchool={handlePickSchool}
                onPickPlace={handlePickPlace}
              />
            </div>
            <div className="pointer-events-auto">
              <LookupButton
                active={pickMode}
                dictionary={dictionary}
                onClick={() => (pickMode ? clearLookup() : setPickMode(true))}
              />
            </div>
            <div className="pointer-events-auto">
              <LanguageToggle locale={locale} onChange={handleLocaleChange} />
            </div>
            <div className="pointer-events-auto">
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} />
            </div>
          </div>

          {pickMode && (
            <div
              style={{ top: topBarBottom + 8 }}
              className="absolute left-1/2 -translate-x-1/2 z-30 rounded-lg bg-indigo-600/95 px-4 py-2 text-xs text-white shadow-lg pointer-events-none"
            >
              {dictionary.lookup.hint}
            </div>
          )}

          {/* Shares the right-hand column with the detail panel. Selecting a
              result swaps to that school's detail; closing it returns here,
              because the lookup state is kept. */}
          {lookupPin && !selectedSchool && (
            <CatchmentLookup
              results={lookupResults}
              schoolsByLocationAgeId={schoolsByLocationAgeId}
              loading={lookupLoading}
              error={lookupError}
              dictionary={dictionary}
              onClear={clearLookup}
              onPickSchool={handlePickSchool}
              topOffset={topBarBottom + 8}
            />
          )}

          <div
            style={{ top: topBarBottom + 8 }}
            className={`absolute left-3 bottom-3 z-10 flex transition-all duration-300 ${
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
              topOffset={topBarBottom + 8}
              catchmentVisible={catchmentVisible}
              onToggleCatchment={handleToggleCatchment}
              catchmentError={catchmentError}
              profileHref={profileHref}
            />
          )}

          {/* The detail panel occupies the same right-hand column, so hide the
              legend while a school is selected instead of stacking the two. */}
          <div className={`absolute bottom-8 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-[10px] text-gray-600 space-y-1 ${selectedSchool ? 'hidden' : ''}`}>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
                style={{ background: SECTOR_COLORS.Government }}
              ></span>
              {dictionary.filters.government}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
                style={{ background: SECTOR_COLORS.Catholic }}
              ></span>
              {dictionary.filters.catholic}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
                style={{ background: SECTOR_COLORS.Independent }}
              ></span>
              {dictionary.filters.independent}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <span className="flex gap-0.5 items-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span>
                <span className="w-3.5 h-3.5 rounded-full bg-gray-400 inline-block"></span>
              </span>
              <span>{dictionary.legend.sizeEqualsEnrolments}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400 border border-white inline-block shrink-0 opacity-55"></span>
              {dictionary.legend.enrolmentsUnknown}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full inline-block shrink-0 relative"
                style={{
                  background: `conic-gradient(${SECTOR_COLORS.Government} 0deg 200deg, ${SECTOR_COLORS.Catholic} 200deg 290deg, ${SECTOR_COLORS.Independent} 290deg 360deg)`,
                }}
              >
                <span className="absolute inset-[3.5px] rounded-full bg-white"></span>
              </span>
              <span>{dictionary.legend.clusterRing}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
