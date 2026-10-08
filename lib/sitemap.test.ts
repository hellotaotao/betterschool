import { describe, expect, it } from 'vitest';
import { bilingualEntries, CHILD_SITEMAPS, sitemapIndexXml } from './sitemap';
import { absoluteUrl } from './site';
import browseSitemap from '@/app/browse/sitemap';
import suburbSitemap from '@/app/suburb/sitemap';
import schoolSitemap from '@/app/school/sitemap';
import catchmentSitemap from '@/app/catchment/sitemap';

describe('bilingualEntries', () => {
  it('emits each locale with the full set of alternates', () => {
    const lastModified = new Date('2026-01-01T00:00:00Z');
    const entries = bilingualEntries(['/school/nsw/x'], { lastModified, priority: 0.7, changeFrequency: 'monthly' });
    expect(entries.map(entry => entry.url)).toEqual([
      absoluteUrl('/school/nsw/x'),
      absoluteUrl('/zh/school/nsw/x'),
    ]);
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        'en-AU': absoluteUrl('/school/nsw/x'),
        'zh-Hans': absoluteUrl('/zh/school/nsw/x'),
      });
    }
  });
});

describe('sitemap index', () => {
  it('lists every child sitemap by absolute URL', () => {
    const xml = sitemapIndexXml(new Date('2026-01-01T00:00:00Z'));
    expect(xml).toContain('<sitemapindex');
    for (const path of CHILD_SITEMAPS) expect(xml).toContain(`<loc>${absoluteUrl(path)}</loc>`);
  });

  it('keeps every child under the 50,000-URL limit, with no URL listed twice', () => {
    const children = [browseSitemap(), suburbSitemap(), schoolSitemap(), catchmentSitemap()];
    for (const child of children) expect(child.length).toBeLessThan(50_000);

    const urls = children.flat().map(entry => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
