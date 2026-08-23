"use client";

import { CATCHMENT_COLORS } from '@/utils/schoolFilters';

/**
 * Colour key for one catchment kind, shown next to the label that names it.
 *
 * Readers were seeing two and three differently coloured outlines stacked on
 * the map with nothing anywhere to say what the colours meant — the corner
 * legend covers marker encoding only, and it is hidden while a school is
 * selected, which is precisely when a zone gets drawn.
 */
export default function ZoneSwatch({ kind, className = '' }: { kind: string; className?: string }) {
  const style = CATCHMENT_COLORS[kind] ?? CATCHMENT_COLORS.primary;

  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-4 shrink-0 rounded-sm ${className}`}
      style={{
        border: `2px ${style.dashArray ? 'dashed' : 'solid'} ${style.color}`,
        backgroundColor: `${style.color}1a`,
      }}
    />
  );
}
