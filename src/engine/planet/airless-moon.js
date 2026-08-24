import { buildSurfaceCells, makeSurface } from './common.js';

// A moon variant of an airless body (VISION.md §4.4): rocky.js with no atmosphere
// to soften anything, so craters and mare basins dominate and temperature swings
// are extreme (no atmosphere to redistribute heat day/night — this is a static
// surface classification, not a day/night simulation, so we just widen the range
// relative to rocky.js's gentler curve).
export const PALETTE = {
  highland: { glyph: '^', fg: '#bbbbbb', bg: '#000000' },
  crater: { glyph: '○', fg: '#888888', bg: '#000000' },
  mare: { glyph: ',', fg: '#555555', bg: '#000000' }
};

function elevation(raw) {
  // sharper contrast than rocky.js — harder crater rims, deeper mare basins
  return +(Math.pow(raw, 1.4) * 110).toFixed(1);
}
function moisture() {
  return 0;
}
function temperature(lat, elev) {
  const latC = 10 - Math.abs(lat) * 1.1; // wider swing, no atmosphere to buffer it
  return +(latC - elev * 0.2).toFixed(1);
}
function biome(elev) {
  if (elev > 65) return 'highland';
  if (elev < 20) return 'mare';
  return 'crater';
}

export const PROFILE = { elevation, moisture, temperature, biome };

export function generateAirlessMoon(seed, planet, opts = {}) {
  const cells = buildSurfaceCells(seed, { ...opts, radiusKm: planet.radius }, { elevation, moisture, temperature, biome });
  return makeSurface(seed, planet, { type: 'airless-moon', cells, palette: PALETTE });
}
