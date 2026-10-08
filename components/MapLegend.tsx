"use client";

import type { ZoneOverlayKind } from '@/lib/catchmentLookup';
import type { Messages } from '@/lib/i18n';
import { CATCHMENT_COLORS, SECTOR_COLORS } from '@/utils/schoolFilters';

/**
 * Desktop map key: sector hue, enrolment size, and the cluster ring, plus the
 * active browse-overlay line when one is on.
 */
export default function MapLegend({
  zoneOverlay,
  label,
  hidden,
  dictionary,
}: {
  zoneOverlay: ZoneOverlayKind;
  /** Name of the active overlay kind; null when the overlay is off. */
  label: string | null;
  hidden: boolean;
  dictionary: Messages;
}) {
  return (
    <div className={`absolute bottom-8 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-[10px] text-gray-600 space-y-1 ${hidden ? 'hidden' : ''}`}>
      {zoneOverlay !== 'off' && (
        <div className="flex items-center gap-2 pb-1 mb-1 border-b border-gray-100">
          <span
            className="inline-block w-4 h-0 shrink-0"
            style={{
              borderTop: `2.5px solid ${CATCHMENT_COLORS[zoneOverlay === 'primary' ? 'primary' : 'secondary'].color}`,
              outline: '1.5px solid rgba(255,255,255,0.9)',
            }}
          ></span>
          <span className="font-medium text-gray-700">{label}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
          style={{ background: SECTOR_COLORS.Government }}
        ></span>
        {dictionary.filters.government}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
          style={{ background: SECTOR_COLORS.Catholic }}
        ></span>
        {dictionary.filters.catholic}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full border border-white inline-block shrink-0"
          style={{ background: SECTOR_COLORS.Independent }}
        ></span>
        {dictionary.filters.independent}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <span className="flex gap-0.5 items-center shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span>
          <span className="w-3.5 h-3.5 rounded-full bg-gray-400 inline-block"></span>
        </span>
        <span>{dictionary.legend.sizeEqualsEnrolments}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gray-400 border border-white inline-block shrink-0 opacity-55"></span>
        {dictionary.legend.enrolmentsUnknown}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-full inline-block shrink-0 relative"
          style={{
            background: `conic-gradient(${SECTOR_COLORS.Government} 0deg 200deg, ${SECTOR_COLORS.Catholic} 200deg 290deg, ${SECTOR_COLORS.Independent} 290deg 360deg)`,
          }}
        >
          <span className="absolute inset-[3.5px] rounded-full bg-white"></span>
        </span>
        <span>{dictionary.legend.clusterRing}</span>
      </div>
    </div>
  );
}
