"use client";

import type { ReactNode } from 'react';
import type { MapSchool } from '@/types/school';
import { formatMessage, getReligionLabel, getSchoolTypeLabel, getSectorLabel, Messages } from '@/lib/i18n';
import { hasLegacyScore, sectorBadgeClass } from '@/utils/schoolFilters';
import { feeLabel } from '@/utils/feeLabel';

interface CompareTableProps {
  schools: MapSchool[];
  dictionary: Messages;
  onRemove: (school: MapSchool) => void;
  onClear: () => void;
  onClose: () => void;
  /** Link to a school's own page, when one can be built. */
  profileHrefFor: (school: MapSchool) => string | undefined;
  variant?: 'panel' | 'sheet';
  topOffset?: number;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
  cell: (school: MapSchool) => ReactNode;
  /** Whether a school has a value; a row with none is omitted, never shown empty. */
  has: (school: MapSchool) => boolean;
}

const COL_REM = 9;
const LABEL_REM = 6.5;

export default function CompareTable({
  schools,
  dictionary,
  onRemove,
  onClear,
  onClose,
  profileHrefFor,
  variant = 'panel',
  topOffset,
}: CompareTableProps) {
  const d = dictionary.details;
  const num = (v: unknown): v is number => Number.isFinite(v);
  const link = (href: string, text: string) => (
    <a className="font-medium text-link hover:underline" href={href} target="_blank" rel="noreferrer">{text}</a>
  );

  const allRows: Row[] = [
    {
      key: 'sector',
      label: d.sector,
      has: () => true,
      cell: s => (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sectorBadgeClass(s.sector)}`}>
          {getSectorLabel(s.sector, dictionary)}
        </span>
      ),
    },
    {
      key: 'religion',
      label: d.religiousAffiliation,
      has: () => true,
      cell: s => getReligionLabel(s.religious_affiliation, dictionary),
    },
    { key: 'type', label: d.schoolType, has: s => !!s.school_type, cell: s => getSchoolTypeLabel(s.school_type!, dictionary) },
    { key: 'years', label: d.yearRange, has: s => !!s.year_range, cell: s => s.year_range },
    { key: 'icsea', label: d.icsea, hint: d.icseaHint, has: s => num(s.icsea), cell: s => s.icsea },
    { key: 'pct', label: d.icseaPercentile, has: s => num(s.icsea_percentile), cell: s => s.icsea_percentile },
    { key: 'enrol', label: d.enrolments, has: s => num(s.total_enrolments), cell: s => s.total_enrolments },
    {
      key: 'gender',
      label: d.girlsBoys,
      has: s => num(s.girls) && num(s.boys),
      cell: s => `${s.girls} / ${s.boys}`,
    },
    { key: 'lbote', label: d.lbote, has: s => num(s.lbote_yes_percent), cell: s => `${s.lbote_yes_percent}%` },
    { key: 'indigenous', label: d.indigenous, has: s => num(s.indigenous_percent), cell: s => `${s.indigenous_percent}%` },
    { key: 'fees', label: d.fees, has: s => !!s.fees, cell: s => feeLabel(s, dictionary) },
    {
      key: 'zone',
      label: dictionary.compare.zone,
      has: () => true,
      cell: s => (s.catchments?.length
        ? Array.from(new Set(s.catchments.map(c => dictionary.catchment[c.kind]))).join(' / ')
        : dictionary.compare.noZone),
    },
    { key: 'gov', label: d.governingBody, has: s => !!s.governing_body, cell: s => s.governing_body },
    { key: 'postcode', label: d.postcode, has: () => true, cell: s => s.postcode },
    {
      key: 'site',
      label: d.website,
      has: s => !!s.school_url,
      cell: s => link(s.school_url!, 'Open'),
    },
    {
      key: 'naplan',
      label: d.naplan,
      has: s => !!s.myschool_url,
      cell: s => link(s.myschool_url!, d.viewOnMySchool),
    },
  ];
  const rows = allRows.filter(row => schools.some(row.has));

  const isPanel = variant === 'panel';
  // Wide enough for every column, but never over the school list on the left.
  const wrapClass = isPanel
    ? 'absolute right-3 bottom-3 z-10 bg-surface/95 backdrop-blur-sm rounded-inner shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-surface';
  const panelStyle = isPanel
    ? {
        top: topOffset ?? 56,
        width: `min(${LABEL_REM + COL_REM * Math.max(schools.length, 2)}rem, calc(100vw - 21rem))`,
      }
    : undefined;

  return (
    <div className={wrapClass} style={panelStyle}>
      <div className="px-3 py-2.5 border-b border-line flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-link">
          {dictionary.compare.title} · {formatMessage(dictionary.compare.trayCount, { count: schools.length })}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={onClear} className="text-[11px] text-muted hover:text-ink">
            {dictionary.compare.clear}
          </button>
          <button
            onClick={onClose}
            aria-label={dictionary.close}
            className="text-muted hover:text-ink text-base leading-none"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>

      {schools.length < 2 && (
        <p className="px-3 py-2 text-[11px] text-muted border-b border-line shrink-0">{dictionary.compare.needTwo}</p>
      )}

      <div className="flex-1 overflow-auto">
        <table className="text-xs border-separate border-spacing-0" style={{ minWidth: '100%' }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-20 bg-surface border-b border-line text-left align-bottom p-2 text-[11px] font-medium text-muted"
                style={{ width: `${LABEL_REM}rem`, minWidth: `${LABEL_REM}rem` }}
              >
                {dictionary.compare.field}
              </th>
              {schools.map(school => {
                const href = profileHrefFor(school);
                return (
                  <th
                    key={school.id}
                    className="sticky top-0 z-10 bg-surface border-b border-l border-line text-left align-top p-2 font-normal"
                    style={{ minWidth: `${COL_REM}rem` }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-display text-[13px] font-bold text-ink leading-tight">
                        {school.school_name}
                      </span>
                      <button
                        onClick={() => onRemove(school)}
                        aria-label={formatMessage(dictionary.compare.remove, { name: school.school_name })}
                        className="text-muted hover:text-ink leading-none"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">{school.suburb}, {school.state}</div>
                    {href && (
                      <a href={href} className="mt-1 inline-block text-[11px] font-medium text-link hover:underline">
                        {d.fullProfile} →
                      </a>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <th
                  scope="row"
                  title={row.hint}
                  className="sticky left-0 z-10 bg-soft border-b border-line text-left align-top p-2 text-[11px] font-medium text-muted"
                >
                  {row.label}
                </th>
                {schools.map(school => (
                  <td key={school.id} className="border-b border-l border-line p-2 align-top font-medium text-ink">
                    {row.has(school) ? row.cell(school) : <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {schools.some(hasLegacyScore) && (
              // Unofficial and sparse, so it sits last and carries its own caveat.
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-accent-soft border-b border-line text-left align-top p-2 text-[11px] font-medium text-on-accent-soft"
                  title={d.legacyCaveat}
                >
                  {d.legacyScore}
                </th>
                {schools.map(school => (
                  <td key={school.id} className="border-b border-l border-line p-2 align-top text-on-accent-soft">
                    {hasLegacyScore(school) ? school.legacy_score : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        {schools.some(hasLegacyScore) && (
          <p className="p-2 text-[11px] text-muted leading-snug">{d.legacyCaveat}</p>
        )}
      </div>
    </div>
  );
}
