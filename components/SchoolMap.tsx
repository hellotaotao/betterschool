"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { School } from '@/types/school';
import { getMarkerRadius, getMarkerColor } from '@/utils/schoolFilters';

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
 */
function createSchoolIcon(school: School, isSelected: boolean): L.DivIcon {
  const radius = getMarkerRadius(school.total_enrolments);
  const size = radius * 2;
  const bgColor = isSelected ? '#4f46e5' : getMarkerColor(school.sector);
  const boxShadow = isSelected ? '0 0 0 6px rgba(79,70,229,0.35)' : '';
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

/** Render a cluster bubble whose size scales with the number of grouped schools. */
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 100 ? 40 : count < 1000 ? 48 : 56;
  const label = count >= 1000 ? `${Math.round(count / 1000)}k` : `${count}`;
  const html = `<div style="
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:rgba(79,70,229,0.92);
      border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      display:flex;
      align-items:center;
      justify-content:center;
      color:white;
      font-weight:700;
      font-size:13px;
      line-height:1;
    ">${label}</div>`;

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

/** Track background clicks and clear the selected school. */
function MapClickTracker({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick });
  return null;
}

/** Report schools visible in the current viewport. */
function BoundsTracker({
  schools,
  onBoundsChange,
  geoReady,
}: {
  schools: School[];
  onBoundsChange: (visible: School[]) => void;
  geoReady: boolean;
}) {
  const map = useMapEvents({
    moveend: () => {
      if (!geoReady) return;
      const bounds = map.getBounds();
      onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    },
  });

  // Recompute visible schools when geolocation finishes or data changes.
  useEffect(() => {
    if (!geoReady) return;
    const bounds = map.getBounds();
    onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools, geoReady]);

  return null;
}

/** Center the map around the detected user location after mount. */
function GeoLocator({ onReady }: { onReady?: () => void }) {
  const map = useMap();

  useEffect(() => {
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
    if (school?.lat && school?.lng) {
      map.flyTo([school.lat, school.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
    }
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
      maxClusterRadius: 48,
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
      const marker = L.marker([school.lat, school.lng], {
        icon: getSchoolIcon(school, false),
      });
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

  const [geoReady, setGeoReady] = useState(false);
  const handleGeoReady = useCallback(() => {
    setGeoReady(true);
    onGeoReady?.();
  }, [onGeoReady]);

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

        <GeoLocator onReady={handleGeoReady} />
        <FlyToTracker school={flyToSchool} />
        <FitToSchools focus={fitToSchools ?? null} schools={schools} onBoundsChange={handleBoundsChange} />
        <MapClickTracker onMapClick={onMapClick} />
        <BoundsTracker schools={schools} onBoundsChange={handleBoundsChange} geoReady={geoReady} />

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
