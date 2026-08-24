import { PRNG } from '../random.js';
import { childSeed } from '../seed.js';
import { makeNoise2D, fbm } from './noise.js';
import { dynamicGridDims, TARGET_REGION_SIDE_KM } from './sphere-geo.js';

// Shared cell-field builder for all in-house (non-habitable) surface generators
// (rocky/icy/hostile/barren/airless-moon). A `profile` supplies the type-specific
// shaping — how noise maps to elevation/moisture, the latitude temperature curve,
// and biome bucketing. Per IMPLEMENTATION_PLAN.md §4.2 (AFMG spike correction),
// output is a point cloud on lon/lat degrees, not a dense w×h array, so it shares
// one coordinate convention with the AFMG-sourced habitable surfaces.
//
// cols/rows default dynamically from `radiusKm` so every planet's per-cell
// regions land under region.js's ~200km-a-side target regardless of body
// size — a fixed 36x18 grid put ~890km regions on an Earth-radius rocky world
// (region.js's equal-area-square sizing is honest about actual cell spacing,
// so that was never really "100km²" like the old flat default claimed).
//
// @param {string} seed
// @param {{cols?:number, rows?:number, radiusKm?:number}} opts
// @param {{elevation, moisture, temperature, biome}} profile
export function buildSurfaceCells(seed, opts, profile) {
  const dynamicDims = dynamicGridDims(opts.radiusKm || 6371, TARGET_REGION_SIDE_KM);
  const { cols = dynamicDims.cols, rows = dynamicDims.rows } = opts;
  const rng = new PRNG(childSeed(seed, 'surface-jitter'));
  const elevNoise = makeNoise2D(childSeed(seed, 'elev'));
  const moistNoise = makeNoise2D(childSeed(seed, 'moisture'));

  const cellW = 360 / cols;
  const cellH = 180 / rows;
  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng.rand() - 0.5) * cellW;
      const jitterY = (rng.rand() - 0.5) * cellH;
      const lon = -180 + (col + 0.5) * cellW + jitterX;
      const lat = -90 + (row + 0.5) * cellH + jitterY;

      // noise coords derived from lon/lat, not raw grid indices, so the field stays
      // continuous even though sample points are jittered
      const nx = (lon / 180 + 1) * 2;
      const ny = (lat / 90 + 1) * 2;
      const elevRaw = fbm(elevNoise, nx, ny, 5, 0.55, 1.7);
      const moistRaw = fbm(moistNoise, nx + 100, ny + 100, 4, 0.5, 1.3);

      const elev = profile.elevation(elevRaw, lat);
      const moisture = profile.moisture(moistRaw, elev, lat);
      const temp = profile.temperature(lat, elev);
      const biome = profile.biome(elev, moisture, temp);

      cells.push({ x: +lon.toFixed(2), y: +lat.toFixed(2), elev, temp, moisture, biome });
    }
  }

  return cells;
}

export const GLOBE_BOUNDS = { minX: -180, maxX: 180, minY: -90, maxY: 90 };

/** Shared PlanetSurface envelope — each in-house generator only supplies cells/palette/type. */
export function makeSurface(seed, planet, { type, cells, palette }) {
  return {
    seed,
    type,
    HI: planet.HI,
    radius: planet.radius,
    gravity: planet.g,
    hydrographics: planet.hydrographics,
    atmosphere: planet.atmosphere,
    meanTempC: planet.tempC,
    bounds: GLOBE_BOUNDS,
    cells,
    regions: [],
    palette
  };
}
