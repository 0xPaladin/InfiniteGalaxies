import { PRNG } from '../random.js';
import { childSeed, coordSeed } from '../seed.js';
import { makeNoise2D, fbm } from './noise.js';

// A planet's surface (lon/lat -180..180 / -90..90, or an AFMG region's own km
// box) is subdivided into an RxC grid of addressable regions — same idea as
// galaxy sectors, one level down. Regions are coordinates (rx,ry) into this
// grid, not physical positions.
export const REGION_COLS = 12;
export const REGION_ROWS = 6;

/** Which (rx,ry) region a surface-space point (x,y) falls into. */
export function regionCoordsFor(surfaceBounds, x, y) {
  const { minX, maxX, minY, maxY } = surfaceBounds;
  const colW = (maxX - minX) / REGION_COLS;
  const rowH = (maxY - minY) / REGION_ROWS;
  return {
    rx: Math.min(REGION_COLS - 1, Math.max(0, Math.floor((x - minX) / colW))),
    ry: Math.min(REGION_ROWS - 1, Math.max(0, Math.floor((y - minY) / rowH)))
  };
}

function boundsFor(surfaceBounds, rx, ry) {
  const { minX, maxX, minY, maxY } = surfaceBounds;
  const colW = (maxX - minX) / REGION_COLS;
  const rowH = (maxY - minY) / REGION_ROWS;
  return {
    minX: minX + rx * colW, maxX: minX + (rx + 1) * colW,
    minY: minY + ry * rowH, maxY: minY + (ry + 1) * rowH
  };
}

function nearestCell(cells, x, y) {
  let best = null, bestD = Infinity;
  for (const c of cells) {
    const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// In-house terrain refinement: sub-sample the parent surface's nearest cell(s)
// (nearest-neighbor by (x,y) — surface.cells is a point cloud, not an array
// index, see IMPLEMENTATION_PLAN.md §6.1) and layer local detail noise on top.
// Elevation/moisture wobble locally; biome is inherited, not reinvented — a
// mountain region can't render as ocean.
function buildRefinedCells(seed, bounds, parentCells, cols = 40, rows = 20) {
  const rng = new PRNG(childSeed(seed, 'jitter'));
  const elevNoise = makeNoise2D(childSeed(seed, 'detail-elev'));
  const moistNoise = makeNoise2D(childSeed(seed, 'detail-moisture'));
  const colW = (bounds.maxX - bounds.minX) / cols;
  const rowH = (bounds.maxY - bounds.minY) / rows;

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng.rand() - 0.5) * colW;
      const jitterY = (rng.rand() - 0.5) * rowH;
      const x = bounds.minX + (col + 0.5) * colW + jitterX;
      const y = bounds.minY + (row + 0.5) * rowH + jitterY;

      const anchor = nearestCell(parentCells, x, y) || { elev: 0, temp: 0, moisture: 0, biome: 'plains' };
      const elevDetail = fbm(elevNoise, col / cols * 8, row / rows * 8, 3, 0.5, 1);
      const moistDetail = fbm(moistNoise, col / cols * 8 + 50, row / rows * 8 + 50, 3, 0.5, 1);

      cells.push({
        x: +x.toFixed(3),
        y: +y.toFixed(3),
        elev: +(anchor.elev + (elevDetail - 0.5) * 20).toFixed(1),
        moisture: +Math.max(0, (anchor.moisture || 0) + (moistDetail - 0.5) * 20).toFixed(1),
        temp: anchor.temp,
        biome: anchor.biome
      });
    }
  }
  return cells;
}

// Cheap, illustrative local features for the in-house path (AFMGData's own
// region mode supplies real rivers/coastlines instead — see afmg-adapter.js).
function deriveFeatures(cells) {
  if (!cells.length) return [];
  const peak = cells.reduce((a, b) => (b.elev > a.elev ? b : a));
  const wettest = cells.reduce((a, b) => ((b.moisture || 0) > (a.moisture || 0) ? b : a));
  const features = [{ kind: 'peak', x: peak.x, y: peak.y, elev: peak.elev }];
  if (wettest.moisture > 40) features.push({ kind: 'water', x: wettest.x, y: wettest.y, moisture: wettest.moisture });
  return features;
}

const SITE_KINDS = ['settlement', 'outpost', 'ruin', 'marker'];

// Fallback ONLY — used when no habitation data was ever wired in (no
// population/culture context available for this planet). Sites are LOCATIONS
// only — no population, no buildings. Placement is a cheap deterministic
// heuristic biased toward moderate elevation, not a population model.
function pickSites(seed, cells, opts = {}) {
  const count = opts.siteCount ?? 3;
  if (!cells.length || count <= 0) return [];

  const rng = new PRNG(childSeed(seed, 'sites'));
  const idealElev = 40;
  const scored = cells
    .filter(c => c.elev > 5) // skip obviously submerged/basin cells
    .map(c => ({ c, score: -Math.abs(c.elev - idealElev) + rng.range(-8, 8) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(({ c }, i) => ({
    kind: rng.pick(SITE_KINDS),
    x: c.x,
    y: c.y,
    seedHint: childSeed(seed, 'site', i)
  }));
}

// POPULATION_PLAN.md §14.2: real sites are placement/habitation.js's output —
// actual settlements/outposts/stations placed by a culture's bioform, TL, and
// development, not invented from terrain alone. `habitats` is the planet's
// FULL habitat list (from generatePlanetHabitation, unfiltered); this picks
// out only the ones whose surface position falls inside this region.
function sitesFromHabitats(habitats, lonLatBounds) {
  return habitats
    .filter(h => h.pos && h.pos.x >= lonLatBounds.minX && h.pos.x < lonLatBounds.maxX &&
                 h.pos.y >= lonLatBounds.minY && h.pos.y < lonLatBounds.maxY)
    .map(h => ({
      kind: h.type, x: h.pos.x, y: h.pos.y,
      population: h.population, cultureId: h.cultureId, bioform: h.bioform, megastructure: h.megastructure
    }));
}

// A region with no live habitat can still hold a ruin — flavored by a former
// claimant's bioform/TL/extinctionCause (§13.1), not invented from nothing.
// Not every such region shows one (0.3 chance) — a dead culture's whole former
// territory being wall-to-wall ruins would read as noise, not history.
function ruinSiteFromFormerClaims(seed, cells, ctx) {
  if (!ctx || !ctx.formerClaims || !ctx.formerClaims.length || !cells.length) return [];
  const rng = new PRNG(childSeed(seed, 'ruins'));
  if (!rng.p(0.3)) return [];

  const claim = rng.pick(ctx.formerClaims);
  const idealElev = 40;
  let best = null, bestScore = -Infinity;
  for (const c of cells) {
    const score = -Math.abs(c.elev - idealElev) + rng.range(-8, 8);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) return [];

  return [{
    kind: 'ruin', x: best.x, y: best.y,
    cultureId: claim.cultureId, bioform: claim.bioform, extinctionCause: claim.extinctionCause
  }];
}

// Real sites if habitation data was wired in (even an empty array counts —
// "no habitats landed here" still means don't invent placeholder ones); a
// possible ruin if this region falls in formerly-claimed territory; the old
// invented heuristic ONLY as a last resort when no ctx/habitats exist at all
// (a caller that hasn't wired the population layer yet — e.g. a standalone
// test — still gets a renderable region instead of an empty one).
function resolveSites(regionSeed, cells, lonLatBounds, opts) {
  if (opts.habitats != null) {
    const real = sitesFromHabitats(opts.habitats, lonLatBounds);
    return real.length ? real : ruinSiteFromFormerClaims(regionSeed, cells, opts.ctx);
  }
  return pickSites(regionSeed, cells, opts);
}

/**
 * Generate one region of a planet surface. Async — the habitable/AFMG branch
 * genuinely awaits (its own richer region-mode terrain sim), the in-house
 * branch resolves immediately through the same function (IMPLEMENTATION_PLAN.md
 * §4.2's async convention). Pure function of `surface` + coords + opts — no
 * live reference to the parent planet object (§0).
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} rx
 * @param {number} ry
 * @param {{siteCount?: number, habitats?: Array, ctx?: Object}} [opts] -
 *   `habitats` is the planet's full habitat list (population/habitation.js);
 *   `ctx` is that planet's CultureContext (population/context.js), used for
 *   ruin flavor when no habitat lands in this specific region.
 */
export async function generateRegion(surface, rx, ry, opts = {}) {
  const regionSeed = coordSeed(surface.seed, 'region', rx, ry);
  // Habitat positions are always in the PARENT SURFACE's lon/lat space (even for
  // habitable worlds, whose region terrain below uses AFMG's own local km grid) —
  // so site filtering always uses this, never the region's own rendering bounds.
  const lonLatBounds = boundsFor(surface.bounds, rx, ry);

  if (surface.type === 'habitable') {
    const { generateHabitableRegion } = await import('./afmg-adapter.js');
    const afmgRegion = await generateHabitableRegion(regionSeed, opts);
    return {
      seed: regionSeed, rx, ry,
      bounds: afmgRegion.bounds,
      cells: afmgRegion.cells,
      features: afmgRegion.features,
      sites: resolveSites(regionSeed, afmgRegion.cells, lonLatBounds, opts),
      palette: afmgRegion.palette
    };
  }

  const cells = buildRefinedCells(regionSeed, lonLatBounds, surface.cells);
  return {
    seed: regionSeed, rx, ry,
    bounds: lonLatBounds,
    cells,
    features: deriveFeatures(cells),
    sites: resolveSites(regionSeed, cells, lonLatBounds, opts),
    palette: surface.palette
  };
}
