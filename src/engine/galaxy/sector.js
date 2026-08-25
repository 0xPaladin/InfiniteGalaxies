import { PRNG } from '../random.js';
import { generateSystem } from './system.js';
import { MakeName } from '../random_name.js';
import { generateSectorHabitation } from '../population/habitation.js';
import { planTouchedSector, planUntouchedSector } from './archetypes.js';

function getPrismPosition(rng, { w, h, d }) {
  const x = rng.range(0, w * 10) / 10;
  const y = rng.range(0, d * 10) / 10;
  const z = rng.range(0, h * 10) / 10;

  return { x, y, z };
}

function getSpherePosition(rng, { r }) {
  const u = rng.rand();
  const v = rng.rand();

  // Distribute angles uniformly
  const theta = u * 2.0 * Math.PI;
  const phi = Math.acos(2.0 * v - 1.0);

  // Convert spherical coordinates to Cartesian (x, y, z)
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100 };
}

/**
 * Generate a sector's systems from its OWN culture history, not a flat count
 * (POPULATION_PLAN.md's "traceable to actual history" rule). Every system
 * traces back to one of two things:
 *   - A culture that actually held this sector cell at some point up to
 *     `opts.uptoStep` — one system per historical event (birth, resettle,
 *     death, extinction, transcension, conflict/contested), scaled by that
 *     culture's bioform breadth; long-held sectors get a diminishing-returns
 *     handful of extra "deepening" systems instead of one per sustained step
 *     (see galaxy/archetypes.js's planTouchedSector).
 *   - For a sector NO culture has ever touched: a small, distance-faded mix
 *     of neutral outposts/native-culture candidates, ancient ruins, and
 *     lawless trouble spots (planUntouchedSector) — genuinely empty far
 *     enough from any culture's history, not uniformly "busy" everywhere.
 *
 * `opts.pop` (populationView() output) and `opts.touchHorizon`
 * (ledger.js's buildTouchHorizon(opts.pop)) are required to build that plan;
 * without them (e.g. a standalone test) this falls back to zero systems,
 * since there's nothing to justify inventing any.
 *
 * @param {number} seed
 * @param {{bounds, gx, gy, pop, uptoStep, touchHorizon, densityScale, ctx}} opts -
 *   `ctx` here is only the sector's CURRENT dominant-owner context, used for
 *   sector-WIDE assets (generateSectorHabitation's deep space stations/capital
 *   ships) — individual systems get their own per-event ctx from the plan,
 *   attached as `system.ctx`/`system.origin`.
 * @returns {object}
 */
export function generateSector(seed, opts = {}) {
  const rng = new PRNG(seed);

  const { bounds, gx, gy, pop, touchHorizon, densityScale = 1 } = opts;
  const uptoStep = opts.uptoStep ?? 0;
  const H = bounds.r ? bounds.r * 2 : bounds.h;
  const W = bounds.r ? bounds.r * 2 : bounds.w;
  const D = bounds.r ? bounds.r * 2 : bounds.d;

  let specs = [];
  if (pop && touchHorizon) {
    const key = `${gx},${gy}`;
    const touchedAt = touchHorizon.get(key);
    specs = (touchedAt != null && touchedAt <= uptoStep)
      ? planTouchedSector(pop, gx, gy, uptoStep, seed, densityScale)
      : planUntouchedSector(pop, gx, gy, uptoStep, touchHorizon, seed, densityScale);
  }

  const names = [];
  const systems = specs.map(spec => {
    const system = generateSystem(spec.seedTag, { forceHabitable: spec.forceHabitable });
    system.name = MakeName(names, rng);
    system.pos = bounds.r ? getSpherePosition(rng, bounds) : getPrismPosition(rng, bounds);
    system.ctx = spec.ctx;
    system.origin = spec.origin;
    if (spec.habitation) system.habitation = spec.habitation;
    return system;
  });

  const habitation = generateSectorHabitation(seed, opts.ctx, bounds);

  return { systems, seed, H, W, D, r: bounds.r || null, gx, gy, habitation };
}