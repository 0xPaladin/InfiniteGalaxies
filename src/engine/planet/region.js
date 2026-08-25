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

// `ruins` is the planet's full ruin list (population/habitation.js's
// generatePlanetRuins output, unfiltered) — a ruin belongs to THIS region if
// its `pos` is that literal parent surface cell, same exact-match test
// sitesFromHabitats uses (generatePlanetRuins's pickSiteCell copies a surface
// cell's x/y verbatim too). The roll of WHETHER a ruin exists at all, and
// WHICH cell it lands on, happens once at the planet level now (so the
// hemisphere view can show it before any region is entered) — this only
// resolves it to a local in-region position, it never re-rolls.
function ruinSitesFromPlanetRuins(ruins, parentCell, localCells, seed) {
  const matched = ruins.filter(r => r.pos &&
    Math.abs(r.pos.x - parentCell.x) < 1e-6 && Math.abs(r.pos.y - parentCell.y) < 1e-6);
  if (!matched.length) return [];

  return matched.map((r, i) => {
    const local = pickLocalCell(localCells, new PRNG(childSeed(seed, 'ruin-placement', i)));
    return {
      kind: 'ruin', x: local ? local.x : 0, y: local ? local.y : 0,
      cultureId: r.cultureId, bioform: r.bioform, extinctionCause: r.extinctionCause
    };
  });
}

// Real sites if habitation data was wired in (even an empty array counts —
// "no habitats landed here" still means don't invent placeholder ones), plus
// any pre-rolled ruin that lands on this exact cell; the old invented
// heuristic ONLY as a last resort when no ctx/habitats exist at all (a caller
// that hasn't wired the population layer yet — e.g. a standalone test — still
// gets a renderable region, not an empty one). Every site gets `tl` stamped
// from this region's ctx (one culture per region, so one TL for all of it) —
// rogue/region.js's sprawl-radius calculation needs it and has no other way
// to reach ctx itself (renderers only ever see the generated data object).
function resolveSites(regionSeed, parentCell, localCells, opts) {
  let sites;
  if (opts.habitats != null) {
    const real = sitesFromHabitats(opts.habitats, parentCell, localCells, regionSeed);
    const ruins = opts.ruins != null ? ruinSitesFromPlanetRuins(opts.ruins, parentCell, localCells, regionSeed) : [];
    sites = [...real, ...ruins];
  } else {
    sites = pickSites(regionSeed, localCells, opts);
  }
  const tl = opts.ctx ? opts.ctx.tl : null;
  return sites.map(s => ({ ...s, tl }));
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
 * @param {{sizeKm?: number, cells?: number, habitats?: Array, ruins?: Array, ctx?: Object, baseColor?: string|Array}} [opts] -
 *   `habitats` is the planet's full habitat list (population/habitation.js's
 *   generatePlanetHabitation); `ruins` is its full ruin list
 *   (generatePlanetRuins) — both matched to THIS region by exact parent-cell
 *   position. `ctx` is that planet's CultureContext, stamped onto every
 *   resolved site as `.tl` (rogue/region.js's sprawl-radius calculation).
 *   `baseColor` is the parent planet's own color (galaxy/planet.js) — passed
 *   straight through as `.baseColor` on the returned region, alongside
 *   `.type` (== surface.type), so rogue/region.js can render a non-habitable
 *   region with the same elevation-binned shading its hemisphere view uses
 *   (elevation-color.js) instead of a biome palette lookup.
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
    type: surface.type,
    baseColor: opts.baseColor,
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
