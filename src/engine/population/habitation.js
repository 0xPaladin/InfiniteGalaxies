import { childSeed } from '../seed.js';
import { PRNG } from '../random.js';
import { eligibleHabitats, placementChance, rollPopulation } from './habitat.js';

// Picks a plausible settlement site from a surface's cell cloud — moderate
// elevation preferred, same heuristic spirit as planet/region.js's pickSites
// (avoids oceans/basins and mountain peaks without needing real terrain
// analysis). Independent implementation on purpose: habitation.js runs before
// any region is ever generated, so it can't depend on region.js internals.
function pickSiteCell(cells, rng) {
  if (!cells || !cells.length) return null;
  const idealElev = 40;
  let best = null, bestScore = -Infinity;
  for (const c of cells) {
    const score = -Math.abs(c.elev - idealElev) + rng.range(-8, 8);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function rollHabitats(habSeed, level, ctx, surfaceType, extra = () => ({})) {
  const habitats = [];
  for (const habitat of eligibleHabitats(level, ctx, surfaceType)) {
    const rng = new PRNG(childSeed(habSeed, habitat.name));
    if (!rng.p(Math.min(1, placementChance(habitat, ctx, surfaceType)))) continue;

    const population = rollPopulation(habitat, ctx, surfaceType, rng);
    habitats.push({
      type: habitat.name,
      level: habitat.level,
      cultureId: ctx.cultureId,
      bioform: ctx.bioform,
      population,
      megastructure: !!habitat.megastructure,
      mobile: !!habitat.mobile,
      ...extra(rng)
    });
  }
  return habitats;
}

/**
 * Habitats on one planet's surface, plus anything in orbit around it
 * (POPULATION_PLAN.md §14, §15). Pure function of (seed, ctx, surface) — same
 * inputs always produce the same habitats. `ctx` comes from
 * population/context.js; a null/unclaimed ctx yields no habitats (native
 * cultures are a separate mechanism — see native.js).
 *
 * @param {string} seed - the planet's own seed (planet._seed)
 * @param {Object|null} ctx - CultureContext for this planet's sector
 * @param {import('../planet/types.js').PlanetSurface} surface
 */
export function generatePlanetHabitation(seed, ctx, surface) {
  const habSeed = childSeed(seed, 'habitation');
  if (!ctx || ctx.cultureId == null) return { seed: habSeed, habitats: [] };

  const surfaceType = surface.type;
  const planetHabitats = rollHabitats(habSeed, 'planet', ctx, surfaceType, rng => {
    const cell = surface.cells && surface.cells.length ? pickSiteCell(surface.cells, rng) : null;
    return { pos: cell ? { x: cell.x, y: cell.y } : null };
  });
  const orbitHabitats = rollHabitats(habSeed, 'orbit', ctx, surfaceType, () => ({ pos: null }));

  return { seed: habSeed, habitats: [...planetHabitats, ...orbitHabitats] };
}

/** Stellar megastructures (§13.0b) — attach to the star, shared by the whole system. */
export function generateSystemHabitation(seed, ctx) {
  const habSeed = childSeed(seed, 'habitation');
  if (!ctx || ctx.cultureId == null) return { seed: habSeed, habitats: [] };
  return { seed: habSeed, habitats: rollHabitats(habSeed, 'star', ctx, null) };
}

function spherePosition(rng, r) {
  const u = rng.rand(), v = rng.rand();
  const theta = u * 2 * Math.PI;
  const phi = Math.acos(2 * v - 1);
  return {
    x: +(r * Math.sin(phi) * Math.cos(theta)).toFixed(2),
    y: +(r * Math.sin(phi) * Math.sin(theta)).toFixed(2),
    z: +(r * Math.cos(phi)).toFixed(2)
  };
}

/**
 * Sector-level habitats: deep space stations and capital ships (living-culture
 * territory), plus derelicts/pirate havens (§13.2 — anyone can be out there).
 * These have no planet to attach to, so they get their own position within the
 * sector volume, same coordinate convention as generateSector()'s stars.
 *
 * @param {string} seed - the sector's own seed
 * @param {Object|null} ctx - CultureContext for this sector
 * @param {{r?: number}} bounds - same bounds generateSector() lays systems out in
 */
export function generateSectorHabitation(seed, ctx, bounds = {}) {
  const habSeed = childSeed(seed, 'habitation');
  const r = bounds.r || 50;
  const habitats = [];

  if (ctx && ctx.cultureId != null) {
    for (const h of rollHabitats(habSeed, 'sector', ctx, null, rng => ({ pos: spherePosition(rng, r) }))) {
      habitats.push(h);
    }
  }

  // §13.2 — unclaimed/abandoned space is more likely to hold scavengers than
  // living territory is; living territory isn't immune, just less likely.
  const isUnclaimed = !ctx || ctx.cultureId == null || ctx.tier === 'abandoned';
  const occRng = new PRNG(childSeed(habSeed, 'occupants'));

  if (occRng.p(isUnclaimed ? 0.15 : 0.03)) {
    habitats.push({ type: 'derelict', level: 'sector', cultureId: null, population: 0, pos: spherePosition(occRng, r) });
  }
  if (occRng.p(isUnclaimed ? 0.10 : 0.02)) {
    const population = Math.round(Math.pow(10, occRng.range(1, 4)));
    habitats.push({ type: 'pirate haven', level: 'sector', cultureId: null, population, pos: spherePosition(occRng, r) });
  }

  return { seed: habSeed, habitats };
}
