import {
  CATCHMENT_STATES,
  candidatesAt,
  catchmentGeometryUrl,
  pointInGeometry,
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
export async function lookupCatchmentsAt(point: [number, number]): Promise<CatchmentFeature[]> {
  const index = await loadCatchmentIndex();
  const candidates = candidatesAt(index, point);
  const features = await Promise.all(candidates.map(loadCatchmentFeature));
  return features.filter(feature => pointInGeometry(point, feature.geometry));
}
