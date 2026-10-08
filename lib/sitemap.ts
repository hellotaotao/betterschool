import type { MetadataRoute } from 'next';
import { absoluteUrl } from './site';
import { SEO_LOCALES, htmlLang } from './seoLocale';
import { toLocalePath } from './slug';

/**
 * The child sitemaps listed by the /sitemap.xml index, one per page family.
 *
 * Split by family rather than by count: each stays far below the 50,000-URL
 * limit at every school ACARA could plausibly add (schools are the largest at
 * two locales per school), a family's growth cannot push another over, and a
 * reader of Search Console sees coverage per page type. /sitemap.xml itself
 * stays the address robots.txt and Search Console already know.
 */
export const CHILD_SITEMAPS = [
  '/browse/sitemap.xml',
  '/suburb/sitemap.xml',
  '/school/sitemap.xml',
  '/catchment/sitemap.xml',
] as const;

/**
 * One entry per locale for a bilingual page, each listing every language
 * version — what Google expects on both sides of a translated pair.
 */
export function bilingualEntries(
  barePaths: Iterable<string>,
  options: { lastModified: Date; priority: number; changeFrequency: 'weekly' | 'monthly' },
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const barePath of barePaths) {
    const languages = Object.fromEntries(
      SEO_LOCALES.map(locale => [htmlLang(locale), absoluteUrl(toLocalePath(barePath, locale))]),
    );
    for (const locale of SEO_LOCALES) {
      entries.push({
        url: absoluteUrl(toLocalePath(barePath, locale)),
        lastModified: options.lastModified,
        changeFrequency: options.changeFrequency,
        priority: options.priority,
        alternates: { languages },
      });
    }
  }
  return entries;
}

/** A sitemap index pointing at each child sitemap. */
export function sitemapIndexXml(lastModified: Date): string {
  const items = CHILD_SITEMAPS.map(path => (
    `  <sitemap>\n    <loc>${absoluteUrl(path)}</loc>\n    <lastmod>${lastModified.toISOString()}</lastmod>\n  </sitemap>`
  ));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    '</sitemapindex>',
    '',
  ].join('\n');
}
