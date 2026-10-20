import Link from 'next/link';
import type { RankingGroup } from '@/lib/schoolsData';
import { capitalize, getSeo, localeRankingGroup, type Locale } from '@/lib/seoLocale';
import { rankingPath } from '@/lib/slug';

/** Pills linking to ranking pages, each with the number of schools it ranks. */
export default function RankingLinks({ rankings, locale }: { rankings: RankingGroup[]; locale: Locale }) {
  const t = getSeo(locale).ranking;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {rankings.map(ranking => (
        <li key={`${ranking.state}-${ranking.slug}`}>
          <Link
            href={rankingPath(ranking.state, ranking.slug, locale)}
            className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            {ranking.schoolType === 'VCE' && ranking.sector === null
              ? t.viewVce
              : capitalize(localeRankingGroup(locale, ranking.schoolType, ranking.sector))}
            <span className="text-[10px] text-gray-400">{ranking.ranked.toLocaleString('en-AU')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
