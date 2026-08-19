import { SPECTRAL_COLORS } from '../constants/defaults.js';

const GLYPHS = {
    '.': { type: 'empty space', fg: '#D3D3D3', bg: '#000000' },
};

export function RogueSystem(system, opts) {
    return { map, glyphs: GLYPHS };
}
