import { PRNG } from '../random.js';
import { childSeed } from '../seed.js';
import { generateSystem } from './system.js';
import { MakeName } from '../random_name.js';
import { generateSectorHabitation } from '../population/habitation.js';

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
 * Generate a 100×100 ASCII map of a 1000 ly cube
 * (each tile ≈ 10 ly in x/y, full 1000 ly depth collapsed into z)
 *
 * @param {number} seed
 * @returns {object} { map: string, stars: array, stats: object }
 */
export function generateSector(seed, opts = {}) {
  const rng = new PRNG(seed);

  const { bounds } = opts;
  const H = bounds.r ? bounds.r * 2 : bounds.h;
  const W = bounds.r ? bounds.r * 2 : bounds.w;
  const D = bounds.r ? bounds.r * 2 : bounds.d;

  const names = [];
  const systems = [];

  // -------------------------------------------------
  // 1. Seed 6–10 main-sequence habitable candidates, biased by this sector's
  //    culture development (POPULATION_PLAN.md §9 step 8) — a core-tier sector
  //    gets up to 2x the baseline habitable count, an abandoned/unclaimed one
  //    as low as 0.5x. An explicit opts.nHab (the GUI slider) still overrides.
  // -------------------------------------------------
  let nHab = 6 + Math.floor(rng.rand() * 5); // 6–10
  if (opts.ctx && opts.ctx.cultureId != null) {
    nHab = Math.round(nHab * (0.5 + opts.ctx.development * 1.5));
  }
  nHab = opts.nHab || nHab;
  for (let i = 0; i < nHab; i++) {
    const system = generateSystem(childSeed(seed, 'system', systems.length), { forceHabitable: true });
    system.name = MakeName(names, rng);
    system.pos = bounds.r ? getSpherePosition(rng, bounds) : getPrismPosition(rng, bounds);
    systems.push(system);
  }

  // -------------------------------------------------
  // 2. Add remaining stars/multiples → total 90–120
  // -------------------------------------------------
  let nSystems = 90 + Math.floor(rng.rand() * 31); // 90–120
  nSystems = opts.nSystems || nSystems;
  while (systems.length < nSystems) {
    const system = generateSystem(childSeed(seed, 'system', systems.length));
    system.name = MakeName(names, rng);
    system.pos = bounds.r ? getSpherePosition(rng, bounds) : getPrismPosition(rng, bounds);
    systems.push(system);
  }

  const habitation = generateSectorHabitation(seed, opts.ctx, bounds);

  return { systems, seed, H, W, D, r: bounds.r || null, gx: opts.gx, gy: opts.gy, habitation };
}