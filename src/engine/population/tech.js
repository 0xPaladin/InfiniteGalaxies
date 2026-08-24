// Technology Level (POPULATION_PLAN.md §12A). Pure functions — sim.js owns the
// RNG and decides when to call these; nothing here reads Math.random.

export const TL_MIN = 4.0;   // basic interstellar spaceflight — the sim's floor
export const TL_MAX = 5.9;   // hard cap; 6+ is transcendence, not a playable state
export const TL_TRANSCEND_MIN = 5.0;
export const TL_STEP = 0.1;

function round1(v) {
  return Math.round(v * 10) / 10;
}

/** P(advance +0.1 this step) — industrious cultures climb roughly 2x faster. */
export function advanceRoll(rng, traits) {
  return rng.p(0.35 * (0.5 + traits.industrial));
}

export function advance(tl) {
  return Math.min(TL_MAX, round1(tl + TL_STEP));
}

/** P(transcend this step) — only meaningful once tl >= TL_TRANSCEND_MIN. */
export function transcendRoll(rng, tl) {
  if (tl < TL_TRANSCEND_MIN) return false;
  return rng.p(0.02 * (1 + (tl - TL_TRANSCEND_MIN) * 2));
}

/** A successor culture inherits TL minus a 0.1-0.5 "dark age" penalty. */
export function successorTL(parentTL, rng) {
  return Math.max(TL_MIN, round1(parentTL - rng.range(0.1, 0.5)));
}

/** As TL rises, population falls — 1.00 at TL_MIN, ~0.60 at 5.0, ~0.38 at 5.9. */
export function populationFactor(tl) {
  return Math.pow(0.6, tl - TL_MIN);
}

/** 0..1 normalization used by contested-claim scoring (life.js) and habitat gating. */
export function tlNormalized(tl) {
  return Math.min(1, Math.max(0, (tl - TL_MIN) / (TL_MAX - TL_MIN)));
}
