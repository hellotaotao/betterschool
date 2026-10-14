import metadata from '@/public/data/schools.metadata.json';

/**
 * The ACARA collection year the profiles come from, read from the metadata the
 * canonical build writes. Pages quote it ("ACARA, 2025"), so a new collection
 * dropped into ACARA/ updates every page on rebuild instead of leaving them
 * citing last year's release.
 */
export function acaraDataYear(source: unknown): number {
  const year = (source as { provenance?: { acara_public_data?: { data_year?: unknown } } })
    ?.provenance?.acara_public_data?.data_year;
  // Fail the build rather than print a wrong or empty year on 22,000 pages.
  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new Error('schools.metadata.json has no provenance.acara_public_data.data_year');
  }
  return year;
}

export const ACARA_DATA_YEAR = acaraDataYear(metadata);
