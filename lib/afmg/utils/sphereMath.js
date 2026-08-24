/*
* Spherical Helpers
*/
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Convert [lon, lat] in degrees to 3D Cartesian coordinates [x, y, z] on unit sphere
 */
export const toCartesian = ([lon, lat]) => {
  const phi = lat * DEG2RAD;
  const theta = lon * DEG2RAD;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(theta), cosPhi * Math.sin(theta), Math.sin(phi)];
};

/**
 * Convert 3D Cartesian coordinates [x, y, z] to [lon, lat] in degrees
 */
export const toSpherical = ([x, y, z]) => {
  const norm = Math.hypot(x, y, z);
  if (norm === 0) return [0, 0];
  const xn = x / norm;
  const yn = y / norm;
  const zn = Math.max(-1, Math.min(1, z / norm));
  const lat = Math.asin(zn) * RAD2DEG;
  const lon = Math.atan2(yn, xn) * RAD2DEG;
  return [lon, lat];
};

/**
 * Spherical angular distance in radians between two [lon, lat] points (degrees)
 */
export const sphericalDistance = ([lon1, lat1], [lon2, lat2]) => {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dPhi = (lat2 - lat1) * DEG2RAD;
  const dLam = deltaLongitude(lon1, lon2) * DEG2RAD;

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
};

/**
 * 3D Euclidean chord distance squared between two [lon, lat] points (degrees) on unit sphere
 */
export const chordDistanceSquared = (p1, p2) => {
  const [x1, y1, z1] = toCartesian(p1);
  const [x2, y2, z2] = toCartesian(p2);
  return (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
};

/**
 * Shortest signed angular delta from lon1 to lon2 in degrees [-180, 180]
 */
export const deltaLongitude = (lon1, lon2) => {
  return (((lon2 - lon1 + 180) % 360 + 360) % 360) - 180;
};

/**
 * Spherical midpoint (slerp t=0.5) of two [lon, lat] points in degrees
 */
export const sphericalMidpoint = (p1, p2) => {
  const [x1, y1, z1] = toCartesian(p1);
  const [x2, y2, z2] = toCartesian(p2);
  const xm = x1 + x2;
  const ym = y1 + y2;
  const zm = z1 + z2;
  return toSpherical([xm, ym, zm]);
};
