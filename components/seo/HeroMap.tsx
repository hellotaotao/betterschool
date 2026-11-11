import { MAP_SIZE, formatScale, overlayPosition } from '@/lib/heroMap';
import type { HeroMapModel, MapDot } from '@/lib/heroMapData';

// Theme tokens (globals.css), set through `style` because SVG presentation
// attributes do not reliably resolve var().
const ZONE = 'var(--bs-zone)';
const INK = 'var(--bs-ink)';

export interface HeroMapLabels {
  /** Accessible name of the picture. */
  title: string;
  /** Legend entry for the filled boundary; omitted when none is drawn. */
  zone: string;
  neighbours: string;
  /** Legend of the year-group switch. */
  variantSwitch: string;
  sector: (sector: string) => string;
}

/**
 * The static map at the top of a school, zone or suburb page.
 *
 * A picture rather than an embedded map: no tiles, no script, every school a
 * link, and it is in the HTML a crawler reads. It uses the map app's encoding —
 * sector is colour, enrolments are area, selection is a white gap and an ink
 * ring, never another hue. Text sits in HTML over the SVG so it stays at its
 * CSS size on a phone instead of shrinking with the drawing.
 */
export default function HeroMap({
  model,
  labels,
  hrefFor,
}: {
  model: HeroMapModel;
  labels: HeroMapLabels;
  hrefFor: (entry: MapDot) => string;
}) {
  const { variants, fixedZones, context, dots, focus, scale } = model;
  const selected = focus.filter(entry => entry.selected);
  const numbered = focus.filter(entry => entry.number && !entry.selected);
  const plain = focus.filter(entry => !entry.number && !entry.selected);
  const hasZone = variants.length > 0 || fixedZones.length > 0;
  const scaleText = formatScale(scale.km);

  return (
    <figure className="bs-map">
      <div className="bs-map-canvas">
      {variants.length > 1 && (
        <fieldset className="bs-map-switch">
          <legend className="sr-only">{labels.variantSwitch}</legend>
          {variants.map((variant, index) => (
            <label key={variant.key}>
              <input type="radio" name="zone-variant" value={index} defaultChecked={index === 0} className="sr-only" />
              <span>{variant.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label={labels.title} className="bs-map-svg">
        <g fill="none" strokeWidth="1" strokeOpacity="0.35" strokeLinejoin="round" style={{ stroke: ZONE }}>
          {context.map((path, index) => <path key={index} d={path} />)}
        </g>

        {fixedZones.map((path, index) => (
          <path
            key={index}
            d={path}
            fillRule="evenodd"
            fillOpacity="0.12"
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ fill: ZONE, stroke: ZONE }}
          />
        ))}
        {variants.map((variant, index) => (
          <path
            key={variant.key}
            className="bs-variant"
            data-variant={index}
            d={variant.path}
            fillRule="evenodd"
            fillOpacity="0.14"
            strokeWidth="2.25"
            strokeLinejoin="round"
            style={{ fill: ZONE, stroke: ZONE }}
          />
        ))}

        <g className="bs-map-dots">
          {dots.map(entry => (
            <a key={entry.id} href={hrefFor(entry)}>
              <circle cx={entry.x} cy={entry.y} r={entry.r} fill={entry.color} stroke="#ffffff" strokeWidth="1.2">
                <title>{entry.name}</title>
              </circle>
            </a>
          ))}
          {plain.map(entry => (
            <a key={entry.id} href={hrefFor(entry)}>
              <circle cx={entry.x} cy={entry.y} r={entry.r} fill={entry.color} stroke="#ffffff" strokeWidth="1.5">
                <title>{entry.name}</title>
              </circle>
            </a>
          ))}
        </g>

        {selected.map(entry => (
          <g key={entry.id}>
            <circle cx={entry.x} cy={entry.y} r={entry.r + 4.5} fill="#ffffff" strokeWidth="2" style={{ stroke: INK }} />
            <circle cx={entry.x} cy={entry.y} r={entry.r} fill={entry.color} />
          </g>
        ))}
      </svg>

      {/* Numbered pins: white with a sector-coloured rim, so the number keeps
          full contrast whatever the sector. */}
      {numbered.map(entry => (
        <a
          key={entry.id}
          href={hrefFor(entry)}
          className="bs-map-pin"
          style={{ ...overlayPosition(entry), borderColor: entry.color }}
          aria-label={`${entry.number}. ${entry.name}`}
          title={entry.name}
        >
          {entry.number}
        </a>
      ))}

      {selected.map(entry => (
        <span
          key={entry.id}
          aria-hidden="true"
          className="bs-map-label"
          data-side={entry.x > MAP_SIZE / 2 ? 'left' : 'right'}
          style={{ ...overlayPosition(entry), ['--r' as string]: entry.r + 7 }}
        >
          {entry.name}
        </span>
      ))}

      <div className="bs-map-scale" aria-hidden="true">
        {scaleText.value} {scaleText.unit}
        <i style={{ width: `calc(${Math.round(scale.units * 10) / 10} * var(--u))` }} />
      </div>
      </div>

      <div className="bs-map-legend" aria-hidden="true">
        {hasZone && (
          <span>
            <i className="bs-map-key-zone" />
            {labels.zone}
          </span>
        )}
        {context.length > 0 && (
          <span>
            <i className="bs-map-key-context" />
            {labels.neighbours}
          </span>
        )}
        {model.sectors.map(sector => (
          <span key={sector}>
            <i className="bs-map-key-dot" style={{ backgroundColor: dots.concat(focus).find(entry => entry.sector === sector)?.color }} />
            {labels.sector(sector)}
          </span>
        ))}
      </div>
    </figure>
  );
}
