import type { School } from '@/types/school';
import type { CatchmentFeature, Ring } from '@/lib/catchmentLookup';
import type { NearbySchool } from '@/lib/schoolsData';
import { kmOffset, ringStepKm } from '@/lib/schoolInsights';
import { CATCHMENT_COLORS, getMarkerColor, getMarkerRadius } from '@/utils/schoolFilters';

// Theme tokens (globals.css). Set through `style` because SVG presentation
// attributes do not reliably resolve var().
const ZONE = 'var(--bs-zone)';
const RING = 'var(--bs-soft-strong)';
const LABEL = 'var(--bs-muted)';
const HALO = 'var(--bs-soft)';
const INK = 'var(--bs-ink)';
// Secondary zones are dashed so a school with both kinds still shows two
// outlines without spending a second hue.
const KIND_DASH: Record<string, string | undefined> = { secondary: '5 3' };

const SIZE = 360;
const CENTRE = SIZE / 2;
const PLOT_RADIUS = 150;
// A zone much larger than the neighbourhood would shrink every school into the
// centre dot, so past this ratio the outline is left to the zone page.
const MAX_ZONE_TO_NEIGHBOUR_RATIO = 4;
// Marker radii are tuned for a full-screen map; scaled down to sit in 360px.
const DOT_SCALE = 0.62;

function polygons(feature: CatchmentFeature): Ring[][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Ring[]]
    : (feature.geometry.coordinates as Ring[][]);
}

/**
 * SVG path for a zone, in diagram pixels.
 *
 * Vertices are snapped to half a pixel and consecutive repeats dropped. That is
 * rasterisation at the size drawn, not a simplified boundary: the stored
 * geometry stays untouched, and the exact one is a link away on the zone page.
 */
function zonePath(feature: CatchmentFeature, origin: School, pxPerKm: number): string {
  const parts: string[] = [];
  for (const polygon of polygons(feature)) {
    for (const ring of polygon) {
      let previous = '';
      const points: string[] = [];
      for (const [lng, lat] of ring) {
        const offset = kmOffset(origin, { lat, lng });
        const x = Math.round((CENTRE + offset.x * pxPerKm) * 2) / 2;
        const y = Math.round((CENTRE + offset.y * pxPerKm) * 2) / 2;
        const point = `${x},${y}`;
        if (point !== previous) points.push(point);
        previous = point;
      }
      if (points.length > 2) parts.push(`M${points.join('L')}Z`);
    }
  }
  return parts.join('');
}

function zoneReachKm(feature: CatchmentFeature, origin: School): number {
  let reach = 0;
  for (const polygon of polygons(feature)) {
    for (const [lng, lat] of polygon[0] ?? []) {
      const offset = kmOffset(origin, { lat, lng });
      reach = Math.max(reach, Math.hypot(offset.x, offset.y));
    }
  }
  return reach;
}

function formatKm(km: number): string {
  return km < 1 ? String(km) : String(Math.round(km * 10) / 10);
}

/** Decided outside the component so the caption can describe what was drawn. */
export function layoutDiagram(school: School, neighbours: NearbySchool[], zones: CatchmentFeature[]) {
  const neighbourReach = Math.max(0.5, ...neighbours.map(entry => entry.km));
  const drawable = zones.filter(
    zone => zoneReachKm(zone, school) <= neighbourReach * MAX_ZONE_TO_NEIGHBOUR_RATIO,
  );
  const radiusKm = Math.max(neighbourReach, ...drawable.map(zone => zoneReachKm(zone, school))) * 1.06;
  return { drawable, radiusKm, stepKm: ringStepKm(radiusKm) };
}

/**
 * Where the surrounding schools sit relative to this one.
 *
 * A static picture rather than an embedded map: it needs no tiles and no
 * script, so it is in the HTML a crawler reads, and it is different for every
 * school. It uses the map's own encoding — sector is colour, enrolments are
 * area — and each dot links to that school's page.
 */
export default function NeighbourhoodDiagram({
  school,
  neighbours,
  zones,
  hrefFor,
  title,
  kmLabel,
  northLabel,
}: {
  school: School;
  neighbours: NearbySchool[];
  zones: CatchmentFeature[];
  hrefFor: (entry: NearbySchool) => string;
  title: string;
  kmLabel: (km: string) => string;
  northLabel: string;
}) {
  const { drawable, radiusKm, stepKm } = layoutDiagram(school, neighbours, zones);
  const pxPerKm = PLOT_RADIUS / radiusKm;

  const rings: number[] = [];
  for (let km = stepKm; km <= radiusKm; km += stepKm) rings.push(km);

  // Largest first, so a small school is never hidden under a big neighbour.
  const dots = neighbours
    .map(entry => ({
      entry,
      offset: kmOffset(school, entry.school),
      radius: getMarkerRadius(entry.school.total_enrolments) * DOT_SCALE,
    }))
    .sort((a, b) => b.radius - a.radius);

  const ownRadius = getMarkerRadius(school.total_enrolments) * DOT_SCALE;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={title}
      className="w-full max-w-[360px] rounded-inner bg-soft"
    >
      <title>{title}</title>

      {rings.map(km => (
        <g key={km}>
          <circle cx={CENTRE} cy={CENTRE} r={km * pxPerKm} fill="none" strokeWidth="1" style={{ stroke: RING }} />
          <text
            x={CENTRE}
            y={CENTRE - km * pxPerKm - 3}
            textAnchor="middle"
            fontSize="9"
            strokeWidth="3"
            paintOrder="stroke"
            style={{ fill: LABEL, stroke: HALO }}
          >
            {kmLabel(formatKm(km))}
          </text>
        </g>
      ))}

      {drawable.map(zone => {
        const kind = zone.properties.kind;
        return (
          <path
            key={zone.properties.zone_id ?? kind}
            d={zonePath(zone, school, pxPerKm)}
            fillOpacity="0.1"
            fillRule="evenodd"
            strokeWidth="1.75"
            strokeDasharray={KIND_DASH[kind] ?? CATCHMENT_COLORS[kind]?.dashArray}
            strokeLinejoin="round"
            style={{ fill: ZONE, stroke: ZONE }}
          />
        );
      })}

      {dots.map(({ entry, offset, radius }) => (
        <a key={entry.school.id} href={hrefFor(entry)}>
          <circle
            cx={CENTRE + offset.x * pxPerKm}
            cy={CENTRE + offset.y * pxPerKm}
            r={radius}
            fill={getMarkerColor(entry.school.sector)}
            fillOpacity="0.85"
            stroke="#ffffff"
            strokeWidth="1"
          >
            <title>{`${entry.school.school_name} · ${kmLabel(formatKm(Math.round(entry.km * 10) / 10))}`}</title>
          </circle>
        </a>
      ))}

      {/* Selection is drawn the way the map draws it: sector fill kept, picked
          out by a white gap and a neutral slate ring rather than another hue. */}
      <circle cx={CENTRE} cy={CENTRE} r={ownRadius + 4} fill="#ffffff" strokeWidth="1.5" style={{ stroke: INK }} />
      <circle cx={CENTRE} cy={CENTRE} r={ownRadius} fill={getMarkerColor(school.sector)} />

      <g transform={`translate(${SIZE - 22}, 26)`} style={{ fill: LABEL }}>
        <path d="M0,-12 L4,0 L0,-3 L-4,0 Z" />
        <text y="11" textAnchor="middle" fontSize="9">{northLabel}</text>
      </g>
    </svg>
  );
}
