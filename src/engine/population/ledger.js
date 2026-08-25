// Turns simulation history (sim.js's `history` snapshots) into a per-sector
// timeline of events — the record galaxy/archetypes.js uses to decide what a
// sector actually contains. Pure, read-only: never mutates `pop`.
import { cellKey } from './life.js';

/**
 * Earliest step at which each sector cell was EVER claimed by a culture
 * (claim() in sim.js always sets `alive=true` too, so "ever claimed" and
 * "ever alive at some point" are the same test). O(history x avg touched
 * cells) — cheap (tens of thousands of ops for a full 40-step run at radius
 * 50) but not free, so callers should compute this once per `pop` object and
 * cache it (rogue.js does, on population change) rather than per sector-entry.
 *
 * @param {Object} pop - populationView() output ({history, ...})
 * @returns {Map<string, number>} cellKey -> earliest step touched
 */
export function buildTouchHorizon(pop) {
  const horizon = new Map();
  for (const snapshot of pop.history) {
    for (const cell of snapshot.cells) {
      if (cell.culture == null) continue;
      const key = cellKey(cell.gx, cell.gy);
      if (!horizon.has(key)) horizon.set(key, snapshot.step);
    }
  }
  return horizon;
}

/**
 * Ring-distance (Chebyshev) from (gx,gy) to the nearest sector cell touched
 * at or before `uptoStep`, up to `maxRing`. Returns Infinity if nothing
 * touched lies within maxRing. Used to fade untouched-sector content out with
 * distance from actual culture history (galaxy/archetypes.js's
 * planUntouchedSector) — a starting cell that's ITSELF touched returns 0, but
 * callers only ever call this for untouched cells.
 */
export function ringDistanceToTouched(touchHorizon, gx, gy, uptoStep, maxRing = 6) {
  for (let r = 0; r <= maxRing; r++) {
    if (r === 0) {
      const t = touchHorizon.get(cellKey(gx, gy));
      if (t != null && t <= uptoStep) return 0;
      continue;
    }
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring, not filled square
        const t = touchHorizon.get(cellKey(gx + dx, gy + dy));
        if (t != null && t <= uptoStep) return r;
      }
    }
  }
  return Infinity;
}

// Culture-stats-as-of-step lookup: buildSnapshot() (sim.js) spreads a shallow
// copy of the culture's registry record into snapshot.cultures at the moment
// each step is built, so pop.history[step].cultures[cid] genuinely reflects
// that culture's tl/bioform/traits AS OF that step — not its current/final
// state. This is what lets archetypes.js flavor e.g. a step-3 birth with the
// culture's TL 4.0 starting form even though it's TL 5.5 by the end of the run.
function statsAt(pop, step, cultureId) {
  if (cultureId == null) return null;
  const snapshot = pop.history[step];
  return (snapshot && snapshot.cultures[cultureId]) || null;
}

/**
 * The chronological event timeline for one sector cell, up to `uptoStep`.
 * Diffs consecutive snapshots — no simulation changes needed to derive this;
 * `contested` piggybacks on sim.js's applyLifeStep recording losing bidders
 * on a birth cell.
 *
 * Event kinds:
 *   birth       - claimed for the first time ever
 *   resettle    - reclaimed after having gone dark (previously claimed)
 *   sustained   - stayed alive under the same owner
 *   contested   - a birth that multiple cultures competed for (fires
 *                 ALONGSIDE that step's birth/resettle event, not instead of it)
 *   conflict    - an already-alive cell changed owner (rare — see sim.js)
 *   death       - went dark, owning culture survives elsewhere
 *   extinction  - went dark because the owning culture died out this step
 *   transcension - went dark because the owning culture transcended this step
 *
 * @param {Object} pop - populationView() output
 * @param {number} gx
 * @param {number} gy
 * @param {number} uptoStep - inclusive
 * @returns {Array<{step:number, kind:string, cultureId:number|null, fromCultureId?:number|null, record:Object|null}>}
 */
export function sectorLedger(pop, gx, gy, uptoStep) {
  const key = cellKey(gx, gy);
  const events = [];
  let prev = null;

  const limit = Math.min(uptoStep, pop.history.length - 1);
  for (let s = 0; s <= limit; s++) {
    const cell = pop.history[s].cells.find(c => c.gx === gx && c.gy === gy) || null;
    // pop.history[s].cells is unindexed here (sim.js keeps it as a flat array
    // per snapshot) -- a linear find is fine for the handful of calls per
    // sector-entry this is used for, but callers doing this in bulk (e.g. a
    // full-galaxy scan) should build their own per-step Map first instead.
    const wasAlive = prev ? prev.alive : false;
    const isAlive = cell ? cell.alive : false;
    const prevOwner = prev ? prev.culture : null;
    const owner = cell ? cell.culture : null;

    if (!wasAlive && isAlive) {
      const kind = prevOwner == null ? 'birth' : 'resettle';
      events.push({ step: s, kind, cultureId: owner, record: statsAt(pop, s, owner), development: cell.development, tier: cell.tier });
      if (cell.contested && cell.contested.length) {
        events.push({ step: s, kind: 'contested', cultureId: owner, rivals: cell.contested, record: statsAt(pop, s, owner), development: cell.development, tier: cell.tier });
      }
    } else if (wasAlive && isAlive) {
      if (owner !== prevOwner) {
        events.push({ step: s, kind: 'conflict', cultureId: owner, fromCultureId: prevOwner, record: statsAt(pop, s, owner), development: cell.development, tier: cell.tier });
      } else {
        events.push({ step: s, kind: 'sustained', cultureId: owner, record: statsAt(pop, s, owner), development: cell.development, tier: cell.tier });
      }
    } else if (wasAlive && !isAlive) {
      const rec = statsAt(pop, s, prevOwner);
      const justDied = rec && rec.deadStep === s;
      const kind = justDied ? (rec.extinctionCause === 'transcended' ? 'transcension' : 'extinction') : 'death';
      // `prev` is the last-alive snapshot of this cell — its development/tier
      // is what the territory looked like right before it went dark, which is
      // the more meaningful flavor for a death/extinction system than "0/abandoned".
      events.push({ step: s, kind, cultureId: prevOwner, record: rec, development: prev.development, tier: prev.tier });
    }
    prev = cell;
  }
  return events;
}
