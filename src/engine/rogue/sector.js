import { SPECTRAL_COLORS } from '../constants/defaults.js';
import { project, radialBounds, rectBounds } from './view.js';

// Sector-level habitats have no star of their own (POPULATION_PLAN.md §14) —
// decision #6: they get their own glyph, drawn after stars so they're never
// hidden by a star sharing a tile.
const HABITAT_GLYPHS = {
  'deep space station': { glyph: '▣', fg: '#8ac9ff' },
  'capital ship': { glyph: '◆', fg: '#ffcc55' },
  derelict: { glyph: '×', fg: '#666666' },
  'pirate haven': { glyph: '☠', fg: '#cc4444' }
};

/**
 * Render a generated sector as ASCII. Pure renderer per IMPLEMENTATION_PLAN.md §0:
 * reads `sector`, draws, returns hit-test data — never mutates `sector`.
 *
 * @returns {{index: import('./view.js').TileIndex}}
 */
export function RogueSector(sector, display, opts = {}) {
  const { width, height } = display._options;
  const srcBounds = sector.r ? radialBounds(sector.r) : rectBounds(sector.W, sector.H);

  const index = project(sector.systems, {
    getPos: sys => sys.pos,
    srcBounds,
    width,
    height
  });

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const items = index.at(x, y);
      if (!items.length) continue;

      // Highest multiplicity (brightest-looking) system wins the glyph when stacked.
      const sys = items.reduce((a, b) => (b.star.multiplicity > a.star.multiplicity ? b : a));
      const { primary, multiplicity } = sys.star;
      const stacked = items.length > 1;

      const glyph = multiplicity > 1 ? '☉' : '☀';
      const fg = SPECTRAL_COLORS[primary.spectral];
      const bg = stacked ? '#333333' : '#000000';

      display.draw(x, y, glyph, fg, bg);
    }
  }

  const habitats = (sector.habitation && sector.habitation.habitats) || [];
  if (habitats.length) {
    const habitatIndex = project(habitats, { getPos: h => h.pos, srcBounds, width, height });
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const items = habitatIndex.at(x, y);
        if (!items.length) continue;
        const h = items[0];
        const def = HABITAT_GLYPHS[h.type] || { glyph: '▪', fg: '#aaaaaa' };
        display.draw(x, y, def.glyph, def.fg);
        items.forEach(item => index.add(x, y, item));
      }
    }
  }

  return { index };
}
