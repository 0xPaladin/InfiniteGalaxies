import { cellKey } from './life.js';

/**
 * Build a CultureContext for one (gx,gy) sector cell (POPULATION_PLAN.md §14).
 * `popIndex` is a Map from sim.js's buildSnapshotIndex(). `cultures` is that
 * same snapshot's `.cultures` — sim.js's buildSnapshot() spreads the FULL
 * registry record (traits, bioform, tl, lineage) plus that step's territory
 * stats into one object per culture, so this needs no second lookup source.
 *
 * A sector with no population data (or no sim run yet) gets a null/zeroed
 * context rather than throwing — every consumer below treats `cultureId ===
 * null` as "nothing to place here."
 *
 * @returns {Object} CultureContext
 */
export function cultureContextFor(popIndex, cultures, gx, gy) {
  const cell = popIndex ? popIndex.get(cellKey(gx, gy)) : null;
  if (!cell || cell.culture == null) {
    return { cultureId: null, bioform: null, tl: null, traits: null, development: 0, tier: 'abandoned', alive: false, formerClaims: [] };
  }

  const owner = cultures[cell.culture];
  const formerClaims = cell.claims.slice(1)
    .map(id => cultures[id])
    .filter(Boolean)
    .map(c => ({ cultureId: c.id, bioform: c.bioform, tl: c.tl, extinctionCause: c.extinctionCause }));

  return {
    cultureId: cell.culture,
    bioform: owner ? owner.bioform : null,
    tl: owner ? owner.tl : null,
    traits: owner ? owner.traits : null,
    development: cell.development,
    tier: cell.tier,
    alive: cell.alive,
    formerClaims
  };
}
