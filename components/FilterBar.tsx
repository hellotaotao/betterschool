"use client";

import { Messages } from '@/lib/i18n';
import { FilterState } from '@/utils/schoolFilters';

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  dictionary: Messages;
  variant?: 'wrap' | 'scroll';
}

interface PillOption<T extends string> {
  label: string;
  value: T;
  title?: string;
}

function PillGroup<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: PillOption<T>[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md shrink-0">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          title={opt.title}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
            value === opt.value
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({ filters, onChange, dictionary, variant = 'wrap' }: FilterBarProps) {
  const legacyMetricOptions: PillOption<FilterState['legacyMetric']>[] = [
    { label: dictionary.filters.allOfficial, value: 'all' },
    { label: dictionary.filters.withLegacyScore, value: 'scored' },
    { label: dictionary.filters.profileOnly, value: 'profile' },
  ];

  const sectorOptions: PillOption<FilterState['sector']>[] = [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.government, value: 'Government' },
    { label: dictionary.filters.catholic, value: 'Catholic' },
    { label: dictionary.filters.independent, value: 'Independent' },
  ];

  const religionOptions: PillOption<FilterState['religion']>[] = [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.religious, value: 'religious' },
    { label: dictionary.filters.secular, value: 'secular' },
  ];

  const icseaOptions: PillOption<FilterState['icsea']>[] = [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.icsea900, value: '900' },
    { label: dictionary.filters.icsea1000, value: '1000' },
    { label: dictionary.filters.icsea1100, value: '1100' },
    { label: dictionary.filters.icsea1200, value: '1200' },
  ];

  const typeOptions: PillOption<FilterState['schoolType']>[] = [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.primary, value: 'Primary' },
    { label: dictionary.filters.combined, value: 'Combined' },
    { label: dictionary.filters.secondary, value: 'Secondary' },
    { label: dictionary.filters.special, value: 'Special' },
  ];

  const enrolmentOptions: PillOption<FilterState['enrolments']>[] = [
    { label: dictionary.filters.all, value: 'all' },
    { label: dictionary.filters.enrolmentSmall, value: 'small', title: dictionary.filters.enrolmentSmallHint },
    { label: dictionary.filters.enrolmentMedium, value: 'medium', title: dictionary.filters.enrolmentMediumHint },
    { label: dictionary.filters.enrolmentLarge, value: 'large', title: dictionary.filters.enrolmentLargeHint },
  ];

  const containerClass = variant === 'scroll'
    ? 'flex gap-2 overflow-x-auto no-scrollbar pb-1'
    : 'flex gap-2 flex-wrap';

  return (
    <div className={containerClass}>
      <PillGroup options={legacyMetricOptions} value={filters.legacyMetric} onSelect={v => onChange({ ...filters, legacyMetric: v })} />
      <PillGroup options={sectorOptions} value={filters.sector} onSelect={v => onChange({ ...filters, sector: v })} />
      <PillGroup options={religionOptions} value={filters.religion} onSelect={v => onChange({ ...filters, religion: v })} />
      <PillGroup options={icseaOptions} value={filters.icsea} onSelect={v => onChange({ ...filters, icsea: v })} />
      <PillGroup options={typeOptions} value={filters.schoolType} onSelect={v => onChange({ ...filters, schoolType: v })} />
      <PillGroup options={enrolmentOptions} value={filters.enrolments} onSelect={v => onChange({ ...filters, enrolments: v })} />
    </div>
  );
}
