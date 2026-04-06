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

export function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template
  );
}

export function getSectorLabel(sector: string, dictionary: Messages): string {
  return sector === 'Government'
    ? dictionary.filters.government
    : dictionary.filters.nonGovernment;
}

export function getSchoolTypeLabel(schoolType: string, dictionary: Messages): string {
  if (schoolType === 'Primary') return dictionary.filters.primary;
  if (schoolType === 'Combined') return dictionary.filters.combined;
  if (schoolType === 'Secondary') return dictionary.filters.secondary;
  return schoolType;
}
