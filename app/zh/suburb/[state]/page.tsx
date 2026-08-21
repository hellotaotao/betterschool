// Thin route shim: the page itself lives in components/seo/pages so the English
// and Chinese versions cannot drift apart.
import type { Metadata } from 'next';
import StateIndexBody, { stateIndexMetadata } from '@/components/seo/pages/StateIndexBody';
import { getStateSummaries } from '@/lib/schoolsData';

interface RouteParams { state: string }

// Only eight of these, and they are the entry points into the long-tail pages,
// so they are prerendered rather than generated on demand like the pages below.
export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  return getStateSummaries().map(summary => ({ state: summary.slug }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state } = await params;
  return stateIndexMetadata('zh', state);
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { state } = await params;
  return <StateIndexBody locale="zh" state={state} />;
}
