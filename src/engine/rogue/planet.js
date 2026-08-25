import * as d3 from 'd3';
import { geoVoronoi } from 'd3-geo-voronoi';
import { SITE_GLYPHS } from './region.js';
import { elevationBandColor } from './elevation-color.js';

// Non-habitable in-house types (rocky/icy/hostile/barren/airless-moon) always
// render elevation-binned (see elevation-color.js), not by biome/overlay —
// habitable stays AFMG-biome-driven, gas giant stays latitude-band-driven.
const NON_HABITABLE_TYPES = new Set(['rocky', 'icy', 'hostile', 'barren', 'airless-moon']);

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

// A gas giant's cells carry no real elevation/biome (types.js's
// buildGasGiantCells — position only, "bigger cells" than a real planet's,
// no region to drill into) — color comes from latitude band instead, same
// striped-band look the old flat renderer had, just per-cell now so it
// follows the same hemisphere/Voronoi mesh solid planets use. `bandColors`
// is the planet's own 1-2 hue set (galaxy/planet.js), not stored on the
// generated surface — same "computed here" spirit as everything else below.
const GAS_GIANT_BANDS = 24;
function gasGiantBandColor(lat, bandColors) {
  const colors = Array.isArray(bandColors) && bandColors.length ? bandColors : ['#c9a86a', '#8a6d4a'];
  const t = Math.min(1, Math.max(0, (90 - lat) / 180)); // 0 at north pole -> 1 at south, matches old top-to-bottom stripe order
  const band = Math.min(GAS_GIANT_BANDS - 1, Math.floor(t * GAS_GIANT_BANDS));
  return colors[band % colors.length];
}

function cellColor(cell, surface, overlay, ranges, bandColors) {
  if (surface.type === 'gas giant') {
    return cell ? gasGiantBandColor(cell.y, bandColors) : '#333333';
  }
  if (NON_HABITABLE_TYPES.has(surface.type)) {
    const base = Array.isArray(bandColors) ? bandColors[0] : bandColors;
    return cell ? elevationBandColor(cell.elev, base) : '#333333';
  }
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
// color only for terrain (VISION.md's roguelike feel comes from the
// surrounding chrome/palette, not from drawing characters onto the globe
// here) but real habitats DO get a marker glyph (see below) so a settled
// world reads as settled at a glance, before drilling into any one region.
function renderHemisphere(svg, cx, cy, size, surface, voronoi, rotateLon, overlay, ranges, onCellClick, habitats, bandColors) {
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
    .attr('fill', d => cellColor(surface.cells[d.i], surface, overlay, ranges, bandColors))
    .on('click', (event, d) => onCellClick(d.i));

  // Habitat markers: orbital habitats (stations, shipyards, ...) have no
  // surface position (`pos: null`) and aren't drawn here. A ground habitat is
  // only ever facing ONE of the two hemispheres at a time — same visibility
  // test d3.geoOrthographic's own clipAngle(90) path clipping uses (within
  // 90 degrees of this hemisphere's sub-observer point).
  const onSurface = (habitats || []).filter(h => h.pos);
  const visible = onSurface.filter(h => d3.geoDistance([h.pos.x, h.pos.y], [rotateLon, 0]) < Math.PI / 2);
  if (visible.length) {
    g.selectAll('text.habitat-marker')
      .data(visible)
      .join('text')
      .attr('class', 'habitat-marker')
      .attr('x', h => projection([h.pos.x, h.pos.y])[0])
      .attr('y', h => projection([h.pos.x, h.pos.y])[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 13)
      .attr('paint-order', 'stroke')
      .attr('stroke', '#000000')
      .attr('stroke-width', 2)
      .attr('fill', h => (SITE_GLYPHS[h.type] || SITE_GLYPHS.marker).fg)
      .text(h => (SITE_GLYPHS[h.type] || SITE_GLYPHS.marker).glyph);
  }

  return g;
}

// A gas giant's moons orbit it in space — they aren't points ON its surface,
// so unlike habitat/ruin/native markers they can't be projected through the
// hemisphere's geoOrthographic projection at all. Drawn as a separate
// top-down orbital scatter beneath the two hemispheres instead (same layout
// the old flat-band renderer used), scaled by AU like the system view's own
// orbital scatter. Solid planets' moons aren't shown here (out of scope —
// gas giants are the only type with no region to drill into, so descending
// via a moon is their ONLY way down; VISION.md §4.3).
function renderMoonStrip(svg, cx, cy, size, moons, onMoonClick) {
  const maxAu = Math.max(1, ...moons.map(m => m.pos.au));
  const scale = (size / 2 * 0.85) / (maxAu * 1.15);
  const ccx = cx + size / 2, ccy = cy + size / 2;

  svg.selectAll('circle.moon')
    .data(moons)
    .join('circle')
    .attr('class', 'region-cell')
    .attr('cx', m => ccx + m.pos.x * scale)
    .attr('cy', m => ccy + m.pos.y * scale)
    .attr('r', 5)
    .attr('fill', m => (m.HI === 1 ? '#228B22' : m.HI === 2 ? '#1E90FF' : '#cccccc'))
    .on('click', (event, m) => onMoonClick(m));
}

/**
 * Render a planet surface as two side-by-side orthographic hemispheres (near
 * side / far side, POPULATION_PLAN.md request) — tile color only, no glyphs
 * beyond the habitat/ruin/native markers. Pure renderer per
 * IMPLEMENTATION_PLAN.md §0: reads `surface`, draws into `container`, and
 * drives clicks through `opts.onCellClick` directly (d3's native per-element
 * event binding, rather than the ROT-renderer TileIndex hit-test pattern the
 * ASCII levels use — appropriate here since d3 owns the DOM elements being
 * clicked). Gas giants (`surface.type === 'gas giant'`) use the same
 * hemisphere mesh — colored by latitude band instead of biome/overlay (see
 * cellColor) — but cell clicks are disabled (no solid surface, no region to
 * drill into) and, if `opts.moons` is non-empty, an orbital moon scatter
 * renders beneath the hemispheres as the actual way down.
 */
function renderSurface(surface, container, opts) {
  const overlay = opts.overlay || 'biome';
  const isGasGiant = surface.type === 'gas giant';
  const moons = isGasGiant ? (opts.moons || []) : [];
  const hostW = container.clientWidth || 900;
  const hostH = container.clientHeight || 560;
  const moonStripH = moons.length ? 90 : 0;
  const size = Math.max(240, Math.min(hostW / 2 - 30, hostH - 30 - moonStripH));
  const gap = 24;
  const totalW = size * 2 + gap;
  const totalH = size + 20 + moonStripH;

  const svg = d3.select(container).append('svg')
    .attr('width', totalW).attr('height', totalH)
    .attr('viewBox', `0 0 ${totalW} ${totalH}`)
    .style('max-width', '100%').style('max-height', '100%');

  const ranges = isGasGiant ? null : {
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
  const onCellClick = isGasGiant ? (() => {}) : (opts.onCellClick || (() => {}));
  const habitats = opts.habitats || [];
  const bandColors = opts.bandColors;

  renderHemisphere(svg, 0, 0, size, surface, voronoi, 0, overlay, ranges, onCellClick, habitats, bandColors);
  svg.append('text').attr('class', 'hemisphere-label').attr('x', size / 2).attr('y', size + 16).text('0° meridian');

  renderHemisphere(svg, size + gap, 0, size, surface, voronoi, 180, overlay, ranges, onCellClick, habitats, bandColors);
  svg.append('text').attr('class', 'hemisphere-label').attr('x', size + gap + size / 2).attr('y', size + 16).text('180° meridian');

  if (moons.length) {
    const stripSize = Math.min(totalW, moonStripH) - 10;
    renderMoonStrip(svg, (totalW - stripSize) / 2, size + 30, stripSize, moons, opts.onMoonClick || (() => {}));
  }

  return {};
}

/**
 * Top-level planet-view renderer. Pure per §0. `container` is a plain DOM
 * element (this level renders via d3/SVG, not ROT.Display — see rogue.js's
 * level-switch), cleared and redrawn each call.
 *
 * @param {Object} planet - generatePlanet()/generateMoon() output
 * @param {import('../planet/types.js').PlanetSurface} surface - generateSurface(planet) output
 * @param {HTMLElement} container
 * @param {{overlay?: string, onCellClick?: (cellIndex:number)=>void, onMoonClick?: (moon:Object)=>void, habitats?: Array}} [opts] -
 *   `habitats` (population/habitation.js's generatePlanetHabitation output,
 *   plus rogue.js's ruin/native markers) get a marker glyph on whichever
 *   hemisphere they're actually facing; entries with `pos: null` (orbital
 *   habitats — no surface position) are skipped. `bandColors`/`moons` are
 *   only used for a gas giant (planet.color / planet.moons) — harmless to
 *   pass for any other type, since they're simply never read there.
 */
export function RoguePlanet(planet, surface, container, opts = {}) {
  container.innerHTML = '';
  return renderSurface(surface, container, { ...opts, bandColors: planet.color, moons: planet.moons });
}
