import { SPECTRAL_COLORS } from '../constants/defaults.js';

const GLYPHS = {
    '.': { type: 'empty space', fg: '#D3D3D3', bg: '#000000' },
    'o': { type: 'rocky', fg: '#977402', bg: '#000000' },
};

export function RogueSystem(system, display, opts) {
    const { star, planets, HI } = system;
    const order = [];

    let placed = 0;
    const orbitPosition = (au) => {
        const [cx, cy] = [display._options.width / 2, display._options.height / 2];
        const angle = 360 * (placed % 8) / 8;
        const radians = Math.PI * angle;
        const x = Math.round(cx + au * Math.cos(angle));
        const y = Math.round(cx + au * Math.sin(angle));
        placed++;
        return { x, y };
    }

    //get stars 
    [star.primary, ...star.companions].forEach(s => {
        const glyph = '🟏';
        const fg = SPECTRAL_COLORS[s.spectral];

        if (s.role === 'primary') {
            order.push([s, 0, glyph, fg]);
        }
        else {
            order.push([s, s.separationAU, glyph, fg]);
        }
    })

    //planets
    planets.forEach(p => {
        const glyph = p.type === 'gas giant' ? '⬤' : '●';
        const fg = p.HI === 1 ? '#228B22' : p.HI === 2 ? '#1E90FF' : p.color[0];
        order.push([p, p.orbit, glyph, fg]);
    })

    const newD = (order.length + 1) * 3;
    display.setOptions({
        width: newD,
        height: newD,
        fontSize: 20
    });

    const tiles = new Map();

    //now sort order and display
    order.sort((a, b) => a[1] - b[1]).forEach(([obj, au, glyph, fg], i) => {
        const { x, y } = orbitPosition(i * 2); // fixes spacing for display
        display.draw(x, y, glyph, fg);

        const xy = [x, y].join(',');
        tiles.set(xy, obj);
    })

    system.tiles = tiles;
}