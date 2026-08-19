import { SPECTRAL_COLORS } from '../constants/defaults.js';

export function RogueSector(sector, display, opts = {}) {
    const { width, height } = display._options;
    const step = sector.H / height;

    const tiles = new Map();

    //systems 
    sector.systems.forEach(sys => {
        const { primary, multiplicity } = sys.star;
        const glyph = multiplicity > 1 ? '☉' : '☀';
        const fg = SPECTRAL_COLORS[primary.spectral];

        const { x, y } = sys.pos;
        const sx = Math.floor(x / step);
        const sy = Math.floor(y / step);

        const xy = [sx, sy].join(',');
        tiles.set(xy, sys);

        display.draw(sx, sy, glyph, fg);
    })

    sector.tiles = tiles;
}
