"use client";

import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_ACCESS_TOKEN = "your_mapbox_access_token_here";
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

interface School {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
}

export default function SchoolMap() {
    const [schools, setSchools] = useState<School[]>([]);
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
        fetch("/api/locations")
            .then((response) => response.json())
            .then((data) => setSchools(data))
            .catch((error) => console.error("Error fetching schools:", error));
    }, []);

    useEffect(() => {
        if (map.current) return; // initialize map only once
        map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: "mapbox://styles/mapbox/light-v10",
            center: [0, 0],
            zoom: 2
        });

        map.current.on("load", () => {
            // Add markers for each school
            schools.forEach((school) => {
                new mapboxgl.Marker()
                    .setLngLat([school.longitude, school.latitude])
                    .setPopup(new mapboxgl.Popup().setHTML(`<h3>${school.name}</h3>`))
                    .addTo(map.current!);
            });
        });

        return () => map.current?.remove();
    }, [schools]);

    return <div ref={mapContainer} style={{ width: "100%", height: "400px" }} />;
}
