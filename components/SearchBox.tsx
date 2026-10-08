"use client";

import { useState, useMemo, useRef, useEffect, useId, type KeyboardEvent } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { MapSchool } from '@/types/school';
import { formatMessage, getSectorLabel, Messages } from '@/lib/i18n';
import { searchSchools, type SearchResult } from '@/lib/searchSchools';

interface SearchBoxProps {
  allSchools: MapSchool[];
  dictionary: Messages;
  onPickSchool: (s: MapSchool) => void;
  onPickPlace: (schools: MapSchool[]) => void;
}

/**
 * Search field with an ARIA combobox popup.
 *
 * Arrow keys move through schools then places in the order they are drawn,
 * Enter picks, Escape closes. Focus stays in the input throughout and
 * aria-activedescendant names the highlighted option, so a screen reader
 * announces each one without the reader leaving the text they are typing.
 */
export default function SearchBox({ allSchools, dictionary, onPickSchool, onPickPlace }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(
    () => (debounced.trim().length >= 2 ? searchSchools(debounced, allSchools) : []),
    [debounced, allSchools]
  );

  // A new result set invalidates whatever was highlighted in the old one.
  const [resultsSeen, setResultsSeen] = useState(results);
  if (resultsSeen !== results) {
    setResultsSeen(results);
    setActive(-1);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const schoolResults = results.filter(r => r.type === 'school');
  const placeResults = results.filter(r => r.type === 'place');
  // Keyboard order is drawing order, which groups schools before places.
  const ordered: SearchResult[] = [...schoolResults, ...placeResults];
  const expanded = open && debounced.trim().length >= 2;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  function pick(result: SearchResult) {
    setOpen(false);
    setActive(-1);
    if (result.type === 'school') {
      setQuery(result.school.school_name);
      onPickSchool(result.school);
    } else {
      setQuery(result.label);
      onPickPlace(result.schools);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (ordered.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(current => (current + step + ordered.length) % ordered.length);
      return;
    }
    if (e.key === 'Enter' && expanded && active >= 0 && ordered[active]) {
      e.preventDefault();
      pick(ordered[active]);
    }
  }

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  // optionId is derived from the stable useId value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const optionClass = (index: number) => (
    `w-full text-left flex items-center gap-2 px-4 py-2 border-t border-gray-50 cursor-pointer ${
      index === active ? 'bg-indigo-50' : 'hover:bg-indigo-50'
    }`
  );

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md">
        <BrandLogo compact />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={dictionary.search.placeholder}
          aria-label={dictionary.search.placeholder}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800 min-w-0"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setDebounced(''); }}
            aria-label={dictionary.search.clear}
            className="text-gray-400 hover:text-gray-700 text-sm shrink-0"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {expanded && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={dictionary.search.placeholder}
          className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-80 overflow-y-auto z-50"
        >
          {results.length === 0 && (
            <div role="presentation" className="px-4 py-3 text-xs text-gray-400">{dictionary.search.noResults}</div>
          )}
          {schoolResults.length > 0 && (
            <div role="presentation" className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.schoolsGroup}</div>
          )}
          {schoolResults.map((r, i) => r.type === 'school' && (
            // Options are not tab stops: focus stays in the input, as the combobox pattern expects.
            <div
              key={r.school.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
              className={optionClass(i)}
            >
              <span aria-hidden="true" className="w-5 h-5 rounded bg-green-100 flex items-center justify-center text-[10px] shrink-0">🏫</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-gray-800 truncate">{r.school.school_name}</span>
                <span className="block text-[10px] text-gray-400 truncate">{r.school.suburb}, {r.school.state}</span>
              </span>
              <span className="text-[10px] text-gray-400 shrink-0">
                {getSectorLabel(r.school.sector, dictionary)}
              </span>
            </div>
          ))}
          {placeResults.length > 0 && (
            <div role="presentation" className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.placesGroup}</div>
          )}
          {placeResults.map((r, j) => {
            if (r.type !== 'place') return null;
            const i = schoolResults.length + j;
            return (
              <div
                key={`p${j}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                className={optionClass(i)}
              >
                <span aria-hidden="true" className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">📍</span>
                <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{r.label}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{formatMessage(dictionary.search.placeCount, { count: r.schools.length })}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
