import {
  CATCHMENT_STATES,
  candidatesAt,
  catchmentGeometryUrl,
  catchmentStateAt,
  pointInGeometry,
  zonesInBounds,
  type ViewportBounds,
  type CatchmentFeature,
  type CatchmentIndex,
  type CatchmentIndexEntry,
} from './catchmentLookup';

let indexPromise: Promise<CatchmentIndexEntry[]> | null = null;
const featureCache = new Map<string, Promise<CatchmentFeature>>();

/**
 * Load every state's catchment index once per session, merged into one list.
 *
 * Deliberately not fetched on page load — only when the user first asks for
 * something catchment-related.
 *
 * A state whose index is missing contributes nothing rather than failing the
 * whole lookup: CATCHMENT_STATES names the states we publish, but a checkout
 * that has only run one state's build is a normal state of the repo, and one
 * absent layer must not take the others down with it.
 */
export function loadCatchmentIndex(): Promise<CatchmentIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = Promise.all(
      CATCHMENT_STATES.map(state => (
        fetch(`/data/catchment/${state}/index.json`)
          .then(response => (response.ok ? response.json() as Promise<CatchmentIndex> : null))
          // State is stamped on here rather than stored in every entry: the
          // loader already knows which directory it read, and keeping it out of
          // the file means adding a state needs no migration of the ones
          // already published.
          .then(index => (index?.catchments ?? []).map(entry => ({ ...entry, state })))
          .catch(() => [] as CatchmentIndexEntry[])
      )),
    )
      .then(perState => {
        const merged = perState.flat();
        // Every state failing is a real failure, not an empty country.
        if (merged.length === 0) throw new Error('No catchment index could be loaded');
        return merged;
      })
      .catch(error => {
        indexPromise = null; // let a later attempt retry rather than caching the failure
        throw error;
      });
  }
  return indexPromise;
}

export function loadCatchmentFeature(
  entry: Pick<CatchmentIndexEntry, 'state' | 'location_age_id' | 'kind'>,
): Promise<CatchmentFeature> {
  const url = catchmentGeometryUrl(entry);
  const cached = featureCache.get(url);
  if (cached) return cached;

  const promise = fetch(url).then(response => {
    if (!response.ok) throw new Error(`Catchment geometry unavailable (HTTP ${response.status})`);
    return response.json() as Promise<CatchmentFeature>;
  }).catch(error => {
    featureCache.delete(url);
    throw error;
  });

  featureCache.set(url, promise);
  return promise;
}

/** Load every catchment polygon belonging to one school. */
export function loadCatchmentsForSchool(
  state: string,
  locationAgeId: number,
  kinds: CatchmentIndexEntry['kind'][],
): Promise<CatchmentFeature[]> {
  const stateSlug = state.toLowerCase();
  return Promise.all(
    kinds.map(kind => loadCatchmentFeature({ state: stateSlug, location_age_id: locationAgeId, kind })),
  );
}

/**
 * Find every catchment containing a point.
 *
 * Two stages: an in-memory bbox scan over every state's index (sub-millisecond,
 * typically leaves 4-8 candidates), then exact point-in-polygon against the
 * full-precision geometry of just those candidates. Measured on real addresses
 * this returns 2-3 zones — a primary and a secondary — but four is normal where
 * single-sex highs cover the same ground or a senior campus overlays a 7-12
 * school, which is why the results panel explains the overlap.
 */
export interface CatchmentLookupResult {
  features: CatchmentFeature[];
  /** State slug when one collected state's overall zone envelope contains the point. */
  state: string | null;
}

export async function lookupCatchmentsAt(point: [number, number]): Promise<CatchmentLookupResult> {
  const index = await loadCatchmentIndex();
  const candidates = candidatesAt(index, point);
  const features = await Promise.all(candidates.map(loadCatchmentFeature));
  return {
    features: features.filter(feature => pointInGeometry(point, feature.geometry)),
    state: catchmentStateAt(index, point),
  };
}

/**
 * The most zones the browse overlay will draw at once.
 *
 * A count gate rather than a zoom gate: zone size varies by two orders of
 * magnitude between inner Sydney and the far west, so the same zoom level means
 * 98 polygons in one place and a handful in another. Measured payloads for a
 * single kind — inner Sydney ~98 primary, Adelaide metro ~59 primary, Sydney
 * metro-wide 553 — put the readable ceiling around here, and past it the map is
 * a wall of outlines anyway.
 */
export const MAX_ZONES_IN_VIEW = 220;

export interface ZonesInView {
  /** Zones actually loaded, empty when the view holds too many. */
  features: CatchmentFeature[];
  /** How many zones of this kind the viewport covers, drawn or not. */
  total: number;
  /** True when `total` exceeded the cap and nothing was drawn. */
  tooMany: boolean;
  /** Published state containing the viewport centre, used only for explanatory copy. */
  state: string | null;
}

/**
 * Every zone of one kind overlapping the current viewport.
 *
 * One kind at a time by design. Primary and secondary are independent layers,
 * so drawing both makes their overlapping borders ambiguous — and several
 * secondary zones can overlap one address where single-sex options coexist.
 *
 * The index is already in memory for the reverse lookup and carries every
 * bbox, so choosing candidates costs nothing; only their geometry is fetched,
 * and `featureCache` keeps it across pans.
 */
export async function loadZonesInView(
  bounds: ViewportBounds,
  kind: CatchmentIndexEntry['kind'],
): Promise<ZonesInView> {
  const index = await loadCatchmentIndex();
  const candidates = zonesInBounds(index, bounds, kind);
  const state = catchmentStateAt(index, [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ]);

  if (candidates.length > MAX_ZONES_IN_VIEW) {
    return { features: [], total: candidates.length, tooMany: true, state };
  }

  const features = await Promise.all(candidates.map(loadCatchmentFeature));
  return { features, total: candidates.length, tooMany: false, state };
}
