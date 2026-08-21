// Thin route shim: the page itself lives in components/seo/pages so the English
// and Chinese versions cannot drift apart.
import type { Metadata } from 'next';
import BrowseBody, { browseMetadata } from '@/components/seo/pages/BrowseBody';

export const metadata: Metadata = browseMetadata('zh');

export default function Page() {
  return <BrowseBody locale="zh" />;
}
