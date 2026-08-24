import { PRNG } from '../random.js';
import { childSeed } from '../seed.js';
import { CultureRegistry } from './culture.js';
import { NEIGHBOR_OFFSETS, RULE, cellKey, scoreCandidate, centroid, meanRadius } from './life.js';
import { developmentOf, tierOf } from './development.js';
import { TL_MIN, advanceRoll, advance, transcendRoll } from './tech.js';

// decision #1: Milky-Way scale by default (1000 ly sectors, radius 50 ≈ 7,850
// sectors) — same grid generateGalaxy() uses, so population cells line up 1:1
// with sectors.
const DEFAULT_RADIUS = 50;
const DEFAULT_STEPS = 40; // decision #7
const GENESIS_FOUNDING = 77; // starting-set size, carried over from the pre-Phase-2 Cultures sim
                              // (tuned at this same grid scale — see docs history)
                              // per-step refill count is 1d6+3 (4-9), rolled inline below
const WALK_LENGTHS = [1, 2, 3, 4, 5];
const WALK_WEIGHTS = [20, 25, 35, 15, 5];
const P_SUCCESSOR = 0.05; // per former cell of a newly-extinct culture
const P_SCHISM = 0.01;    // per living culture per step

function buildValidCells(radius) {
  const cells = [];
  for (let gx = -radius; gx <= radius; gx++) {
    for (let gy = -radius; gy <= radius; gy++) {
      if (gx * gx + gy * gy <= radius * radius) cells.push([gx, gy]);
    }
  }
  return cells;
}

function claim(grid, gx, gy, cultureId) {
  const key = cellKey(gx, gy);
  let cell = grid.get(key);
  if (!cell) {
    cell = { gx, gy, alive: false, claims: [] };
    grid.set(key, cell);
  }
  if (cell.claims[0] !== cultureId) cell.claims.unshift(cultureId);
  cell.alive = true;
  return cell;
}

function walk(grid, validKeySet, startKey, cultureId, length, rng) {
  let key = startKey;
  const [sx, sy] = key.split(',').map(Number);
  claim(grid, sx, sy, cultureId);
  for (let i = 1; i < length; i++) {
    const [gx, gy] = key.split(',').map(Number);
    const neighborKeys = NEIGHBOR_OFFSETS
      .map(([dx, dy]) => cellKey(gx + dx, gy + dy))
      .filter(k => validKeySet.has(k));
    if (!neighborKeys.length) break;
    key = rng.pick(neighborKeys);
    const [nx, ny] = key.split(',').map(Number);
    claim(grid, nx, ny, cultureId);
  }
}

function foundCultures(step, grid, validKeys, validKeySet, registry, rng, count) {
  for (let i = 0; i < count; i++) {
    const startKey = rng.pick(validKeys);
    const [gx, gy] = startKey.split(',').map(Number);
    const record = registry.found(step, [gx, gy]);
    const length = rng.weighted(WALK_LENGTHS, WALK_WEIGHTS);
    walk(grid, validKeySet, startKey, record.id, length, rng);
  }
}

// One synchronous B36/S23 generation: every valid cell's next state is decided
// from the PREVIOUS grid snapshot simultaneously (standard CA semantics) —
// mutations below are applied only after all decisions are made.
function applyLifeStep(grid, validCells, registry) {
  const prevAlive = new Map();
  const cultureStats = new Map(); // cid -> {aliveCount, sumX, sumY, tl}

  for (const [key, cell] of grid) {
    prevAlive.set(key, cell.alive);
    if (cell.alive) {
      const cid = cell.claims[0];
      let s = cultureStats.get(cid);
      if (!s) {
        const rec = registry.get(cid);
        s = { aliveCount: 0, sumX: 0, sumY: 0, tl: rec ? rec.tl : TL_MIN };
        cultureStats.set(cid, s);
      }
      s.aliveCount++; s.sumX += cell.gx; s.sumY += cell.gy;
    }
  }
  const maxAlive = Math.max(0, ...[...cultureStats.values()].map(s => s.aliveCount));
  const comOf = cid => {
    const s = cultureStats.get(cid);
    return s ? [s.sumX / s.aliveCount, s.sumY / s.aliveCount] : [0, 0];
  };

  const deaths = [];
  const survivors = [];
  const births = []; // {gx, gy, candidates: [cid,...]}

  for (const [gx, gy] of validCells) {
    const key = cellKey(gx, gy);
    let aliveN = 0;
    const liveNeighborCultures = [];
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nk = cellKey(gx + dx, gy + dy);
      if (prevAlive.get(nk)) {
        aliveN++;
        liveNeighborCultures.push(grid.get(nk).claims[0]);
      }
    }
    const wasAlive = prevAlive.get(key) || false;
    if (wasAlive) {
      (RULE.survive.includes(aliveN) ? survivors : deaths).push(key);
    } else if (RULE.birth.includes(aliveN)) {
      births.push({ gx, gy, candidates: liveNeighborCultures });
    }
  }

  for (const key of deaths) {
    const c = grid.get(key);
    if (c) c.alive = false;
  }

  for (const b of births) {
    const unique = [...new Set(b.candidates)].sort((a, c) => a - c); // ascending id = deterministic tie order
    let winner;
    if (unique.length === 1) {
      winner = unique[0];
    } else {
      let bestScore = -Infinity, bestId = null;
      for (const cid of unique) {
        const score = scoreCandidate(
          { aliveCount: cultureStats.get(cid).aliveCount, com: comOf(cid), tl: cultureStats.get(cid).tl },
          [b.gx, b.gy],
          maxAlive
        );
        if (score > bestScore) { bestScore = score; bestId = cid; }
      }
      winner = bestId;
    }
    claim(grid, b.gx, b.gy, winner);
  }
}

function currentAliveCounts(grid) {
  const counts = new Map();
  for (const [, cell] of grid) {
    if (cell.alive) counts.set(cell.claims[0], (counts.get(cell.claims[0]) || 0) + 1);
  }
  return counts;
}

function groupByOwner(grid) {
  const byOwner = new Map();
  for (const [, cell] of grid) {
    const cid = cell.claims[0];
    if (cid == null) continue;
    if (!byOwner.has(cid)) byOwner.set(cid, []);
    byOwner.get(cid).push(cell);
  }
  return byOwner;
}

// Combines three things that all decide "which cultures die this step, and
// what former cells they leave behind":
//   1. Natural die-out (aliveCount drops to 0 through ordinary CA rules).
//   2. Technology advancement + transcendence (§12A.2-3) — a culture that
//      reaches TL 5.0+ can roll to LEAVE the simulation entirely, distinct
//      from dying. Its territory goes dark (population departed) the same way
//      a die-out culture's does, so the successor mechanic below treats both
//      causes identically.
//   3. Successor births (decision #4): INDEPENDENT per-cell rolls over every
//      newly-extinct culture's former territory — a dead empire can splinter
//      into several unrelated revivals, not one shared phoenix. Each successor
//      inherits TL minus a dark-age penalty (tech.js's successorTL).
function applyTechAndExtinction(step, grid, registry, techRng, successorRng) {
  const byOwner = groupByOwner(grid);
  const extinct = [];

  const aliveCounts = currentAliveCounts(grid);
  for (const record of registry.living()) {
    if (!aliveCounts.has(record.id)) {
      registry.markDead(record.id, step, 'died-out');
      extinct.push(record.id);
    }
  }

  for (const record of registry.living()) {
    if (transcendRoll(techRng, record.tl)) {
      registry.markDead(record.id, step, 'transcended');
      extinct.push(record.id);
      // the population sustaining these cells departed — territory goes dark,
      // stays claimed (so it still reads as ruins, per §13.1's flagged split)
      for (const cell of byOwner.get(record.id) || []) cell.alive = false;
      continue;
    }
    if (advanceRoll(techRng, record.traits)) {
      registry.setTL(record.id, advance(record.tl));
    }
  }

  for (const deadId of extinct) {
    const formerCells = byOwner.get(deadId) || [];
    for (const cell of formerCells) {
      if (successorRng.p(P_SUCCESSOR)) {
        const successor = registry.found(step, [cell.gx, cell.gy], { parent: deadId, inheritKind: 'successor' });
        claim(grid, cell.gx, cell.gy, successor.id);
      }
    }
  }
}

// Decision #4: schism SPLITS a living culture geographically. A seeded random
// line through the culture's center of mass bisects its owned cells (alive +
// claimed-dead); one side keeps the old id, the other becomes a new culture.
// The old culture is not marked extinct. A degenerate split (everything on one
// side) is skipped rather than forcing an empty culture into existence.
function applySchisms(step, grid, registry, rng) {
  const byOwner = groupByOwner(grid);

  for (const record of registry.living()) {
    const cells = byOwner.get(record.id) || [];
    if (cells.length < 2) continue;
    if (!rng.p(P_SCHISM)) continue;

    const com = centroid(cells);
    const theta = rng.range(0, 2 * Math.PI);
    const dir = [Math.cos(theta), Math.sin(theta)];
    const splitCells = cells.filter(c => (c.gx - com[0]) * dir[0] + (c.gy - com[1]) * dir[1] < 0);
    if (splitCells.length === 0 || splitCells.length === cells.length) continue;

    const origin = [splitCells[0].gx, splitCells[0].gy];
    const successor = registry.found(step, origin, { parent: record.id, inheritKind: 'schism' });
    for (const cell of splitCells) {
      cell.claims.unshift(successor.id);
    }
  }
}

function buildSnapshot(step, grid, registry) {
  const cells = [];
  for (const [, cell] of grid) {
    cells.push({ gx: cell.gx, gy: cell.gy, alive: cell.alive, culture: cell.claims[0], claims: [...cell.claims] });
  }

  const aliveByC = new Map(), allByC = new Map();
  for (const c of cells) {
    if (!allByC.has(c.culture)) allByC.set(c.culture, []);
    allByC.get(c.culture).push(c);
    if (c.alive) {
      if (!aliveByC.has(c.culture)) aliveByC.set(c.culture, []);
      aliveByC.get(c.culture).push(c);
    }
  }

  const cultureStats = {};
  for (const [cid, allCells] of allByC) {
    const aliveCells = aliveByC.get(cid) || [];
    const refCells = aliveCells.length ? aliveCells : allCells;
    const com = centroid(refCells);
    const rec = registry.get(cid);
    // Spreading the WHOLE record (not just id) captures this step's state
    // correctly for free: `tl` ticks upward over a culture's life (setTL) and
    // `deadStep`/`extinctionCause` get set on the step they occur, so reading
    // the registry right after that step's mutations — before any later step
    // can change it again — makes each snapshot's culture stats a complete,
    // self-contained, historically-accurate record (traits, bioform, tl, color,
    // lineage, and this step's territory numbers all in one place).
    cultureStats[cid] = { ...rec, aliveCount: aliveCells.length, territoryCount: allCells.length, com, radius: meanRadius(refCells, com) };
  }

  // development/tier are pure functions of (cell, cultureStats) — baked in here
  // so every downstream consumer (renderer, populationOf(), future sector/region
  // bias) reads them directly instead of recomputing per read.
  for (const cell of cells) {
    cell.development = developmentOf(cell, cultureStats);
    cell.tier = tierOf(cell.development);
  }

  return { step, cells, cultures: cultureStats };
}

// Genesis (step 0) only — the shared setup every run needs regardless of how
// far it's eventually stepped. Split out from generatePopulation so a caller
// can hold onto this live, mutable state and extend it later (advancePopulation)
// instead of re-running everything from scratch every time the user wants to
// see one more generation (§16's determinism/replay guarantees still hold: every
// step's RNG derives from `popSeed` + the ABSOLUTE step number, never from how
// many steps were already computed, so extending incrementally produces
// byte-identical results to computing the same target step in one shot).
//
// @param {string} seed - the galaxy seed
// @param {{radius?: number, sectorSize?: number}} [opts]
export function initPopulation(seed, opts = {}) {
  const radius = opts.radius ?? DEFAULT_RADIUS;
  const sectorSize = opts.sectorSize ?? 1000;

  const popSeed = childSeed(seed, 'pop');
  const validCells = buildValidCells(radius);
  const validKeys = validCells.map(([gx, gy]) => cellKey(gx, gy));
  const validKeySet = new Set(validKeys);

  const registry = new CultureRegistry(popSeed);
  const grid = new Map();
  const history = [];

  // Genesis: the "starting set" (VISION.md §5) — a larger one-time founding,
  // tuned at this same grid scale (see GENESIS_FOUNDING).
  const genesisRng = new PRNG(childSeed(popSeed, 'found', 0));
  foundCultures(0, grid, validKeys, validKeySet, registry, genesisRng, GENESIS_FOUNDING);
  history.push(buildSnapshot(0, grid, registry));

  return { seed, popSeed, radius, sectorSize, validCells, validKeys, validKeySet, registry, grid, history, step: 0 };
}

/** Run `state` forward (in place) from its current step up to `toStep`. No-op if already there or beyond. */
export function advancePopulation(state, toStep) {
  for (let step = state.step + 1; step <= toStep; step++) {
    applyLifeStep(state.grid, state.validCells, state.registry);

    const techRng = new PRNG(childSeed(state.popSeed, 'tech', step));
    const successorRng = new PRNG(childSeed(state.popSeed, 'successor', step));
    applyTechAndExtinction(step, state.grid, state.registry, techRng, successorRng);

    const schismRng = new PRNG(childSeed(state.popSeed, 'schism', step));
    applySchisms(step, state.grid, state.registry, schismRng);

    const foundRng = new PRNG(childSeed(state.popSeed, 'found', step));
    const refillCount = foundRng.d(6) + 3;
    foundCultures(step, state.grid, state.validKeys, state.validKeySet, state.registry, foundRng, refillCount);

    state.history.push(buildSnapshot(step, state.grid, state.registry));
  }
  state.step = Math.max(state.step, toStep);
  return state;
}

/** The plain, structuredClone-safe shape every consumer (renderers, context.js) actually reads. */
export function populationView(state) {
  return {
    seed: state.seed, radius: state.radius, sectorSize: state.sectorSize,
    steps: state.step, history: state.history, cultures: state.registry.toPlainObject()
  };
}

/**
 * Run the galaxy-level population/culture simulation (VISION.md §5,
 * POPULATION_PLAN.md) in one shot. Pure function of (seed, opts) — same inputs
 * always produce byte-identical output, which is what makes step-forward/back
 * and reload-through-seed work. All randomness derives from `seed` via
 * childSeed()/coordSeed() — nothing reads Math.random or Date.now. A caller
 * that wants to step PAST `opts.steps` later (uncapped scrubbing) should use
 * initPopulation()/advancePopulation() directly instead, to avoid recomputing
 * from scratch on every step — see rogue.js's `_stepPopulation`.
 *
 * @param {string} seed - the galaxy seed
 * @param {{radius?: number, steps?: number, sectorSize?: number}} [opts]
 * @returns {{seed, radius, sectorSize, steps, history: Array, cultures: Object}}
 */
export function generatePopulation(seed, opts = {}) {
  const steps = opts.steps ?? DEFAULT_STEPS;
  const state = initPopulation(seed, opts);
  advancePopulation(state, steps);
  return populationView(state);
}

/** O(1)-lookup index from a snapshot, for renderers/generators keyed by (gx,gy). */
export function buildSnapshotIndex(snapshot) {
  const index = new Map();
  for (const cell of snapshot.cells) index.set(cellKey(cell.gx, cell.gy), cell);
  return index;
}
