"use client";

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { School } from '@/types/school';
import { getMarkerRadius, getMarkerColor } from '@/utils/schoolFilters';

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
}: {
  schools: School[];
  onBoundsChange: (visible: School[]) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    },
  });

  // 首次加载后触发一次
  useEffect(() => {
    const bounds = map.getBounds();
    onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  return null;
}

/** 地图初始化后跳转到 IP 定位位置。 */
function IpLocator() {
  const map = useMap();
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.latitude && data.longitude) {
          map.setView([data.latitude, data.longitude], 10);
        }
      })
      .catch(() => {});
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
}: SchoolMapProps) {
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

        <IpLocator />
        <FlyToTracker school={flyToSchool} />
        <MapClickTracker onMapClick={onMapClick} />
        <BoundsTracker schools={schools} onBoundsChange={onBoundsChange} />

        {/* 非选中学校 */}
        {schools
          .filter(s => s !== selectedSchool)
          .map((school, index) => {
            if (!school.lat || !school.lng) return null;
            return (
              <Marker
                key={`${school.school_name}-${index}`}
                position={[school.lat, school.lng]}
                icon={createSchoolIcon(school, false)}
                eventHandlers={{ click: () => onSchoolClick(school) }}
              />
            );
          })}

        {/* 选中学校 */}
        {selectedSchool && selectedSchool.lat && selectedSchool.lng && (
          <Marker
            key="selected"
            position={[selectedSchool.lat, selectedSchool.lng]}
            icon={createSchoolIcon(selectedSchool, true)}
            eventHandlers={{ click: () => onSchoolClick(selectedSchool) }}
          />
        )}
      </MapContainer>
    </div>
  );
}
