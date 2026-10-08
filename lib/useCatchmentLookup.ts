"use client";

import { useCallback, useRef, useState } from 'react';
import type { CatchmentFeature } from './catchmentLookup';
import { lookupCatchmentsAt } from './catchmentClient';

/** "Which zones is this location in?" — the pin, its results, and pick mode. */
export function useCatchmentLookup() {
  const [pickMode, setPickMode] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [results, setResults] = useState<CatchmentFeature[] | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Bumped by every new lookup and by clearing one, so a response that lands
  // after the reader moved on is dropped instead of painting orphan zones.
  const requestRef = useRef(0);

  const clear = useCallback(() => {
    requestRef.current += 1;
    setPickMode(false);
    setPin(null);
    setResults(null);
    setState(null);
    setError(false);
    setLoading(false);
  }, []);

  /** Look up a Leaflet [lat, lng]. */
  const lookUp = useCallback(([lat, lng]: [number, number]) => {
    setPickMode(false);
    setPin([lat, lng]);
    setResults([]);
    setState(null);
    setError(false);
    setLoading(true);

    const request = ++requestRef.current;
    // GeoJSON is [lng, lat]; Leaflet hands us [lat, lng].
    lookupCatchmentsAt([lng, lat])
      .then(result => {
        if (request !== requestRef.current) return;
        setResults(result.features);
        setState(result.state);
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        setError(true);
        setLoading(false);
      });
  }, []);

  return { pickMode, setPickMode, pin, results, state, loading, error, clear, lookUp };
}
