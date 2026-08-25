// IMPLEMENTATION_PLAN.md §11 — region generation as a window onto a
// continuous planet-wide field, replacing AFMG's per-region template
// generation entirely (§11.3: once field.js supplies the heightmap and
// hydrology-local.js supplies rivers/lakes, AFMG has no remaining job at
// region scale — its own post-hoc height mutation and h<20-as-ocean
// convention were the root cause of the seam/flooding bugs this replaces).
import { PRNG } from '../random.js';
import { childSeed, coordSeed } from '../seed.js';
import { buildFieldSampler } from './field.js';
import { computeLocalHydrology, offsetLonLat } from './hydrology-local.js';

// Fixed window, not the old equal-area-square sizing — with terrain as a
// pure function of position (§11.1), a region no longer needs to "tile" its
// neighbors by construction, so there's nothing left for a variable size to
// serve. 500km / 2km-per-tile matches what the renderer already expects
// (rogue/region.js). HALO_KM is the measured minimum for exact hydrology
// seam-agreement (IMPLEMENTATION_PLAN.md §11.2) between two overlapping
// windows — anything less measurably disagrees at the boundary.
export const WINDOW_KM = 500;
export const HALO_KM = 100;
export const KM_PER_TILE = 2;

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
    .filter(c => c.elev > 5 && !c.water) // skip obviously submerged/basin cells
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
  const dry = cells.filter(c => !c.water);
  const pool = dry.length ? dry : cells;
  if (!pool.length) return null;
  let best = null, bestScore = -Infinity;
  for (const c of pool) {
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
  if (!parentCell) return [];
  const matched = habitats.filter(h => h.pos &&
    Math.abs(h.pos.x - parentCell.x) < 1e-6 && Math.abs(h.pos.y - parentCell.y) < 1e-6);
  if (!matched.length) return [];

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
  if (!parentCell) return [];
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

const WATER_KIND_NAME = ['', 'stream', 'river', 'pond'];

/**
 * Build one region: a WINDOW_KM x WINDOW_KM window centered on (centerLon,
 * centerLat), sampled from `surface`'s continuous field (field.js) with local
 * hydrology (hydrology-local.js) layered on top. Pure function of its
 * arguments — no live reference to a parent object (§0).
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} centerLon
 * @param {number} centerLat
 * @param {number|null} cellIndex - the surface cell this region is centered
 *   on, if any (drives habitat/ruin site matching below); null for a region
 *   reached by traversal rather than a direct cell click (rogue.js) — such a
 *   region still renders fully, it just can't match habitats/ruins to a
 *   specific parent cell since it isn't centered on one.
 * @param {{seedTag?: string, habitats?: Array, ruins?: Array, ctx?: Object, baseColor?: string|Array}} [opts]
 * @returns {Object} region
 */
export function buildRegion(surface, centerLon, centerLat, cellIndex, opts = {}) {
  const parentCell = cellIndex != null ? surface.cells[cellIndex] : null;
  const regionSeed = opts.seedTag || coordSeed(surface.seed, 'region-at', centerLon.toFixed(3), centerLat.toFixed(3));

  const sampler = buildFieldSampler(surface, centerLon, centerLat, WINDOW_KM, HALO_KM);
  const hydro = computeLocalHydrology(surface, sampler, centerLon, centerLat, WINDOW_KM, HALO_KM, KM_PER_TILE);

  const n = hydro.n; // WINDOW_KM / KM_PER_TILE
  const R = surface.radius || 6371;
  const originKm = -WINDOW_KM / 2;
  const cells = new Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const localX = i * KM_PER_TILE, localY = j * KM_PER_TILE;
      // heightAt() was already sampled once by hydrology-local (its `h`) —
      // reuse it rather than sampling the field a second time (field.js's
      // detail-noise layer is the expensive part; paying for it twice would
      // double region generation time for no benefit).
      const elev = hydro.h[k];
      const [lon, lat] = offsetLonLat(centerLon, centerLat, originKm + localX, originKm + localY, R);
      const { moisture, temp } = sampler.climateAt(lon, lat, elev);
      const biome = sampler.biomeAt(elev, moisture, temp);
      const kindId = hydro.kind[k];
      cells[k] = {
        x: localX, y: localY, elev, temp, moisture, biome,
        water: kindId ? WATER_KIND_NAME[kindId] : null
      };
    }
  }

  return {
    seed: regionSeed,
    cellIndex,
    type: surface.type,
    baseColor: opts.baseColor,
    lon: centerLon,
    lat: centerLat,
    sideKm: WINDOW_KM,
    bounds: { minX: 0, maxX: WINDOW_KM, minY: 0, maxY: WINDOW_KM },
    cells,
    features: [],
    sites: resolveSites(regionSeed, parentCell, cells, opts),
    palette: surface.palette
  };
}

/**
 * Generate the region for a specific planet surface cell (the click-to-region
 * entry point — rogue.js's _enterRegion). Thin wrapper over buildRegion:
 * centers the window on that cell's own (lon,lat) exactly, so this really is
 * a zoom into that spot on the planet, not an offset/mis-scaled sample of
 * somewhere nearby (the bug this whole rework started from).
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {number} cellIndex - index into surface.cells
 * @param {{habitats?: Array, ruins?: Array, ctx?: Object, baseColor?: string|Array}} [opts]
 */
export async function generateRegion(surface, cellIndex, opts = {}) {
  const parentCell = surface.cells[cellIndex];
  return buildRegion(surface, parentCell.x, parentCell.y, cellIndex, opts);
}

/**
 * Generate a region centered on an arbitrary (lon,lat) — the traversal entry
 * point (rogue.js: walking off a region's edge re-centers here instead of
 * requiring a fresh cell click). Not tied to any one surface cell, so habitat/
 * ruin matching is skipped (cellIndex: null) — a traversed-to region still
 * renders fully, just without site data that was never generated for "the
 * planet cell at this exact spot" in the first place.
 */
export async function generateRegionAt(surface, lon, lat, opts = {}) {
  return buildRegion(surface, lon, lat, null, opts);
}
