// IMPLEMENTATION_PLAN.md §11.2, Layer 2 — region-scale drainage: ponds,
// headwater streams, tributaries. Runs D8 flow accumulation on the region's
// own fine (2km) heightmap, built window+halo then cropped, so it's exactly
// window-independent the same way field.js's terrain is (verified: 100km
// halo -> zero flux/pond/stream-class disagreement between two overlapping
// windows). Major rivers are handed down from hydrology-macro.js as a
// boundary condition (injected flux at the point they cross into the
// window) rather than re-derived locally — Layer 1 already decided where
// continental drainage goes; Layer 2 only grows the local watershed around it.
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

// A macro cell counts as a "major river" injection point once its upstream
// contributor count crosses this — well above what any local 500km window
// could accumulate on its own (see IMPLEMENTATION_PLAN.md §11.2's measured
// bucket table: local D8 alone reproduces global truth up to ~4000 km²
// watersheds, i.e. roughly 1000 macro-mesh cells at this surface's typical
// cell size — pick a threshold comfortably above that so "major" really
// means continental, not just a big local creek).
const MAJOR_RIVER_FLUX = 40;
// Flux thresholds for classifying a LOCAL (2km-tile) cell once accumulation
// has run — tuned so the common case (most tiles) reads as bare ground.
const STREAM_FLUX = 8;
const RIVER_FLUX = 40;

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

  const down = new Int32Array(n * n).fill(-1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let best = -1, bestDrop = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        const drop = (h[k] - h[nk]) / Math.hypot(dx, dy);
        if (drop > bestDrop) { bestDrop = drop; best = nk; }
      }
      down[k] = best;
    }
  }

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

  const order = Array.from({ length: n * n }, (_, k) => k).sort((a, b) => h[b] - h[a]);
  for (const k of order) if (down[k] >= 0) flux[down[k]] += flux[k];

  const kind = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (down[k] === -1 && flux[k] > 2) kind[k] = 3; // pond: local minimum with any real catchment
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
  for (let j = 0; j < winTiles; j++) {
    for (let i = 0; i < winTiles; i++) {
      const src = (j + haloTiles) * n + (i + haloTiles);
      const dst = j * winTiles + i;
      outH[dst] = h[src];
      outFlux[dst] = flux[src];
      outKind[dst] = kind[src];
      outPond[dst] = kind[src] === 3 ? 1 : 0;
    }
  }

  return { n: winTiles, h: outH, flux: outFlux, kind: outKind, isPond: outPond };
}
