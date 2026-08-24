import * as d3 from 'd3';
import { geoVoronoi } from 'd3-geo-voronoi';

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
const RANGE_KEY_BY_OVERLAY = { elevation: 'elev', temperature: 'temp', moisture: 'moisture' };

function cellColor(cell, surface, overlay, ranges) {
  if (overlay === 'biome' || !cell) {
    const def = cell && surface.palette[cell.biome];
    return def ? def.fg : '#333333';
  }
  const rangeKey = RANGE_KEY_BY_OVERLAY[overlay];
  return ramp(cell[rangeKey], ranges[overlay][0], ranges[overlay][1], OVERLAY_RAMPS[overlay]);
}

function buildProjection(rotateLon, size) {
  return d3.geoOrthographic()
    .rotate([-rotateLon, 0])
    .clipAngle(90)
    .fitSize([size, size], { type: 'Sphere' });
}

// One hemisphere: a filled Voronoi mesh over the planet's surface cells,
// projected orthographically and clipped at the horizon by d3.geoPath — cell
// color only, no glyphs (VISION.md's roguelike feel comes from the surrounding
// chrome/palette, not from drawing characters onto the globe here).
function renderHemisphere(svg, cx, cy, size, surface, voronoi, rotateLon, overlay, ranges, onCellClick) {
  const projection = buildProjection(rotateLon, size);
  const path = d3.geoPath(projection);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

  g.append('path')
    .attr('d', path({ type: 'Sphere' }))
    .attr('fill', '#04070d')
    .attr('stroke', '#345')
    .attr('stroke-width', 1);

  // geoVoronoi's polygons() features are index-aligned with the input point
  // array (surface.cells), NOT tagged with that index on d.properties — using
  // d.properties.index there was always undefined, breaking both cell color
  // lookup and the click handler. Attach the real index ourselves.
  const allCells = voronoi.polygons().features.map((f, i) => Object.assign({ i }, f));

  g.selectAll('path.region-cell')
    .data(allCells)
    .join('path')
    .attr('class', 'region-cell')
    .attr('d', path)
    .attr('fill', d => cellColor(surface.cells[d.i], surface, overlay, ranges))
    .on('click', (event, d) => onCellClick(d.i));

  return g;
}

/**
 * Render a solid planet surface as two side-by-side orthographic hemispheres
 * (near side / far side, POPULATION_PLAN.md request) — tile color only, no
 * glyphs. Pure renderer per IMPLEMENTATION_PLAN.md §0: reads `surface`, draws
 * into `container`, and drives clicks through `opts.onCellClick` directly
 * (d3's native per-element event binding, rather than the ROT-renderer TileIndex
 * hit-test pattern the ASCII levels use — appropriate here since d3 owns the
 * DOM elements being clicked).
 */
function renderSurface(surface, container, opts) {
  const overlay = opts.overlay || 'biome';
  const hostW = container.clientWidth || 900;
  const hostH = container.clientHeight || 560;
  const size = Math.max(240, Math.min(hostW / 2 - 30, hostH - 30));
  const gap = 24;
  const totalW = size * 2 + gap;
  const totalH = size + 20;

  const svg = d3.select(container).append('svg')
    .attr('width', totalW).attr('height', totalH)
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .style('max-width', '100%').style('max-height', '100%');

  const ranges = {
    elevation: cellRange(surface.cells, 'elev'),
    temperature: cellRange(surface.cells, 'temp'),
    moisture: cellRange(surface.cells, 'moisture')
  };

  const points = surface.cells.map((c, i) => ({
    type: 'Feature',
    properties: { index: i },
    geometry: { type: 'Point', coordinates: [c.x, c.y] }
  }));
  const voronoi = geoVoronoi(points);
  const onCellClick = opts.onCellClick || (() => {});

  renderHemisphere(svg, 0, 0, size, surface, voronoi, 0, overlay, ranges, onCellClick);
  svg.append('text').attr('class', 'hemisphere-label').attr('x', size / 2).attr('y', size + 16).text('0° meridian');

  renderHemisphere(svg, size + gap, 0, size, surface, voronoi, 180, overlay, ranges, onCellClick);
  svg.append('text').attr('class', 'hemisphere-label').attr('x', size + gap + size / 2).attr('y', size + 16).text('180° meridian');

  return {};
}

// A gas giant has no surface cells (VISION.md §4.3: moons stand in for terrain
// to descend into) — horizontal color bands plus its moons as clickable dots,
// same information as the old ASCII renderer, drawn with the same technology
// as the surface view above so the planet level is consistently d3-driven.
function renderGasGiant(planet, container, opts) {
  const size = Math.max(240, Math.min(container.clientWidth || 480, container.clientHeight || 480));
  const svg = d3.select(container).append('svg')
    .attr('width', size).attr('height', size)
    .attr('viewBox', `0 0 ${size} ${size}`)
    .style('max-width', '100%').style('max-height', '100%');

  const colors = Array.isArray(planet.color) ? planet.color : [planet.color, planet.color];
  const bands = 24;
  const bandH = size / bands;
  for (let i = 0; i < bands; i++) {
    svg.append('rect')
      .attr('x', 0).attr('y', i * bandH).attr('width', size).attr('height', bandH + 1)
      .attr('fill', colors[i % colors.length]);
  }

  const moons = planet.moons || [];
  if (moons.length) {
    const maxAu = Math.max(1, ...moons.map(m => m.pos.au));
    const scale = (size / 2 * 0.85) / (maxAu * 1.15);
    const cx = size / 2, cy = size / 2;
    const onMoonClick = opts.onMoonClick || (() => {});

    svg.selectAll('circle.moon')
      .data(moons)
      .join('circle')
      .attr('class', 'region-cell')
      .attr('cx', m => cx + m.pos.x * scale)
      .attr('cy', m => cy + m.pos.y * scale)
      .attr('r', 5)
      .attr('fill', m => (m.HI === 1 ? '#228B22' : m.HI === 2 ? '#1E90FF' : '#cccccc'))
      .on('click', (event, m) => onMoonClick(m));
  }

  return {};
}

/**
 * Top-level planet-view renderer — dispatches on surface.type. Pure per §0.
 * `container` is a plain DOM element (this level renders via d3/SVG, not
 * ROT.Display — see rogue.js's level-switch), cleared and redrawn each call.
 *
 * @param {Object} planet - generatePlanet()/generateMoon() output
 * @param {import('../planet/types.js').PlanetSurface} surface - generateSurface(planet) output
 * @param {HTMLElement} container
 * @param {{overlay?: string, onCellClick?: (cellIndex:number)=>void, onMoonClick?: (moon:Object)=>void}} [opts]
 */
export function RoguePlanet(planet, surface, container, opts = {}) {
  container.innerHTML = '';
  return surface.type === 'gas giant'
    ? renderGasGiant(planet, container, opts)
    : renderSurface(surface, container, opts);
}
