// Thin route shim: the page itself lives in components/seo/pages so the English
// and Chinese versions cannot drift apart.
import type { Metadata } from 'next';
import SuburbBody, { suburbMetadata } from '@/components/seo/pages/SuburbBody';

interface RouteParams { state: string; slug: string }

export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams(): RouteParams[] {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { state, slug } = await params;
  return suburbMetadata('en', state, slug);
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { state, slug } = await params;
  return <SuburbBody locale="en" state={state} slug={slug} />;
}
