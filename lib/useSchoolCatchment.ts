"use client";

import { useCallback, useState } from 'react';
import type { MapSchool, MapSchoolCatchment } from '@/types/school';
import type { CatchmentFeature } from './catchmentLookup';
import { loadCatchmentFeature } from './catchmentClient';

interface CatchmentDisplay {
  schoolId: string;
  geometryUrl: string;
  visible: boolean;
  feature: CatchmentFeature | null;
  error: boolean;
}

/**
 * The one zone drawn for the selected school.
 *
 * State is tagged with the school it belongs to, so selecting another school
 * makes it stale by construction — no reset effect — and a slow fetch that
 * lands after the reader moved on is ignored rather than drawn.
 */
export function useSchoolCatchment(selectedSchool: MapSchool | null) {
  const [display, setDisplay] = useState<CatchmentDisplay | null>(null);
  const active = display && display.schoolId === selectedSchool?.id ? display : null;

  /** Draw one boundary variant, reusing its geometry when it is already loaded. */
  const show = useCallback((
    school: MapSchool,
    catchment: MapSchoolCatchment,
    cached: CatchmentFeature | null = null,
  ) => {
    const isCurrent = (current: CatchmentDisplay | null) => (
      current?.schoolId === school.id && current.geometryUrl === catchment.geometry_url
    );
    setDisplay({
      schoolId: school.id,
      geometryUrl: catchment.geometry_url,
      visible: true,
      feature: cached,
      error: false,
    });
    if (cached) return;

    loadCatchmentFeature({
      state: school.state.toLowerCase(),
      location_age_id: Number(school.location_age_id),
      kind: catchment.kind,
      geometry_url: catchment.geometry_url,
    })
      .then(feature => setDisplay(current => (isCurrent(current) ? { ...current!, feature } : current)))
      .catch(() => setDisplay(current => (
        isCurrent(current) ? { ...current!, visible: false, error: true } : current
      )));
  }, []);

  const toggle = useCallback((catchment: MapSchoolCatchment) => {
    const school = selectedSchool;
    if (!school?.catchments?.length || !Number.isFinite(school.location_age_id)) return;

    const sameVariant = active?.geometryUrl === catchment.geometry_url;
    if (sameVariant && active.visible) {
      setDisplay({ ...active, visible: false, error: false });
      return;
    }
    show(school, catchment, sameVariant ? active.feature : null);
  }, [active, selectedSchool, show]);

  const visible = active?.visible ?? false;
  return {
    visible,
    /** geometry_url of the drawn variant, for the detail panel's toggle state. */
    activeUrl: visible ? active?.geometryUrl : undefined,
    features: visible && active?.feature ? [active.feature] : null,
    error: active?.error ?? false,
    show,
    toggle,
  };
}
