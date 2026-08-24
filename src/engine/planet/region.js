import { PRNG } from '../random.js';
import { childSeed, coordSeed } from '../seed.js';
import { makeNoise2D, fbm } from './noise.js';
import { prepareCellTerrain } from './cell-terrain.js';
import { PROFILES } from './profiles.js';
import { biasHabitableRegion } from './habitable-biome.js';

/** Nearest surface cell's INDEX to a clicked surface-space point (x,y) — the region for that click. */
export function regionCellIndexFor(surface, x, y) {
  let bestI = -1, bestD = Infinity;
  surface.cells.forEach((c, i) => {
    const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d < bestD) { bestD = d; bestI = i; }
  });
  return bestI;
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

function pickLocalCell(cells, rng, idealElev = 40) {
  if (!cells.length) return null;
  let best = null, bestScore = -Infinity;
  for (const c of cells) {
    const score = -Math.abs(c.elev - idealElev) + rng.range(-8, 8);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// POPULATION_PLAN.md §14.2: real sites are placement/habitation.js's output —
// actual settlements/outposts/stations placed by a culture's bioform, TL, and
// development, not invented from terrain alone. `habitats` is the planet's
// FULL habitat list (from generatePlanetHabitation, unfiltered); a habitat
// belongs to THIS region if its `pos` is that literal parent surface cell
// (habitation.js's pickSiteCell copies a surface cell's x/y verbatim, so exact
// match — not a bounds test — is the correct test now that a region IS one cell).
// Matched habitats are then sited on a plausible LOCAL cell within the
// region's own newly-generated terrain (not literally "at" the parent cell's
// lon/lat, which has no meaning in the region's local km coordinate space).
function sitesFromHabitats(habitats, parentCell, localCells, seed) {
  const matched = habitats.filter(h => h.pos &&
    Math.abs(h.pos.x - parentCell.x) < 1e-6 && Math.abs(h.pos.y - parentCell.y) < 1e-6);
  if (!matched.length) return [];

  const rng = new PRNG(childSeed(seed, 'site-placement'));
  return matched.map((h, i) => {
    const local = pickLocalCell(localCells, new PRNG(childSeed(seed, 'site-placement', i)));
    return {
      kind: h.type, x: local ? local.x : 0, y: local ? local.y : 0,
      population: h.population, cultureId: h.cultureId, bioform: h.bioform, megastructure: h.megastructure
    };
  });
}

// A region with no live habitat can still hold a ruin — flavored by a former
// claimant's bioform/TL/extinctionCause (§13.1), not invented from nothing.
// Not every such region shows one (0.3 chance) — a dead culture's whole former
// territory being wall-to-wall ruins would read as noise, not history.
function ruinSiteFromLocalCells(seed, localCells, ctx) {
  if (!ctx || !ctx.formerClaims || !ctx.formerClaims.length || !localCells.length) return [];
  const rng = new PRNG(childSeed(seed, 'ruins'));
  if (!rng.p(0.3)) return [];

  const claim = rng.pick(ctx.formerClaims);
  const best = pickLocalCell(localCells, rng);
  if (!best) return [];

  return [{
    kind: 'ruin', x: best.x, y: best.y,
    cultureId: claim.cultureId, bioform: claim.bioform, extinctionCause: claim.extinctionCause
  }];
}

// Real sites if habitation data was wired in (even an empty array counts —
// "no habitats landed here" still means don't invent placeholder ones); a
// possible ruin if this region's parent cell falls in formerly-claimed
// territory; the old invented heuristic ONLY as a last resort when no
// ctx/habitats exist at all (a caller that hasn't wired the population layer
// yet — e.g. a standalone test — still gets a renderable region, not an empty one).
function resolveSites(regionSeed, parentCell, localCells, opts) {
  if (opts.habitats != null) {
    const real = sitesFromHabitats(opts.habitats, parentCell, localCells, regionSeed);
    return real.length ? real : ruinSiteFromLocalCells(regionSeed, localCells, opts.ctx);
  }
  return pickSites(regionSeed, localCells, opts);
}

// A fresh small local noise field for moisture ONLY (0..1 raw, the exact input
// shape every in-house PROFILE.moisture() expects) — elevation comes from
// cell-terrain.js's neighbor-ramped heightmap instead (see generateRegion
// below), but AFMG's own precipitation field is on a different, incompatible
// scale, so moisture stays independently seeded local noise like the old
// refinement path did.
function localMoistureRaw(noise, x, y) {
  return fbm(noise, x / 20 + 50, y / 20 + 50, 3, 0.5, 1.3);
}

/**
 * Generate one region — a single planet surface cell's worth of local detail
 * (POPULATION_PLAN.md: "each planet cell is a region," equal-area square
 * bounds sized from the cell's own measured neighbor spacing). Async —
 * genuinely awaits AFMGData's region-mode terrain sim, used for EVERY planet
 * type now, not just habitable ones (see afmg-adapter.js's generateCellRegion
 * for why). Pure function of `surface` + `cellIndex` + `opts` — no live
 * reference to the parent planet object (§0).
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} cellIndex - index into surface.cells
 * @param {{sizeKm?: number, cells?: number, habitats?: Array, ctx?: Object}} [opts] -
 *   `habitats` is the planet's full habitat list (population/habitation.js);
 *   `ctx` is that planet's CultureContext (population/context.js), used for
 *   ruin flavor when no habitat lands in this specific region.
 */
export async function generateRegion(surface, cellIndex, opts = {}) {
  const parentCell = surface.cells[cellIndex];
  const regionSeed = coordSeed(surface.seed, 'region-cell', cellIndex);

  const { heightmapFn, sideKm } = prepareCellTerrain(surface, cellIndex, { fallbackSideKm: opts.sizeKm ?? 150 });

  const { generateCellRegion } = await import('./afmg-adapter.js');
  const afmgRegion = await generateCellRegion(regionSeed, {
    sizeKm: opts.sizeKm ?? sideKm,
    heightmap: heightmapFn,
    // Nudges AFMG's own local climate sim toward the parent cell's real
    // temperature (same units — both are the AFMG planet-scale sim's own
    // °C output) instead of a generic default. See habitable-biome.js for
    // the accompanying moisture/biome bias, which does the same job more
    // decisively for the habitable branch below.
    tempC: parentCell.temp
  });

  let cells = afmgRegion.cells;
  let palette = afmgRegion.palette;

  const profile = PROFILES[surface.type];
  if (profile) {
    // Non-habitable types: keep AFMG's geologically-plausible elevation SHAPE,
    // but re-derive moisture/biome through this planet type's OWN calibrated
    // logic instead of AFMG's Earth-biome classifier (see profiles.js).
    const moistureNoise = makeNoise2D(childSeed(regionSeed, 'detail-moisture'));
    cells = afmgRegion.cells.map(c => {
      const raw = localMoistureRaw(moistureNoise, c.x, c.y);
      const moisture = profile.moisture(raw, c.elev);
      const temp = profile.temperature(parentCell.y, c.elev);
      return { x: c.x, y: c.y, elev: c.elev, moisture, temp, biome: profile.biome(c.elev, moisture, temp) };
    });
    palette = surface.palette;
  } else if (surface.type === 'habitable') {
    // Habitable: AFMG's own biome classifier is otherwise blind to what the
    // parent surface cell actually was — bias moisture toward it and
    // reclassify, so a region generated from a forest tile predominantly
    // comes out forest instead of whatever AFMG's generic regional climate
    // model produced. See habitable-biome.js.
    cells = biasHabitableRegion(afmgRegion.cells, parentCell);
  }

  return {
    seed: regionSeed,
    cellIndex,
    lon: parentCell.x,
    lat: parentCell.y,
    sideKm,
    bounds: afmgRegion.bounds,
    cells,
    features: afmgRegion.features,
    sites: resolveSites(regionSeed, parentCell, cells, opts),
    palette
  };
}
