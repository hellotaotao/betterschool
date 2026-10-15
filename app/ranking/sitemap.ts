import type { MetadataRoute } from 'next';
import { getDatasetLastModified, getRankingGroups } from '@/lib/schoolsData';
import { bilingualEntries } from '@/lib/sitemap';
import { rankingPath } from '@/lib/slug';

/** Every state ranking page, in both languages. */
export default function sitemap(): MetadataRoute.Sitemap {
  return bilingualEntries(
    getRankingGroups().map(group => rankingPath(group.state, group.slug)),
    { lastModified: getDatasetLastModified(), priority: 0.7, changeFrequency: 'monthly' },
  );
}
