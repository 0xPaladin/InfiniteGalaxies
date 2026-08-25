// IMPLEMENTATION_PLAN.md §11.2, Layer 1 — planet-scale drainage, computed once
// per surface and shared by every region generated from it. Owns sea level
// (implicitly — flow just runs downhill), major river courses, and large
// lakes. Consistent by construction: there is exactly one computation, so
// two regions on either side of a continental divide can't disagree about
// which way the water goes.
//
// Runs on a k-nearest-neighbor graph over surface.cells rather than a real
// adjacency list, since that's the one thing both surface families
// (in-house's regular jittered grid and AFMG's irregular Voronoi pack) have
// in common — every PlanetSurface.cells entry is just {x, y, elev, ...}.
import { greatCircleKm } from './sphere-geo.js';

const K_NEIGHBORS = 8;
const BUCKET_DEG = 5; // spatial hash cell size for the neighbor search

function buildNeighborGraph(cells, radiusKm) {
  const buckets = new Map();
  const keyOf = (lon, lat) => `${Math.floor(lon / BUCKET_DEG)}|${Math.floor(lat / BUCKET_DEG)}`;
  cells.forEach((c, i) => {
    const k = keyOf(c.x, c.y);
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(i);
  });

  const neighbors = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const bx = Math.floor(c.x / BUCKET_DEG), by = Math.floor(c.y / BUCKET_DEG);
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = buckets.get(`${bx + dx}|${by + dy}`);
        if (arr) candidates.push(...arr);
      }
    }
    const withDist = [];
    for (const j of candidates) {
      if (j === i) continue;
      withDist.push({ j, d: greatCircleKm(radiusKm, c.x, c.y, cells[j].x, cells[j].y) });
    }
    withDist.sort((a, b) => a.d - b.d);
    neighbors[i] = withDist.slice(0, K_NEIGHBORS).map(e => e.j);
  }
  return neighbors;
}

// A depression fills until it either overflows to a lower neighbor or hits
// LAKE_CAP cells — the bounded version of AFMG's own (unbounded)
// resolveDepressions, cheap enough to run on the whole planet mesh. Members
// must be within LEVEL_TOLERANCE of the seed's elevation, so a lake reads as
// a genuinely flat body of water, not an arbitrary elevation band.
const LAKE_CAP = 60;
const LEVEL_TOLERANCE = 3;

function fillBasins(cells, neighbors, flowTo) {
  const n = cells.length;
  const lakeId = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  let nextId = 0;

  for (let seed = 0; seed < n; seed++) {
    if (flowTo[seed] !== -1 || visited[seed]) continue;
    const seedElev = cells[seed].elev;
    const queue = [seed];
    const members = [seed];
    visited[seed] = 1;
    let qi = 0;
    while (qi < queue.length && members.length < LAKE_CAP) {
      const cur = queue[qi++];
      for (const j of neighbors[cur]) {
        if (visited[j]) continue;
        if (cells[j].elev > seedElev + LEVEL_TOLERANCE) continue;
        visited[j] = 1;
        queue.push(j);
        members.push(j);
      }
    }
    const id = nextId++;
    for (const m of members) lakeId[m] = id;
  }
  return lakeId;
}

/**
 * @param {import('./types.js').PlanetSurface} surface
 * @returns {{flowTo: Int32Array, flux: Float64Array, lakeId: Int32Array, neighbors: number[][]}}
 *   `flowTo[i]` is the steepest-descent neighbor's index, or -1 at a local
 *   minimum. `flux[i]` is accumulated "1 unit of rain per cell" flow — not
 *   rainfall-weighted (that needs a climate field per cell, which surface
 *   already carries via `.moisture`, but this stays uniform for now; regions
 *   built on top read moisture from field.js directly). `lakeId[i]` groups
 *   cells into bounded basins (see fillBasins); -1 means not part of a lake.
 */
export function computeMacroHydrology(surface) {
  const cells = surface.cells;
  const R = surface.radius || 6371;
  const n = cells.length;
  const neighbors = buildNeighborGraph(cells, R);

  const flowTo = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -1, bestDrop = 0;
    for (const j of neighbors[i]) {
      const d = greatCircleKm(R, cells[i].x, cells[i].y, cells[j].x, cells[j].y) || 1;
      const drop = (cells[i].elev - cells[j].elev) / d;
      if (drop > bestDrop) { bestDrop = drop; best = j; }
    }
    flowTo[i] = best;
  }

  // Process high -> low so every cell's upstream contributors are already
  // resolved by the time it's visited (standard flow-accumulation order).
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => cells[b].elev - cells[a].elev);
  const flux = new Float64Array(n).fill(1);
  for (const i of order) if (flowTo[i] >= 0) flux[flowTo[i]] += flux[i];

  const lakeId = fillBasins(cells, neighbors, flowTo);

  return { flowTo, flux, lakeId, neighbors };
}

/** Lazily computed, cached on the surface object itself (plain data — an
 * Int32Array/Float64Array round-trips through structuredClone fine, so this
 * doesn't violate §0's "generator output must be structuredClone-safe" rule,
 * it's just expensive enough to compute once and reuse across every region
 * generated from this surface rather than recomputing per region-entry. */
export function macroHydrologyFor(surface) {
  if (!surface._hydrology) surface._hydrology = computeMacroHydrology(surface);
  return surface._hydrology;
}
