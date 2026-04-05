"use client";

import { useState, useEffect, useMemo } from 'react';
// import Head from 'next/head';
// import dynamic from 'next/dynamic';
// import SchoolMap from '../../components/SchoolMap';
import dynamic from 'next/dynamic';
import { School } from '@/types/school';

// Dynamically import map to avoid SSR issues with Leaflet/Mapbox
const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {  
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">Loading Map...</div>
});

export default function SchoolsPage() {
  console.log("Rendering SchoolsPage");
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    sector: 'All',
    minScore: 0,
    state: 'All'
  });

  useEffect(() => {
    console.log("Starting fetch...");
    fetch('/data/schools.json')
      .then(res => {
        console.log("Fetch response:", res.status);
        return res.json();
      })
      .then(data => {
        console.log("Data loaded, count:", data.length);
        setSchools(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load schools:", err);
        setLoading(false);
      });
  }, []);

  const filteredSchools = useMemo(() => {
    return schools.filter(school => {
      if (filters.sector !== 'All' && school.sector !== filters.sector) return false;
      if (filters.state !== 'All' && school.state !== filters.state) return false;
      if (school.score < filters.minScore) return false;
      return true;
    });
  }, [schools, filters]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* <Head>
        <title>Top Primary Schools | BetterSchool</title>
      </Head> */}
      
      <header className="bg-white shadow-sm z-10 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Top Primary Schools</h1>
        <div className="text-sm text-gray-500">
          Showing {filteredSchools.length} schools
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar / List View */}
        <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 space-y-4">
            {/* Filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
              <select 
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={filters.sector}
                onChange={(e) => setFilters({...filters, sector: e.target.value})}
              >
                <option value="All">All Sectors</option>
                <option value="Government">Government</option>
                <option value="Non-government">Non-government</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <select 
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                value={filters.state}
                onChange={(e) => setFilters({...filters, state: e.target.value})}
              >
                <option value="All">All States</option>
                <option value="VIC">VIC</option>
                <option value="NSW">NSW</option>
                <option value="QLD">QLD</option>
                <option value="WA">WA</option>
                <option value="SA">SA</option>
                <option value="TAS">TAS</option>
                <option value="ACT">ACT</option>
                <option value="NT">NT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Score: {filters.minScore}</label>
              <input 
                type="range" 
                min="60" 
                max="100" 
                value={filters.minScore} 
                onChange={(e) => setFilters({...filters, minScore: parseInt(e.target.value)})}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <p className="text-center text-gray-500">Loading schools...</p>
            ) : (
              filteredSchools.map((school, idx) => (
                <div key={idx} className="p-3 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-white">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-gray-900">{school.school_name}</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {school.score}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{school.suburb}, {school.state} {school.postcode}</p>
                  <div className="mt-2 flex items-center text-xs text-gray-500 space-x-2">
                    <span className={`px-2 py-0.5 rounded ${school.sector === 'Government' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                      {school.sector}
                    </span>
                    <span>Rank: #{school.rank}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Map View */}
        <div className="flex-1 relative">
           <SchoolMap
             schools={filteredSchools}
             selectedSchool={null}
             onSchoolClick={() => {}}
             onBoundsChange={() => {}}
             onMapClick={() => {}}
           />
        </div>
      </main>
    </div>
  );
}
