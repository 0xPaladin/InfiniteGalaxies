// IMPLEMENTATION_PLAN.md §11.2, Layer 2 — region-scale drainage: ponds,
// headwater streams, tributaries. Runs depression filling + D8 flow
// accumulation on the region's own fine (2km) heightmap, built window+halo
// then cropped. Major rivers are handed down from hydrology-macro.js as a
// smooth rainfall boost near where continental drainage runs, rather than
// re-derived locally — Layer 1 already decided where the big water goes;
// Layer 2 only grows the local watershed around it.
//
// Window-independence: the underlying TERRAIN is exactly position-pure
// (field.js — verified 0.00e+0 across 40k shared points), and so is the
// macro-river boost. The drainage derived from it is very nearly so, but NOT
// exactly: priority-flood (see below) is a window-global operation, so a basin
// whose outlet lies beyond one window's halo fills to a slightly different
// level than it does in a window that can see that outlet. Measured between
// two windows offset 200km, over 87500 shared tiles: heights agree to 1.4e-12,
// water-class agrees on 94.4% of tiles. (An earlier note here claimed 99.91%;
// that predates the terrain gaining real 2km roughness, which gives depression
// filling far more to do and so more for a window edge to disagree about.)
// That residual is the price of having real drainage networks at all — without
// depression filling, flow terminates in a local pit within a few tiles and no
// channels form anywhere (measured: 2540 pits, zero rivers, in one window).
import { greatCircleKm } from './sphere-geo.js';
import { macroHydrologyFor } from './hydrology-macro.js';

// Index-preserving version of field.js's gatherNearby — the macro handoff
// below needs each candidate's index into surface.cells (to read its
// pre-computed macro flux), so it can't reuse the plain cell-object list.
function gatherNearbyIndices(surface, lon, lat, radiusKm) {
  const R = surface.radius || 6371;
  const out = [];
  surface.cells.forEach((c, idx) => {
    if (greatCircleKm(R, lon, lat, c.x, c.y) <= radiusKm) out.push(idx);
  });
  return out;
}

const NEIGHBORS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// Minimal binary min-heap over (elevation, index) — only what priorityFlood
// below needs, so no general-purpose PQ dependency.
function makeHeap() {
  const key = [], val = [];
  return {
    get size() { return key.length; },
    push(k, v) {
      key.push(k); val.push(v);
      let i = key.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (key[p] <= key[i]) break;
        [key[p], key[i]] = [key[i], key[p]];
        [val[p], val[i]] = [val[i], val[p]];
        i = p;
      }
    },
    pop() {
      const topK = key[0], topV = val[0], lastK = key.pop(), lastV = val.pop();
      if (key.length) {
        key[0] = lastK; val[0] = lastV;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < key.length && key[l] < key[m]) m = l;
          if (r < key.length && key[r] < key[m]) m = r;
          if (m === i) break;
          [key[m], key[i]] = [key[i], key[m]];
          [val[m], val[i]] = [val[i], val[m]];
          i = m;
        }
      }
      return [topK, topV];
    }
  };
}

// Priority-flood depression filling (Barnes/Lehman/Mulla 2014). Raises every
// interior pit to the level of its lowest outlet, plus a tiny EPSILON gradient
// so the filled surface still drains rather than forming a dead flat.
//
// This is what makes real drainage networks possible at all. Before terrain
// had genuine 2km-scale roughness the field was smooth enough that flow just
// slid downhill across a whole window; with real roughness, D8 on the RAW
// heightmap terminates in a local pit within a handful of tiles almost
// everywhere (measured: 2540 pits and zero rivers in one 250x250 window), so
// nothing ever accumulates into a channel. Filling first lets flow cross those
// pits, and the fill DEPTH is itself the signal for where standing water
// actually belongs — a pond is a basin deep enough to hold water, not merely
// any cell with no lower neighbour.
// Returns TWO surfaces from a single flood, because they answer different
// questions and must not be conflated:
//   `level` — the true water surface: a pit is raised to exactly its outlet
//     elevation, no more. `level - h` is therefore the real standing-water
//     depth, which is what decides where a pond goes.
//   `route` — the same fill plus a monotonically increasing EPSILON, so D8 has
//     a defined downhill direction across an otherwise dead-flat filled basin.
// Using `route` for depth (an earlier version of this) badly overcounts: the
// epsilon accrues along the whole flood path, so a large basin's far end reads
// as metres deep purely from path length, and 44% of a window came out as pond.
const EPSILON = 1e-4;

function priorityFlood(h, n) {
  const level = Float64Array.from(h);
  const route = Float64Array.from(h);
  const closed = new Uint8Array(n * n);
  const heap = makeHeap();

  // Seed with the grid border: everything drains out through it. Interior
  // cells enter the heap only as the flood reaches them.
  for (let i = 0; i < n; i++) {
    for (const k of [i, (n - 1) * n + i, i * n, i * n + (n - 1)]) {
      if (!closed[k]) { closed[k] = 1; heap.push(route[k], k); }
    }
  }

  while (heap.size) {
    const [, k] = heap.pop();
    const ci = k % n, cj = (k - ci) / n;
    for (const [dx, dy] of NEIGHBORS_8) {
      const ni = ci + dx, nj = cj + dy;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (closed[nk]) continue;
      closed[nk] = 1;
      if (level[nk] < level[k]) level[nk] = level[k];
      if (route[nk] <= route[k]) route[nk] = route[k] + EPSILON;
      heap.push(route[nk], nk);
    }
  }
  return { level, route };
}

// D8 straight-line artifact. Steepest-descent D8 has only eight possible
// directions, so on any locally SMOOTH slope every cell in a neighbourhood
// picks the same one and the channel comes out as a dead-straight ray. This
// field is smooth over long stretches — inside a depression-filled basin
// especially, where `route` is a synthetic BFS-order gradient rather than real
// terrain — so the artifact was severe: measured 18-25% of all channel tiles
// sitting in perfectly straight runs of 20+ tiles, with individual runs up to
// ~180 tiles, drawn as the parallel 45-degree lines that made regions look
// hatched rather than drained.
//
// An earlier attempt (Garbrecht & Martz 1997 flat-routing, shaping the
// in-basin gradient from distance-to-outlet and distance-to-rim) is gone: the
// 8-connected BFS distance transforms it needs are a Chebyshev metric, whose
// own medial axis is built from 45-degree lines, so it swapped one set of
// straight diagonals for another (measured: no improvement, 20-25% still in
// long runs).
//
// The fix instead attacks the direction quantisation itself. Compute the
// CONTINUOUS downslope aspect from a central-difference gradient of the real
// terrain, perturb it by a deterministic per-cell angle, and score each
// candidate neighbour by how well it aligns with that jittered aspect as well
// as by its drop. A slope whose true aspect falls between two octants then
// alternates between them instead of committing to one, which is what turns a
// straight ray into a meander.
//
// Two properties are preserved exactly:
//   - No new pits or cycles. `route` remains a hard FILTER: a neighbour is
//     only ever a candidate if `route[nk] < route[k]`. Every step therefore
//     strictly descends a finite field, so every path still terminates at the
//     border. Alignment only reorders candidates that were already legal.
//   - Window-independence. The jitter is hashed from the cell's own HEIGHT
//     (which field.js guarantees is a pure function of position, agreeing to
//     1.4e-12 between overlapping windows), never from its grid index, which
//     would differ between two windows covering the same ground.
//
// Measured over 6 windows across 3 seeds: channel tiles in straight runs of
// 20+ drop from 23.7/25.5/18.3/20.1/5.8/5.6% to 6.4/3.9/6.0/4.5/4.1/4.2%,
// p99 run length from 13-28 tiles to 9-13, with zero unresolved pits in every
// case. Seam agreement between two windows offset 200km is 94.4% of shared
// tiles versus 95.8% before -- the jitter makes flow marginally more sensitive
// to the window-dependent part of `route`, which is the same tradeoff
// depression filling itself already makes (see the header note).
//
// JITTER is in radians (+-1 rad ~ +-57 degrees, comfortably more than the 45
// between adjacent octants, so ties actually break). ALIGN_WEIGHT is relative
// to the drop term, which is normalised per-cell to 0..1 so the two are
// comparable regardless of local relief; below ~0.6 the drop term dominates
// and the straight runs come back unchanged.
const JITTER = 1.0;
const ALIGN_WEIGHT = 1.0;

// Deterministic 0..1 hash of a float's bits. Used to derive the per-cell
// jitter from the height value itself (see above) — an integer bit-mixer of
// the same shape as noise.js's makeFastNoise3D, so it costs nothing per cell.
const HASH_BUF = new ArrayBuffer(8);
const HASH_F64 = new Float64Array(HASH_BUF);
const HASH_I32 = new Int32Array(HASH_BUF);
function hashFloat(v) {
  HASH_F64[0] = v;
  let x = Math.imul(HASH_I32[0], 374761393) ^ Math.imul(HASH_I32[1], 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function buildFlowDirections(h, n, route) {
  const at = (i, j) => h[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const down = new Int32Array(n * n).fill(-1);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      // Continuous downslope direction of the REAL terrain (not `route`) —
      // clamped central differences, so edge cells just see a one-sided slope.
      const gx = (at(i + 1, j) - at(i - 1, j)) / 2;
      const gy = (at(i, j + 1) - at(i, j - 1)) / 2;
      const ang = Math.atan2(-gy, -gx) + (hashFloat(h[k]) * 2 - 1) * JITTER;
      const tx = Math.cos(ang), ty = Math.sin(ang);

      // Two passes over the 8 neighbours: the first finds the steepest legal
      // drop so the drop term can be normalised, the second scores. Cheaper
      // than allocating a candidate array per cell (this runs n^2 times).
      let maxDrop = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (route[nk] >= route[k]) continue;
        const drop = (route[k] - route[nk]) / Math.hypot(dx, dy);
        if (drop > maxDrop) maxDrop = drop;
      }
      if (maxDrop === 0) continue; // no legal downhill neighbour: a border sink

      let best = -1, bestScore = -Infinity;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (route[nk] >= route[k]) continue; // correctness filter: strict descent
        const len = Math.hypot(dx, dy);
        const drop = (route[k] - route[nk]) / len;
        const align = (dx * tx + dy * ty) / len;
        const score = drop / maxDrop + ALIGN_WEIGHT * align;
        if (score > bestScore) { bestScore = score; best = nk; }
      }
      down[k] = best;
    }
  }
  return down;
}

// A macro cell counts as a "major river" injection point once its upstream
// contributor count crosses this — well above what any local 500km window
// could accumulate on its own (see IMPLEMENTATION_PLAN.md §11.2's measured
// bucket table: local D8 alone reproduces global truth up to ~4000 km²
// watersheds, i.e. roughly 1000 macro-mesh cells at this surface's typical
// cell size — pick a threshold comfortably above that so "major" really
// means continental, not just a big local creek).
const MAJOR_RIVER_FLUX = 40;
// Flux thresholds for classifying a LOCAL (2km-tile) cell once accumulation
// has run. These have to be re-measured whenever the terrain field changes,
// because accumulated flux is a property of the drainage structure, not an
// absolute unit: on the old near-flat field the whole window's flux topped out
// in the hundreds, whereas with real relief and depression filling a trunk
// channel reaches tens of thousands. Measured over 10 windows across 2 seeds,
// these give ~2.7% of tiles as stream and ~1.2% as river, which alongside
// ~1.2% pond puts total surface water near 5% — a readable drainage network
// rather than the blue web that earlier values produced.
const STREAM_FLUX = 300;
const RIVER_FLUX = 2500;
// Pond classification. Depth alone is nearly enough, with one exception:
// priority-flood on a BOUNDED grid can only drain a basin out through the
// grid's own border, so a basin whose true rim lies beyond the window+halo
// floods all the way out to that border — that's an artifact of the grid
// boundary, not real hydrology, and would read as "the whole window is one
// giant lake" if rendered.
//
// An earlier version excluded any filled connected component above a fixed
// tile-count cap (400 tiles / ~1600km²) to avoid that, on the assumption that
// only a window-boundary artifact could get that large. That assumption
// didn't survive the terrain gaining real 2km-scale relief: legitimate,
// fully-enclosed basins (with a real detected rim, never touching the grid
// border) now commonly span 5-000-30,000+ tiles. Capping by size excluded
// those too, rendering a real, sizeable lake as plain dry ground right next
// to a smaller sub-pond that happened to land under the cap — a hard color
// cliff at an arbitrary tile count, not a shoreline.
//
// The correct discriminator is BOUNDEDNESS, not size: a filled component
// counts as standing water unless it touches the grid's outer edge (the
// literal signature of "flow never found a lower way out inside this grid").
// Measured across 3400+ sampled components: none of the large ones (>400
// tiles, the old cap) ever touched the border — every one was a real,
// bounded basin. Water coverage is therefore no longer capped near the ~5%
// figure measured for the size-based version; a region whose terrain
// genuinely sits in one broad low basin can now read as substantially wetter,
// which is the physically honest result of a bounded low area with no outlet.
const POND_MIN_DEPTH = 0.4;

function toXYZ(lonDeg, latDeg) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

// Local (lon,lat) offset, `dxKm` east / `dyKm` north of (centerLon,centerLat)
// — same small-angle tangent-plane approximation cell-terrain.js already used.
export function offsetLonLat(centerLon, centerLat, dxKm, dyKm, radiusKm) {
  const cosLat = Math.max(0.05, Math.cos(centerLat * Math.PI / 180));
  const dLat = (dyKm / radiusKm) * (180 / Math.PI);
  const dLon = (dxKm / (radiusKm * cosLat)) * (180 / Math.PI);
  return [centerLon + dLon, centerLat + dLat];
}

/**
 * Local hydrology for one region window, cropped from a window+halo D8 run.
 *
 * @param {import('./types.js').PlanetSurface} surface
 * @param {{heightAt: Function}} sampler - field.js's buildFieldSampler output
 *   (built with the SAME windowKm/haloKm passed here — caller's responsibility,
 *   this doesn't rebuild it, to avoid sampling the macro field twice)
 * @param {number} centerLon
 * @param {number} centerLat
 * @param {number} windowKm
 * @param {number} haloKm
 * @param {number} kmPerTile
 * @returns {{n: number, flux: Float64Array, isPond: Uint8Array, kind: Uint8Array}}
 *   `n` is the CROPPED (window-only) grid side length. `kind` per tile: 0
 *   dry, 1 stream, 2 river, 3 pond/lake.
 */
export function computeLocalHydrology(surface, sampler, centerLon, centerLat, windowKm, haloKm, kmPerTile) {
  const R = surface.radius || 6371;
  const totalKm = windowKm + 2 * haloKm;
  const n = Math.round(totalKm / kmPerTile);
  const originKm = -totalKm / 2;

  const h = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [lon, lat] = offsetLonLat(centerLon, centerLat, originKm + i * kmPerTile, originKm + j * kmPerTile, R);
      h[j * n + i] = sampler.heightAt(lon, lat);
    }
  }

  // Flow is routed on the DEPRESSION-FILLED surface so it can cross pits
  // instead of terminating in them; `h` itself stays the real terrain and is
  // what the region renders. `fillDepth` is the standing-water depth each
  // basin holds, used to place ponds below.
  const { level, route } = priorityFlood(h, n);
  const down = buildFlowDirections(h, n, route);

  // Macro handoff: nearby macro-mesh cells carrying a major river's worth of
  // flux add a smooth, continuous rainfall boost to every local tile within
  // BOOST_RADIUS_KM (falling off linearly with distance), instead of
  // injecting flux at one quantized tile. A point injection is fragile near
  // a local drainage divide — a sub-tile difference in exactly which tile
  // receives it (inevitable between two windows with different origins) can
  // send the flow down a completely different path. A smooth boost is a
  // pure function of position instead, so it inherits the same
  // window-independence the height/climate fields already have. Local D8
  // still does the actual channelizing — this just makes sure there's a lot
  // more water on the ground near where a continental river actually runs.
  const BOOST_RADIUS_KM = 40;
  const gatherRadius = (totalKm * Math.SQRT2 / 2) + BOOST_RADIUS_KM;
  const hydro = macroHydrologyFor(surface);
  const cosLat0 = Math.max(0.05, Math.cos(centerLat * Math.PI / 180));
  const sources = gatherNearbyIndices(surface, centerLon, centerLat, gatherRadius)
    .map(idx => ({ idx, mFlux: hydro.flux[idx] }))
    .filter(e => e.mFlux >= MAJOR_RIVER_FLUX)
    .map(({ idx, mFlux }) => {
      const c = surface.cells[idx];
      const dxKm = (c.x - centerLon) * Math.PI / 180 * R * cosLat0;
      const dyKm = (c.y - centerLat) * Math.PI / 180 * R;
      return { dxKm, dyKm, mFlux };
    });

  const flux = new Float64Array(n * n).fill(1);
  if (sources.length) {
    for (let j = 0; j < n; j++) {
      const tileDyKm = originKm + j * kmPerTile;
      for (let i = 0; i < n; i++) {
        const tileDxKm = originKm + i * kmPerTile;
        let boost = 0;
        for (const s of sources) {
          const d = Math.hypot(tileDxKm - s.dxKm, tileDyKm - s.dyKm);
          if (d >= BOOST_RADIUS_KM) continue;
          boost += s.mFlux * (1 - d / BOOST_RADIUS_KM);
        }
        if (boost > 0) flux[j * n + i] += boost;
      }
    }
  }

  const order = Array.from({ length: n * n }, (_, k) => k).sort((a, b) => route[b] - route[a]);
  for (const k of order) if (down[k] >= 0) flux[down[k]] += flux[k];

  // Label connected components of "held standing water", then keep every one
  // that's actually BOUNDED (see the comment above POND_MIN_DEPTH) — only a
  // component that touches the grid's own outer edge is excluded, since that's
  // the signature of flow never finding a lower way out inside this grid.
  // Flood-fill iteratively rather than recursively — a component can span
  // tens of thousands of tiles.
  const isWet = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) if (level[k] - h[k] >= POND_MIN_DEPTH) isWet[k] = 1;

  const pondCell = new Uint8Array(n * n);
  const seen = new Uint8Array(n * n);
  const stack = [];
  for (let start = 0; start < n * n; start++) {
    if (!isWet[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const members = [start];
    let touchesEdge = false;
    while (stack.length) {
      const k = stack.pop();
      const ci = k % n, cj = (k - ci) / n;
      if (ci === 0 || cj === 0 || ci === n - 1 || cj === n - 1) touchesEdge = true;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (seen[nk] || !isWet[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
        members.push(nk);
      }
    }
    if (!touchesEdge) for (const m of members) pondCell[m] = 1;
  }

  const kind = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (pondCell[k]) kind[k] = 3;
    else if (flux[k] >= RIVER_FLUX) kind[k] = 2;
    else if (flux[k] >= STREAM_FLUX) kind[k] = 1;
  }

  // Crop halo -> window. `h` is cropped and returned too (not just
  // flux/kind) so the region generator can reuse THIS pass's height samples
  // as its terrain heightmap directly, instead of re-sampling the field a
  // second time at the same resolution — sampling is the expensive part
  // (field.js), so paying for it twice per region would double generation time.
  const haloTiles = Math.round(haloKm / kmPerTile);
  const winTiles = Math.round(windowKm / kmPerTile);
  const outH = new Float64Array(winTiles * winTiles);
  const outFlux = new Float64Array(winTiles * winTiles);
  const outKind = new Uint8Array(winTiles * winTiles);
  const outPond = new Uint8Array(winTiles * winTiles);
  const outDepth = new Float64Array(winTiles * winTiles);
  for (let j = 0; j < winTiles; j++) {
    for (let i = 0; i < winTiles; i++) {
      const src = (j + haloTiles) * n + (i + haloTiles);
      const dst = j * winTiles + i;
      outH[dst] = h[src];
      outFlux[dst] = flux[src];
      outKind[dst] = kind[src];
      outPond[dst] = kind[src] === 3 ? 1 : 0;
      outDepth[dst] = level[src] - h[src];
    }
  }

  return { n: winTiles, h: outH, flux: outFlux, kind: outKind, isPond: outPond, depth: outDepth };
}
