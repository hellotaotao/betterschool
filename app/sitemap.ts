import type { MetadataRoute } from 'next';
import {
  getSchoolSlug,
  getSchoolsDataset,
  getSchoolsWithCatchments,
  getStateSummaries,
} from '@/lib/schoolsData';
import { catchmentPath, schoolPath, stateIndexPath, suburbPath, toLocalePath } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';
import { SEO_LOCALES } from '@/lib/seoLocale';

/**
 * Every canonical URL in both locales (~35.7k), inside the 50,000-URL limit.
 *
 * The long-tail pages render on demand rather than at build time, so this is
 * how a crawler discovers them — together with the /browse and state indexes,
 * which give them internal links as well. Each entry carries the full set of
 * language alternates, which is what Google expects to see on both sides of a
 * translated pair. `lastModified` tracks the dataset build, the only thing that
 * changes these pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const dataset = getSchoolsDataset();
  const lastModified = dataset.metadata.generated_at
    ? new Date(dataset.metadata.generated_at)
    : new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/schools'), lastModified, changeFrequency: 'weekly', priority: 1 },
  ];

  /** Emit one entry per locale, each listing every language version. */
  const addBoth = (
    barePath: string,
    priority: number,
    changeFrequency: 'weekly' | 'monthly',
  ) => {
    const languages = Object.fromEntries(
      SEO_LOCALES.map(locale => [
        locale === 'zh' ? 'zh-Hans' : 'en-AU',
        absoluteUrl(toLocalePath(barePath, locale)),
      ]),
    );

    for (const locale of SEO_LOCALES) {
      entries.push({
        url: absoluteUrl(toLocalePath(barePath, locale)),
        lastModified,
        changeFrequency,
        priority,
        alternates: { languages },
      });
    }
  };

  addBoth('/browse', 0.9, 'weekly');

  for (const summary of getStateSummaries()) {
    addBoth(stateIndexPath(summary.state), 0.8, 'monthly');
  }

  for (const school of dataset.schools) {
    const slug = dataset.slugs.get(school.id);
    if (!slug) continue;
    addBoth(schoolPath(school.state, slug), 0.7, 'monthly');
  }

  for (const group of dataset.suburbs.values()) {
    addBoth(suburbPath(group.state, group.suburb), 0.6, 'monthly');
  }

  for (const school of getSchoolsWithCatchments()) {
    const slug = getSchoolSlug(school);
    if (!slug) continue;
    addBoth(catchmentPath(school.state, slug), 0.8, 'monthly');
  }

  return entries;
}
