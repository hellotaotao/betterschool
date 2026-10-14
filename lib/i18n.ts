import enMessages from '@/messages/en.json';
import zhMessages from '@/messages/zh.json';

import { catchmentStateCodes } from './catchmentStates';

export type Locale = 'en' | 'zh';

export type Messages = typeof enMessages;

const messages: Record<Locale, Messages> = {
  en: enMessages,
  zh: zhMessages,
};

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

export function detectBrowserLocale(languages: readonly string[] = []): Locale {
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}

export const LOCALE_STORAGE_KEY = 'betterschool.locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh';
}

/**
 * Which language the map app should open in.
 *
 * An explicit ?lang= wins — it is how a Chinese SEO page hands the reader to
 * the map without losing their language. A remembered choice comes next, so a
 * manual switch survives a reload. Guessing from the browser is the fallback,
 * and it is only ever a guess: plenty of Chinese-speaking parents in Australia
 * run an English-language browser.
 */
export function resolveInitialLocale({
  query,
  stored,
  languages = [],
}: {
  query?: string | null;
  stored?: string | null;
  languages?: readonly string[];
}): Locale {
  if (isLocale(query)) return query;
  if (isLocale(stored)) return stored;
  return detectBrowserLocale(languages);
}

/**
 * Fill `{name}` placeholders. Every occurrence is replaced, and the value is
 * inserted literally: a function replacement keeps a school name containing
 * `$&` or `$1` from being read as a regex back-reference. A placeholder with
 * no value is left in place so the gap shows up rather than vanishing.
 */
export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder
  ));
}

/**
 * A number as the ordinal its locale writes before "percentile": "93rd" in
 * English (11th-13th are the exceptions to the last-digit rule); Chinese puts
 * 第 in the message itself and takes the bare number.
 */
export function ordinalNumber(value: number, locale: Locale): string {
  if (locale !== 'en') return String(value);
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[lastTwo % 10] ?? 'th';
  return `${value}${suffix}`;
}

export function getSectorLabel(sector: string, dictionary: Messages): string {
  if (sector === 'Government') return dictionary.filters.government;
  if (sector === 'Catholic') return dictionary.filters.catholic;
  if (sector === 'Independent') return dictionary.filters.independent;
  return sector;
}

export function getSchoolTypeLabel(schoolType: string, dictionary: Messages): string {
  if (schoolType === 'Primary') return dictionary.filters.primary;
  if (schoolType === 'Combined') return dictionary.filters.combined;
  if (schoolType === 'Secondary') return dictionary.filters.secondary;
  if (schoolType === 'Special') return dictionary.filters.special;
  return schoolType;
}

export function getReligionLabel(affiliation: string | undefined, dictionary: Messages): string {
  const labels = dictionary.religions as Record<string, string>;
  if (!affiliation) return labels.Unknown;
  return labels[affiliation] ?? affiliation;
}

/** Localised list of the states whose zones we publish, e.g. "NSW, SA". */
export function coveredCatchmentStates(dictionary: Messages, locale: Locale): string {
  const names = dictionary.seo.states as Record<string, string>;
  return catchmentStateCodes()
    .map(code => (locale === 'zh' ? names[code] ?? code : code))
    .join(locale === 'zh' ? '、' : ', ');
}
