import Link from 'next/link';
import { School } from '@/types/school';
import { schoolPath } from '@/lib/slug';

const SECTOR_CLASS: Record<string, string> = {
  Government: 'bg-green-100 text-green-800',
  Catholic: 'bg-violet-100 text-violet-800',
  Independent: 'bg-orange-100 text-orange-800',
};

export default function SchoolLinkCard({ school, slug }: { school: School; slug: string }) {
  return (
    <li>
      <Link
        href={schoolPath(school.state, slug)}
        className="block rounded-lg border border-gray-200 p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
      >
        <span className="block text-sm font-semibold text-gray-900">{school.school_name}</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {school.suburb}, {school.state} {school.postcode}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${SECTOR_CLASS[school.sector] ?? 'bg-gray-100 text-gray-700'}`}>
            {school.sector}
          </span>
          {school.school_type && <span>{school.school_type}</span>}
          {school.year_range && <span>Years {school.year_range}</span>}
          {Number.isFinite(school.total_enrolments) && <span>{school.total_enrolments} students</span>}
        </span>
      </Link>
    </li>
  );
}
