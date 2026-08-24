import { project } from './view.js';

// The `settlement`/`marker` entries are the pickSites() fallback vocabulary
// (region.js, used only when no population/habitation data is wired in); every
// other key is a real habitat type from population/habitat.js's catalog.
export const SITE_GLYPHS = {
  settlement: { glyph: '⌂', fg: '#ffe08a' },
  marker: { glyph: '✦', fg: '#ffffff' },
  ruin: { glyph: '▦', fg: '#aa8866' },
  outpost: { glyph: '▣', fg: '#8ac9ff' },
  'mining outpost': { glyph: '▨', fg: '#c9a86a' },
  'gas mine': { glyph: '▨', fg: '#c9a86a' },
  town: { glyph: '⌂', fg: '#ffe08a' },
  city: { glyph: '⌘', fg: '#ffcc33' },
  'cloud city': { glyph: '⌘', fg: '#ffcc33' },
  dome: { glyph: '◍', fg: '#88ddee' },
  'research station': { glyph: '⚗', fg: '#bb88ff' },
  'orbital station': { glyph: '⊙', fg: '#8ac9ff' },
  shipyard: { glyph: '⚒', fg: '#aaaaaa' },
  'orbital habitat': { glyph: '◎', fg: '#ffdd66' },
  arcology: { glyph: '▲', fg: '#ffdd66' },
  'capital ship': { glyph: '◆', fg: '#ffcc55' }
};
const FEATURE_GLYPHS = {
  peak: { glyph: '▲', fg: '#dddddd' },
  water: { glyph: '≈', fg: '#4499dd' },
  river: { glyph: '~', fg: '#3a7fc9' },
  island: { glyph: 'o', fg: '#c8b878' },
  isle: { glyph: 'o', fg: '#c8b878' },
  continent: { glyph: 'O', fg: '#c8b878' },
  lake: { glyph: '≈', fg: '#4499dd' },
  lake_island: { glyph: 'o', fg: '#c8b878' }
};

function toGrid(x, y, bounds, width, height) {
  const spanX = (bounds.maxX - bounds.minX) || 1;
  const spanY = (bounds.maxY - bounds.minY) || 1;
  const gx = Math.min(width - 1, Math.max(0, Math.floor(((x - bounds.minX) / spanX) * width)));
  const gy = Math.min(height - 1, Math.max(0, Math.floor(((y - bounds.minY) / spanY) * height)));
  return [gx, gy];
}

/**
 * Render a generated region as ASCII. Pure renderer per IMPLEMENTATION_PLAN.md
 * §0: reads `region`, draws, returns hit-test data — never mutates `region`.
 * Sites and features carry a `.kind`; plain terrain cells don't — that's the
 * distinction the click handler uses (no separate bookkeeping needed here).
 *
 * @param {Object} region - generateRegion() output
 * @param {ROT.Display} display
 * @returns {{index: import('./view.js').TileIndex}}
 */
const KM_PER_TILE = 2;

export function RogueRegion(region, display) {
  // Fixed 2km-per-tile: the ROT grid dimensions track the region's own
  // equal-area-square side length (region.js's sideKm), not a constant tile
  // count — a small region reads at native resolution instead of being
  // stretched to fill a fixed grid. `forceSquareRatio: true` (set at app init)
  // keeps it visually square regardless of size.
  const tiles = Math.max(10, Math.round((region.sideKm || 100) / KM_PER_TILE));
  display.setOptions({ width: tiles, height: tiles, fontSize: Math.max(4, Math.min(8, Math.round(900 / tiles))) });
  const { width, height } = display._options;
  const { bounds } = region;

  // `index` is only needed for click hit-testing of the features/sites added
  // to it below — built once via the shared project() helper, unused for the
  // terrain fill (see the direct binning pass just below, which needs to be
  // fast at up to ~60k tiles and a string-keyed Map lookup per tile isn't).
  const index = project(region.cells, {
    getPos: c => ({ x: c.x, y: c.y }),
    srcBounds: bounds,
    width,
    height
  });

  // base layer: terrain, biome-colored. The AFMG mesh is capped at 25000
  // cells for generation speed (afmg-adapter.js) while a large region can ask
  // for far more display tiles (2km/tile) — so plenty of tiles have no source
  // cell landing on them at all. Rather than leave those black, bin every
  // source cell directly into a flat per-tile array (O(cells), no Map), then
  // run a multi-source BFS fill: seed every directly-binned tile, spread each
  // one outward into its still-empty neighbors until the grid is covered.
  // That approximates a real nearest-neighbor rasterization of the point
  // cloud (the correct visual result regardless of source-cell sparsity) —
  // O(tiles) with a small constant factor, no extra AFMG cells needed.
  const spanX = (bounds.maxX - bounds.minX) || 1;
  const spanY = (bounds.maxY - bounds.minY) || 1;
  const destCell = new Array(width * height).fill(null);
  const destElev = new Float32Array(width * height).fill(-Infinity);
  const at = (x, y) => y * width + x;

  const queue = [];
  for (const cell of region.cells) {
    const nx = (cell.x - bounds.minX) / spanX;
    const ny = (cell.y - bounds.minY) / spanY;
    const gx = Math.min(width - 1, Math.max(0, Math.floor(nx * width)));
    const gy = Math.min(height - 1, Math.max(0, Math.floor(ny * height)));
    const k = at(gx, gy);
    if (cell.elev > destElev[k]) {
      if (destElev[k] === -Infinity) queue.push(gx, gy); // seed the fill queue once per tile
      destElev[k] = cell.elev;
      destCell[k] = cell;
    }
  }

  const NEIGHBORS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (let qi = 0; qi < queue.length; qi += 2) {
    const x = queue[qi], y = queue[qi + 1];
    const cell = destCell[at(x, y)];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (destCell[at(nx, ny)]) continue;
      destCell[at(nx, ny)] = cell;
      queue.push(nx, ny);
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const cell = destCell[at(x, y)];
      if (!cell) continue; // only possible if region.cells is empty
      const def = region.palette[cell.biome];
      display.draw(x, y, def ? def.glyph : '?', '#000', def ? def.fg : '#888888');
    }
  }

  // features (rivers, peaks, coastlines, ...) — drawn over terrain
  (region.features || []).forEach(f => {
    const [gx, gy] = toGrid(f.x, f.y, bounds, width, height);
    const def = FEATURE_GLYPHS[f.kind] || { glyph: '+', fg: '#ffffff' };
    display.draw(gx, gy, def.glyph, def.fg);
    index.add(gx, gy, f);
  });

  // sites — drawn last so they're always visible on top
  (region.sites || []).forEach(s => {
    const [gx, gy] = toGrid(s.x, s.y, bounds, width, height);
    const def = SITE_GLYPHS[s.kind] || { glyph: '✦', fg: '#ffffff' };
    display.draw(gx, gy, def.glyph, def.fg);
    index.add(gx, gy, s);
  });

  return { index };
}
