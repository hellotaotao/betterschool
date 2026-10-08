import type { MetadataRoute } from 'next';
import { getDatasetLastModified } from '@/lib/schoolsData';
import { bilingualEntries } from '@/lib/sitemap';
import { absoluteUrl } from '@/lib/site';
import { browsePath } from '@/lib/slug';

/** Entry points: the map app (one URL for both languages) and the browse hub. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getDatasetLastModified();
  return [
    { url: absoluteUrl('/schools'), lastModified, changeFrequency: 'weekly', priority: 1 },
    ...bilingualEntries([browsePath()], { lastModified, priority: 0.9, changeFrequency: 'weekly' }),
  ];
}
