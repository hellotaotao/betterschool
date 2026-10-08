"use client";

import { useCallback, useEffect, useState } from 'react';
import { LOCALE_STORAGE_KEY, resolveInitialLocale, type Locale } from './i18n';

/**
 * The map app's language, resolved after mount and remembered on change.
 *
 * Starts as English so the first client render matches the prerendered shell;
 * `resolveInitialLocale` then applies ?lang=, the stored choice, and the
 * browser's languages, in that order.
 */
export function useMapLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const languages = navigator.languages?.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // Private browsing and blocked storage both throw; the guess still works.
    }

    const query = new URLSearchParams(window.location.search).get('lang');
    // Deferred a tick so the first paint matches the server-rendered shell.
    const timer = window.setTimeout(() => setLocale(resolveInitialLocale({ query, stored, languages })), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const change = useCallback((next: Locale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the switch still applies for this visit.
    }
  }, []);

  return [locale, change];
}
