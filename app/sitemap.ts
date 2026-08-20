import type { MetadataRoute } from 'next';
import {
  getSchoolSlug,
  getSchoolsDataset,
  getSchoolsWithCatchments,
  getStateSummaries,
} from '@/lib/schoolsData';
import { catchmentPath, schoolPath, suburbPath } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';

/**
 * One sitemap for every canonical URL (~17.9k), comfortably inside the
 * 50,000-URL limit. The long-tail pages render on demand rather than at build
 * time, so this is how a crawler discovers them — together with the /browse
 * and state indexes above, which give them internal links as well.
 * `lastModified` tracks the dataset build, the only thing that changes them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const dataset = getSchoolsDataset();
  const lastModified = dataset.metadata.generated_at
    ? new Date(dataset.metadata.generated_at)
    : new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/schools'), lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/browse'), lastModified, changeFrequency: 'weekly', priority: 0.9 },
  ];

  // State indexes: the crawl path from /browse down to the suburb pages.
  for (const summary of getStateSummaries()) {
    entries.push({
      url: absoluteUrl(`/suburb/${summary.slug}`),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  for (const school of dataset.schools) {
    const slug = dataset.slugs.get(school.id);
    if (!slug) continue;
    entries.push({
      url: absoluteUrl(schoolPath(school.state, slug)),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  for (const group of dataset.suburbs.values()) {
    entries.push({
      url: absoluteUrl(suburbPath(group.state, group.suburb)),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const school of getSchoolsWithCatchments()) {
    const slug = getSchoolSlug(school);
    if (!slug) continue;
    entries.push({
      url: absoluteUrl(catchmentPath(school.state, slug)),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  return entries;
}
