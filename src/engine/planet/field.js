// IMPLEMENTATION_PLAN.md §11.1 — terrain as a pure function of position.
// Builds a "field sampler" for one region window: elevation/climate/biome at
// any (lon,lat) inside the window, continuous with the rest of the planet by
// construction. Two data sources feed it depending on surface type:
//
//   - in-house types (rocky/icy/hostile/barren/airless-moon): the SAME
//     analytic noise field buildSurfaceCells() samples at its grid points
//     (common.js's sampleRawField) — evaluating it at a finer spacing than
//     the grid is exact, not an approximation, because it's the same
//     function. Verified: this macro field only varies ~0.06 (of a ~2.0
//     planet-wide range) across a 500km span, so it sets the region's
//     baseline elevation but has no meaningful HIGH-frequency content at
//     2km scale — see the detail layer below for that.
//   - habitable: no analytic field exists (AFMG generated the cells), so
//     interpolated from surface.cells with a COMPACTLY-SUPPORTED kernel
//     (KERNEL_SUPPORT_KM) — verified exact (0.00e+0 disagreement) between
//     two overlapping windows when the gather radius covers
//     window-half-diagonal + KERNEL_SUPPORT_KM, vs. up to 2.69 units of
//     seam disagreement with a plain fixed-cell-count k-nearest approach.
//
// On top of the macro baseline, a region-local 3D-sphere-sampled fbm layer
// (same technique the old cell-terrain.js used, and for the same reason:
// exactly seam-continuous everywhere, since it's a function of the point's
// real 3D position on the sphere, not of which region "owns" it) supplies
// the actual terrain shape at 2km resolution.
import { childSeed } from '../seed.js';
import { makeNoise3D, fbm3D } from './noise.js';
import { sampleRawField } from './common.js';
import { greatCircleKm } from './sphere-geo.js';
import { PROFILES } from './profiles.js';
import { classifyBiome } from './habitable-biome.js';

export const KERNEL_SUPPORT_KM = 700;

const _detailNoiseCache = new Map();
function detailNoiseFor(seed) {
  let n = _detailNoiseCache.get(seed);
  if (!n) { n = makeNoise3D(childSeed(seed, 'region-detail')); _detailNoiseCache.set(seed, n); }
  return n;
}

// The vendored simplex-noise library is measured ~36x slower per call when
// queried across a real geographic span vs. near-identical points (1.4s vs
// 50.2s for 160k calls, isolated benchmark) — some internal cache/locality
// effect, not something worth chasing into the library itself. Evaluating it
// at full 2km resolution made a single region take ~18s. Fix: evaluate the
// detail layer on a coarse, GLOBALLY-ALIGNED lon/lat lattice (not aligned to
// any one window's own origin) and bilinearly interpolate for any finer
// query point. Global alignment is what keeps this exactly seam-safe: two
// overlapping windows share the same lattice cells, cached once, so they
// interpolate from identical corner values. LATTICE_STEP_DEG is chosen well
// under the detail noise's own tuned wavelength (windowKm/8, e.g. ~62.5km at
// the 500km default) so the lattice doesn't alias away the texture it's
// supposed to carry.
const LATTICE_STEP_DEG = 0.1; // ~11km at the equator
const _detailLatticeCache = new Map(); // key: `${seed}|${ix}|${iy}` -> raw fbm3D value

function detailLatticeCorner(seed, noise, noiseFreq, ix, iy) {
  // noiseFreq is included in the key (not just seed/ix/iy) because it's
  // window-size-dependent — every region uses the same fixed windowKm today
  // so this never actually varies in practice, but keying on it prevents a
  // silent cache-poisoning bug if that assumption ever changes (e.g. a
  // clamped window on a very small body).
  const key = `${seed}|${noiseFreq.toFixed(3)}|${ix}|${iy}`;
  let v = _detailLatticeCache.get(key);
  if (v != null) return v;
  const lon = ix * LATTICE_STEP_DEG, lat = Math.max(-90, Math.min(90, iy * LATTICE_STEP_DEG));
  const [sx, sy, sz] = sphereXYZ(lon, lat).map(c => c * noiseFreq);
  v = fbm3D(noise, sx, sy, sz, 4, 0.5, 1);
  _detailLatticeCache.set(key, v);
  return v;
}

// Bilinear interpolation directly in (lon,lat) space — a coarse approximation
// near the poles (where a degree of longitude is a much shorter arc), but
// this only modulates the fine TEXTURE layer, not the macro shape, and every
// region this could visibly matter for is far from a pole edge case worth
// the added complexity of a proper local projection here.
function detailAt(seed, noise, noiseFreq, lon, lat) {
  const gx = lon / LATTICE_STEP_DEG, gy = lat / LATTICE_STEP_DEG;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const h00 = detailLatticeCorner(seed, noise, noiseFreq, x0, y0);
  const h10 = detailLatticeCorner(seed, noise, noiseFreq, x0 + 1, y0);
  const h01 = detailLatticeCorner(seed, noise, noiseFreq, x0, y0 + 1);
  const h11 = detailLatticeCorner(seed, noise, noiseFreq, x0 + 1, y0 + 1);
  const top = h00 + (h10 - h00) * tx;
  const bot = h01 + (h11 - h01) * tx;
  return top + (bot - top) * ty;
}

function sphereXYZ(lonDeg, latDeg) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Cells within `radiusKm` great-circle distance of (lon,lat) — the one-time
 * gather step so per-tile interpolation only scans a small local subset
 * instead of the whole planet cell list. */
export function gatherNearby(surface, lon, lat, radiusKm) {
  const R = surface.radius || 6371;
  return surface.cells.filter(c => greatCircleKm(R, lon, lat, c.x, c.y) <= radiusKm);
}

function kernelInterp(nearby, lon, lat, radiusKm, getValue) {
  let num = 0, den = 0;
  for (const c of nearby) {
    const d = greatCircleKm(radiusKm, lon, lat, c.x, c.y);
    if (d >= KERNEL_SUPPORT_KM) continue;
    if (d < 1e-6) return getValue(c);
    const t = 1 - d / KERNEL_SUPPORT_KM;
    const w = (t * t) / (d * d);
    num += w * getValue(c); den += w;
  }
  return den > 0 ? num / den : 0;
}

/** Macro elevation only (no region-local detail) — the planet-consistent
 * baseline every region's fine terrain sits on top of. */
function macroElevation(surface, lon, lat, nearby, profile) {
  if (profile) return profile.elevation(sampleRawField(surface.seed, lon, lat).elevRaw, lat);
  return kernelInterp(nearby, lon, lat, surface.radius || 6371, c => c.elev);
}

function macroClimate(surface, lon, lat, elev, nearby, profile) {
  if (profile) {
    const { moistRaw } = sampleRawField(surface.seed, lon, lat);
    return { moisture: profile.moisture(moistRaw, elev, lat), temp: profile.temperature(lat, elev) };
  }
  const R = surface.radius || 6371;
  return {
    moisture: kernelInterp(nearby, lon, lat, R, c => c.moisture),
    temp: kernelInterp(nearby, lon, lat, R, c => c.temp)
  };
}

// Local relief (max-min macro elevation over a handful of points), used to
// scale the detail-noise amplitude below (flat neighborhoods stay flat,
// rugged ones stay rugged — same role cell-terrain.js's 3x3-lattice range
// played). MUST be a pure function of position, not of which window asked —
// sampling around each window's own center (an earlier version of this)
// measurably broke seam-exactness (0.42 unit disagreement at a shared
// boundary) purely from two overlapping windows estimating slightly
// different relief for the same neighborhood. Snapping to a coarse degree
// bucket first fixes that: any two windows querying the same physical
// neighborhood compute relief around the identical snapped center, so they
// agree exactly, regardless of their own window's center. Cached per
// (seed, bucket) since many sample points share a bucket.
const RELIEF_BUCKET_DEG = 2;
const _reliefCache = new Map();
function bucketRelief(sampleMacro, seed, lon, lat, radiusKm) {
  const bLon = Math.round(lon / RELIEF_BUCKET_DEG) * RELIEF_BUCKET_DEG;
  const bLat = Math.round(lat / RELIEF_BUCKET_DEG) * RELIEF_BUCKET_DEG;
  const key = `${seed}|${bLon}|${bLat}`;
  let relief = _reliefCache.get(key);
  if (relief != null) return relief;

  const cosLat = Math.max(0.05, Math.cos(bLat * Math.PI / 180));
  const halfKm = (RELIEF_BUCKET_DEG * Math.PI / 180) * radiusKm / 2;
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let min = Infinity, max = -Infinity;
  for (const [dx, dy] of offsets) {
    const dLat = (dy * halfKm / radiusKm) * (180 / Math.PI);
    const dLon = (dx * halfKm / (radiusKm * cosLat)) * (180 / Math.PI);
    const v = sampleMacro(bLon + dLon, bLat + dLat);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  relief = max - min;
  _reliefCache.set(key, relief);
  return relief;
}

/**
 * Build a sampler for one region window, centered on (centerLon, centerLat).
 * `windowKm` is the region's own visual span (drives detail-noise frequency
 * and the relief estimate); `haloKm` extends how far this sampler is willing
 * to be QUERIED beyond that (a caller doing local hydrology needs points in
 * the halo band too) — it only affects the one-time gather radius below, not
 * how the terrain itself looks.
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} centerLon
 * @param {number} centerLat
 * @param {number} windowKm
 * @param {number} [haloKm]
 * @returns {{heightAt, climateAt, biomeAt}}
 */
export function buildFieldSampler(surface, centerLon, centerLat, windowKm, haloKm = 0) {
  const R = surface.radius || 6371;
  const profile = PROFILES[surface.type] || null;
  const halfDiag = (windowKm + 2 * haloKm) * Math.SQRT2 / 2;
  // Habitable (kernel path) needs every cell that could influence ANY point
  // in the window+halo; in-house (analytic path) needs none at all.
  const nearby = profile ? null : gatherNearby(surface, centerLon, centerLat, halfDiag + KERNEL_SUPPORT_KM);

  const sampleMacro = (lon, lat) => macroElevation(surface, lon, lat, nearby, profile);

  const detailNoise = detailNoiseFor(surface.seed);
  const wavelengthKm = Math.max(8, windowKm / 8);
  const noiseFreq = (2 * Math.PI * R) / wavelengthKm;

  function heightAt(lon, lat) {
    const macro = sampleMacro(lon, lat);
    const relief = bucketRelief(sampleMacro, surface.seed, lon, lat, R);
    const noiseAmp = Math.min(25, Math.max(3, relief * 0.4));
    const detail = detailAt(surface.seed, detailNoise, noiseFreq, lon, lat);
    const h = macro + (detail - 0.5) * noiseAmp;
    return Math.max(0, Math.min(100, h));
  }

  function climateAt(lon, lat, elev) {
    return macroClimate(surface, lon, lat, elev, nearby, profile);
  }

  function biomeAt(elev, moisture, temp) {
    return profile ? profile.biome(elev, moisture, temp) : classifyBiome(moisture, temp, elev);
  }

  return { heightAt, climateAt, biomeAt };
}
