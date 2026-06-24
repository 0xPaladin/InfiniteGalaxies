export const DEFAULT_SEED = 123;
export const DEFAULT_N = 25000;
export const DEFAULT_P = 20;
export const DEFAULT_JITTER = 0.75;
export const DEFAULT_ROTATION = -1;
export const DEFAULT_DRAW_MODE = 'quads';
export const DEFAULT_PLANET_TYPE = 'earthlike';
export const DEFAULT_BARREN_SUBTYPE = 'barren';
export const DEFAULT_TEMP_OFFSET = 0;
export const DEFAULT_RAIN_OFFSET = 0;
export const DEFAULT_WATER_LEVEL = 0;

export const DEFAULT_DRAW_PLATE_VECTORS = false;
export const DEFAULT_DRAW_PLATE_BOUNDARIES = false;
export const DEFAULT_DRAW_CULTURE_OVERLAY = false;
export const DEFAULT_DRAW_STATE_BORDERS = false;
export const DEFAULT_DRAW_STATE_OVERLAY = false;
export const DEFAULT_DRAW_PROVINCE_OVERLAY = false;
export const DEFAULT_DRAW_PROVINCE_BORDERS = false;
export const DEFAULT_DRAW_BURG_OVERLAY = false;

export const DEFAULT_NUM_CULTURES = 16;
export const DEFAULT_NUM_STATES = 16;
export const DEFAULT_MAX_BURGS = 10000;

export const GAS_GIANT_DEFAULTS = {
    scale: 1,
    turbulence: 2,
    blur: 0.5,
    colorA: '#fff8f0',
    colorB: '#f0e8b0',
    colorC: '#afa0d0',
};

export const BARREN_DEFAULTS = {
    colorA: '#321408',
    colorB: '#aa5523',
    colorC: '#fae6e6',
};

export const AIRLESS_DEFAULTS = {
    colorA: '#555555',
    colorB: '#aaaaaa',
    colorC: '#eeeeee',
};

export const SPECTRAL_COLORS = {
    O: '#6699ff',
    B: '#99bbff',
    A: '#bbddff',
    F: '#fff8e8',
    G: '#fff4b5',
    K: '#ffaa44',
    M: '#ff5533',
    D: '#ffffff',
};

export const SPECTRAL_DEFAULTS = {
    O: { sphereBrightness: 3, glowPower: 4, fresnelPower: 3.5 },
    B: { sphereBrightness: 3, glowPower: 5.5, fresnelPower: 4.5 },
    A: { sphereBrightness: 2, glowPower: 3, fresnelPower: 2 },
    F: { sphereBrightness: 1.1, glowPower: 1, fresnelPower: 0.5 },
    G: { sphereBrightness: 2, glowPower: 7, fresnelPower: 4.5 },
    K: { sphereBrightness: 2.7, glowPower: 5.5, fresnelPower: 2.5 },
    M: { sphereBrightness: 3.5, glowPower: 6, fresnelPower: 6 },
    D: { sphereBrightness: 1.5, glowPower: 5, fresnelPower: 1.5 },
};

export const SUN_DEFAULTS = {
    glowTint: 1.2,
    glowBrightness: 2.5,
    glowFalloff: 2.0,
    glowRadius: 1.5,
    sphereBrightness: 1.5,
    noiseScale: 5.0,
    glowPower: 1.5,
    fresnelPower: 2.0,
    spectralType: 'G',
};

export const SHADER_DEFAULTS = {
    sphereBrightness: 1.5,
    noiseScale: 5.0,
    glowPower: 1.5,
    fresnelPower: 2.0,
    glowTint: 1.2,
    glowBrightness: 2.5,
    glowFalloff: 2.0,
    glowRadius: 1.5,
};

export const COLLISION_THRESHOLD = 0.75;
