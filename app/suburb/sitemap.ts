import type { MetadataRoute } from 'next';
import { getDatasetLastModified, getSchoolsDataset, getStateSummaries } from '@/lib/schoolsData';
import { bilingualEntries } from '@/lib/sitemap';
import { stateIndexPath, suburbPath } from '@/lib/slug';

/** State indexes and every suburb page, in both languages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = getDatasetLastModified();
  return [
    ...bilingualEntries(
      getStateSummaries().map(summary => stateIndexPath(summary.state)),
      { lastModified, priority: 0.8, changeFrequency: 'monthly' },
    ),
    ...bilingualEntries(
      [...getSchoolsDataset().suburbs.values()].map(group => suburbPath(group.state, group.suburb)),
      { lastModified, priority: 0.6, changeFrequency: 'monthly' },
    ),
  ];
}
