import Alea from "alea";
import { range as d3Range, leastIndex, mean } from "d3";
import { heightmapTemplates } from "../data/heightmap-templates.js";
import { createTypedArray, getNumberInRange, lim, minmax, P, rand } from "../utils/index.js";
import { findGridCell } from "../utils/graphUtils.js";
import { seed, graphWidth, graphHeight, config } from "../src/state.js";
import { ERROR, TIME } from "../utils/debug.js";

class HeightmapModule {
  grid = null;
  heights = null;
  blobPower = 0;
  linePower = 0;

  clearData() {
    this.heights = null;
    this.grid = null;
  }

  getBlobPower(cells) {
    const blobPowerMap = {
      1000: 0.93,
      2000: 0.95,
      5000: 0.97,
      10000: 0.98,
      20000: 0.99,
      30000: 0.991,
      40000: 0.993,
      50000: 0.994,
      60000: 0.995,
      70000: 0.9955,
      80000: 0.996,
      90000: 0.9964,
      100000: 0.9973
    };
    return blobPowerMap[cells] || 0.98;
  }

  getLinePower(cells) {
    const linePowerMap = {
      1000: 0.75,
      2000: 0.77,
      5000: 0.79,
      10000: 0.81,
      20000: 0.82,
      30000: 0.83,
      40000: 0.84,
      50000: 0.86,
      60000: 0.87,
      70000: 0.88,
      80000: 0.91,
      90000: 0.92,
      100000: 0.93
    };

    return linePowerMap[cells] || 0.81;
  }

  getPointInRange(range, length) {
    if (typeof range !== "string") {
      ERROR && console.error("Range should be a string");
      return;
    }

    const min = parseInt(range.split("-")[0], 10) / 100 || 0;
    const max = parseInt(range.split("-")[1], 10) / 100 || min;
    return rand(min * length, max * length);
  }

  setGraph(graph) {
    const { cellsDesired, cells, points } = graph;
    this.heights = cells.h
      ? Uint8Array.from(cells.h)
      : createTypedArray({
          maxValue: 100,
          length: points.length
        });
    this.blobPower = this.getBlobPower(cellsDesired);
    this.linePower = this.getLinePower(cellsDesired);
    this.grid = graph;
  }

  addHill(count, height, rangeX, rangeY) {
    const addOneHill = () => {
      if (!this.heights || !this.grid) return;
      const change = new Uint8Array(this.heights.length);
      let limit = 0;
      let start;
      const h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, graphWidth);
        const y = this.getPointInRange(rangeY, graphHeight);
        if (x === undefined || y === undefined) return;
        start = findGridCell(x, y, this.grid);
        limit++;
      } while (this.heights[start] + h > 90 && limit < 50);
      change[start] = h;
      const queue = [start];
      while (queue.length) {
        const q = queue.shift();

        for (const c of this.grid.cells.c[q]) {
          if (change[c]) continue;
          change[c] = change[q] ** this.blobPower * (Math.random() * 0.2 + 0.9);
          if (change[c] > 1) queue.push(c);
        }
      }

      this.heights = this.heights.map((h, i) => lim(h + change[i]));
    };

    const desiredHillCount = getNumberInRange(count);
    for (let i = 0; i < desiredHillCount; i++) {
      addOneHill();
    }
  }

  addPit(count, height, rangeX, rangeY) {
    const addOnePit = () => {
      if (!this.heights || !this.grid) return;
      const used = new Uint8Array(this.heights.length);
      let limit = 0;
      let start;
      let h = lim(getNumberInRange(height));

      do {
        const x = this.getPointInRange(rangeX, graphWidth);
        const y = this.getPointInRange(rangeY, graphHeight);
        if (x === undefined || y === undefined) return;
        start = findGridCell(x, y, this.grid);
        limit++;
      } while (this.heights[start] < 20 && limit < 50);

      const queue = [start];
      while (queue.length) {
        const q = queue.shift();
        h = h ** this.blobPower * (Math.random() * 0.2 + 0.9);
        if (h < 1) return;

        this.grid.cells.c[q].forEach(c => {
          if (used[c] || this.heights === null) return;
          this.heights[c] = lim(this.heights[c] - h * (Math.random() * 0.2 + 0.9));
          used[c] = 1;
          queue.push(c);
        });
      }
    };

    const desiredPitCount = getNumberInRange(count);
    for (let i = 0; i < desiredPitCount; i++) {
      addOnePit();
    }
  }

  addRange(count, height, rangeX, rangeY, startCellId, endCellId, randomness = 0.15) {
    if (!this.heights || !this.grid) return;

    const addOneRange = () => {
      if (!this.heights || !this.grid) return;

      // get main ridge
      const getRange = (cur, end) => {
        const range = [cur];
        const p = this.grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid.cells.c[cur].forEach(e => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            // compare against the top of the [0,1) range to keep seeded generation identical to the legacy `> 0.85`/`> 0.8` checks
            if (Math.random() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        const startX = this.getPointInRange(rangeX, graphWidth);
        const startY = this.getPointInRange(rangeY, graphHeight);

        let dist = 0;
        let limit = 0;
        let endY;
        let endX;

        do {
          endX = Math.random() * graphWidth * 0.8 + graphWidth * 0.1;
          endY = Math.random() * graphHeight * 0.7 + graphHeight * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < graphWidth / 8 || dist > graphWidth / 3) && limit < 50);

        startCellId = findGridCell(startX, startY, this.grid);
        endCellId = findGridCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId, endCellId);

      // add height to ridge and cells around
      let queue = range.slice();
      let i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach(i => {
          if (!this.heights) return;
          this.heights[i] = lim(this.heights[i] + h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach(f => {
          this.grid.cells.c[f].forEach(i => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur, d) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(
            this.grid.cells.c[cur],
            (a, b) => this.heights[a] - this.heights[b]
          );
          if (index === undefined) continue;
          const min = this.grid.cells.c[cur][index]; // downhill cell
          this.heights[min] = (this.heights[cur] * 2 + this.heights[min]) / 3;
          cur = min;
        }
      });
    };

    const desiredRangeCount = getNumberInRange(count);
    for (let i = 0; i < desiredRangeCount; i++) {
      addOneRange();
    }
  }

  addTrough(count, height, rangeX, rangeY, startCellId, endCellId, randomness = 0.2) {
    const addOneTrough = () => {
      if (!this.heights || !this.grid) return;

      // get main ridge
      const getRange = (cur, end) => {
        const range = [cur];
        const p = this.grid.points;
        used[cur] = 1;

        while (cur !== end) {
          let min = Infinity;
          this.grid.cells.c[cur].forEach(e => {
            if (used[e]) return;
            let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
            // compare against the top of the [0,1) range to keep seeded generation identical to the legacy `> 0.85`/`> 0.8` checks
            if (Math.random() > 1 - randomness) diff = diff / 2;
            if (diff < min) {
              min = diff;
              cur = e;
            }
          });
          if (min === Infinity) return range;
          range.push(cur);
          used[cur] = 1;
        }

        return range;
      };

      const used = new Uint8Array(this.heights.length);
      let h = lim(getNumberInRange(height));

      if (rangeX && rangeY) {
        // find start and end points
        let limit = 0;
        let startX;
        let startY;
        let dist = 0;
        let endX;
        let endY;
        do {
          startX = this.getPointInRange(rangeX, graphWidth);
          startY = this.getPointInRange(rangeY, graphHeight);
          startCellId = findGridCell(startX, startY, this.grid);
          limit++;
        } while (this.heights[startCellId] < 20 && limit < 50);

        limit = 0;
        do {
          endX = Math.random() * graphWidth * 0.8 + graphWidth * 0.1;
          endY = Math.random() * graphHeight * 0.7 + graphHeight * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit++;
        } while ((dist < graphWidth / 8 || dist > graphWidth / 2) && limit < 50);

        endCellId = findGridCell(endX, endY, this.grid);
      }

      const range = getRange(startCellId, endCellId);

      // add height to ridge and cells around
      let queue = range.slice(),
        i = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        i++;
        frontier.forEach(i => {
          this.heights[i] = lim(this.heights[i] - h * (Math.random() * 0.3 + 0.85));
        });
        h = h ** this.linePower - 1;
        if (h < 2) break;
        frontier.forEach(f => {
          this.grid.cells.c[f].forEach(i => {
            if (!used[i]) {
              queue.push(i);
              used[i] = 1;
            }
          });
        });
      }

      // generate prominences
      range.forEach((cur, d) => {
        if (d % 6 !== 0) return;
        for (const _l of d3Range(i)) {
          const index = leastIndex(
            this.grid.cells.c[cur],
            (a, b) => this.heights[a] - this.heights[b]
          );
          if (index === undefined) continue;
          const min = this.grid.cells.c[cur][index]; // downhill cell
          this.heights[min] = (this.heights[cur] * 2 + this.heights[min]) / 3;
          cur = min;
        }
      });
    };

    const desiredTroughCount = getNumberInRange(count);
    for (let i = 0; i < desiredTroughCount; i++) {
      addOneTrough();
    }
  }

  addStrait(width, direction = "vertical") {
    if (!this.heights || !this.grid) return;
    const desiredWidth = Math.min(getNumberInRange(width), this.grid.cellsX / 3);
    if (desiredWidth < 1 && P(desiredWidth)) return;
    const used = new Uint8Array(this.heights.length);
    const vert = direction === "vertical";
    const startX = vert ? Math.floor(Math.random() * graphWidth * 0.4 + graphWidth * 0.3) : 5;
    const startY = vert ? 5 : Math.floor(Math.random() * graphHeight * 0.4 + graphHeight * 0.3);
    const endX = vert
      ? Math.floor(graphWidth - startX - graphWidth * 0.1 + Math.random() * graphWidth * 0.2)
      : graphWidth - 5;
    const endY = vert
      ? graphHeight - 5
      : Math.floor(graphHeight - startY - graphHeight * 0.1 + Math.random() * graphHeight * 0.2);

    const start = findGridCell(startX, startY, this.grid);
    const end = findGridCell(endX, endY, this.grid);

    const getRange = (cur, end) => {
      const range = [];
      const p = this.grid.points;

      while (cur !== end) {
        let min = Infinity;
        this.grid.cells.c[cur].forEach(e => {
          let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
          if (Math.random() > 0.8) diff = diff / 2;
          if (diff < min) {
            min = diff;
            cur = e;
          }
        });
        range.push(cur);
      }

      return range;
    };
    let range = getRange(start, end);
    const query = [];

    const step = 0.1 / desiredWidth;

    for (let i = 0; i < desiredWidth; i++) {
      const remainingWidth = desiredWidth - i;
      const exp = 0.9 - step * remainingWidth;
      range.forEach(r => {
        this.grid.cells.c[r].forEach(e => {
          if (used[e]) return;
          used[e] = 1;
          query.push(e);
          this.heights[e] **= exp;
          if (this.heights[e] > 100) this.heights[e] = 5;
        });
      });
      range = query.slice();
    }
  }

  modify(range, add, mult, power) {
    if (!this.heights) return;
    const min = range === "land" ? 20 : range === "all" ? 0 : +range.split("-")[0];
    const max = range === "land" || range === "all" ? 100 : +range.split("-")[1];
    const isLand = min === 20;

    this.heights = this.heights.map(h => {
      if (h < min || h > max) return h;

      if (add) h = isLand ? Math.max(h + add, 20) : h + add;
      if (mult !== 1) h = isLand ? (h - 20) * mult + 20 : h * mult;
      if (power) h = isLand ? (h - 20) ** power + 20 : h ** power;
      return lim(h);
    });
  }

  smooth(fr = 2, add = 0) {
    if (!this.heights || !this.grid) return;
    this.heights = this.heights.map((h, i) => {
      const a = [h];
      this.grid.cells.c[i].forEach(c => {
        a.push(this.heights[c]);
      });
      if (fr === 1) return mean(a) + add;
      return lim((h * (fr - 1) + mean(a) + add) / fr);
    });
  }

  mask(power = 1) {
    if (!this.heights || !this.grid) return;
    const fr = power ? Math.abs(power) : 1;

    this.heights = this.heights.map((h, i) => {
      const [x, y] = this.grid.points[i];
      const nx = (2 * x) / graphWidth - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / graphHeight - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted, 0 is center, 1 is edge
      const masked = h * distance;
      return lim((h * (fr - 1) + masked) / fr);
    });
  }

  invert(count, axes) {
    if (!P(count) || !this.heights || !this.grid) return;

    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = this.grid;

    const inverted = this.heights.map((_h, i) => {
      if (!this.heights) return 0;
      const x = i % cellsX;
      const y = Math.floor(i / cellsX);

      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedI = nx + ny * cellsX;
      return this.heights[invertedI];
    });

    this.heights = inverted;
  }

  addStep(tool, a2, a3, a4, a5) {
    if (tool === "Hill") {
      this.addHill(a2, a3, a4, a5);
      return;
    }
    if (tool === "Pit") {
      this.addPit(a2, a3, a4, a5);
      return;
    }
    if (tool === "Range") {
      this.addRange(a2, a3, a4, a5);
      return;
    }
    if (tool === "Trough") {
      this.addTrough(a2, a3, a4, a5);
      return;
    }
    if (tool === "Strait") {
      this.addStrait(a2, a3);
      return;
    }
    if (tool === "Mask") {
      this.mask(+a2);
      return;
    }
    if (tool === "Invert") {
      this.invert(+a2, a3);
      return;
    }
    if (tool === "Add") {
      this.modify(a3, +a2, 1);
      return;
    }
    if (tool === "Multiply") {
      this.modify(a3, 0, +a2);
      return;
    }
    if (tool === "Smooth") {
      this.smooth(+a2);
      return;
    }
  }

  async generate(graph) {
    TIME && console.time("defineHeightmap");
    const id = config.template;
    Math.random = Alea(seed);
    const isTemplate = id in heightmapTemplates;

    const heights = isTemplate ? this.fromTemplate(graph, id) : await this.fromPrecreated(graph, id);
    TIME && console.timeEnd("defineHeightmap");

    this.clearData();
    return heights;
  }

  fromTemplate(graph, id) {
    const templateString = heightmapTemplates[id]?.template || "";
    const steps = templateString.split("\n");

    if (!steps.length) throw new Error(`Heightmap template: no steps. Template: ${id}. Steps: ${steps}`);
    this.setGraph(graph);

    for (const step of steps) {
      const elements = step.trim().split(" ");
      if (elements.length < 2) throw new Error(`Heightmap template: steps < 2. Template: ${id}. Step: ${elements}`);
      this.addStep(...elements);
    }

    return this.heights;
  }

  getHeightsFromImageData(imageData) {
    if (!this.heights) return;
    for (let i = 0; i < this.heights.length; i++) {
      const lightness = imageData[i * 4] / 255;
      const powered = lightness < 0.2 ? lightness : 0.2 + (lightness - 0.2) ** 0.8;
      this.heights[i] = minmax(Math.floor(powered * 100), 0, 100);
    }
  }

  fromPrecreated(graph, id) {
    return new Promise(resolve => {
      // create canvas where 1px corresponds to a cell
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const { cellsX, cellsY } = graph;
      canvas.width = cellsX;
      canvas.height = cellsY;

      // load heightmap into image and render to canvas
      const img = new Image();
      img.src = `./heightmaps/${id}.png`;
      img.onload = () => {
        if (!ctx) {
          throw new Error("Could not get canvas context");
        }
        this.heights = this.heights || new Uint8Array(cellsX * cellsY);
        ctx.drawImage(img, 0, 0, cellsX, cellsY);
        const imageData = ctx.getImageData(0, 0, cellsX, cellsY);
        this.setGraph(graph);
        this.getHeightsFromImageData(imageData.data);
        canvas.remove();
        img.remove();
        resolve(this.heights);
      };
    });
  }

  getHeights() {
    return this.heights;
  }
}

export const HeightmapGenerator = new HeightmapModule();
