import { childSeed } from '../seed.js';
import { PRNG } from '../random.js';
import { rollBioform, affinityFor } from './bioform.js';
import { pickSiteCell } from './habitation.js';

/**
 * A TL 0-3 pre-spacefaring culture, generated independently at the planet
 * level (POPULATION_PLAN.md §13.2). TL 0-3 cultures can't cross between
 * stars, so they cannot be represented in the galaxy-level Game of Life sim at
 * all — that sim specifically models interstellar spread. This is therefore a
 * wholly separate mechanism, not a degraded case of generatePlanetHabitation().
 *
 * More likely on worlds no LIVING interstellar culture currently holds — not
 * because life avoids empires, but because a starfaring culture that moves in
 * tends to absorb, displace, or uplift what it finds. Returns null on most
 * rolls; a hit is meant to read as a discovery, not a default state.
 *
 * @param {string} seed - the planet's own seed (planet._seed)
 * @param {Object|null} ctx - CultureContext for this planet's sector (may be null)
 * @param {import('../planet/types.js').PlanetSurface} surface
 * @returns {{seed, bioform, tl, population, pos: {x,y}|null}|null}
 */
export function generateNativeCulture(seed, ctx, surface) {
  const nativeSeed = childSeed(seed, 'native');
  const rng = new PRNG(nativeSeed);

  if (surface.type === 'gas giant') return null; // no native life modeled there

  const inLivingTerritory = !!(ctx && ctx.cultureId != null && ctx.alive);
  if (!rng.p(inLivingTerritory ? 0.01 : 0.05)) return null;

  const bioform = rollBioform(rng);
  if (!rng.p(affinityFor(bioform, surface.type))) return null; // the world has to actually suit them

  // A real surface (surface.cells populated) gets a real site position, same
  // heuristic habitation.js's own real habitats use, so the hemisphere view
  // (rogue/planet.js) can show a marker for this culture too — a cheap
  // presence-only check (rogue.js's _planetHasContent, no real surface) just
  // gets pos: null back, which is fine since that call only checks non-null.
  const cell = surface.cells && surface.cells.length ? pickSiteCell(surface.cells, rng) : null;

  return {
    seed: nativeSeed,
    bioform,
    tl: +rng.range(0, 3.9).toFixed(1),
    population: Math.round(Math.pow(10, rng.range(3, 9))), // pre-space civilizations can still be enormous
    pos: cell ? { x: cell.x, y: cell.y } : null
  };
}
