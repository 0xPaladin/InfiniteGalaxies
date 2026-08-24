import { buildSurfaceCells, makeSurface } from './common.js';

// Regolith plains, dust seas, minimal relief — the featureless end of rocky worlds
// (no atmosphere/hydrographics to speak of, so nothing carves the terrain further).
export const PALETTE = {
  regolith: { glyph: '.', fg: '#aa5523', bg: '#000000' },
  dust_sea: { glyph: ',', fg: '#c98a4a', bg: '#000000' },
  rise: { glyph: '^', fg: '#7a5230', bg: '#000000' }
};

function elevation(raw) {
  return +(raw * 30).toFixed(1); // low relief throughout
}
function moisture() {
  return 0;
}
function temperature(lat, elev) {
  const latC = 5 - Math.abs(lat) * 0.6;
  return +(latC - elev * 0.1).toFixed(1);
}
function biome(elev) {
  if (elev > 20) return 'rise';
  if (elev < 8) return 'dust_sea';
  return 'regolith';
}

export const PROFILE = { elevation, moisture, temperature, biome };

export function generateBarren(seed, planet, opts = {}) {
  const cells = buildSurfaceCells(seed, { ...opts, radiusKm: planet.radius }, { elevation, moisture, temperature, biome });
  return makeSurface(seed, planet, { type: 'barren', cells, palette: PALETTE });
}
