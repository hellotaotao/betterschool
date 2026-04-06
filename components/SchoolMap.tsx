"use client";

import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { School } from '@/types/school';
import { getMarkerRadius, getMarkerColor } from '@/utils/schoolFilters';

/** icon 缓存：按 score+sector+selected 生成 key，避免重复创建 DivIcon */
const iconCache = new Map<string, L.DivIcon>();

function getSchoolIcon(school: School, isSelected: boolean): L.DivIcon {
  const cacheKey = `${Math.round(school.score)}-${school.sector}-${isSelected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;
  const icon = createSchoolIcon(school, isSelected);
  iconCache.set(cacheKey, icon);
  return icon;
}

/** 根据学校数据和选中状态创建 Leaflet DivIcon。 */
function createSchoolIcon(school: School, isSelected: boolean): L.DivIcon {
  const radius = getMarkerRadius(school.score);
  const size = radius * 2;
  const bgColor = isSelected ? '#4f46e5' : getMarkerColor(school.score, school.sector);
  const boxShadow = isSelected ? '0 0 0 6px rgba(79,70,229,0.35)' : '';
  const showLabel = radius >= 13; // diameter ≥ 26px，约 score ≥ 83
  const fontSize = Math.max(10, Math.min(18, Math.round(radius * 0.75)));

  const html = `<div
    class="marker-circle"
    style="
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${bgColor};
      border:2px solid white;
      ${boxShadow ? `box-shadow:${boxShadow};` : ''}
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
    "
  >${showLabel ? `<span style="color:white;font-weight:bold;font-size:${fontSize}px;line-height:1;user-select:none;">${Math.round(school.score)}</span>` : ''}</div>`;

  return L.divIcon({
    html,
    className: 'school-marker-icon',
    iconSize: [size, size],
    iconAnchor: [radius, radius],
  });
}

interface SchoolMapProps {
  schools: School[];
  selectedSchool: School | null;
  onSchoolClick: (school: School) => void;
  onBoundsChange: (visibleSchools: School[]) => void;
  onMapClick: () => void;
  flyToSchool?: School | null;
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

/** 监听地图背景点击（非圆点），通知父组件取消选中。 */
function MapClickTracker({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick });
  return null;
}

/** 监听地图移动/缩放，将当前视口内的学校回调给父组件。 */
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

  // geoReady 或 schools 变化时触发
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

/** 选中学校时将地图飞跳到该学校位置。 */
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

export default function SchoolMap({
  schools,
  selectedSchool,
  onSchoolClick,
  onBoundsChange,
  onMapClick,
  flyToSchool,
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
  const [renderSchools, setRenderSchools] = useState<School[]>([]);
  const handleGeoReady = useCallback(() => {
    setGeoReady(true);
    onGeoReady?.();
  }, [onGeoReady]);

  const handleBoundsChange = useCallback((visible: School[]) => {
    setRenderSchools(visible);
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
        <MapClickTracker onMapClick={onMapClick} />
        <BoundsTracker schools={schools} onBoundsChange={handleBoundsChange} geoReady={geoReady} />

        {/* 非选中学校 — 只渲染视口内的 */}
        {renderSchools
          .filter(s => !selectedSchool || `${s.school_name}-${s.postcode}` !== `${selectedSchool.school_name}-${selectedSchool.postcode}`)
          .map((school) => {
            if (!school.lat || !school.lng) return null;
            return (
              <Marker
                key={`${school.school_name}-${school.postcode}`}
                position={[school.lat, school.lng]}
                icon={getSchoolIcon(school, false)}
                eventHandlers={{ click: () => onSchoolClick(school) }}
              />
            );
          })}

        {/* 选中学校 */}
        {selectedSchool && selectedSchool.lat && selectedSchool.lng && (
          <Marker
            key="selected"
            position={[selectedSchool.lat, selectedSchool.lng]}
            icon={getSchoolIcon(selectedSchool, true)}
            eventHandlers={{ click: () => onSchoolClick(selectedSchool) }}
          />
        )}
      </MapContainer>
    </div>
  );
}
