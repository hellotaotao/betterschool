import type { Metadata } from 'next';
import { getMessages, type Locale, type Messages } from './i18n';
import { absoluteUrl, SITE_NAME } from './site';
import { toLocalePath } from './slug';

export type { Locale };

export const SEO_LOCALES: Locale[] = ['en', 'zh'];

/** The static pages' own slice of the message bundle. */
export function getSeo(locale: Locale): Messages['seo'] {
  return getMessages(locale).seo;
}

/**
 * BCP 47 tag for the locale.
 *
 * `zh-Hans` rather than `zh-CN`: the audience is Chinese-speaking parents in
 * Australia, so the script is what matters, not a country.
 */
export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-Hans' : 'en-AU';
}

export function localeStateName(locale: Locale, state: string): string {
  const names = getSeo(locale).states as Record<string, string>;
  return names[state] ?? state;
}

/**
 * State label for titles and meta descriptions.
 *
 * English keeps the abbreviation — "NSW" is how Australians write and search
 * it, and a title has no room to spare. Chinese has no established short form,
 * so it gets the full name.
 */
export function localeStateLabel(locale: Locale, state: string): string {
  return locale === 'zh' ? localeStateName(locale, state) : state;
}

/** Localised label for a catchment kind (primary / secondary / future). */
export function localeKind(locale: Locale, kind: string): string {
  const kinds = getSeo(locale).kinds as Record<string, string>;
  return kinds[kind] ?? kind;
}

/**
 * Canonical + hreflang for a page that exists in both locales.
 *
 * Each language version points at itself as canonical and lists every version,
 * including itself, which is what Google expects. `x-default` goes to English:
 * it is the fallback for a reader whose language we do not publish.
 */
export function buildAlternates(locale: Locale, bareEnglishPath: string): Metadata['alternates'] {
  return {
    canonical: toLocalePath(bareEnglishPath, locale),
    languages: {
      'en-AU': absoluteUrl(toLocalePath(bareEnglishPath, 'en')),
      'zh-Hans': absoluteUrl(toLocalePath(bareEnglishPath, 'zh')),
      'x-default': absoluteUrl(toLocalePath(bareEnglishPath, 'en')),
    },
  };
}

/** Title, description, canonical, hreflang and OpenGraph in one place. */
export function buildPageMetadata({
  locale,
  title,
  description,
  bareEnglishPath,
  type = 'website',
}: {
  locale: Locale;
  title: string;
  description: string;
  bareEnglishPath: string;
  type?: 'website' | 'article';
}): Metadata {
  const alternates = buildAlternates(locale, bareEnglishPath);
  return {
    title,
    description,
    alternates,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(toLocalePath(bareEnglishPath, locale)),
      locale: htmlLang(locale).replace('-', '_'),
      type,
    },
  };
}
