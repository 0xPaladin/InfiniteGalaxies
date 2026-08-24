import { coordSeed } from '../seed.js';
import { cellKey } from '../population/life.js';

/**
 * Generate a galaxy as a grid of sector *coordinates* — no sector content
 * (systems/planets) is generated here. A sector's real data is only produced
 * when generateSector(sector.seed, ...) is called on click (see rogue.js).
 *
 * This mirrors galaxy/sector.js in style but does not reuse galaxy/galaxy.js,
 * which depends on the global `Chance`/`chance` and builds a Cultures sim —
 * that sim's B36/S23 successor now lives in src/engine/population/.
 *
 * @param {string} seed
 * @param {{radius?: number, sectorSize?: number}} opts
 * @returns {{seed, radius, sectorSize, sectors: Array}}
 */
export function generateGalaxy(seed, opts = {}) {
  const { radius = 50, sectorSize = 1000 } = opts;
  const sectors = [];

  for (let gx = -radius; gx <= radius; gx++) {
    for (let gy = -radius; gy <= radius; gy++) {
      if (gx * gx + gy * gy > radius * radius) continue;

      const sectorSeed = coordSeed(seed, 'sector', gx, gy);
      sectors.push({ gx, gy, seed: sectorSeed });
    }
  }

  return { seed, radius, sectorSize, sectors };
}

/**
 * Phase 5 seam accessor — the one place any consumer reads population from.
 * `popIndex` is a Map from src/engine/population/sim.js's buildSnapshotIndex()
 * (the current step's snapshot, keyed by "gx,gy") — built once per render, not
 * per sector, since a linear scan per sector would be O(sectors × cells).
 * Callers that don't have a sim yet (or a coordinate with no population data)
 * get 0 (fully undeveloped), never a crash.
 */
export function populationOf(node, popIndex) {
  if (!popIndex) return 0;
  const cell = popIndex.get(cellKey(node.gx, node.gy));
  return cell ? cell.development : 0;
}
