import { SPECTRAL_COLORS } from '../constants/defaults.js';
import { generateSector } from '../galaxy/sector.js';

const GLYPHS = {
    '.': { type: 'empty space', fg: '#D3D3D3', bg: '#000000' },
};

//create glyphs for stars
Object.entries(SPECTRAL_COLORS).forEach((type, color) => {
    GLYPHS[type] = { type: type + '-type Multiple', fg: '#FFFFFF', bg: color };
    GLYPHS[type.toLowerCase()] = { type: type + '-type', fg: '#FFFFFF', bg: color };
});

function RogueSector(sector, opts) {
    const { step = 10 } = opts;
    const { W, D } = sector;

    const map = new Map();

    //systems 
    sector.systems.forEach(sys => {
        const { primary, multiplicity } = sys.star;
        const glyph = multiplicity > 1 ? primary.spectral.toLowerCase() : primary.spectral;

        const { x, y } = sys.pos;
        const xy = [Math.floor(x / step), Math.floor(y / step)].join('.');

        map[xy] = { glyph, sys };
    })

    return { map, glyphs: GLYPHS };
}

export function RenderSector(app) {
    app.view = 'sector';
    app.currentSystem = null;
    app.map = generateSector(app.sectorSeed, {
        bounds: { w: 1000, h: 1000, d: 1000 }
    });

    app.display.clear();
    app._updateInfo();

    const { systems, H, W } = this.map;
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);

    // Draw star field
    for (const s of systems) {
        const sx = Math.floor(s.pos.x + cx);
        const sy = Math.floor(s.pos.y + cy);
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;

        let glyph = '·';
        let fg = '#888';
        if (s.star && s.star.primary) {
            const st = s.star.primary.spectral;
            if (st) {
                if (st.startsWith('O') || st.startsWith('B')) { glyph = '*'; fg = '#9af'; }
                else if (st.startsWith('A') || st.startsWith('F')) { glyph = '*'; fg = '#bff'; }
                else if (st.startsWith('G') || st.startsWith('K')) { glyph = '∘'; fg = '#ffd'; }
                else { glyph = '·'; fg = '#f80'; }
            }
        }
        // Habitable candidates get a ring
        if (s.star && s.star.primary && s.star.primary.habitable) {
            glyph = '⊙';
            fg = '#0f0';
        }
        this.display.draw(sx, sy, glyph, fg);
    }

    // Crosshair
    this.display.draw(cx, cy, '+', '#fff');
    toast(`Sector ${this.sectorSeed} — ${systems.length} systems`);
}
