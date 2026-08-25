import { PRNG } from '../random.js';

// Seeded 2D value noise — no CDN simplex-noise dependency (that came in with the
// deleted World-Engine stack; see IMPLEMENTATION_PLAN.md §1.2). Good enough at the
// resolution these ASCII surfaces render at.
export function makeNoise2D(seed) {
  const cache = new Map();

  function hash(x, y) {
    const key = x + ',' + y;
    let v = cache.get(key);
    if (v === undefined) {
      v = new PRNG(seed + ':' + key).rand();
      cache.set(key, v);
    }
    return v;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  return function noise2D(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const n00 = hash(x0, y0), n10 = hash(x0 + 1, y0);
    const n01 = hash(x0, y0 + 1), n11 = hash(x0 + 1, y0 + 1);
    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
  };
}

/** Fractal sum of several octaves of `noise2D`. Returns roughly 0..1. */
export function fbm(noise2D, x, y, octaves = 4, persistence = 0.5, scale = 1) {
  let amp = 1, freq = scale, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    amp *= persistence;
    freq *= 2;
  }
  return sum / norm;
}

// Seeded 3D value noise — same trilinear-over-hashed-lattice approach as
// makeNoise2D, extended a dimension. Used to sample terrain detail directly in
// a planet's 3D unit-sphere space (cell-terrain.js): two adjacent regions
// querying the SAME physical (lon,lat) point always get the identical value,
// so this layer is exactly seam-continuous regardless of region boundaries —
// unlike the coarse elevation ramp, which only matches at shared control points.
export function makeNoise3D(seed) {
  const cache = new Map();

  function hash(x, y, z) {
    const key = x + ',' + y + ',' + z;
    let v = cache.get(key);
    if (v === undefined) {
      v = new PRNG(seed + ':' + key).rand();
      cache.set(key, v);
    }
    return v;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  return function noise3D(x, y, z) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const sx = smooth(x - x0), sy = smooth(y - y0), sz = smooth(z - z0);
    const n000 = hash(x0, y0, z0), n100 = hash(x0 + 1, y0, z0);
    const n010 = hash(x0, y0 + 1, z0), n110 = hash(x0 + 1, y0 + 1, z0);
    const n001 = hash(x0, y0, z0 + 1), n101 = hash(x0 + 1, y0, z0 + 1);
    const n011 = hash(x0, y0 + 1, z0 + 1), n111 = hash(x0 + 1, y0 + 1, z0 + 1);
    const nx00 = lerp(n000, n100, sx), nx10 = lerp(n010, n110, sx);
    const nx01 = lerp(n001, n101, sx), nx11 = lerp(n011, n111, sx);
    const nxy0 = lerp(nx00, nx10, sy), nxy1 = lerp(nx01, nx11, sy);
    return lerp(nxy0, nxy1, sz);
  };
}

// Same trilinear value noise as makeNoise3D, but with the per-corner hash
// replaced by a cheap integer bit-mixer instead of `new PRNG(seed + ':' + key)`
// against a Map. That string-keyed PRNG hash costs ~8 corners x N octaves
// object constructions + string concats per sample, which measured 23.8s for a
// 6-octave 350x350 region window; this measures 166ms for the identical work
// (~143x). That cost is the ONLY reason field.js used to evaluate its detail
// layer on a coarse interpolated lattice — with this it can sample at full 2km
// resolution directly, which is what actually gives terrain content at region
// scale (see field.js's heightAt).
//
// Deliberately a SEPARATE function rather than a fix to makeNoise3D: changing
// that hash would silently change every already-generated world's terrain,
// and the surface generators (common.js via makeNoise2D) are fine as they are
// — they sample a few thousand grid points, not hundreds of thousands.
export function makeFastNoise3D(seed) {
  // Fold the string seed to an int once, so the hot path is pure integer math.
  let S = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) S = (Math.imul(S, 31) + str.charCodeAt(i)) | 0;

  function hash(x, y, z) {
    let h = S ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  return function fastNoise3D(x, y, z) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const sx = smooth(x - x0), sy = smooth(y - y0), sz = smooth(z - z0);
    const n000 = hash(x0, y0, z0), n100 = hash(x0 + 1, y0, z0);
    const n010 = hash(x0, y0 + 1, z0), n110 = hash(x0 + 1, y0 + 1, z0);
    const n001 = hash(x0, y0, z0 + 1), n101 = hash(x0 + 1, y0, z0 + 1);
    const n011 = hash(x0, y0 + 1, z0 + 1), n111 = hash(x0 + 1, y0 + 1, z0 + 1);
    const nx00 = lerp(n000, n100, sx), nx10 = lerp(n010, n110, sx);
    const nx01 = lerp(n001, n101, sx), nx11 = lerp(n011, n111, sx);
    const nxy0 = lerp(nx00, nx10, sy), nxy1 = lerp(nx01, nx11, sy);
    return lerp(nxy0, nxy1, sz);
  };
}

/** Fractal sum of several octaves of `noise3D`. Returns roughly 0..1. */
export function fbm3D(noise3D, x, y, z, octaves = 4, persistence = 0.5, scale = 1) {
  let amp = 1, freq = scale, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= persistence;
    freq *= 2;
  }
  return sum / norm;
}
