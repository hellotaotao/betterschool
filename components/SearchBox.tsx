"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { School } from '@/types/school';
import { formatMessage, getSectorLabel, Messages } from '@/lib/i18n';
import { searchSchools } from '@/lib/searchSchools';

interface SearchBoxProps {
  allSchools: School[];
  dictionary: Messages;
  onPickSchool: (s: School) => void;
  onPickPlace: (schools: School[]) => void;
}

export default function SearchBox({ allSchools, dictionary, onPickSchool, onPickPlace }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(
    () => (debounced.trim().length >= 2 ? searchSchools(debounced, allSchools) : []),
    [debounced, allSchools]
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const schoolResults = results.filter(r => r.type === 'school');
  const placeResults = results.filter(r => r.type === 'place');

  function pickSchool(s: School) {
    setQuery(s.school_name);
    setOpen(false);
    onPickSchool(s);
  }

  function pickPlace(schools: School[], label: string) {
    setQuery(label);
    setOpen(false);
    onPickPlace(schools);
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md">
        <BrandLogo compact />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={dictionary.search.placeholder}
          className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800 min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setDebounced(''); }} className="text-gray-400 hover:text-gray-700 text-sm shrink-0">✕</button>
        )}
      </div>

      {open && debounced.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-80 overflow-y-auto z-50">
          {results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400">{dictionary.search.noResults}</div>
          )}
          {schoolResults.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.schoolsGroup}</div>
          )}
          {schoolResults.map(r => r.type === 'school' && (
            <button key={r.school.id} onClick={() => pickSchool(r.school)}
              className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 border-t border-gray-50">
              <span className="w-5 h-5 rounded bg-green-100 flex items-center justify-center text-[10px] shrink-0">🏫</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-gray-800 truncate">{r.school.school_name}</span>
                <span className="block text-[10px] text-gray-400 truncate">{r.school.suburb}, {r.school.state}</span>
              </span>
              <span className="text-[10px] text-gray-400 shrink-0">
                {getSectorLabel(r.school.sector, dictionary)}
              </span>
            </button>
          ))}
          {placeResults.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.placesGroup}</div>
          )}
          {placeResults.map((r, i) => r.type === 'place' && (
            <button key={`p${i}`} onClick={() => pickPlace(r.schools, r.label)}
              className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 border-t border-gray-50">
              <span className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">📍</span>
              <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{r.label}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{formatMessage(dictionary.search.placeCount, { count: r.schools.length })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
