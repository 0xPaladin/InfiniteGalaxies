import { SPECTRAL_COLORS } from '../constants/defaults.js';

const GLYPHS = {
    '.': { type: 'empty space', fg: '#D3D3D3', bg: '#000000' },
};

//create glyphs for stars
Object.entries(SPECTRAL_COLORS).forEach((type, color) => {
    GLYPHS[type] = { type: type + '-type Multiple', fg: '#FFFFFF', bg: color };
    GLYPHS[type.toLowerCase()] = { type: type + '-type', fg: '#FFFFFF', bg: color };
});

export function RogueSector(sector, opts) {
    const { step = 10 } = opts;
    const { W, D } = sector;

    const map = new Map();

    //systems 
    sector.systems.forEach(sys => {
        const { primary, multiplicity } = sys.star;
        const glyph = multiplicity > 1 ? primary.spectral.toLowerCase() : primary.spectral;

        const { x, y } = sys.pos;
        const xy = [Math.floor(x / step), Math.floor(y / step)].join('.');

        map[xy] = { glyph, data };
    })

    return { map, glyphs: GLYPHS };
}
