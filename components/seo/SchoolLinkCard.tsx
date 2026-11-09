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
        className="bs-tile h-full"
      >
        <span className="block font-semibold text-ink">{school.school_name}</span>
        <span className="mt-0.5 block text-sm text-muted">
          {school.suburb}, {school.state} {school.postcode}
        </span>
        {distance && <span className="mt-0.5 block text-[13px] text-muted">{distance}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${sectorBadgeClass(school.sector)}`}>
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
