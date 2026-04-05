"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { School } from '@/types/school';
import { getMarkerRadius } from '@/utils/schoolFilters';

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
  const [hoveredSchool, setHoveredSchool] = useState<School | null>(null);

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
            const radius = getMarkerRadius(school.score);
            const fillColor = school.sector === 'Government' ? '#22c55e' : '#f97316';
            return (
              <CircleMarker
                key={`${school.school_name}-${index}`}
                center={[school.lat, school.lng]}
                radius={hoveredSchool === school ? radius * 1.3 : radius}
                pathOptions={{
                  color: 'white',
                  weight: 1.5,
                  fillColor,
                  fillOpacity: 0.85,
                }}
                eventHandlers={{
                  click: () => onSchoolClick(school),
                  mouseover: () => setHoveredSchool(school),
                  mouseout: () => setHoveredSchool(null),
                }}
              />
            );
          })}

        {/* 选中学校（渲染在最上层）：先画发光大圆，再画主圆 */}
        {selectedSchool && selectedSchool.lat && selectedSchool.lng && (
          <>
            <CircleMarker
              key="selected-glow"
              center={[selectedSchool.lat, selectedSchool.lng]}
              radius={getMarkerRadius(selectedSchool.score) + 8}
              pathOptions={{
                color: 'transparent',
                weight: 0,
                fillColor: '#4f46e5',
                fillOpacity: 0.25,
              }}
              interactive={false}
            />
            <CircleMarker
              key="selected-main"
              center={[selectedSchool.lat, selectedSchool.lng]}
              radius={getMarkerRadius(selectedSchool.score)}
              pathOptions={{
                color: 'white',
                weight: 2,
                fillColor: '#4f46e5',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSchoolClick(selectedSchool) }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
