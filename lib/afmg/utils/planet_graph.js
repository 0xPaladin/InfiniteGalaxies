import Alea from "alea";
import { color, quadtree, polygonArea } from "d3";
import { geoVoronoi } from "d3-geo-voronoi";
import { isLand, isWater, getGridPolygon } from "./graphUtils.js";
import { createTypedArray, TYPED_ARRAY_MAX } from "./arrayUtils.js";
import { rn } from "./numberUtils.js";
import { rand } from "./probability.js";
import { TIME } from "./debug.js";
import { seed, pack, graphWidth, graphHeight, config } from "../src/state.js";
import { chordDistanceSquared, sphericalMidpoint } from "./sphereMath.js";

export {
  toCartesian,
  toSpherical,
  sphericalDistance,
  chordDistanceSquared,
  deltaLongitude,
  sphericalMidpoint
} from "./sphereMath.js";

/**
 * Generate points on a Fibonacci sphere for even distribution across the entire globe.
 * @param {number} count - Number of points to generate
 * @param {number} jitter - Jitter fraction (0 = no jitter, 0.1 = 10% of spacing). Defaults to 0.15.
 * @returns {Array} - Array of [lon, lat] coordinates in degrees
 */
const fibonacciSphere = (count, jitter = 0.15) => {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.39996

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    let lon = (theta * (180 / Math.PI)) % 360;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    let lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);

    // Apply seeded jitter to vary Voronoi topology per seed while keeping
    // roughly even global distribution. Jitter is scaled by spacing so it
    // stays proportional regardless of cell count.
    if (jitter > 0) {
      const spacingDeg = 360 / Math.sqrt(count * Math.PI); // approximate angular spacing
      const jitterDeg = spacingDeg * jitter;
      const r1 = Math.random() * 2 - 1; // [-1, 1]
      const r2 = Math.random() * 2 - 1; // [-1, 1]

      lon += r1 * jitterDeg;
      lat += r2 * jitterDeg * Math.cos(lat * Math.PI / 180); // scale lat jitter by latitude

      // Wrap longitude back into [-180, 180]
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      // Clamp latitude to valid range
      lat = Math.max(-89.9, Math.min(89.9, lat));
    }

    points.push([lon, lat]);
  }

  return points;
};

/**
 * Places points on a Fibonacci sphere and calculates cell counts
 * @returns {Object} - An object containing spacing, cellsDesired, points, cellsX, and cellsY
 */
const placePoints = () => {
  TIME && console.time("placePoints");
  const cellsDesired = config.cells;

  // Use Fibonacci sphere for even distribution on the full sphere
  const points = fibonacciSphere(cellsDesired);

  // cellsX/cellsY are kept for compatibility but represent approximate grid dimensions
  // based on the map aspect ratio and cell count
  const aspectRatio = graphWidth / graphHeight;
  const cellsX = Math.round(Math.sqrt(cellsDesired * aspectRatio));
  const cellsY = Math.round(cellsDesired / aspectRatio);

  TIME && console.timeEnd("placePoints");

  return {
    spacing: 0, // not applicable for spherical distribution
    cellsDesired,
    boundary: [], // no boundary needed for spherical Voronoi
    points,
    cellsX,
    cellsY
  };
};

/**
 * Checks if the grid needs to be regenerated based on desired parameters
 * @param {Object} grid - The current grid object
 * @param {number} expectedSeed - The expected seed value
 * @returns {boolean} - True if the grid should be regenerated, false otherwise
 */
export const shouldRegenerateGrid = (grid, expectedSeed) => {
  if (expectedSeed && expectedSeed !== grid.seed) return true;

  const cellsDesired = config.cells;
  if (cellsDesired !== grid.cellsDesired) return true;

  return false;
};

/**
 * Generates a Voronoi grid based on Fibonacci sphere points
 * @returns {Object} - The generated grid object containing spacing, cellsDesired, boundary, points, cellsX, cellsY, cells, vertices, and seed
 */
export const generateGrid = () => {
  Math.random = Alea(seed); // reset PRNG
  const { spacing, cellsDesired, boundary, points, cellsX, cellsY } = placePoints();
  const { cells, vertices, delaunay } = calculateVoronoi(points);

  return {
    spacing,
    cellsDesired,
    boundary,
    points,
    cellsX,
    cellsY,
    cells,
    vertices,
    delaunay,
    seed
  };
};

/**
 * Calculates the spherical Voronoi diagram from given [lon, lat] points using d3-geo-voronoi.
 * @param {Array} points - The array of [lon, lat] points for Voronoi calculation (lon in degrees, lat in degrees)
 * @returns {Object} - An object containing Voronoi cells and vertices
 */
export const calculateVoronoi = (points) => {
  TIME && console.time("calculateDelaunay");

  // d3-geo-voronoi expects [lon, lat] in degrees
  const voronoi = geoVoronoi(points);

  TIME && console.timeEnd("calculateDelaunay");

  TIME && console.time("calculateVoronoi");

  const delaunay = voronoi.delaunay;
  const n = points.length;

  // Build cells structure compatible with existing codebase
  const cells = {
    v: [], // cell vertices (indices into vertices.p)
    c: [], // adjacent cells (neighbor indices)
    b: [], // near-border cell flag
    i: createTypedArray({
      maxValue: n,
      length: n
    }).map((_, i) => i) // array of indexes
  };

  // Build vertices structure
  const vertices = {
    p: [], // vertex coordinates [lon, lat]
    v: [], // neighboring vertices
    c: [] // adjacent cells
  };

  // Map from delaunay circumcenter indices to our vertex IDs.
  // Each element of delaunay.polygons[i] is a circumcenter index (into
  // delaunay.centers), and each circumcenter IS a Voronoi vertex. Keying by
  // circumcenter index ensures the same physical vertex shared across cells
  // maps to a single vertex ID, which keeps vertices.c[v] adjacency correct.
  const vertexMap = new Map();

  // Build cells from delaunay polygons
  // delaunay.polygons[i] is an array of circumcenter indices forming the
  // Voronoi cell polygon for site i (ordered clockwise on the sphere)
  for (let i = 0; i < n; i++) {
    const polygon = delaunay.polygons[i];
    const neighbors = delaunay.neighbors[i] || [];

    if (!polygon || polygon.length === 0) {
      // Degenerate cell (e.g. duplicate/near-duplicate site points).
      // Give it a fallback vertex at its own site point so downstream
      // code (markupPack, connectVertices) doesn't crash on empty cells.
      const site = points[i];
      const vertexId = vertices.p.length;
      vertices.p.push(site);
      vertices.v.push([]);
      vertices.c.push([i]);
      cells.v[i] = [vertexId];
      cells.c[i] = neighbors;
      cells.b[i] = 1;
      continue;
    }

    // Convert polygon (array of circumcenter indices) to vertex indices
    const vertexIndices = [];
    for (let j = 0; j < polygon.length; j++) {
      const centerIdx = polygon[j];

      if (!vertexMap.has(centerIdx)) {
        const center = delaunay.centers[centerIdx];
        const vertexId = vertices.p.length;
        vertices.p.push(center);
        vertexMap.set(centerIdx, vertexId);
      }

      vertexIndices.push(vertexMap.get(centerIdx));
    }

    cells.v[i] = vertexIndices;
    cells.c[i] = neighbors;
    // Border cells are those with fewer neighbors than expected or empty polygons
    cells.b[i] = (cells.c[i].length === 0 || cells.v[i].length < 3) ? 1 : 0;
  }

  // Build vertex adjacency (neighboring vertices and adjacent cells)
  for (let v = 0; v < vertices.p.length; v++) {
    vertices.v[v] = [];
    vertices.c[v] = [];
  }

  // For each cell, link its vertices
  for (let i = 0; i < n; i++) {
    const cellVertices = cells.v[i];
    for (let j = 0; j < cellVertices.length; j++) {
      const v = cellVertices[j];
      const nextV = cellVertices[(j + 1) % cellVertices.length];

      if (vertices.v[v].indexOf(nextV) === -1) {
        vertices.v[v].push(nextV);
      }
      if (vertices.c[v].indexOf(i) === -1) {
        vertices.c[v].push(i);
      }
    }
  }

  TIME && console.timeEnd("calculateVoronoi");

  return { cells, vertices, delaunay };
};

/**
 * Returns the polygon points for a packed cell given its index
 * @param {number} cellIndex - The index of the packed cell
 * @returns {Array} - An array of polygon points for the specified cell
 */
export const getPackPolygon = (cellIndex, packedGraph = pack) => {
  return packedGraph.cells.v[cellIndex].map(v => packedGraph.vertices.p[v]);
};

/**
 * mbostock's poissonDiscSampler implementation
 * Generates points using Poisson-disc sampling within a specified rectangle
 * NOTE: This is kept for compatibility but operates in 2D space.
 * For spherical maps, use fibonacciSphere instead.
 */
export function* poissonDiscSampler(x0, y0, x1, y1, r, k = 3) {
  if (!(x1 >= x0) || !(y1 >= y0) || !(r > 0)) throw new Error();

  const width = x1 - x0;
  const height = y1 - y0;
  const r2 = r * r;
  const r2_3 = 3 * r2;
  const cellSize = r * Math.SQRT1_2;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight);
  const queue = [];

  function far(x, y) {
    const i = (x / cellSize) | 0;
    const j = (y / cellSize) | 0;
    const i0 = Math.max(i - 2, 0);
    const j0 = Math.max(j - 2, 0);
    const i1 = Math.min(i + 3, gridWidth);
    const j1 = Math.min(j + 3, gridHeight);
    for (let j = j0; j < j1; ++j) {
      const o = j * gridWidth;
      for (let i = i0; i < i1; ++i) {
        const s = grid[o + i];
        if (s) {
          const dx = s[0] - x;
          const dy = s[1] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }

  function sample(x, y) {
    const point = [x, y];
    grid[gridWidth * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = point;
    queue.push(point);
    return [x + x0, y + y0];
  }

  yield sample(width / 2, height / 2);

  pick: while (queue.length) {
    const i = (Math.random() * queue.length) | 0;
    const parent = queue[i];

    for (let j = 0; j < k; ++j) {
      const a = 2 * Math.PI * Math.random();
      const r = Math.sqrt(Math.random() * r2_3 + r2);
      const x = parent[0] + r * Math.cos(a);
      const y = parent[1] + r * Math.sin(a);
      if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) {
        yield sample(x, y);
        continue pick;
      }
    }

    const r = queue.pop();
    if (r !== undefined && i < queue.length) queue[i] = r;
  }
}
// draw raster heightmap preview (not used in main generation)
/**
 * Draws a raster heightmap preview based on given heights and rendering options
 */
export const drawHeights = ({ heights, width, height, scheme, renderOcean }) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);

  const getHeight = height => (height < 20 ? (renderOcean ? height : 0) : height);

  for (let i = 0; i < heights.length; i++) {
    const colorScheme = scheme(1 - getHeight(heights[i]) / 100);
    const { r, g, b } = color(colorScheme)?.rgb() ?? { r: 0, g: 0, b: 0 };

    const n = i * 4;
    imageData.data[n] = r;
    imageData.data[n + 1] = g;
    imageData.data[n + 2] = b;
    imageData.data[n + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

/**
 * Find the grid cell containing a given [lon, lat] point.
 * Uses d3-geo-voronoi's delaunay.find() for efficient nearest-site lookup.
 * @param {number} lon - Longitude in degrees
 * @param {number} lat - Latitude in degrees
 * @param {Object} grid - The grid object containing points, cells, and delaunay
 * @returns {number} - The index of the cell containing the point
 */
export const findGridCell = (lon, lat, grid) => {
  if (!grid.delaunay) {
    // Fallback: linear search if delaunay not available
    const points = grid.points;
    let minDist = Infinity;
    let closestCell = 0;

    for (let i = 0; i < points.length; i++) {
      const [pLon, pLat] = points[i];
      const dLon = pLon - lon;
      const dLat = pLat - lat;
      const dist = dLon * dLon + dLat * dLat;
      if (dist < minDist) {
        minDist = dist;
        closestCell = i;
      }
    }

    return closestCell;
  }

  // Use d3-geo-voronoi's efficient spatial lookup
  return grid.delaunay.find(lon, lat);
};

/**
 * return array of cell indexes in radius on a regular square grid
 * @param {number} lon - Longitude in degrees
 * @param {number} lat - Latitude in degrees
 * @param {number} radius - The search radius in degrees
 * @param {Object} grid - The grid object containing spacing, cellsX, and cellsY
 * @returns {Array} - An array of cell indexes within the specified radius
 */
export const findGridAll = (lon, lat, radius, grid) => {
  const c = grid.cells.c;
  let r = Math.floor(radius / (grid.spacing || 1));
  let found = [findGridCell(lon, lat, grid)];
  if (!r || radius === 1) return found;
  if (r > 0) found = found.concat(c[found[0]]);
  if (r > 1) {
    let frontier = c[found[0]];
    while (r > 1) {
      const cycle = frontier.slice();
      frontier = [];
      cycle.forEach(s => {
        c[s].forEach(e => {
          if (found.indexOf(e) !== -1) return;
          found.push(e);
          frontier.push(e);
        });
      });
      r--;
    }
  }

  return found;
};

/*
* Regraph
*/

// recalculate Voronoi Graph to pack cells
export function reGraph(grid) {
  const { cells: gridCells, points, features } = grid;
  const newCells = { p: [], g: [], h: [] }; // store new data

  // On a globe, maintaining even point distribution prevents distorted wedge cells.
  // We keep land, coastal, and ocean points, adding higher density along coastlines.
  const distThresholdRad = (0.5 * Math.PI) / 180;
  const distThresholdSq = 4 * Math.sin(distThresholdRad / 2) ** 2;

  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    // Subsample deep ocean slightly for performance while preserving full spherical topology
    if (height < 20 && type !== 1 && type !== -1) {
      if (i % 2 !== 0 && features[gridCells.f[i]]?.type !== "lake") continue;
    }

    const [lon, lat] = points[i];
    addNewPoint(i, lon, lat, height);

    // add additional points for cells along coast using true spherical midpoints
    if (type === 1 || type === -1) {
      if (gridCells.b[i]) continue; // not for near-border cells
      gridCells.c[i].forEach(function (e) {
        if (i > e) return;
        if (gridCells.t[e] === type) {
          const pt1 = points[i];
          const pt2 = points[e];
          if (chordDistanceSquared(pt1, pt2) < distThresholdSq) return;
          const [lon1, lat1] = sphericalMidpoint(pt1, pt2);
          addNewPoint(i, rn(lon1, 2), rn(lat1, 2), height);
        }
      });
    }
  }

  function addNewPoint(i, lon, lat, height) {
    newCells.p.push([lon, lat]);
    newCells.g.push(i);
    newCells.h.push(height);
  }

  // Deduplicate points that are extremely close (within 0.01 degrees).
  // d3-geo-voronoi produces degenerate cells for duplicate/near-duplicate
  // sites, which breaks downstream feature markup.
  const seen = new Map();
  const deduped = { p: [], g: [], h: [] };
  for (let k = 0; k < newCells.p.length; k++) {
    const [lon, lat] = newCells.p[k];
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    deduped.p.push(newCells.p[k]);
    deduped.g.push(newCells.g[k]);
    deduped.h.push(newCells.h[k]);
  }

  const { cells: packCells, vertices } = calculateVoronoi(deduped.p);
  pack.vertices = vertices;
  pack.cells = packCells;
  pack.cells.p = deduped.p;
  pack.cells.g = createTypedArray({ maxValue: grid.points.length, from: deduped.g });
  pack.cells.h = createTypedArray({ maxValue: 100, from: deduped.h });
  pack.cells.area = createTypedArray({ maxValue: TYPED_ARRAY_MAX.UINT16, length: packCells.i.length }).map(
    (_, cellId) => {
      const area = Math.abs(polygonArea(getPackPolygon(cellId)));
      return Math.min(area, TYPED_ARRAY_MAX.UINT16);
    }
  );
}
