import type { MetadataRoute } from 'next';
import {
  getSchoolSlug,
  getSchoolsDataset,
  getSchoolsWithCatchments,
} from '@/lib/schoolsData';
import { catchmentPath, schoolPath, suburbPath } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';

/**
 * One sitemap for every prerendered page (~17.9k URLs), comfortably inside the
 * 50,000-URL limit. `lastModified` tracks the dataset build, since that is the
 * only thing that changes these pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const dataset = getSchoolsDataset();
  const lastModified = dataset.metadata.generated_at
    ? new Date(dataset.metadata.generated_at)
    : new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/schools'), lastModified, changeFrequency: 'weekly', priority: 1 },
  ];

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
