import { project, radialBounds } from './view.js';
import { populationOf } from '../galaxy/galaxy_gen.js';

// Fallback glyphs/colors for sectors with no culture data (development === 0 —
// unclaimed, or no population sim wired in yet).
const TIER_GLYPH = { core: '☉', settled: '*', frontier: ':', fringe: '.', abandoned: '.' };
const EMPTY_GLYPH = ' ', EMPTY_COLOR = '#000000';
const ABANDONED_COLOR = '#333344';

/**
 * Render a generated galaxy as ASCII. Pure renderer per IMPLEMENTATION_PLAN.md §0:
 * reads `galaxy` (+ the current population snapshot), draws, returns hit-test
 * data — never mutates either input.
 *
 * @param {Object} galaxy - generateGalaxy() output
 * @param {ROT.Display} display
 * @param {{popIndex?: Map, cultures?: Object}} [opts] - popIndex from
 *   population/sim.js's buildSnapshotIndex(); cultures from generatePopulation()'s
 *   `.cultures` registry (for color lookup)
 * @returns {{index: import('./view.js').TileIndex}}
 */
export function RogueGalaxy(galaxy, display, opts = {}) {
  const { width, height } = display._options;
  const srcBounds = radialBounds(galaxy.radius || 1);
  const { popIndex, cultures } = opts;

  const index = project(galaxy.sectors, {
    getPos: s => ({ x: s.gx, y: s.gy }),
    srcBounds,
    width,
    height
  });

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const items = index.at(x, y);
      if (!items.length) continue;

      const sector = items.reduce((a, b) => (populationOf(b, popIndex) > populationOf(a, popIndex) ? b : a));
      const development = populationOf(sector, popIndex);

      if (development <= 0) {
        display.draw(x, y, EMPTY_GLYPH, EMPTY_COLOR);
        continue;
      }

      const cell = popIndex.get(`${sector.gx},${sector.gy}`);
      const glyph = TIER_GLYPH[cell.tier] || '.';
      const color = cell.culture != null && cell.tier !== 'abandoned' && cultures
        ? (cultures[cell.culture]?.color || ABANDONED_COLOR)
        : ABANDONED_COLOR;

      display.draw(x, y, glyph, color);
    }
  }

  return { index };
}
