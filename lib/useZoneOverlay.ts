"use client";

import { useCallback, useEffect, useState } from 'react';
import type { ViewportBounds, ZoneOverlayKind } from './catchmentLookup';
import { loadZonesInView, type ZonesInView } from './catchmentClient';

/** Browse overlay: every zone of one kind across the viewport. */
export function useZoneOverlay(viewport: ViewportBounds | null) {
  const [kind, setKindState] = useState<ZoneOverlayKind>('off');
  const [zones, setZones] = useState<ZonesInView | null>(null);

  useEffect(() => {
    if (kind === 'off' || !viewport) return;

    // A pan that lands while an earlier fetch is still in flight must not have
    // the stale result painted over it.
    let current = true;
    loadZonesInView(viewport, kind)
      .then(result => { if (current) setZones(result); })
      .catch(() => { if (current) setZones(null); });

    return () => { current = false; };
  }, [kind, viewport]);

  const setKind = useCallback((next: ZoneOverlayKind) => {
    // The previous kind's zones must not linger while the new ones load.
    setZones(null);
    setKindState(next);
  }, []);

  return { kind, setKind, zones };
}
