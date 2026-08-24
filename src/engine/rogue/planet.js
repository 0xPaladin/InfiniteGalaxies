import { project, radialBounds, TileIndex } from './view.js';

// ── color helpers (renderer-local derived data — §0: computed here, not stored
// on the generated object) ──────────────────────────────────────────────────
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function lerpColor(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}
function ramp(value, min, max, stops) {
  if (value == null || !isFinite(value)) return stops[0];
  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const scaled = t * (stops.length - 1);
  const i0 = Math.floor(scaled), i1 = Math.min(stops.length - 1, i0 + 1);
  return lerpColor(stops[i0], stops[i1], scaled - i0);
}
function cellRange(cells, key) {
  let min = Infinity, max = -Infinity;
  cells.forEach(c => {
    const v = c[key];
    if (v == null || !isFinite(v)) return;
    if (v < min) min = v;
    if (v > max) max = v;
  });
  if (!isFinite(min)) { min = 0; max = 1; }
  return [min, max];
}

const OVERLAY_RAMPS = {
  elevation: ['#0a2a0a', '#3a6e2a', '#a08a3a', '#ffffff'],
  temperature: ['#2255ff', '#88ccff', '#ffcc55', '#ff3311'],
  moisture: ['#7a5a2a', '#8ac93a', '#2288dd']
};

/**
 * Render a habitable/in-house planet surface (point-cloud cells) as ASCII.
 * Pure renderer per IMPLEMENTATION_PLAN.md §0: reads `surface`, draws, returns
 * hit-test data — never mutates `surface`.
 *
 * @param {import('../planet/types.js').PlanetSurface} surface
 * @param {ROT.Display} display
 * @param {{overlay?: 'biome'|'elevation'|'temperature'|'moisture'|'regions'}} [opts]
 * @returns {{index: TileIndex}}
 */
function renderSurface(surface, display, opts = {}) {
  const overlay = opts.overlay || 'biome';
  const { width, height } = display._options;
  const srcBounds = surface.bounds;

  const index = project(surface.cells, {
    getPos: c => ({ x: c.x, y: c.y }),
    srcBounds,
    width,
    height
  });

  const ranges = {
    elevation: cellRange(surface.cells, 'elev'),
    temperature: cellRange(surface.cells, 'temp'),
    moisture: cellRange(surface.cells, 'moisture')
  };
  const rangeKeyByOverlay = { elevation: 'elev', temperature: 'temp', moisture: 'moisture' };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const items = index.at(x, y);
      if (!items.length) continue;

      // Highest elevation wins when multiple cells land in one terminal cell.
      const cell = items.reduce((a, b) => (b.elev > a.elev ? b : a));
      const def = surface.palette[cell.biome];
      const glyph = def ? def.glyph : '?';

      let fg;
      if (overlay === 'biome' || overlay === 'regions') {
        fg = def ? def.fg : '#888888';
      } else {
        const rangeKey = rangeKeyByOverlay[overlay];
        fg = ramp(cell[rangeKey], ranges[overlay][0], ranges[overlay][1], OVERLAY_RAMPS[overlay]);
      }

      display.draw(x, y, glyph, fg);
    }
  }

  return { index };
}

/**
 * Render a gas giant: horizontal color bands (no surface cells — a gas giant has
 * no terrain to walk) plus, if it has moons, their orbital positions overlaid so
 * the player can navigate to one (VISION.md §4.3 note: gas giants offer moons
 * instead of a surface to descend into).
 *
 * @param {Object} planet - the generatePlanet() output (for `.color`/`.moons`;
 *   `surface` itself carries no cells/moons for gas giants, see planet/types.js)
 */
function renderGasGiant(planet, display) {
  const side = 40;
  display.setOptions({ width: side, height: side, fontSize: 16 });

  const colors = Array.isArray(planet.color) ? planet.color : [planet.color, planet.color];
  for (let y = 0; y < side; y++) {
    const band = Math.floor(y / 3) % colors.length;
    for (let x = 0; x < side; x++) {
      display.draw(x, y, '▒', colors[band]);
    }
  }

  const index = new TileIndex();
  const moons = planet.moons || [];
  if (moons.length) {
    const maxAu = Math.max(1, ...moons.map(m => m.pos.au));
    const srcBounds = radialBounds(maxAu * 1.15);
    const moonIndex = project(moons, {
      getPos: m => ({ x: m.pos.x, y: m.pos.y }),
      srcBounds,
      width: side,
      height: side
    });

    for (let x = 0; x < side; x++) {
      for (let y = 0; y < side; y++) {
        const items = moonIndex.at(x, y);
        if (!items.length) continue;
        const moon = items[0];
        display.draw(x, y, '○', moon.HI === 1 ? '#228B22' : moon.HI === 2 ? '#1E90FF' : '#cccccc');
        items.forEach(m => index.add(x, y, m));
      }
    }
  }

  return { index };
}

/**
 * Top-level planet-view renderer — dispatches on surface.type. Pure per §0.
 *
 * @param {Object} planet - generatePlanet()/generateMoon() output
 * @param {import('../planet/types.js').PlanetSurface} surface - generateSurface(planet) output
 * @param {ROT.Display} display
 * @param {{overlay?: string}} [opts]
 * @returns {{index: TileIndex}}
 */
export function RoguePlanet(planet, surface, display, opts = {}) {
  if (surface.type === 'gas giant') {
    return renderGasGiant(planet, display);
  }

  display.setOptions({ width: 120, height: 60, fontSize: 8 });
  return renderSurface(surface, display, opts);
}
