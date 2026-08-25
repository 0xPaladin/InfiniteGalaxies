// Elevation-binned shading shared by the planet hemisphere view
// (rogue/planet.js) and the region view (rogue/region.js) for every
// non-habitable surface (rocky/icy/hostile/barren/airless-moon) — dark at low
// elevation, light at high, BINNED in coarse 0.1 steps (10 bands across the
// 0..100 elev scale) rather than a smooth ramp, so a world reads as
// terraced/topographic instead of photorealistic. Uses that planet's own base
// color (galaxy/planet.js's `color`) as the hue, so each non-habitable world
// still has its own visual identity — same idea gas giants' band coloring
// already uses, just dark->light instead of alternating stripes.

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function lerpColor(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

const STEP = 0.1;
const BANDS = 10; // 0.0, 0.1, ..., 0.9

/**
 * @param {number} elev - 0..100 (this codebase's standard elevation scale —
 *   see common.js's buildSurfaceCells / AFMG's own 0..100 h scale)
 * @param {string} baseColor - the planet's own hex color (galaxy/planet.js)
 * @returns {string} hex
 */
export function elevationBandColor(elev, baseColor) {
  const base = baseColor || '#8a7048';
  const maxBin = STEP * (BANDS - 1); // 0.9 -- the top bin's floor
  const t = Math.max(0, Math.min(1, (elev ?? 0) / 100));
  // floor(1/0.1) can land on 9 or 10 depending on floating-point rounding at
  // exactly t=1 -- clamp explicitly rather than rely on that edge case.
  const binned = Math.min(maxBin, Math.floor(t / STEP) * STEP);
  const lightness = binned / maxBin; // 0..1 across the 10 bins

  const dark = lerpColor(base, '#000000', 0.65);
  const light = lerpColor(base, '#ffffff', 0.55);
  return lerpColor(dark, light, lightness);
}
