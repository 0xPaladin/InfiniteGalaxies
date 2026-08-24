import { buildSurfaceCells, makeSurface } from './common.js';

// Cratered, dry, moderate-relief rocky worlds — the "default" non-habitable rocky
// profile (not icy, not volcanic-hostile, not featureless barren).
const PALETTE = {
  plains: { glyph: '.', fg: '#a89968', bg: '#000000' },
  hills: { glyph: '^', fg: '#8a7048', bg: '#000000' },
  mountain: { glyph: '▲', fg: '#c9c9c9', bg: '#000000' },
  crater: { glyph: '○', fg: '#6b5b3d', bg: '#000000' },
  basin: { glyph: ',', fg: '#5a4a30', bg: '#000000' }
};

function elevation(raw) {
  return +(raw * 100).toFixed(1); // 0..100, no oceans to normalize against
}
function moisture() {
  return 0; // rocky worlds in this profile are dry by definition
}
function temperature(lat, elev) {
  const latC = 20 - Math.abs(lat) * 0.7;
  return +(latC - elev * 0.12).toFixed(1);
}
function biome(elev) {
  if (elev > 80) return 'mountain';
  if (elev > 55) return 'hills';
  if (elev < 12) return 'basin';
  if (elev < 25) return 'crater';
  return 'plains';
}

export function generateRocky(seed, planet, opts = {}) {
  const cells = buildSurfaceCells(seed, opts, { elevation, moisture, temperature, biome });
  return makeSurface(seed, planet, { type: 'rocky', cells, palette: PALETTE });
}
