/**
 * Geo helpers.
 *
 * Convex has no PostGIS, so we do the equivalent: a bounding-box prefilter via
 * index-friendly comparisons, then exact haversine distance in memory. This is
 * the same two-phase strategy PostGIS uses internally (GiST index candidates,
 * then exact distance filter) — just done in JS at the small scale v1 has.
 */

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rough lat/lng bounding box around a point — the cheap prefilter. */
export function boundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusKm / 111.32; // ~111.32 km per degree of latitude
  const dLng = radiusKm / (111.32 * Math.max(0.1, Math.cos(toRad(lat))));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}
