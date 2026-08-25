import { childSeed } from '../seed.js';
import { PRNG } from '../random.js';
import { generateRocky } from './rocky.js';
import { generateIcy } from './icy.js';
import { generateHostile } from './hostile.js';
import { generateBarren } from './barren.js';
import { generateAirlessMoon } from './airless-moon.js';
import { GLOBE_BOUNDS } from './common.js';
import { dynamicGridDims, GAS_GIANT_TARGET_SIDE_KM } from './sphere-geo.js';
// Dynamically imported only for the habitable branch — its module graph pulls in
// AFMGData's own CDN dependencies (d3, alea, simplex-noise, ...), which a session
// that never generates a habitable world shouldn't have to fetch.
const loadAfmgAdapter = () => import('./afmg-adapter.js');

/**
 * @typedef {Object} PlanetSurface
 * @property {string} seed
 * @property {'habitable'|'rocky'|'icy'|'hostile'|'barren'|'airless-moon'|'gas giant'} type
 * @property {number} HI - 1..5 from constants/astrophysics.js, reused as-is
 * @property {number} radius
 * @property {string} gravity
 * @property {string|number} hydrographics
 * @property {string} atmosphere
 * @property {string|number} meanTempC
 * @property {{minX:number,maxX:number,minY:number,maxY:number}} bounds
 * @property {Array<{x:number,y:number,elev:number,temp:number,moisture:number,biome:string}>} cells
 * @property {Array} regions
 * @property {Object} palette - biome name -> {glyph, fg, bg}
 */

// Everything below classifies an already-generated planet/moon (galaxy/planet.js
// output — has HI/type/kind/atmosphere/hydrographics/temp from astrophysics.js's
// HI() classifier) into one of the archetypes VISION.md §4.4 asks for. There is no
// second taxonomy here — this only routes to a generator; HI/type/atmosphere remain
// the source of truth.
function classify(planet) {
  // hydrographics comes off astrophysics.js as a numeric string ("0", "20", ...)
  const hydro = Number(planet.hydrographics);

  if (planet.type === 'gas giant' || planet.type === 'brown dwarf') return 'gas giant';

  if (planet.HI <= 2) return 'habitable';

  if (planet.kind === 'moon' && (planet.atmosphere === 'Trace' || planet.atmosphere === 'Crushing') && hydro === 0) {
    return 'airless-moon';
  }

  if (['frigid', 'extremely cold'].includes(planet.temp) && hydro > 0) {
    return 'icy';
  }

  if (planet.atmosphere === 'Crushing' || planet.atmosphere === 'Corrosive' ||
      ['inferno', 'extremely hot'].includes(planet.temp)) {
    return 'hostile';
  }

  if (hydro === 0 || planet.atmosphere === 'Trace') {
    return 'barren';
  }

  return 'rocky';
}

// A coarse jittered lon/lat point cloud, same spirit as common.js's
// buildSurfaceCells but without any of its noise/elevation machinery — a gas
// giant has no terrain to speak of, just position (for the renderer's
// latitude-band coloring, rogue/planet.js) and, now that real cells exist,
// somewhere for a 'gas mine'/'cloud city' habitat to actually be sited
// (previously impossible: pickSiteCell always got an empty cell list).
// GAS_GIANT_TARGET_SIDE_KM keeps cells much bigger/fewer than a real
// planet's, since there's no region to drill into and no fine detail to show.
function buildGasGiantCells(seed, radiusKm) {
  const { cols, rows } = dynamicGridDims(radiusKm, GAS_GIANT_TARGET_SIDE_KM);
  const rng = new PRNG(childSeed(seed, 'gas-giant-jitter'));
  const cellW = 360 / cols, cellH = 180 / rows;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lon = -180 + (col + 0.5) * cellW + (rng.rand() - 0.5) * cellW;
      const lat = -90 + (row + 0.5) * cellH + (rng.rand() - 0.5) * cellH;
      cells.push({ x: +lon.toFixed(2), y: +lat.toFixed(2), elev: 0, temp: 0, moisture: 0, biome: 'band' });
    }
  }
  return cells;
}

const IN_HOUSE = {
  rocky: generateRocky,
  icy: generateIcy,
  hostile: generateHostile,
  barren: generateBarren,
  'airless-moon': generateAirlessMoon
};

/**
 * Generate a renderable surface for any planet/moon, regardless of source.
 * Always async — the habitable/AFMG path genuinely awaits, in-house branches just
 * resolve immediately through the same function, so callers always `await`
 * uniformly (IMPLEMENTATION_PLAN.md §4.2).
 *
 * @param {Object} planet - a generatePlanet()/generateMoon() output
 * @param {Object} [opts]
 * @returns {Promise<PlanetSurface>}
 */
export async function generateSurface(planet, opts = {}) {
  const type = classify(planet);
  const surfaceSeed = childSeed(planet._seed, 'surface');

  if (type === 'gas giant') {
    // A hemisphere-mapped gas giant still has no REGION to drill into (no
    // solid surface — VISION.md §4.3, moons stand in for terrain instead;
    // rogue/planet.js disables cell clicks for this type), but it does now
    // get real (coarse, "bigger cells") surface cells so the hemisphere view
    // can render latitude-band coloring instead of the old flat strip view.
    return {
      seed: surfaceSeed, type, HI: planet.HI, radius: planet.radius,
      gravity: planet.g, hydrographics: 0, atmosphere: planet.atmosphere,
      meanTempC: planet.tempC, bounds: GLOBE_BOUNDS,
      cells: buildGasGiantCells(surfaceSeed, planet.radius || 69911),
      regions: [], palette: {}
    };
  }

  if (type === 'habitable') {
    const { generateHabitableSurface } = await loadAfmgAdapter();
    return generateHabitableSurface(surfaceSeed, planet, opts);
  }

  return IN_HOUSE[type](surfaceSeed, planet, opts);
}

export { classify };
