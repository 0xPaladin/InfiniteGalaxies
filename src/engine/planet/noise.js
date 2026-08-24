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
