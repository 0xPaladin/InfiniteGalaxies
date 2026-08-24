import { mean, min } from "d3";
import { isLand, rn, unique } from "../utils/index.js";
import { grid, pack, config } from "../src/state.js";
import { TIME } from "../utils/debug.js";

class LakesModule {
  LAKE_ELEVATION_DELTA = 0.1;

  getHeight(feature) {
    const heights = pack.cells.h;
    const minShoreHeight = min(feature.shoreline.map(cellId => heights[cellId])) || 20;
    return rn(minShoreHeight - this.LAKE_ELEVATION_DELTA, 2);
  }

  defineNames() {
    pack.features.forEach(feature => {
      if (feature.type !== "lake") return;
      feature.name = this.getName(feature);
    });
  }

  getName() {
    return "";
  }

  cleanupLakeData = () => {
    for (const feature of pack.features) {
      if (feature.type !== "lake") continue;
      delete feature.river;
      delete feature.enteringFlux;
      delete feature.outCell;
      delete feature.closed;
      feature.height = rn(feature.height, 3);

      const inlets = feature.inlets?.filter(r => pack.rivers.find(river => river.i === r));
      if (!inlets?.length) delete feature.inlets;
      else feature.inlets = inlets;

      const outlet = feature.outlet && pack.rivers.find(river => river.i === feature.outlet);
      if (!outlet) delete feature.outlet;
    }
  };

  defineClimateData(heights) {
    const { cells, features } = pack;
    const lakeOutCells = new Uint16Array(cells.i.length);

    const getFlux = lake => {
      return lake.shoreline.reduce((acc, c) => acc + grid.cells.prec[cells.g[c]], 0);
    };

    const getLakeTemp = lake => {
      // A lake with NO land-touching shoreline (its whole boundary is other
      // water, not land — routine now that per-region custom heightmaps often
      // put a small land patch entirely inside a larger body of water) has
      // nothing for `.map()` to read; fall back to the lake's own first cell,
      // same as the small-lake branch just below.
      if (lake.cells < 6 || !lake.shoreline.length) return grid.cells.temp[cells.g[lake.firstCell]];
      return rn(mean(lake.shoreline.map(c => grid.cells.temp[cells.g[c]])) , 1);
    };

    const getLakeEvaporation = lake => {
      const height = (lake.height - 18) ** Number(config.heightExponent); // height in meters
      const evaporation = ((700 * (lake.temp + 0.006 * height)) / 50 + 75) / (80 - lake.temp); // based on Penman formula, [1-11]
      return rn(evaporation * lake.cells);
    };

    const getLowestShoreCell = lake => {
      return lake.shoreline.reduce((minCell, c) => (heights[c] < heights[minCell] ? c : minCell));
    };

    features.forEach(feature => {
      if (feature.type !== "lake") return;
      feature.flux = getFlux(feature);
      feature.temp = getLakeTemp(feature);
      feature.evaporation = getLakeEvaporation(feature);
      if (feature.closed) return; // no outlet for lakes in depressed areas

      // BUG FIX: shoreline.reduce() with no initial value throws on an empty
      // array — an empty shoreline means no land cell touches this lake's
      // boundary at all, so there's no land path to an outlet by definition.
      // Same conclusion detectCloseLakes below reaches for this case; skip
      // assigning an outlet instead of crashing the whole region generation.
      if (!feature.shoreline.length) return;

      feature.outCell = getLowestShoreCell(feature);
      lakeOutCells[feature.outCell] = feature.i;
    });

    return lakeOutCells;
  }

  // check if lake can be potentially open (not in deep depression)
  detectCloseLakes(h) {
    const { cells } = pack;
    const ELEVATION_LIMIT = config.lakeElevationLimit;

    pack.features.forEach(feature => {
      if (feature.type !== "lake") return;
      delete feature.closed;

      const MAX_ELEVATION = feature.height + ELEVATION_LIMIT;
      if (MAX_ELEVATION > 99) {
        feature.closed = false;
        return;
      }

      // Same empty-shoreline case as defineClimateData above — no land cell
      // touches this lake's boundary, so there is no land path outward at
      // all; that's an unconditional "closed", not something to BFS-check.
      if (!feature.shoreline.length) {
        feature.closed = true;
        return;
      }

      let isDeep = true;
      const lowestShorelineCell = feature.shoreline.reduce((minCell, c) => (h[c] < h[minCell] ? c : minCell));
      const queue = [lowestShorelineCell];
      const checked = [];
      checked[lowestShorelineCell] = true;

      while (queue.length && isDeep) {
        const cellId = queue.pop();

        for (const neibCellId of cells.c[cellId]) {
          if (checked[neibCellId]) continue;
          if (h[neibCellId] >= MAX_ELEVATION) continue;

          if (h[neibCellId] < 20) {
            const nFeature = pack.features[cells.f[neibCellId]];
            if (nFeature.type === "ocean" || feature.height > nFeature.height) isDeep = false;
          }

          checked[neibCellId] = true;
          queue.push(neibCellId);
        }
      }

      feature.closed = isDeep;
    });
  }

  defineShoreline(feature) {
    return unique(
      feature.vertices.flatMap(vertexIndex => pack.vertices.c[vertexIndex].filter(index => isLand(index, pack)))
    );
  }
}

export const Lakes = new LakesModule();

function addLakesInDeepDepressions() {
  TIME && console.time("addLakesInDeepDepressions");
  const elevationLimit = config.lakeElevationLimit;
  if (elevationLimit === 80) return;

  const { cells, features } = grid;
  const { c, h, b } = cells;
  const n = cells.i.length;

  // Cheap neighbor-min without the `.map()` allocation `min()` needed for
  // every single interior land cell.
  function minNeighborHeight(i) {
    let m = Infinity;
    for (const nb of c[i]) if (h[nb] < m) m = h[nb];
    return m;
  }

  // Reused across every BFS call below, so a call doesn't allocate+clear a
  // fresh tracking array — a generation stamp instead of a boolean reset.
  const visitedStamp = new Int32Array(n);
  let epoch = 0;

  // Memoizes the "is this basin deep" verdict, keyed by the EXACT height
  // (hence exact threshold) it was computed under. Heights are integer 0..100
  // (Uint8Array), so ties are common — many adjacent cells on one basin floor
  // routinely share the exact same rounded height, and each one independently
  // satisfies the local-minimum candidacy check below. Without this cache,
  // every one of those tied cells re-explores the SAME basin with its own
  // full BFS: O(basin size squared) instead of O(basin size) — the dominant
  // cause of lag at higher cell counts, since basin cell count grows with
  // grid resolution for a fixed physical basin. The keying makes reuse exact,
  // not approximate: BFS reachability under a fixed threshold predicate is a
  // property of the connected region, not of which cell in it you start
  // from, so any cell swept into a resolved BFS's visited set only gets a
  // cache hit later if its OWN height still matches the threshold that
  // resolved it — a cell at a different height (basin wall, or a nested
  // deeper pocket) always falls through to its own fresh, correctly-thresholded BFS.
  const resolvedHeight = new Int16Array(n).fill(-1);
  const resolvedDeep = new Uint8Array(n);

  for (const i of cells.i) {
    if (b[i] || h[i] < 20) continue;

    const minHeight = minNeighborHeight(i);
    if (h[i] > minHeight) continue;

    let deep;
    if (resolvedHeight[i] === h[i]) {
      deep = resolvedDeep[i] === 1;
    } else {
      deep = true;
      const threshold = h[i] + elevationLimit;
      const queue = [i];
      epoch++;
      visitedStamp[i] = epoch;
      const visited = [i];

      // check if elevated cell can potentially pour to water
      while (deep && queue.length) {
        const q = queue.pop();

        for (const nb of c[q]) {
          if (visitedStamp[nb] === epoch) continue;
          if (h[nb] >= threshold) continue;
          if (h[nb] < 20) {
            deep = false;
            break;
          }

          visitedStamp[nb] = epoch;
          visited.push(nb);
          queue.push(nb);
        }
      }

      for (const v of visited) {
        resolvedHeight[v] = h[i];
        resolvedDeep[v] = deep ? 1 : 0;
      }
    }

    // if not, add a lake
    if (deep) {
      const lakeCells = [i].concat(c[i].filter(nb => h[nb] === h[i]));
      addLake(lakeCells);
    }
  }

  function addLake(lakeCells) {
    const f = features.length;
    const lakeSet = new Set(lakeCells);

    lakeCells.forEach(i => {
      cells.h[i] = 19;
      cells.t[i] = -1;
      cells.f[i] = f;
      // BUG FIX: was `cells.t[c] = 1`, assigning into `c` (the neighbor-array
      // container from this closure's destructuring) instead of the neighbor
      // cell `nb` — a silent no-op on a typed array, so coastline marking
      // around newly-formed lakes never actually happened.
      c[i].forEach(nb => { if (!lakeSet.has(nb)) cells.t[nb] = 1; });
    });

    features.push({ i: f, land: false, border: false, type: "lake" });
  }

  TIME && console.timeEnd("addLakesInDeepDepressions");
}

// near sea lakes usually get a lot of water inflow, most of them should break threshold and flow out to sea (see Ancylus Lake)
function openNearSeaLakes() {
  if (config.template === "Atoll") return; // no need for Atolls

  const cells = grid.cells;
  const features = grid.features;
  if (!features.find(f => f.type === "lake")) return; // no lakes
  TIME && console.time("openLakes");
  const LIMIT = 22; // max height that can be breached by water

  for (const i of cells.i) {
    const lakeFeatureId = cells.f[i];
    if (features[lakeFeatureId].type !== "lake") continue; // not a lake

    check_neighbours: for (const c of cells.c[i]) {
      if (cells.t[c] !== 1 || cells.h[c] > LIMIT) continue; // water cannot break this

      for (const n of cells.c[c]) {
        const ocean = cells.f[n];
        if (features[ocean].type !== "ocean") continue; // not an ocean
        removeLake(c, lakeFeatureId, ocean);
        break check_neighbours;
      }
    }
  }

  function removeLake(thresholdCellId, lakeFeatureId, oceanFeatureId) {
    cells.h[thresholdCellId] = 19;
    cells.t[thresholdCellId] = -1;
    cells.f[thresholdCellId] = oceanFeatureId;
    cells.c[thresholdCellId].forEach(function (c) {
      if (cells.h[c] >= 20) cells.t[c] = 1; // mark as coastline
    });

    cells.i.forEach(i => {
      if (cells.f[i] === lakeFeatureId) cells.f[i] = oceanFeatureId;
    });
    features[lakeFeatureId].type = "ocean"; // mark former lake as ocean
  }

  TIME && console.timeEnd("openLakes");
}

export { addLakesInDeepDepressions, openNearSeaLakes };
