"use client";

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LiveMapData } from '@/lib/heroMapData';

// Leaflet touches `window` on import, so it loads only in the browser, after
// the server-drawn SVG has already painted the hero.
const LiveMapCanvas = dynamic(() => import('./LiveMapCanvas'), { ssr: false });

export interface LiveMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  /** Radius in drawing units, used as pixels. */
  r: number;
  href: string;
  number?: string;
  selected: boolean;
}

export interface LiveZone {
  url: string;
  name: string;
  href: string;
}

export interface LiveMapLabels {
  /** The school whose zone is filled; null where no single school owns the map (suburb pages). */
  schoolName: string | null;
  tapHint: string;
  inZone: string;
  inZoneVariant: string;
  inOtherZone: string;
  inOtherZoneNoOwn: string;
  inNoZone: string;
  confirm: string;
  finderText: string | null;
  finderUrl: string | null;
}

/**
 * The hero map's interactive layer: the same picture on a street basemap,
 * draggable, and a tap anywhere says which published zone that spot is in.
 *
 * It wraps the server-rendered figure rather than replacing it. The SVG paints
 * first and stays for readers without JavaScript and for crawlers; once
 * Leaflet is up the figure is marked `data-live` and CSS hides the drawing
 * underneath. The year-group radio buttons are the server's own, so the
 * switch works the same before and after.
 */
export default function LiveMap({
  data,
  zones,
  markers,
  labels,
  children,
}: {
  data: LiveMapData;
  /** Neighbouring zones with their owner's page. */
  zones: LiveZone[];
  markers: LiveMarker[];
  labels: LiveMapLabels;
  children: React.ReactNode;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const [canvas, setCanvas] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [variant, setVariant] = useState(0);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    setCanvas(figure.querySelector<HTMLElement>('.bs-map-canvas'));
    const onChange = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === 'zone-variant') setVariant(Number(input.value));
    };
    figure.addEventListener('change', onChange);
    return () => figure.removeEventListener('change', onChange);
  }, []);

  return (
    <figure ref={figureRef} className="bs-map" data-live={ready ? '' : undefined}>
      {children}
      {canvas && createPortal(
        <LiveMapCanvas
          data={data}
          zones={zones}
          markers={markers}
          labels={labels}
          variant={variant}
          hasSwitch={data.variants.length > 1}
          onReady={() => setReady(true)}
        />,
        canvas,
      )}
    </figure>
  );
}
