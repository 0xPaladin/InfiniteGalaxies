// Spherical geometry helpers shared by cell-terrain.js and every surface
// generator that needs to size a per-cell region. All positions are plain
// (lon, lat) degrees — the same convention every PlanetSurface.cells entry
// already uses (x = lon, y = lat).

const toRad = d => d * Math.PI / 180;

/** Initial compass bearing (degrees, 0=N/90=E/180=S/270=W) from point 1 to point 2. */
export function bearingDeg(lon1, lat1, lon2, lat2) {
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const brg = Math.atan2(y, x) * 180 / Math.PI;
  return (brg + 360) % 360;
}

/** Great-circle distance (km) between two (lon,lat) points on a sphere of `radiusKm`. */
export function greatCircleKm(radiusKm, lon1, lat1, lon2, lat2) {
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1), dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

// Every planet's regions target the same physical ceiling (per-planet request:
// "regions will be < 200 km x 200 km") — 180 leaves margin under that ceiling
// since these are ESTIMATES made before the point cloud/grid actually exists.
export const TARGET_REGION_SIDE_KM = 180;

// Guard rails so a tiny asteroid-moon doesn't demand a near-zero cell count.
// Upper bound is sized for the largest radius a habitable (HI<=2) world can
// actually roll — 15000km, from astrophysics.js's "rocky" classification
// template, the only template HI<=2 routes through — so the <200km-per-region
// requirement holds even at that extreme (needs ~87k cells at the 180km
// target). That's ~10x AFMG's own historical planet-mode default (8000) for
// the biggest habitable worlds; expect noticeably slower surface generation
// there — untested in-browser, since this environment can't run AFMG's real
// multi-stage sim (see the earlier note on why: no import-map support under
// plain Node).
const MIN_CELLS = 200;
const MAX_CELLS = 100000;

/** How many equal-area cells a sphere of `radiusKm` needs so each cell's
 * equivalent square side is ~`targetSideKm`. Used to pick a Fibonacci-sphere
 * point count (habitable worlds) BEFORE the point cloud exists. */
export function dynamicCellCount(radiusKm, targetSideKm = TARGET_REGION_SIDE_KM) {
  const area = 4 * Math.PI * radiusKm * radiusKm;
  const n = Math.ceil(area / (targetSideKm * targetSideKm));
  return Math.max(MIN_CELLS, Math.min(MAX_CELLS, n));
}

/** Same idea, but for the in-house jittered lon/lat surface generators
 * (common.js's buildSurfaceCells). A lon/lat grid's cells are NOT equal-area —
 * a row spanning `180/rows` degrees of latitude is the same physical height
 * everywhere, but a column spanning `360/cols` degrees of longitude shrinks
 * toward the poles (by cos(lat)). Sizing off the total-cell-count average (as
 * dynamicCellCount does for the uniform Fibonacci-sphere case) systematically
 * undersizes the grid: equatorial cells — the LARGEST ones — end up bigger
 * than the target while polar cells sit far under it. So this sizes directly
 * off the equator, the worst case, by picking rows/cols so that a row's
 * latitude-height and an equatorial column's longitude-width both equal
 * `targetSideKm` (cols = 2 x rows keeps those two spans equal at the equator:
 * a full row spans 180deg of latitude, a full circle of columns spans 360deg
 * of longitude, so twice the column count covers twice the angular span in
 * the same physical distance). Every other latitude then comes out smaller
 * than the target, never larger. */
// Higher than MAX_CELLS above — a plain value-noise lookup per cell
// (common.js) is far cheaper than AFMG's multi-stage plate/climate/river/biome
// sim, so this grid can afford more cells before it's a perf concern. Sized to
// clear the worst case (a 15000km-radius rocky world, astrophysics.js's max)
// without clipping short of the <200km target.
const MAX_GRID_CELLS = 200000;

export function dynamicGridDims(radiusKm, targetSideKm = TARGET_REGION_SIDE_KM) {
  let rows = Math.max(4, Math.round((Math.PI * radiusKm) / targetSideKm));
  const maxRows = Math.round(Math.sqrt(MAX_GRID_CELLS / 2));
  rows = Math.min(rows, maxRows);
  const cols = Math.max(8, rows * 2);
  return { cols, rows };
}
