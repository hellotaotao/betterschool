import type { MetadataRoute } from 'next';
import { getDatasetLastModified, getSchoolsDataset } from '@/lib/schoolsData';
import { bilingualEntries } from '@/lib/sitemap';
import { schoolPath } from '@/lib/slug';

/**
 * Every school page in both languages. The pages render on demand rather than
 * at build time, so this is how a crawler finds most of them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const dataset = getSchoolsDataset();
  const paths = dataset.schools.flatMap(school => {
    const slug = dataset.slugs.get(school.id);
    return slug ? [schoolPath(school.state, slug)] : [];
  });
  return bilingualEntries(paths, { lastModified: getDatasetLastModified(), priority: 0.7, changeFrequency: 'monthly' });
}
