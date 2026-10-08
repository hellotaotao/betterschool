"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { formatMessage, getMessages } from '@/lib/i18n';
import type { MapSchool } from '@/types/school';
import {
  FilterState,
  filterSchools,
  filterSchoolsForZoneOverlay,
  schoolMatchesZoneOverlay,
  type ZoneOverlayKind,
} from '@/utils/schoolFilters';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useMapLocale } from '@/lib/useMapLocale';
import { useSchoolCatchment } from '@/lib/useSchoolCatchment';
import { useCatchmentLookup } from '@/lib/useCatchmentLookup';
import { useZoneOverlay } from '@/lib/useZoneOverlay';
import { schoolPath, schoolSlugFor, stateSlug, suburbSlug } from '@/lib/slug';
import type { ViewportBounds } from '@/lib/catchmentLookup';
import schoolsMetadata from '@/public/data/schools.metadata.json';

import SchoolDetail from '../../components/SchoolDetail';
import SchoolList from '../../components/SchoolList';
import FilterBar from '../../components/FilterBar';
import SearchBox from '../../components/SearchBox';
import CatchmentLookup from '../../components/CatchmentLookup';
import BottomSheet, { SheetSnap } from '../../components/BottomSheet';
import MapLegend from '../../components/MapLegend';
import { LanguageToggle, LookupButton, ZoneOverlayControl, zoneOverlayStatus } from '../../components/MapControls';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
});

// Cache-bust the static dataset whenever it is rebuilt. /data/* is served with a
// long max-age, so without a version query returning users would keep stale data
// for up to a day after each data update. generated_at changes on every rebuild;
// the client file's own hash covers a change to its field allowlist alone.
const DATA_VERSION = [
  String(schoolsMetadata.generated_at ?? '').replace(/\D/g, ''),
  schoolsMetadata.client_dataset?.sha256 ?? '',
].filter(Boolean).join('-') || 'v1';

export default function SchoolsPage() {
  const [allSchools, setAllSchools] = useState<MapSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sector: 'all',
    schoolType: 'all',
    icsea: 'all',
    enrolments: 'all',
    religion: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<MapSchool[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<MapSchool | null>(null);
  const [placeFocus, setPlaceFocus] = useState<MapSchool[] | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'icsea' | 'enrolments'>('name');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  // A deep link decides the initial view; IP geolocation must not override it.
  const [deepLinked, setDeepLinked] = useState(false);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarBottom, setTopBarBottom] = useState(56);
  const [locale, handleLocaleChange] = useMapLocale();
  const dictionary = useMemo(() => getMessages(locale), [locale]);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const catchment = useSchoolCatchment(selectedSchool);
  const lookup = useCatchmentLookup();
  const { kind: zoneOverlay, setKind: setZoneOverlay, zones: overlayState } = useZoneOverlay(viewport);
  // Stable across renders, so the one-shot dataset effect can depend on it.
  const showCatchment = catchment.show;

  useEffect(() => {
    fetch(`/data/schools.client.json?v=${DATA_VERSION}`)
      .then(res => {
        if (!res.ok) throw new Error(`School dataset unavailable (HTTP ${res.status})`);
        return res.json();
      })
      .then((data: MapSchool[]) => {
        setAllSchools(data);
        setLoading(false);
        // Deep link from a prerendered school or catchment page:
        // /schools?school=<acara_sml_id>[&catchment=1]. Read from location
        // rather than useSearchParams so this client-only route keeps
        // prerendering without a Suspense bailout.
        const query = new URLSearchParams(window.location.search);

        // A suburb page's "explore on the map" link. Reuses the same place
        // focus the search box produces, so the map fits the suburb's actual
        // schools rather than guessing a centre and a zoom.
        const suburbParam = query.get('suburb');
        const stateParam = query.get('state');
        if (suburbParam && stateParam) {
          const matches = data.filter(school => (
            suburbSlug(school.suburb) === suburbParam && stateSlug(school.state) === stateParam
          ));
          if (matches.length > 0) {
            setPlaceFocus(matches);
            setDeepLinked(true);
            return;
          }
        }

        const requested = Number(query.get('school'));
        if (!Number.isFinite(requested) || requested === 0) return;
        const match = data.find(school => school.acara_sml_id === requested);
        if (!match) return;
        setSelectedSchool(match);
        setDeepLinked(true);
        if (query.get('catchment') !== '1' || !match.catchments?.length) return;

        showCatchment(match, match.catchments[0]);
      })
      .catch(() => {
        // An empty map would read as "no schools here", so say it failed.
        setLoadError(true);
        setLoading(false);
      });
  }, [showCatchment]);

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
    () => filterSchoolsForZoneOverlay(filterSchools(allSchools, filters), zoneOverlay),
    [allSchools, filters, zoneOverlay]
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

  function handleSchoolClick(school: MapSchool) {
    const isDeselect = selectedSchool?.id === school.id;
    setSelectedSchool(isDeselect ? null : school);
    if (!isDeselect && isMobile) setSheetSnap('expanded');
  }

  function handleMapClick() {
    setSelectedSchool(null);
  }

  const handleZoneOverlayChange = useCallback((next: ZoneOverlayKind) => {
    setZoneOverlay(next);
    if (selectedSchool && !schoolMatchesZoneOverlay(selectedSchool, next)) {
      setSelectedSchool(null);
    }
  }, [selectedSchool, setZoneOverlay]);

  const handlePickSchool = useCallback((s: MapSchool) => {
    setPlaceFocus(null);
    setSelectedSchool(s);
    if (isMobile) setSheetSnap('expanded');
  }, [isMobile]);

  const handlePickPlace = useCallback((schools: MapSchool[]) => {
    setSelectedSchool(null);
    setPlaceFocus(schools);
  }, []);

  const lookUpLocation = lookup.lookUp;
  const handlePickLocation = useCallback((point: [number, number]) => {
    setSelectedSchool(null);
    if (isMobile) setSheetSnap('expanded');
    lookUpLocation(point);
  }, [isMobile, lookUpLocation]);

  const schoolsByLocationAgeId = useMemo(() => {
    const map = new Map<number, MapSchool>();
    for (const school of allSchools) {
      if (Number.isFinite(school.location_age_id)) map.set(Number(school.location_age_id), school);
    }
    return map;
  }, [allSchools]);

  // The lookup result and a school's own zone are mutually exclusive views.
  // The selected school's zone wins: the lookup is kept so closing the detail
  // panel returns to it, and its zones stay as context until then, but once
  // the reader asks for this school's zone that is what the map must show.
  const mapCatchments = catchment.visible
    ? catchment.features
    : lookup.results?.length
      ? lookup.results
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
  const zoneStatus = zoneOverlay === 'off' ? null : zoneOverlayStatus(overlayState, dictionary);
  const zoneLegendLabel = zoneOverlay === 'off'
    ? null
    : zoneOverlay === 'primary'
      ? dictionary.catchment.primary
      : zoneOverlay === 'secondary-unspecified'
        ? dictionary.zoneBrowse.secondary
        : formatMessage(dictionary.zoneBrowse.year, { year: zoneOverlay.slice('year-'.length) });
  const zoneContext = zoneOverlay === 'primary' && overlayState?.state === 'sa'
    ? dictionary.zoneBrowse.saPrimaryPartial
    : null;

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
      <div className={`absolute inset-0 z-0 bg-gray-100${overlayState?.features.length ? ' zone-overlay-active' : ''}`}>
        {loading || loadError ? (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            {loadError ? dictionary.loadError : dictionary.loadingMap}
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
            overlayFeatures={overlayState?.features ?? null}
            onViewportChange={setViewport}
            autoLocate={!deepLinked}
            pickMode={lookup.pickMode}
            onPickLocation={handlePickLocation}
            lookupPin={lookup.pin}
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
            <div className="pointer-events-auto flex gap-2 items-center overflow-x-auto">
              <LookupButton
                active={lookup.pickMode}
                dictionary={dictionary}
                onClick={() => (lookup.pickMode ? lookup.clear() : lookup.setPickMode(true))}
              />
              <ZoneOverlayControl value={zoneOverlay} onChange={handleZoneOverlayChange} dictionary={dictionary} />
              <LanguageToggle locale={locale} onChange={handleLocaleChange} />
            </div>
            <div className="pointer-events-auto">
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} variant="scroll" />
            </div>
            {lookup.pickMode && (
              <div className="pointer-events-none rounded-lg bg-indigo-600/95 px-3 py-2 text-[11px] text-white shadow-md">
                {dictionary.lookup.hint}
              </div>
            )}
            {zoneStatus && (
              <div className="pointer-events-none rounded-lg bg-white/95 px-3 py-1.5 text-[11px] text-gray-700 shadow-md">
                <div>{zoneStatus}</div>
                {zoneContext && <div className="mt-1 max-w-sm text-gray-600">{zoneContext}</div>}
              </div>
            )}
          </div>

          <BottomSheet
            snap={sheetSnap}
            onSnapChange={setSheetSnap}
            labels={{ expand: dictionary.sidebar.expandList, collapse: dictionary.sidebar.collapseList }}
          >
            {lookup.pin && !selectedSchool ? (
              <CatchmentLookup
                results={lookup.results}
                lookupState={lookup.state}
                schoolsByLocationAgeId={schoolsByLocationAgeId}
                loading={lookup.loading}
                error={lookup.error}
                dictionary={dictionary}
                locale={locale}
                onClear={lookup.clear}
                onPickSchool={handlePickSchool}
                variant="sheet"
              />
            ) : selectedSchool ? (
              <SchoolDetail
                school={selectedSchool}
                dictionary={dictionary}
                locale={locale}
                onClose={handleMapClick}
                variant="sheet"
                activeCatchmentUrl={catchment.activeUrl}
                onToggleCatchment={catchment.toggle}
                catchmentError={catchment.error}
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
                locale={locale}
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
                active={lookup.pickMode}
                dictionary={dictionary}
                onClick={() => (lookup.pickMode ? lookup.clear() : lookup.setPickMode(true))}
              />
            </div>
            <div className="pointer-events-auto">
              <ZoneOverlayControl value={zoneOverlay} onChange={handleZoneOverlayChange} dictionary={dictionary} />
            </div>
            <div className="pointer-events-auto">
              <LanguageToggle locale={locale} onChange={handleLocaleChange} />
            </div>
            <div className="pointer-events-auto">
              <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} />
            </div>
          </div>

          {(lookup.pickMode || zoneStatus || zoneContext) && (
            <div
              style={{ top: topBarBottom + 8 }}
              className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none"
            >
              {lookup.pickMode && (
                <div className="rounded-lg bg-indigo-600/95 px-4 py-2 text-xs text-white shadow-lg">
                  {dictionary.lookup.hint}
                </div>
              )}
              {zoneStatus && (
                <div className="rounded-lg bg-white/95 px-4 py-1.5 text-xs text-gray-700 shadow-lg">
                  <div>{zoneStatus}</div>
                  {zoneContext && <div className="mt-1 max-w-md text-gray-600">{zoneContext}</div>}
                </div>
              )}
            </div>
          )}

          {/* Shares the right-hand column with the detail panel. Selecting a
              result swaps to that school's detail; closing it returns here,
              because the lookup state is kept. */}
          {lookup.pin && !selectedSchool && (
            <CatchmentLookup
              results={lookup.results}
              lookupState={lookup.state}
              schoolsByLocationAgeId={schoolsByLocationAgeId}
              loading={lookup.loading}
              error={lookup.error}
              dictionary={dictionary}
              locale={locale}
              onClear={lookup.clear}
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
              aria-label={leftPanelOpen ? dictionary.sidebar.collapseList : dictionary.sidebar.expandList}
              aria-expanded={leftPanelOpen}
            >
              <span aria-hidden="true">{leftPanelOpen ? '‹' : '›'}</span>
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
                  locale={locale}
                  selectedCardRef={selectedCardRef}
                />
              </div>
            )}
          </div>

          {selectedSchool && (
            <SchoolDetail
              school={selectedSchool}
              dictionary={dictionary}
              locale={locale}
              onClose={handleMapClick}
              topOffset={topBarBottom + 8}
              activeCatchmentUrl={catchment.activeUrl}
              onToggleCatchment={catchment.toggle}
              catchmentError={catchment.error}
              profileHref={profileHref}
            />
          )}

          {/* The detail panel occupies the same right-hand column, so hide the
              legend while a school is selected instead of stacking the two. */}
          <MapLegend zoneOverlay={zoneOverlay} label={zoneLegendLabel} hidden={!!selectedSchool} dictionary={dictionary} />
        </>
      )}
    </div>
  );
}
