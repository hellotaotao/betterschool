"use client";

import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const mapboxToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';

interface School {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
}

export default function SchoolMap() {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const [schools, setSchools] = useState<School[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/locations")
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                console.log("Fetched schools:", data);
                setSchools(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching schools:", error);
                setError(error.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!mapContainerRef.current || loading || error || schools.length === 0) {
            return;
        }

        mapboxgl.accessToken = mapboxToken;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: {
                version: 8,
                sources: {
                    "raster-tiles": {
                        type: "raster",
                        tiles: [
                            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        ],
                        tileSize: 256,
                        attribution: "© OpenStreetMap contributors"
                    }
                },
                layers: [
                    {
                        id: "simple-tiles",
                        type: "raster",
                        source: "raster-tiles",
                        minzoom: 0,
                        maxzoom: 22
                    }
                ]
            },
            center: [-98.5795, 39.8283], // Center of USA
            zoom: 3
        });

        mapRef.current = map;

        map.on('load', () => {
            // Add markers for each school
            schools.forEach((school) => {
                // Create a popup
                const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<div>
                        <h3 style="margin: 0 0 5px 0; font-weight: bold;">${school.name}</h3>
                        <p style="margin: 0; font-size: 12px; color: #666;">
                            Lat: ${school.latitude}<br>
                            Lng: ${school.longitude}
                        </p>
                    </div>`
                );

                // Create a marker
                new mapboxgl.Marker({ color: '#e74c3c' })
                    .setLngLat([school.longitude, school.latitude])
                    .setPopup(popup)
                    .addTo(map);
            });

            // Fit map to show all markers
            if (schools.length > 0) {
                const bounds = new mapboxgl.LngLatBounds();
                schools.forEach((school) => {
                    bounds.extend([school.longitude, school.latitude]);
                });
                map.fitBounds(bounds, { padding: 50 });
            }
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
            }
        };
    }, [schools, loading, error]);

    if (loading) {
        return (
            <div className="p-4">
                <h2 className="text-xl font-bold mb-4">School Locations</h2>
                <div>Loading school data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4">
                <h2 className="text-xl font-bold mb-4">School Locations</h2>
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">School Locations</h2>
            <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Found {schools.length} school locations</p>
                <div 
                    ref={mapContainerRef}
                    className="w-full h-96 rounded-lg border border-gray-300"
                />
            </div>
            <div className="bg-gray-100 p-4 rounded">
                <h3 className="font-semibold mb-2">School List:</h3>
                <div className="space-y-2">
                    {schools.map((school) => (
                        <div key={school.id} className="bg-white p-3 rounded shadow">
                            <h4 className="font-semibold">{school.name}</h4>
                            <p className="text-sm text-gray-600">
                                Latitude: {school.latitude}, Longitude: {school.longitude}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
