import {
  candidatesAt,
  catchmentGeometryUrl,
  pointInGeometry,
  type CatchmentFeature,
  type CatchmentIndex,
  type CatchmentIndexEntry,
} from './catchmentLookup';

const INDEX_URL = '/data/catchment/nsw/index.json';

let indexPromise: Promise<CatchmentIndex> | null = null;
const featureCache = new Map<string, Promise<CatchmentFeature>>();

/**
 * Load the catchment index once per session.
 *
 * ~380 KB, so it is deliberately not fetched on page load — only when the user
 * first asks for something catchment-related.
 */
export function loadCatchmentIndex(): Promise<CatchmentIndex> {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL).then(response => {
      if (!response.ok) throw new Error(`Catchment index unavailable (HTTP ${response.status})`);
      return response.json() as Promise<CatchmentIndex>;
    }).catch(error => {
      indexPromise = null; // let a later attempt retry rather than caching the failure
      throw error;
    });
  }
  return indexPromise;
}

export function loadCatchmentFeature(entry: Pick<CatchmentIndexEntry, 'location_age_id' | 'kind'>): Promise<CatchmentFeature> {
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
export function loadCatchmentsForSchool(locationAgeId: number, kinds: CatchmentIndexEntry['kind'][]): Promise<CatchmentFeature[]> {
  return Promise.all(kinds.map(kind => loadCatchmentFeature({ location_age_id: locationAgeId, kind })));
}

/**
 * Find every catchment containing a point.
 *
 * Two stages: an in-memory bbox scan over the whole index (sub-millisecond,
 * typically leaves 4-8 candidates), then exact point-in-polygon against the
 * full-precision geometry of just those candidates. Measured on real addresses
 * this returns 2-3 zones — a primary and a secondary, sometimes split by year
 * level where a town runs separate junior and senior campuses.
 */
export async function lookupCatchmentsAt(point: [number, number]): Promise<CatchmentFeature[]> {
  const index = await loadCatchmentIndex();
  const candidates = candidatesAt(index, point);
  const features = await Promise.all(candidates.map(loadCatchmentFeature));
  return features.filter(feature => pointInGeometry(point, feature.geometry));
}
