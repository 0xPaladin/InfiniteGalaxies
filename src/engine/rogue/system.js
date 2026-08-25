import { SPECTRAL_COLORS } from '../constants/defaults.js';
import { project, radialBounds } from './view.js';

// Terrestrial vs gas giant stays a fixed small/large circle pair regardless
// of content (existing visual language, unchanged); a planet with anything
// to find on it (habitats, ruins, a possible native culture — see rogue.js's
// _planetHasContent, `opts.hasContent` here) draws solid-filled, an empty one
// draws hollow/outlined. Deliberately ONE combined "has content" flag, not a
// separate glyph per content type — what's actually there stays a surprise
// until you visit, same as region-level content already is.
const PLANET_GLYPH = {
  terrestrial: { empty: '○', content: '●' },
  'gas giant': { empty: '◯', content: '⬤' }
};

/**
 * Render a generated system as ASCII. Pure renderer per IMPLEMENTATION_PLAN.md §0:
 * reads `system`, draws, returns hit-test data — never mutates `system`.
 * Orbital positions (`.pos`) are assigned at generation time in galaxy/system.js —
 * this renderer only projects them onto the grid.
 *
 * @param {{hasContent?: (planet:Object)=>boolean}} [opts] - `hasContent` decides
 *   solid-vs-outline (see PLANET_GLYPH above); omitted/no-op means every
 *   planet draws solid, same as before this distinction existed.
 * @returns {{index: import('./view.js').TileIndex}}
 */
export function RogueSystem(system, display, opts = {}) {
  const { star, planets } = system;
  const bodies = [star.primary, ...star.companions, ...planets];
  const isStar = obj => obj.kind === 'star';
  const hasContent = opts.hasContent || (() => true);

  const maxAu = Math.max(1, ...bodies.map(b => b.pos.au));
  const side = Math.max(9, Math.min(60, (bodies.length + 1) * 3));
  display.setOptions({ width: side, height: side, fontSize: 20 });

  const srcBounds = radialBounds(maxAu * 1.05);
  const index = project(bodies, {
    getPos: obj => ({ x: obj.pos.x, y: obj.pos.y }),
    srcBounds,
    width: side,
    height: side
  });

  for (let x = 0; x < side; x++) {
    for (let y = 0; y < side; y++) {
      const items = index.at(x, y);
      if (!items.length) continue;

      // Prefer a star over a planet when stacked (the more informative glyph).
      const obj = items.find(isStar) || items[0];

      if (isStar(obj)) {
        display.draw(x, y, '🟏', SPECTRAL_COLORS[obj.spectral]);
      } else {
        const glyphSet = obj.type === 'gas giant' ? PLANET_GLYPH['gas giant'] : PLANET_GLYPH.terrestrial;
        const glyph = hasContent(obj) ? glyphSet.content : glyphSet.empty;
        const color = Array.isArray(obj.color) ? obj.color[0] : obj.color;
        const fg = obj.HI === 1 ? '#228B22' : obj.HI === 2 ? '#1E90FF' : color;
        display.draw(x, y, glyph, fg);
      }
    }
  }

  return { index };
}
