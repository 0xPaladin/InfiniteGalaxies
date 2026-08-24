// Pure Game-of-Life mechanics — no seeds, no RNG, no I/O. sim.js owns the
// working grid, the registry, and all seeded randomness; this module only
// answers "given this data, what's the next state / who wins a contested cell."

import { tlNormalized, TL_MIN } from './tech.js';

export const NEIGHBOR_OFFSETS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

// B36/S23 ("HighLife") — decision #2: replicator structures keep the galaxy
// active instead of settling into a mostly-static field like classic B3/S23.
export const RULE = { birth: [3, 6], survive: [2, 3] };

export function cellKey(gx, gy) {
  return `${gx},${gy}`;
}

/**
 * Score one candidate culture for a contested birth cell: territory size,
 * proximity to center of mass, and technology level (POPULATION_PLAN.md §12A.4
 * — this reweights decision #3's original 0.5/0.5 split to 0.40/0.40/0.20 to
 * make room for TL without letting it dominate — TL only ever increases, so at
 * full weight a high-TL culture would win every contest forever). Deterministic
 * given its inputs — the only non-determinism in cell resolution is the
 * caller's tie-break (lowest id wins, see sim.js).
 *
 * @param {{aliveCount: number, com: [number, number], tl?: number}} candidate
 * @param {[number, number]} cellPos
 * @param {number} maxAlive - largest aliveCount among ALL candidates this step
 */
export function scoreCandidate(candidate, cellPos, maxAlive) {
  const dist = Math.hypot(cellPos[0] - candidate.com[0], cellPos[1] - candidate.com[1]);
  const proxScore = 1 / (1 + dist);
  const sizeScore = maxAlive > 0 ? candidate.aliveCount / maxAlive : 0;
  const tlScore = tlNormalized(candidate.tl ?? TL_MIN);
  return 0.40 * sizeScore + 0.40 * proxScore + 0.20 * tlScore;
}

/** Centroid of a list of {gx,gy} points. Caller guarantees a non-empty list. */
export function centroid(points) {
  const sx = points.reduce((s, p) => s + p.gx, 0);
  const sy = points.reduce((s, p) => s + p.gy, 0);
  return [sx / points.length, sy / points.length];
}

/** Mean distance of a list of {gx,gy} points from a [x,y] center. */
export function meanRadius(points, com) {
  if (!points.length) return 0;
  return points.reduce((s, p) => s + Math.hypot(p.gx - com[0], p.gy - com[1]), 0) / points.length;
}
