import { getDatasetLastModified } from '@/lib/schoolsData';
import { sitemapIndexXml } from '@/lib/sitemap';

// The index robots.txt names. A route handler because Next's sitemap
// convention emits <urlset> files only, never a <sitemapindex>.
export const dynamic = 'force-static';

export function GET() {
  return new Response(sitemapIndexXml(getDatasetLastModified()), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
