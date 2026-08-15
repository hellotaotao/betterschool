import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The map app is a single client-rendered route; its query strings are
      // view state, not distinct pages, and would only dilute crawl budget.
      disallow: ['/schools?'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
