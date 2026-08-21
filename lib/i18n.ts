import enMessages from '@/messages/en.json';
import zhMessages from '@/messages/zh.json';

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

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template
  );
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
