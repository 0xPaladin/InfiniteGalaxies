import { PROFILE as ROCKY_PROFILE, PALETTE as ROCKY_PALETTE } from './rocky.js';
import { PROFILE as ICY_PROFILE, PALETTE as ICY_PALETTE } from './icy.js';
import { PROFILE as HOSTILE_PROFILE, PALETTE as HOSTILE_PALETTE } from './hostile.js';
import { PROFILE as BARREN_PROFILE, PALETTE as BARREN_PALETTE } from './barren.js';
import { PROFILE as AIRLESS_MOON_PROFILE, PALETTE as AIRLESS_MOON_PALETTE } from './airless-moon.js';

// Lets region.js reuse each in-house planet type's own (lat,elev)-calibrated
// moisture/temperature/biome logic when generating that type's regions — see
// rocky.js's PROFILE comment for why this matters (AFMG's own biome classifier
// assumes an Earth-like water cycle that doesn't fit a barren/hostile/airless world).
export const PROFILES = {
  rocky: ROCKY_PROFILE,
  icy: ICY_PROFILE,
  hostile: HOSTILE_PROFILE,
  barren: BARREN_PROFILE,
  'airless-moon': AIRLESS_MOON_PROFILE
};

export const PALETTES = {
  rocky: ROCKY_PALETTE,
  icy: ICY_PALETTE,
  hostile: HOSTILE_PALETTE,
  barren: BARREN_PALETTE,
  'airless-moon': AIRLESS_MOON_PALETTE
};

// Biomes that represent a body of liquid (or quasi-liquid — lava, acid) rather
// than solid terrain: icy.js's ice_sheet, hostile.js's lava_field/acid_lowland.
// rogue/planet.js and rogue/region.js render every other non-habitable biome
// with elevation-binned shading (elevation-color.js) instead of a fixed
// palette color, but these stay their own distinct fixed color regardless of
// elevation — a "body of water" reads as a body of water, not as just another
// elevation band, the same way habitable worlds' oceans aren't elevation-shaded.
export const WATER_BIOMES = new Set(['ice_sheet', 'lava_field', 'acid_lowland']);
