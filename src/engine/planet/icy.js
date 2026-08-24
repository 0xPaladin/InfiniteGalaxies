import { buildSurfaceCells, makeSurface } from './common.js';

// Ice sheets, fracture/chaos terrain, cryo-plains. Low overall relief with sharp
// fracture ridges; "moisture" here means ice coverage, not liquid water.
export const PALETTE = {
  ice_sheet: { glyph: '*', fg: '#dff2ff', bg: '#000000' },
  cryo_plain: { glyph: '.', fg: '#a7d6e8', bg: '#000000' },
  fracture: { glyph: '≡', fg: '#6fb3d2', bg: '#000000' },
  ridge: { glyph: '^', fg: '#c8e8f5', bg: '#000000' }
};

function elevation(raw) {
  // flatter overall (ice tends to smooth terrain), with occasional sharp fracture ridges
  const flat = raw * 40;
  return +(flat + (raw > 0.85 ? (raw - 0.85) * 400 : 0)).toFixed(1);
}
function moisture(raw) {
  return +(60 + raw * 40).toFixed(1); // mostly ice-covered
}
function temperature(lat, elev) {
  const latC = -60 - Math.abs(lat) * 0.4;
  return +(latC - elev * 0.05).toFixed(1);
}
function biome(elev, moisture) {
  if (elev > 60) return 'ridge';
  if (elev > 25) return 'fracture';
  return moisture > 80 ? 'ice_sheet' : 'cryo_plain';
}

export const PROFILE = { elevation, moisture, temperature, biome };

export function generateIcy(seed, planet, opts = {}) {
  const cells = buildSurfaceCells(seed, { ...opts, radiusKm: planet.radius }, { elevation, moisture, temperature, biome });
  return makeSurface(seed, planet, { type: 'icy', cells, palette: PALETTE });
}
