"use client";

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { BASEMAP_ATTRIBUTION, BASEMAP_TILE_URL } from '@/lib/basemap';
import { pointInGeometry, type CatchmentFeature } from '@/lib/catchmentLookup';
import { formatMessage } from '@/lib/i18n';
import type { LiveMapData } from '@/lib/heroMapData';
import type { LiveMapLabels, LiveMarker, LiveZone } from './LiveMap';

type Answer =
  | { kind: 'own'; variant: string | null }
  | { kind: 'other'; name: string; href: string | null }
  | { kind: 'none' };

async function fetchFeature(url: string): Promise<CatchmentFeature | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as CatchmentFeature) : null;
  } catch {
    return null;
  }
}

function themeColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export default function LiveMapCanvas({
  data,
  zones,
  markers,
  labels,
  variant,
  hasSwitch,
  onReady,
}: {
  data: LiveMapData;
  zones: LiveZone[];
  markers: LiveMarker[];
  labels: LiveMapLabels;
  variant: number;
  hasSwitch: boolean;
  onReady: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const variantLayers = useRef<(L.GeoJSON | null)[]>([]);
  const variantFeatures = useRef<(CatchmentFeature | null)[]>([]);
  const fixedFeatures = useRef<CatchmentFeature[]>([]);
  const contextFeatures = useRef<{ feature: CatchmentFeature; zone: LiveZone }[]>([]);
  const pinRef = useRef<L.CircleMarker | null>(null);
  const variantRef = useRef(variant);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const zoneColor = themeColor('--bs-zone', '#1f5eea');
    const inkColor = themeColor('--bs-ink', '#0e1b3d');

    // Wheel zoom and one-finger drag stay off until the reader taps the map,
    // so scrolling the page past it never gets caught by it.
    const map = L.map(container, {
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      // Half steps fit the zone to the frame more tightly than whole levels.
      zoomSnap: 0.5,
      // Top left belongs to the answer box and the year switch.
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapRef.current = map;
    // Room at the top for the answer box (and the year switch, when shown),
    // so a school at the edge of the frame is not drawn under them. A phone
    // cannot spare that height without zooming out a level, so there the box
    // may sit over the map and only the switch gets room.
    // A valid view first: fitting a container that has no size yet (a narrow
    // window lays the figure out after this runs) yields NaN coordinates.
    map.setView(L.latLngBounds(data.bounds).getCenter(), 14, { animate: false });
    const frame = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return false;
      const narrow = size.x < 640;
      map.fitBounds(data.bounds, {
        animate: false,
        paddingTopLeft: narrow ? [8, hasSwitch ? 48 : 8] : [12, hasSwitch ? 104 : 64],
        paddingBottomRight: [8, 8],
      });
      // The server drawing is pinned to the top of a tall figure; match it, so
      // the school sits in the same place before and after the swap.
      if (size.y > size.x) map.panBy([0, (size.y - size.x) / 2], { animate: false });
      return true;
    };
    if (!frame()) {
      const observer = new ResizeObserver(() => {
        map.invalidateSize({ animate: false });
        if (frame()) observer.disconnect();
      });
      observer.observe(container);
      map.once('unload', () => observer.disconnect());
    }
    // Marker sizes are tuned for a desktop-wide hero; scale them down with
    // the map so a phone does not show a carpet of overlapping dots.
    const dotScale = Math.min(1, Math.max(0.55, (map.getSize().x || 640) / 640));

    L.tileLayer(BASEMAP_TILE_URL, { attribution: BASEMAP_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    zones.forEach(zone => {
      void fetchFeature(zone.url).then(feature => {
        if (!feature || mapRef.current !== map) return;
        contextFeatures.current.push({ feature, zone });
        const layer = L.geoJSON(feature, {
          interactive: false,
          style: { color: zoneColor, weight: 1.25, opacity: 0.6, fill: false },
        }).addTo(map);
        L.tooltip({ permanent: true, direction: 'center', className: 'bs-zone-label', interactive: false })
          .setContent(zone.name)
          .setLatLng(layer.getBounds().getCenter())
          .addTo(map);
      });
    });

    data.fixed.forEach(url => {
      void fetchFeature(url).then(feature => {
        if (!feature || mapRef.current !== map) return;
        fixedFeatures.current.push(feature);
        L.geoJSON(feature, {
          interactive: false,
          style: { color: zoneColor, weight: 2, opacity: 0.9, fillColor: zoneColor, fillOpacity: 0.1 },
        }).addTo(map);
      });
    });

    data.variants.forEach((entry, index) => {
      void fetchFeature(entry.url).then(feature => {
        if (!feature || mapRef.current !== map) return;
        variantFeatures.current[index] = feature;
        const layer = L.geoJSON(feature, {
          interactive: false,
          style: { color: zoneColor, weight: 2.5, opacity: 1, fillColor: zoneColor, fillOpacity: 0.14 },
        });
        variantLayers.current[index] = layer;
        if (index === variantRef.current) layer.addTo(map);
      });
    });

    // Largest first, so a small school is never hidden under a big neighbour.
    [...markers].sort((a, b) => b.r - a.r).forEach(marker => {
      const go = () => window.location.assign(marker.href);
      if (marker.number) {
        L.marker([marker.lat, marker.lng], {
          icon: L.divIcon({
            className: '',
            html: `<span class="bs-live-pin" style="border-color:${marker.color}">${marker.number}</span>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          title: marker.name,
          zIndexOffset: 500,
        }).on('click', go).addTo(map);
        return;
      }
      if (marker.selected) {
        L.circleMarker([marker.lat, marker.lng], {
          radius: marker.r * dotScale + 4.5, color: inkColor, weight: 2, fillColor: '#ffffff', fillOpacity: 1, bubblingMouseEvents: false,
        }).addTo(map);
      }
      const dot = L.circleMarker([marker.lat, marker.lng], {
        radius: marker.r * dotScale,
        color: '#ffffff',
        weight: marker.selected ? 0 : 1.2,
        fillColor: marker.color,
        fillOpacity: 1,
        bubblingMouseEvents: false,
      }).on('click', go).addTo(map);
      dot.bindTooltip(marker.name, marker.selected
        ? { permanent: true, direction: 'right', offset: [marker.r * dotScale + 6, 0], className: 'bs-live-label' }
        : { direction: 'top', offset: [0, -marker.r * dotScale] });
    });

    map.on('click', event => {
      map.scrollWheelZoom.enable();
      map.dragging.enable();
      const { lat, lng } = event.latlng;
      pinRef.current?.remove();
      pinRef.current = L.circleMarker([lat, lng], {
        radius: 7, color: '#ffffff', weight: 3, fillColor: inkColor, fillOpacity: 1, interactive: false,
      }).addTo(map);
      const point: [number, number] = [lng, lat];
      const own = variantFeatures.current[variantRef.current];
      if (own && pointInGeometry(point, own.geometry)) {
        setAnswer({ kind: 'own', variant: data.variants.length > 1 ? data.variants[variantRef.current]?.label ?? null : null });
        return;
      }
      const fixed = fixedFeatures.current.find(feature => pointInGeometry(point, feature.geometry));
      if (fixed) {
        setAnswer({ kind: 'other', name: fixed.properties.school_name, href: null });
        return;
      }
      const other = contextFeatures.current.find(entry => pointInGeometry(point, entry.feature.geometry));
      setAnswer(other ? { kind: 'other', name: other.zone.name, href: other.zone.href } : { kind: 'none' });
    });

    onReady();
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Built once per page; the inputs are server props that never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    variantRef.current = variant;
    const map = mapRef.current;
    if (!map) return;
    variantLayers.current.forEach((layer, index) => {
      if (!layer) return;
      if (index === variant) layer.addTo(map);
      else layer.remove();
    });
    setAnswer(null);
    pinRef.current?.remove();
  }, [variant]);

  const own = labels.schoolName;
  const message = !answer
    ? labels.tapHint
    : answer.kind === 'own'
      ? formatMessage(answer.variant ? labels.inZoneVariant : labels.inZone, { school: own ?? '', variant: answer.variant ?? '' })
      : answer.kind === 'other'
        ? formatMessage(own ? labels.inOtherZone : labels.inOtherZoneNoOwn, { school: own ?? '', other: answer.name })
        : labels.inNoZone;

  return (
    <>
      <div ref={containerRef} className="bs-live" />
      <div className={`bs-live-answer${hasSwitch ? ' bs-live-answer-low' : ''}`} role="status" aria-live="polite">
        <p className={answer ? 'font-semibold text-ink' : 'text-ink-2'}>
          {message}
          {answer?.kind === 'other' && answer.href && (
            <> <a href={answer.href} className="bs-link">→</a></>
          )}
        </p>
        {answer && (
          <p className="mt-1 text-[13px] text-muted">
            {labels.confirm}
            {labels.finderUrl && labels.finderText && (
              <> <a href={labels.finderUrl} target="_blank" rel="noreferrer" className="bs-link">{labels.finderText} →</a></>
            )}
          </p>
        )}
      </div>
    </>
  );
}
