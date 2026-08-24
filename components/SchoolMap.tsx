"use client";

import { useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { School } from '@/types/school';
import { getMarkerRadius, getMarkerColor, CATCHMENT_COLORS, SECTOR_COLORS } from '@/utils/schoolFilters';
import type { CatchmentFeature } from '@/lib/catchmentLookup';

export interface Viewport { west: number; south: number; east: number; north: number }


/**
 * Pin marking the location the user asked about in catchment lookup mode.
 *
 * Sized well clear of the school markers (10-36px) it lands among — at 18px it
 * was just another dot in the crowd, and the one thing on screen that answers
 * "where did I click?" has to win that comparison. Slate rather than a hue,
 * for the same reason selection is slate: colour on this map means sector.
 */
const lookupPinIcon = L.divIcon({
  className: 'catchment-lookup-pin',
  html: `<div style="
    position:relative;
    width:28px;height:28px;border-radius:50% 50% 50% 0;
    background:#0f172a;border:3px solid white;
    transform:rotate(-45deg);
    box-shadow:0 0 0 4px rgba(15,23,42,.18),0 2px 6px rgba(0,0,0,.45);
  "><div style="
      position:absolute;top:50%;left:50%;
      width:8px;height:8px;margin:-4px 0 0 -4px;
      border-radius:50%;background:white;
    "></div></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

/** Cache marker icons by rendered radius, sector, and selection state. */
const iconCache = new Map<string, L.DivIcon>();

function getSchoolIcon(school: School, isSelected: boolean): L.DivIcon {
  const radius = getMarkerRadius(school.total_enrolments);
  const known = Number.isFinite(school.total_enrolments);
  const cacheKey = `${Math.round(radius * 2)}-${known ? 'k' : 'u'}-${school.sector}-${isSelected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;
  const icon = createSchoolIcon(school, isSelected);
  iconCache.set(cacheKey, icon);
  return icon;
}

/**
 * Create a Leaflet DivIcon from school data and selection state.
 *
 * Color = official ACARA sector, size = official ACARA enrolments. Both are
 * facts present for ~100% / ~90% of schools respectively. No number is drawn
 * inside the marker: a single headline score per school is exactly the
 * league-table framing this project deliberately avoids.
 *
 * Selecting a school never recolours it. The fill used to flip to indigo, which
 * sits 19 degrees of hue from the Catholic violet — so clicking a green
 * government school turned it purple. The rings do that job on their own, and
 * they are deliberately achromatic, because hue on this map means sector.
 */
function createSchoolIcon(school: School, isSelected: boolean): L.DivIcon {
  const radius = getMarkerRadius(school.total_enrolments);
  const size = radius * 2;
  const bgColor = getMarkerColor(school.sector);
  // White gap, crisp slate ring, soft halo — visible against OSM tiles at any
  // marker size without borrowing a sector hue.
  const boxShadow = isSelected
    ? '0 0 0 2px #0f172a,0 0 0 7px rgba(15,23,42,0.22)'
    : '';
  // Enrolments are not published for ~10% of schools; render those faintly so
  // their small radius does not read as "this is a tiny school".
  const opacity = Number.isFinite(school.total_enrolments) ? 1 : 0.55;

  const html = `<div
    class="marker-circle"
    style="
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${bgColor};
      border:2px solid white;
      ${boxShadow ? `box-shadow:${boxShadow};` : ''}
      cursor:pointer;
      opacity:${opacity};
    "
  ></div>`;

  return L.divIcon({
    html,
    className: 'school-marker-icon',
    iconSize: [size, size],
    iconAnchor: [radius, radius],
  });
}

/** A school marker carries its sector so cluster bubbles can show the real mix. */
type SchoolMarker = L.Marker & { schoolSector?: string };

/** Slice order, so the same sector mix always draws the same ring. */
const CLUSTER_SLICE_ORDER = ['Government', 'Catholic', 'Independent', 'Unknown'];

/** Ring thickness (px); the disc inside it carries the count. */
const CLUSTER_RING_WIDTH = 7;

/**
 * Render a cluster as a ring sliced by the sectors it contains, with the school
 * count in the middle.
 *
 * The bubble used to be one flat indigo sitting 19 degrees of hue from the
 * Catholic violet, so two government schools 48px apart merged into a purple dot
 * that read as "Catholic". A ring also keeps the aggregate out of the size
 * encoding: a filled disc means one school and its diameter means enrolments, so
 * a group of schools must not be drawn as a filled disc.
 */
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 100 ? 40 : count < 1000 ? 48 : 56;
  const label = count >= 1000 ? `${Math.round(count / 1000)}k` : `${count}`;

  const tally = new Map<string, number>();
  for (const marker of cluster.getAllChildMarkers() as SchoolMarker[]) {
    const sector = marker.schoolSector ?? '';
    const key = sector in SECTOR_COLORS ? sector : 'Unknown';
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const total = [...tally.values()].reduce((sum, n) => sum + n, 0);
  const stops: string[] = [];
  let cursor = 0;
  for (const key of CLUSTER_SLICE_ORDER) {
    const slice = tally.get(key);
    if (!slice) continue;
    const start = (cursor / total) * 360;
    cursor += slice;
    stops.push(`${getMarkerColor(key)} ${start.toFixed(2)}deg ${((cursor / total) * 360).toFixed(2)}deg`);
  }
  // getAllChildMarkers can come back empty mid-animation; grey is the honest fallback.
  const ring = stops.length ? `conic-gradient(${stops.join(',')})` : getMarkerColor('Unknown');

  const html = `<div style="
      position:relative;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${ring};
      box-shadow:0 0 0 2px white,0 1px 4px rgba(0,0,0,0.3);
    "><div style="
        position:absolute;
        inset:${CLUSTER_RING_WIDTH}px;
        border-radius:50%;
        background:white;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#1e293b;
        font-weight:700;
        font-size:13px;
        line-height:1;
      ">${label}</div></div>`;

  return L.divIcon({
    html,
    className: 'school-cluster-icon',
    iconSize: [size, size],
  });
}

interface SchoolMapProps {
  schools: School[];
  selectedSchool: School | null;
  onSchoolClick: (school: School) => void;
  onBoundsChange: (visibleSchools: School[]) => void;
  onMapClick: () => void;
  flyToSchool?: School | null;
  fitToSchools?: School[] | null;
  onGeoReady?: () => void;
  /** Catchment polygons to draw, if any. */
  catchmentFeatures?: CatchmentFeature[] | null;
  /** Browse overlay: every zone of one kind across the viewport, outlines only. */
  overlayFeatures?: CatchmentFeature[] | null;
  onViewportChange?: (viewport: Viewport) => void;
  /** When true, a map click picks a location to look up instead of clearing the selection. */
  pickMode?: boolean;
  onPickLocation?: (point: [number, number]) => void;
  /** [lat, lng] of the location currently being looked up. */
  lookupPin?: [number, number] | null;
  /** False when a deep link already decided where the map should sit. */
  autoLocate?: boolean;
}

type Coordinates = [number, number];

type GeoService = {
  url: string;
  timeoutMs: number;
  parse: (data: unknown) => Coordinates | null;
};

const GEO_SERVICES: GeoService[] = [
  {
    url: 'https://ipapi.co/json/',
    timeoutMs: 1000,
    parse: parseIpApiResponse,
  },
  {
    url: 'https://free.freeipapi.com/api/json',
    timeoutMs: 1200,
    parse: parseFreeIpApiResponse,
  },
  {
    url: 'https://ipinfo.io/json',
    timeoutMs: 1000,
    parse: parseIpInfoResponse,
  },
];

function toCoordinate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);

  if (lat === null || lng === null) return null;
  return [lat, lng];
}

function parseIpApiResponse(data: unknown): Coordinates | null {
  if (!data || typeof data !== 'object') return null;

  const payload = data as { latitude?: unknown; longitude?: unknown };
  return toCoordinates(payload.latitude, payload.longitude);
}

function parseFreeIpApiResponse(data: unknown): Coordinates | null {
  const payload = Array.isArray(data) ? data[0] : data;

  if (!payload || typeof payload !== 'object') return null;

  const record = payload as { latitude?: unknown; longitude?: unknown };
  return toCoordinates(record.latitude, record.longitude);
}

function parseIpInfoResponse(data: unknown): Coordinates | null {
  if (!data || typeof data !== 'object') return null;

  const payload = data as { loc?: unknown };
  if (typeof payload.loc !== 'string') return null;

  const [latitude, longitude] = payload.loc.split(',');
  return toCoordinates(latitude, longitude);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function locateByIp(): Promise<Coordinates | null> {
  for (const service of GEO_SERVICES) {
    try {
      const payload = await fetchJsonWithTimeout(service.url, service.timeoutMs);
      const coordinates = service.parse(payload);

      if (coordinates) {
        return coordinates;
      }
    } catch {
      // Try the next provider.
    }
  }

  return null;
}

/**
 * Track background clicks. In pick mode a click chooses a location to look up;
 * otherwise it clears the selected school.
 */
function MapClickTracker({
  onMapClick,
  pickMode,
  onPickLocation,
}: {
  onMapClick: () => void;
  pickMode?: boolean;
  onPickLocation?: (point: [number, number]) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (pickMode) onPickLocation?.([event.latlng.lat, event.latlng.lng]);
      else onMapClick();
    },
  });
  return null;
}

/** Fit the map around a set of catchment polygons once they load. */
function FitToCatchments({ features }: { features: CatchmentFeature[] | null | undefined }) {
  const map = useMap();
  const signature = (features ?? []).map(f => `${f.properties.location_age_id}-${f.properties.kind}`).join(',');

  useEffect(() => {
    if (!features || features.length === 0) return;
    const bounds = L.latLngBounds([]);
    for (const feature of features) {
      bounds.extend(L.geoJSON(feature as never).getBounds());
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}

/**
 * Report schools visible in the current viewport.
 *
 * Deliberately not gated on geolocation. It used to be, which held the list
 * empty until three IP services had been tried in sequence and, failing those,
 * the browser's own geolocation timed out — up to 6.2s, and the IP services do
 * return 429 in practice. The map has a valid view from the moment it mounts,
 * so the list can fill straight away; when geolocation later moves the map,
 * moveend fires and the list follows.
 */
function BoundsTracker({
  schools,
  onBoundsChange,
  onViewportChange,
}: {
  schools: School[];
  onBoundsChange: (visible: School[]) => void;
  /** Raw viewport, for the browse overlay's index query. */
  onViewportChange?: (viewport: Viewport) => void;
}) {
  const report = () => {
    const bounds = map.getBounds();
    onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    onViewportChange?.({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    });
  };
  const map = useMapEvents({ moveend: report, resize: report });

  useEffect(() => {
    report();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  return null;
}

/**
 * Center the map around the detected user location after mount.
 *
 * Skipped when the page already has an explicit target (a /schools?school=
 * deep link): IP lookup resolves seconds later and would otherwise yank the
 * view away from the school the visitor asked for.
 */
function GeoLocator({ onReady, enabled = true }: { onReady?: () => void; enabled?: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      onReady?.();
      return;
    }
    let cancelled = false;

    const done = (lat: number, lng: number) => {
      if (cancelled) return;
      map.setView([lat, lng], 10);
      onReady?.();
    };

    const ready = () => {
      if (!cancelled) {
        onReady?.();
      }
    };

    const fallbackToBrowserGeolocation = () => {
      if (!navigator.geolocation) {
        ready();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => done(position.coords.latitude, position.coords.longitude),
        () => ready(),
        {
          enableHighAccuracy: false,
          timeout: 3000,
          maximumAge: 300000,
        }
      );
    };

    void locateByIp()
      .then((coordinates) => {
        if (coordinates) {
          done(coordinates[0], coordinates[1]);
          return;
        }

        fallbackToBrowserGeolocation();
      })
      .catch(() => {
        fallbackToBrowserGeolocation();
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Fly to the selected school after selection changes. */
function FlyToTracker({ school }: { school: School | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!school || !Number.isFinite(school.lat) || !Number.isFinite(school.lng)) return;

    // flyTo's easing solves for the viewport size, dividing by it. On a
    // zero-sized container that divide yields NaN and the animation lands on
    // "Invalid LatLng object: (NaN, NaN)" several frames later, nowhere near
    // the cause. The map only mounts once the dataset resolves, and a
    // /schools?school= deep link selects a school in that same commit, so this
    // effect can run before Leaflet has measured the container.
    //
    // setView is the right call in that state regardless: arriving from a
    // landing page should land on the school, not animate across the country.
    let animatable = false;
    try {
      const size = map.getSize();
      const centre = map.getCenter();
      animatable = size.x > 0 && size.y > 0
        && Number.isFinite(centre.lat) && Number.isFinite(centre.lng)
        && Number.isFinite(map.getZoom());
    } catch {
      animatable = false; // Leaflet throws until a view is set.
    }

    if (!animatable) {
      map.setView([school.lat, school.lng], 14);
      return;
    }

    map.flyTo([school.lat, school.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);
  return null;
}

/**
 * Fit the map to a focus set of schools (a suburb/postcode search result) and
 * report the now-visible schools directly. A programmatic fitBounds does not
 * reliably fire the moveend that BoundsTracker listens to, so we recompute the
 * viewport set here instead of relying on the event.
 */
function FitToSchools({
  focus,
  schools,
  onBoundsChange,
}: {
  focus: School[] | null;
  schools: School[];
  onBoundsChange: (visible: School[]) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus || focus.length === 0) return;
    const pts = focus
      .filter(s => s.lat && s.lng)
      .map(s => [s.lat, s.lng] as [number, number]);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: false });
    const viewBounds = map.getBounds();
    onBoundsChange(schools.filter(s => viewBounds.contains([s.lat, s.lng])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return null;
}

/**
 * Group nearby school markers into clusters so dense areas stay readable.
 * Markers are managed imperatively via the leaflet.markercluster plugin. The
 * currently selected school is pulled out of the cluster so the page can render
 * it as a highlighted, always-visible marker on top.
 */
function ClusterLayer({
  schools,
  selectedId,
  onSchoolClick,
}: {
  schools: School[];
  selectedId: string | null;
  onSchoolClick: (school: School) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const prevSelectedRef = useRef<string | null>(null);
  const clickRef = useRef(onSchoolClick);
  clickRef.current = onSchoolClick;

  // Create the cluster group once and attach it to the map.
  useEffect(() => {
    const group = L.markerClusterGroup({
      // Insert markers synchronously: chunked (async) loading can fire a deferred
      // chunk after the group has been removed from the map (StrictMode remount or
      // a real unmount), dereferencing a null map. The one-time synchronous cost is
      // negligible next to loading the dataset.
      showCoverageOnHover: false,
      // 48 merged schools that were only just touching (markers run to 36px
      // wide), so pairs and triples clustered far more than density warranted.
      maxClusterRadius: 30,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: createClusterIcon,
    });
    group.addTo(map);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      markersRef.current.clear();
    };
  }, [map]);

  // Rebuild markers when the school set changes (e.g. a filter is applied).
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.clearLayers();
    const markers = new Map<string, L.Marker>();
    const layers: L.Marker[] = [];

    for (const school of schools) {
      if (!school.lat || !school.lng) continue;
      const marker: SchoolMarker = L.marker([school.lat, school.lng], {
        icon: getSchoolIcon(school, false),
      });
      marker.schoolSector = school.sector;
      marker.on('click', () => clickRef.current(school));
      markers.set(school.id, marker);
      if (school.id !== selectedId) layers.push(marker);
    }

    markersRef.current = markers;
    prevSelectedRef.current = selectedId;
    group.addLayers(layers);
  // Rebuild only when the data changes; selection is handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  // Pull the selected school out of the cluster; return the previous one.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const markers = markersRef.current;
    const prev = prevSelectedRef.current;

    if (prev && prev !== selectedId) {
      const prevMarker = markers.get(prev);
      if (prevMarker && !group.hasLayer(prevMarker)) group.addLayer(prevMarker);
    }
    if (selectedId) {
      const selectedMarker = markers.get(selectedId);
      if (selectedMarker && group.hasLayer(selectedMarker)) group.removeLayer(selectedMarker);
    }
    prevSelectedRef.current = selectedId;
  }, [selectedId]);

  return null;
}

export default function SchoolMap({
  schools,
  selectedSchool,
  onSchoolClick,
  onBoundsChange,
  onMapClick,
  flyToSchool,
  fitToSchools,
  onGeoReady,
  catchmentFeatures,
  overlayFeatures,
  onViewportChange,
  pickMode,
  onPickLocation,
  lookupPin,
  autoLocate = true,
}: SchoolMapProps) {
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = '/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  const handleBoundsChange = useCallback((visible: School[]) => {
    onBoundsChange(visible);
  }, [onBoundsChange]);

  const defaultCenter: [number, number] = [-25.2744, 133.7751];

  return (
    <div className="w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <GeoLocator onReady={onGeoReady} enabled={autoLocate} />
        <FlyToTracker school={flyToSchool} />
        <FitToSchools focus={fitToSchools ?? null} schools={schools} onBoundsChange={handleBoundsChange} />
        <MapClickTracker onMapClick={onMapClick} pickMode={pickMode} onPickLocation={onPickLocation} />
        <BoundsTracker schools={schools} onBoundsChange={handleBoundsChange} onViewportChange={onViewportChange} />
        <FitToCatchments features={catchmentFeatures} />

        {/* Browse overlay: outlines only, no fill. A filled zone already means
            "this is the school you selected", and dozens of translucent fills
            stacked over one another would read as depth that is not there.

            Drawn twice — a white casing under a coloured stroke. A single thin
            line disappears into an OSM basemap that is already full of coloured
            roads and waterways at similar widths; the casing is what makes it
            read as a deliberate boundary rather than another road. Every casing
            is laid down before any coloured stroke, so a neighbouring zone's
            halo cannot paint over the line it abuts. */}
        {overlayFeatures?.map((feature) => (
          <GeoJSON
            key={`overlay-casing-${feature.properties.zone_id ?? `${feature.properties.location_age_id}-${feature.properties.kind}-${feature.properties.year_levels.join('-')}`}`}
            data={feature as never}
            interactive={false}
            style={{ color: '#ffffff', weight: 5, opacity: 0.85, fill: false }}
          />
        ))}
        {overlayFeatures?.map((feature) => {
          const style = CATCHMENT_COLORS[feature.properties.kind] ?? CATCHMENT_COLORS.primary;
          return (
            <GeoJSON
              key={`overlay-${feature.properties.zone_id ?? `${feature.properties.location_age_id}-${feature.properties.kind}-${feature.properties.year_levels.join('-')}`}`}
              data={feature as never}
              interactive={false}
              style={{
                color: style.color,
                weight: 2.5,
                opacity: 1,
                dashArray: style.dashArray,
                fill: false,
              }}
            />
          );
        })}

        {/* Catchment outlines sit under the markers so schools stay clickable. */}
        {catchmentFeatures?.map((feature) => {
          const style = CATCHMENT_COLORS[feature.properties.kind] ?? CATCHMENT_COLORS.primary;
          return (
            <GeoJSON
              key={feature.properties.zone_id ?? `${feature.properties.location_age_id}-${feature.properties.kind}-${feature.properties.year_levels.join('-')}`}
              data={feature as never}
              interactive={false}
              style={{
                color: style.color,
                weight: 2,
                dashArray: style.dashArray,
                fillColor: style.color,
                fillOpacity: 0.1,
              }}
            />
          );
        })}

        {lookupPin && <Marker position={lookupPin} icon={lookupPinIcon} interactive={false} />}

        {/* Cluster all filtered schools so dense areas stay readable. */}
        <ClusterLayer
          schools={schools}
          selectedId={selectedSchool?.id ?? null}
          onSchoolClick={onSchoolClick}
        />

        {/* Render the selected school on top so it stays highlighted and visible. */}
        {selectedSchool && selectedSchool.lat && selectedSchool.lng && (
          <Marker
            key="selected"
            position={[selectedSchool.lat, selectedSchool.lng]}
            icon={getSchoolIcon(selectedSchool, true)}
            eventHandlers={{ click: () => onSchoolClick(selectedSchool) }}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>
    </div>
  );
}
