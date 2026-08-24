import { childSeed } from '../seed.js';
import { generateRocky } from './rocky.js';
import { generateIcy } from './icy.js';
import { generateHostile } from './hostile.js';
import { generateBarren } from './barren.js';
import { generateAirlessMoon } from './airless-moon.js';
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
    // No surface grid for gas giants — see IMPLEMENTATION_PLAN.md §5 (banded-latitude
    // renderer, no region drill-down). Callers should check `type` before expecting cells.
    return {
      seed: surfaceSeed, type, HI: planet.HI, radius: planet.radius,
      gravity: planet.g, hydrographics: 0, atmosphere: planet.atmosphere,
      meanTempC: planet.tempC, bounds: null, cells: [], regions: [], palette: {}
    };
  }

  if (type === 'habitable') {
    const { generateHabitableSurface } = await loadAfmgAdapter();
    return generateHabitableSurface(surfaceSeed, planet, opts);
  }

  return IN_HOUSE[type](surfaceSeed, planet, opts);
}

export { classify };
