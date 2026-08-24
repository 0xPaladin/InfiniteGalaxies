import Alea from "alea";
import { min } from "d3";
import { clipPoly, getGridPolygon, getIsolines, lerp, minmax, normalize, P, ra, rand, rn } from "../utils/index.js";
import { seed, graphWidth, graphHeight, grid, pack } from "../src/state.js";

class IceModule {
  regenerate() {
    this.generate();
  }

  // Generate glaciers and icebergs based on temperature and height
  generate() {
    this.clear();
    const { cells, features } = grid;
    const { temp, h } = cells;
    Math.random = Alea(seed);

    const ICEBERG_MAX_TEMP = 0;
    const GLACIER_MAX_TEMP = -8;
    const minMaxTemp = min(temp);

    // Generate glaciers on cold land
    {
      const type = "iceShield";
      const getType = cellId => (h[cellId] >= 20 && temp[cellId] <= GLACIER_MAX_TEMP ? type : null);
      const isolines = getIsolines(grid, getType, { polygons: true });

      if (isolines[type]?.polygons) {
        isolines[type].polygons.forEach(points => {
          const clipped = clipPoly(points, graphWidth, graphHeight);
          const ice = { i: this.getNextId(), points: clipped, type: "glacier" };
          pack.ice.push(ice);
        });
      }
    }

    // Generate icebergs on cold water
    for (const cellId of grid.cells.i) {
      const t = temp[cellId];
      if (h[cellId] >= 20) continue; // no icebergs on land
      if (t > ICEBERG_MAX_TEMP) continue; // too warm: no icebergs
      if (features[cells.f[cellId]].type === "lake") continue; // no icebergs on lakes
      if (P(0.8)) continue; // skip most of eligible cells

      const randomFactor = 0.8 + rand() * 0.4; // random size factor
      let baseSize = (1 - normalize(t, minMaxTemp, 1)) * 0.8; // size: 0 = zero, 1 = full
      if (cells.t[cellId] === -1) baseSize /= 1.3; // coastline: smaller icebergs
      const size = minmax(rn(baseSize * randomFactor, 2), 0.1, 1);

      const [cx, cy] = grid.points[cellId];
      const points = getGridPolygon(cellId, grid).map(([x, y]) => [
        rn(lerp(cx, x, size), 2),
        rn(lerp(cy, y, size), 2)
      ]);

      const ice = { i: this.getNextId(), points, type: "iceberg", cellId, size };
      pack.ice.push(ice);
    }
  }

  // Find next available id for new ice element idealy filling gaps
  getNextId() {
    if (pack.ice.length === 0) return 0;
    // find gaps in existing ids
    const existingIds = pack.ice.map(e => e.i).sort((a, b) => a - b);
    for (let id = 0; id < existingIds[existingIds.length - 1]; id++) {
      if (!existingIds.includes(id)) return id;
    }
    return existingIds[existingIds.length - 1] + 1;
  }

  clear() {
    pack.ice = [];
  }

  addIceberg(cellId, size) {
    const [cx, cy] = grid.points[cellId];
    const points = getGridPolygon(cellId, grid).map(([x, y]) => [
      rn(lerp(cx, x, size), 2),
      rn(lerp(cy, y, size), 2)
    ]);
    const id = this.getNextId();
    const ice = { i: id, points, type: "iceberg", cellId, size };
    pack.ice.push(ice);
  }

  removeIce(id) {
    const ice = pack.ice.find(ice => ice.i === id);
    if (ice) {
      const index = pack.ice.indexOf(ice);
      pack.ice.splice(index, 1);
    }
  }

  randomizeIcebergShape(id) {
    const iceberg = pack.ice.find(ice => ice.i === id);
    if (!iceberg || iceberg.type !== "iceberg") return;

    const cellId = iceberg.cellId;
    const size = iceberg.size;
    const [cx, cy] = grid.points[cellId];

    // Get a different random cell for the polygon template
    const i = ra(grid.cells.i);
    const cn = grid.points[i];
    const poly = getGridPolygon(i, grid).map(p => [p[0] - cn[0], p[1] - cn[1]]);
    const points = poly.map(p => [rn(cx + p[0] * size, 2), rn(cy + p[1] * size, 2)]);

    iceberg.points = points;
  }

  changeIcebergSize(id, newSize) {
    const iceberg = pack.ice.find(ice => ice.i === id);
    if (!iceberg || iceberg.type !== "iceberg") return;

    const cellId = iceberg.cellId;
    const [cx, cy] = grid.points[cellId];
    const oldSize = iceberg.size;

    const pairs = iceberg.points;
    const poly = pairs.map(p => [(p[0] - cx) / oldSize, (p[1] - cy) / oldSize]);
    const points = poly.map(p => [rn(cx + p[0] * newSize, 2), rn(cy + p[1] * newSize, 2)]);

    iceberg.points = points;
    iceberg.size = newSize;
  }
}

export const Ice = new IceModule();
