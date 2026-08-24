// Builds a region's heightmap directly from its parent surface cell's own
// elevation and its 8 cardinal neighbors, instead of picking a canned AFMG
// template at random. The neighbors anchor a coarse "ramp" so two adjacent
// regions agree at their shared edge/corner control points; fine-grained
// texture comes from 3D noise sampled in real sphere-space, which is exactly
// continuous everywhere (no region-boundary seam at all for that layer).
import { childSeed } from '../seed.js';
import { makeNoise3D, fbm3D } from './noise.js';
import { bearingDeg, greatCircleKm } from './sphere-geo.js';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function sectorFor(bearing) {
  return DIRS[Math.round(bearing / 45) % 8];
}

// How many nearest neighbors (regardless of direction) to use for local
// density estimation — see estimateRegionSideKm below.
const DENSITY_K = 6;

/**
 * The nearest OTHER cell in each of the 8 compass sectors around `cells[index]`
 * — one candidate per 45deg wedge, not a fixed k-nearest set, so neighbors stay
 * spread around the cell instead of clustering on one side (a real risk with
 * plain k-nearest on a jittered grid). Some sectors may come back empty near a
 * pole or a very sparse grid — callers must handle a missing direction.
 * Also returns the plain K-nearest-by-distance list (unrestricted by sector),
 * for local density estimation — sector picks answer "which cell sits roughly
 * north/east/etc." (needed for a compass-aligned ramp) but are a BAD estimate
 * of true local spacing on an irregular point cloud (e.g. a Fibonacci-sphere
 * habitable surface, where a point's true nearest neighbors routinely fall
 * outside a narrow 45deg wedge — sector-restricted distances there run ~40%
 * too high). O(n) per call; fine for a one-off, lazy, per-click region gen.
 *
 * @returns {{bySector: Object<string,{cell,dist}>, kNearest: Array<{cell,dist}>}}
 */
export function cardinalNeighbors(cells, index, radiusKm, densityK = DENSITY_K) {
  const center = cells[index];
  const bySector = {};
  const kNearest = [];
  for (let i = 0; i < cells.length; i++) {
    if (i === index) continue;
    const c = cells[i];
    const dist = greatCircleKm(radiusKm, center.x, center.y, c.x, c.y);
    const dir = sectorFor(bearingDeg(center.x, center.y, c.x, c.y));
    if (!bySector[dir] || dist < bySector[dir].dist) bySector[dir] = { cell: c, dist };

    if (kNearest.length < densityK) {
      kNearest.push({ cell: c, dist });
      kNearest.sort((a, b) => a.dist - b.dist);
    } else if (dist < kNearest[densityK - 1].dist) {
      kNearest[densityK - 1] = { cell: c, dist };
      kNearest.sort((a, b) => a.dist - b.dist);
    }
  }
  return { bySector, kNearest };
}

// Equal-area square side length for this cell's region, from a K-nearest-
// neighbor LOCAL DENSITY estimate (standard 2D point-process technique: if a
// circle of radius r contains k points, local density ~ k/(pi*r^2), so the
// equal-area square side is r*sqrt(pi/k)). Robust regardless of how the
// point cloud is laid out — unlike measuring compass-direction spacing
// directly, which only works cleanly on an actual rectilinear grid.
export function estimateRegionSideKm(kNearest, fallbackKm) {
  if (!kNearest.length) return fallbackKm;
  const k = kNearest.length;
  const rK = kNearest[k - 1].dist;
  if (!rK) return fallbackKm;
  return Math.max(5, Math.min(400, rK * Math.sqrt(Math.PI / k)));
}

function mid(center, neighbor) {
  return neighbor == null ? center : (center + neighbor) / 2;
}
function cornerAvg(vals) {
  const present = vals.filter(v => v != null);
  return present.reduce((s, v) => s + v, 0) / present.length;
}

/** A 3x3 control lattice of elevation values: center, 4 edges (boundary
 * midpoint with that neighbor — so the shared edge anchors match exactly on
 * both sides of a boundary), 4 corners (mean of the up-to-4 cells meeting
 * there). Missing neighbors (sparse grid / pole) fall back to the center. */
export function buildControlLattice(centerElev, neighborsByDir) {
  const e = dir => neighborsByDir[dir] ? neighborsByDir[dir].cell.elev : null;
  const N = e('N'), S = e('S'), E = e('E'), W = e('W');
  return {
    C: centerElev,
    N: mid(centerElev, N), S: mid(centerElev, S),
    E: mid(centerElev, E), W: mid(centerElev, W),
    NE: cornerAvg([centerElev, N, E, e('NE')]),
    NW: cornerAvg([centerElev, N, W, e('NW')]),
    SE: cornerAvg([centerElev, S, E, e('SE')]),
    SW: cornerAvg([centerElev, S, W, e('SW')])
  };
}

// Bilinear sample of the 3x3 lattice at (u,v) in [-1,1]^2 — u=+1 is this
// region's east edge (the shared boundary with the E neighbor), v=+1 is the
// north edge, etc. Reduces to an exact lattice value at the 9 anchor points.
function bilinear(lattice, u, v) {
  u = Math.max(-1, Math.min(1, u));
  v = Math.max(-1, Math.min(1, v));
  const hPos = u >= 0, vPos = v >= 0;
  const tu = Math.abs(u), tv = Math.abs(v);
  const hAxis = hPos ? lattice.E : lattice.W;
  const vAxis = vPos ? lattice.N : lattice.S;
  const diag = lattice[(vPos ? 'N' : 'S') + (hPos ? 'E' : 'W')];
  const bottom = lattice.C + (hAxis - lattice.C) * tu;
  const top = vAxis + (diag - vAxis) * tu;
  return bottom + (top - bottom) * tv;
}

/**
 * Prepares everything region.js needs to generate one surface cell's region:
 * the equal-area square side length, and an AFMG `options.heightmap` function
 * that ramps from this cell's own elevation to its neighbors' at the region's
 * edges/corners, with 3D-sphere-sampled noise layered on top for local detail
 * (amplitude scaled by how much relief the neighborhood actually has, so flat
 * neighborhoods stay flat and rugged ones stay rugged).
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} cellIndex
 * @param {{fallbackSideKm?: number}} [opts]
 * @returns {{heightmapFn: Function, sideKm: number}}
 */
export function prepareCellTerrain(surface, cellIndex, opts = {}) {
  const cell = surface.cells[cellIndex];
  const radiusKm = surface.radius || 6371;
  const { bySector, kNearest } = cardinalNeighbors(surface.cells, cellIndex, radiusKm);
  const lattice = buildControlLattice(cell.elev, bySector);

  const latticeVals = Object.values(lattice);
  const relief = Math.max(...latticeVals) - Math.min(...latticeVals);
  const noiseAmp = Math.min(25, Math.max(3, relief * 0.4));

  const sideKm = estimateRegionSideKm(kNearest, opts.fallbackSideKm ?? 150);

  const noise = makeNoise3D(childSeed(surface.seed, 'cell-terrain', cellIndex));
  const wavelengthKm = Math.max(8, sideKm / 8);
  const noiseFreq = (2 * Math.PI * radiusKm) / wavelengthKm;

  const lat0Rad = cell.y * Math.PI / 180;
  const cosLat0 = Math.max(0.05, Math.cos(lat0Rad));
  const halfSideKm = sideKm / 2;

  async function heightmapFn(grid) {
    const n = grid.points.length;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const [px, py] = grid.points[i];
      const u = (px - 500) / 500;
      const v = (500 - py) / 500; // AFMG: y=0 is the north edge (climate.js)

      const localXKm = u * halfSideKm;
      const localYKm = v * halfSideKm;
      const dLat = (localYKm / radiusKm) * (180 / Math.PI);
      const dLon = (localXKm / (radiusKm * cosLat0)) * (180 / Math.PI);
      const lat = Math.max(-90, Math.min(90, cell.y + dLat));
      const lon = ((cell.x + dLon + 180) % 360 + 360) % 360 - 180;

      const latRad = lat * Math.PI / 180, lonRad = lon * Math.PI / 180;
      const sx = Math.cos(latRad) * Math.cos(lonRad) * noiseFreq;
      const sy = Math.cos(latRad) * Math.sin(lonRad) * noiseFreq;
      const sz = Math.sin(latRad) * noiseFreq;

      const base = bilinear(lattice, u, v);
      const detail = fbm3D(noise, sx, sy, sz, 4, 0.5, 1);
      const h = base + (detail - 0.5) * noiseAmp;
      out[i] = Math.max(0, Math.min(100, Math.round(h)));
    }
    return out;
  }

  return { heightmapFn, sideKm };
}
