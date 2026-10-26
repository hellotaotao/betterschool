import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The map app is a single client-rendered route; its query strings are
      // view state, not distinct pages, and would only dilute crawl budget.
      // /data/ is the map app's JSON. SEO pages read it on the server, never in
      // the browser, yet Google found zone files through paths in the RSC
      // payload and spent crawls on them.
      disallow: ['/schools?', '/data/'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
