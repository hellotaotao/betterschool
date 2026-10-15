// Thin route shim: the page itself lives in components/seo/pages so the English
// and Chinese versions cannot drift apart.
import type { Metadata } from 'next';
import RankingBody, { rankingMetadata } from '@/components/seo/pages/RankingBody';
import { getRankingGroups } from '@/lib/schoolsData';
import { stateSlug } from '@/lib/slug';

interface RouteParams { state: string; slug: string }

// A fixed, small set (one per state, type and sector with enough schools), and
// they are hubs linking into the school pages, so they are prerendered.
export const dynamicParams = false;

export function generateStaticParams(): RouteParams[] {
  return getRankingGroups().map(group => ({ state: stateSlug(group.state), slug: group.slug }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state, slug } = await params;
  return rankingMetadata('en', state, slug);
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { state, slug } = await params;
  return <RankingBody locale="en" state={state} slug={slug} />;
}
