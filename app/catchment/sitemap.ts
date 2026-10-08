import type { MetadataRoute } from 'next';
import { getDatasetLastModified, getSchoolSlug, getSchoolsWithCatchments } from '@/lib/schoolsData';
import { bilingualEntries } from '@/lib/sitemap';
import { catchmentPath } from '@/lib/slug';

/** One zone page per school with a published catchment, in both languages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = getSchoolsWithCatchments().flatMap(school => {
    const slug = getSchoolSlug(school);
    return slug ? [catchmentPath(school.state, slug)] : [];
  });
  return bilingualEntries(paths, { lastModified: getDatasetLastModified(), priority: 0.8, changeFrequency: 'monthly' });
}
