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
import { makeFastNoise3D, fbm3D } from './noise.js';
import { sampleRawField } from './common.js';
import { greatCircleKm } from './sphere-geo.js';
import { PROFILES } from './profiles.js';
import { classifyBiome } from './habitable-biome.js';

export const KERNEL_SUPPORT_KM = 700;

const _detailNoiseCache = new Map();
function detailNoiseFor(seed) {
  let n = _detailNoiseCache.get(seed);
  if (!n) { n = makeFastNoise3D(childSeed(seed, 'region-detail')); _detailNoiseCache.set(seed, n); }
  return n;
}

// The detail fbm spans from LARGER than the window down to a few tiles, so a
// region gets both a regional slope and fine texture out of one coherent
// multi-scale field (see buildFieldSampler for why the base has to exceed the
// window). DETAIL_OCTAVE_FLOOR_KM is deliberately ~4 tiles rather than the
// 2-tile Nyquist limit: at 2 tiles the height field is effectively white noise
// tile-to-tile, which pits the terrain so densely that depression filling
// (hydrology-local.js) has to flood a sixth of the window. Four tiles keeps
// the surface differentiable enough for D8 to trace real channels while still
// having texture at the scale the region actually renders.
//
// An earlier version evaluated this on a coarse 0.1-degree (~11km) lattice and
// bilinearly interpolated, to dodge how slow the old string-keyed-PRNG
// makeNoise3D was. That capped resolvable detail at ~22km against a 2km grid,
// which aliased away the two finest octaves entirely and left the height field
// so smooth that D8 flow accumulation (hydrology-local.js) ran in straight
// lines for dozens of tiles at a time — the "90-degree and 45-degree water
// grid" artifact. makeFastNoise3D removed the reason for the lattice (166ms vs
// 23.8s for a full 350x350 window), so the detail layer is now sampled
// directly at full resolution. Seam-exactness is untouched: this is still a
// pure function of the point's real 3D position on the sphere, which is the
// property the tiling proof actually rests on — the lattice was never what
// made it exact.
const DETAIL_BASE_WINDOWS = 4;   // base wavelength = 4 x windowKm
const DETAIL_OCTAVE_FLOOR_KM = 8;

// fbm-of-value-noise does NOT span 0..1 — measured across 40k samples it runs
// 0.087..0.896 with p5..p95 of only 0.306..0.682. Treating `detail - 0.5` as a
// +/-0.5 signal (as this used to) therefore threw away most of the intended
// amplitude. Dividing the centered value by the measured half-span maps the
// typical range onto roughly [-1, 1], so `noiseAmp` below means what it says.
// Clamped because the tails run wider than the p5/p95 span.
const DETAIL_HALF_SPAN = 0.19;
function normalizedDetail(raw) {
  return Math.max(-1.5, Math.min(1.5, (raw - 0.5) / DETAIL_HALF_SPAN));
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
  // Base wavelength is several times the WINDOW, not a fraction of it. When it
  // was windowKm/8 (~62.5km) the detail layer was a single narrow band, so —
  // with the macro field varying only ~2 units across a whole window — terrain
  // came out as a field of ~60km closed bowls with no regional slope for water
  // to run down. Depression filling then had to flood each bowl, and 16% of a
  // window classified as pond. Starting above the window size gives every
  // region a coherent large-scale tilt that flow can follow for hundreds of km,
  // with the finer octaves supplying texture on top of it.
  const baseWavelengthKm = Math.max(64, windowKm * DETAIL_BASE_WINDOWS);
  const noiseFreq = (2 * Math.PI * R) / baseWavelengthKm;
  // Enough octaves to reach ~4 tiles (see DETAIL_OCTAVE_FLOOR_KM), derived
  // rather than hardcoded so it stays correct if the window or tile size moves.
  const octaves = Math.max(4, Math.min(10,
    Math.round(Math.log2(baseWavelengthKm / DETAIL_OCTAVE_FLOOR_KM)) + 1));

  function heightAt(lon, lat) {
    const macro = sampleMacro(lon, lat);
    const relief = bucketRelief(sampleMacro, surface.seed, lon, lat, R);
    // relief is measured on the deliberately-smooth macro field, so its own
    // planet-wide spread is small (p5/p50/p95 = 1.8/4.8/11.2 across 612
    // buckets). The old `max(3, relief * 0.4)` mapping left 79.9% of the
    // planet pinned at the floor of 3, i.e. the relief term did nothing
    // almost everywhere and every region came out a ~3-unit-tall plane on a
    // 0..100 scale. The gain and floor here are set against that measured
    // distribution instead: a typical (p50) neighbourhood now gets ~10 and a
    // rugged (p95) one ~25, with the floor engaging only in genuinely flat
    // country rather than as the default.
    const noiseAmp = Math.min(30, Math.max(8, relief * 2.2));
    const [sx, sy, sz] = sphereXYZ(lon, lat);
    const raw = fbm3D(detailNoise, sx * noiseFreq, sy * noiseFreq, sz * noiseFreq, octaves, 0.5, 1);
    const h = macro + normalizedDetail(raw) * noiseAmp;
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
