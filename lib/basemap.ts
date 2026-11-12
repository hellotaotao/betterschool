/**
 * The raster basemap under every slippy map on the site. One place, so moving
 * off OpenStreetMap's own tile servers (see the OSMF tile usage policy: no
 * quota, best effort, access may be withdrawn from commercial sites) is a
 * one-line change.
 */
export const BASEMAP_ORIGIN = 'https://tile.openstreetmap.org';
export const BASEMAP_TILE_URL = `${BASEMAP_ORIGIN}/{z}/{x}/{y}.png`;
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
