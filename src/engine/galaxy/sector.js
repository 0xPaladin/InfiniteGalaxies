import { PRNG } from '../random.js';
import { generateSystem } from './system.js';
import { MakeName } from '../random_name.js';

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
export function generateSector(seed = Date.now(), opts = {}) {
  const rng = new PRNG(seed);

  const { bounds } = opts;
  const H = bounds.r ? bounds.r * 2 : bounds.h;
  const W = bounds.r ? bounds.r * 2 : bounds.w;
  const D = bounds.r ? bounds.r * 2 : bounds.d;

  const names = [];
  const systems = [];

  // -------------------------------------------------
  // 1. Seed 6–10 main-sequence habitable candidates
  // -------------------------------------------------
  let nHab = 6 + Math.floor(rng.rand() * 5); // 6–10
  nHab = opts.nHab || nHab;
  for (let i = 0; i < nHab; i++) {
    const system = generateSystem([seed, systems.length].join(':'), { forceHabitable: true });
    system.name = MakeName(names, rng);
    system.pos = bounds.r ? getSpherePosition(rng, bounds) : getPrismPosition(rng, bounds);
    systems.push(system);
  }

  // -------------------------------------------------
  // 2. Add remaining stars/multiples → total 90–120
  // -------------------------------------------------
  let nSystems = 0// 90 + Math.floor(rng.rand() * 31); // 90–120
  nSystems = opts.nSystems || nSystems;
  while (systems.length < nSystems) {
    const system = generateSystem([seed, systems.length].join(':'));
    system.name = MakeName(names, rng);
    system.pos = bounds.r ? getSpherePosition(rng, bounds) : getPrismPosition(rng, bounds);
    systems.push(system);
  }

  return { systems, seed, H, W, D };
}