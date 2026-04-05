"use client";

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { School } from '@/types/school';

// Fix for default marker icons in Next.js if we were using standard markers
// But we will use CircleMarkers which are easier and look cleaner for data points.

interface SchoolMapProps {
  schools: School[];
}

// Component to handle map view updates
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function SchoolMap({ schools }: SchoolMapProps) {
  // Default center (Australia)
  const defaultCenter: [number, number] = [-25.2744, 133.7751];
  const defaultZoom = 4;

  const center = useMemo((): [number, number] => {
    if (schools.length > 0 && schools.length < 50) {
      return [schools[0].lat, schools[0].lng];
    }
    return defaultCenter;
  }, [schools]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full h-full z-0">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater center={center} />

        {schools.map((school, index) => {
          if (school.lat === null || school.lng === null || school.lat === undefined || school.lng === undefined) return null;
          return (
          <CircleMarker
            key={`${school.school_name}-${index}`}
            center={[school.lat, school.lng]}
            radius={6}
            pathOptions={{
              color: 'white',
              weight: 1,
              fillColor: school.sector === 'Government' ? '#22c55e' : '#f97316', // green-500 : orange-500
              fillOpacity: 0.8
            }}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-sm mb-1">{school.school_name}</h3>
                <p className="text-xs text-gray-600 mb-1">{school.suburb}, {school.state}</p>
                <div className="flex justify-between items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    school.sector === 'Government' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                  }`}>
                    {school.sector}
                  </span>
                  <span className="font-bold text-blue-600 text-xs">Score: {school.score}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Rank: #{school.rank}
                </div>
              </div>
            </Popup>
          </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
