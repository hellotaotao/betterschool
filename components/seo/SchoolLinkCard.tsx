import Link from 'next/link';
import { School } from '@/types/school';
import { schoolPath } from '@/lib/slug';
import { getMessages, getSchoolTypeLabel, getSectorLabel, formatMessage } from '@/lib/i18n';
import type { Locale } from '@/lib/seoLocale';
import { sectorBadgeClass } from '@/utils/schoolFilters';

export default function SchoolLinkCard({
  school,
  slug,
  locale,
  distance,
}: {
  school: School;
  slug: string;
  locale: Locale;
  /** Pre-formatted proximity line, shown only where the card is a distance result. */
  distance?: string;
}) {
  const dictionary = getMessages(locale);

  return (
    <li>
      <Link
        href={schoolPath(school.state, slug, locale)}
        className="block rounded-lg border border-gray-200 p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
      >
        <span className="block text-sm font-semibold text-gray-900">{school.school_name}</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {school.suburb}, {school.state} {school.postcode}
        </span>
        {distance && <span className="block text-[11px] text-gray-400 mt-0.5">{distance}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${sectorBadgeClass(school.sector)}`}>
            {getSectorLabel(school.sector, dictionary)}
          </span>
          {school.school_type && <span>{getSchoolTypeLabel(school.school_type, dictionary)}</span>}
          {school.year_range && <span>{school.year_range}</span>}
          {Number.isFinite(school.total_enrolments) && (
            <span>{formatMessage(dictionary.sidebar.studentsShort, { count: Number(school.total_enrolments) })}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
