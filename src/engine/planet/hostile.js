import { buildSurfaceCells, makeSurface } from './common.js';

// Venus-like: high volcanism, acid/corrosive lowlands, crushing high-pressure
// atmosphere. High relief variance and hot everywhere, not just by latitude.
export const PALETTE = {
  lava_field: { glyph: '≡', fg: '#ff5522', bg: '#220000' },
  volcanic_highland: { glyph: '▲', fg: '#994422', bg: '#220000' },
  acid_lowland: { glyph: '~', fg: '#aacc33', bg: '#220000' },
  scorched_plain: { glyph: '.', fg: '#886644', bg: '#220000' }
};

function elevation(raw) {
  return +(raw * 100).toFixed(1);
}
function moisture(raw, elev) {
  // "moisture" stands in for corrosive/acidic surface liquid, concentrated in lowlands
  return elev < 30 ? +(raw * 80).toFixed(1) : 0;
}
function temperature(lat, elev) {
  // hostile worlds run hot everywhere — greenhouse atmosphere dominates over latitude
  return +(420 - elev * 0.3).toFixed(1);
}
function biome(elev, moisture) {
  if (elev > 75) return 'volcanic_highland';
  if (elev > 45) return 'lava_field';
  return moisture > 30 ? 'acid_lowland' : 'scorched_plain';
}

export const PROFILE = { elevation, moisture, temperature, biome };

export function generateHostile(seed, planet, opts = {}) {
  const cells = buildSurfaceCells(seed, { ...opts, radiusKm: planet.radius }, { elevation, moisture, temperature, biome });
  return makeSurface(seed, planet, { type: 'hostile', cells, palette: PALETTE });
}
