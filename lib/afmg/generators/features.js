import Alea from "alea";
import { polygonArea } from "d3";
import {
  clipPoly,
  connectVertices,
  createTypedArray,
  distanceSquared,
  isLand,
  isWater,
  rn,
  TYPED_ARRAY_MAX
} from "../utils/index.js";
import { seed, grid, pack, graphWidth, graphHeight } from "../src/state.js";
import { TIME } from "../utils/debug.js";
import { Lakes } from "./lakes.js";

const NON_NAVIGABLE_LAKE_GROUPS = new Set(["dry", "frozen", "lava"]);

class FeatureModule {
  DEEPER_LAND = 3;
  LANDLOCKED = 2;
  LAND_COAST = 1;
  UNMARKED = 0;
  WATER_COAST = -1;
  DEEP_WATER = -2;

  /**
   * calculate distance to coast for every cell
   */
  markup({ distanceField, neighbors, start, increment, limit = TYPED_ARRAY_MAX.INT8 }) {
    for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
      marked = 0;
      const prevDistance = distance - increment;
      for (let cellId = 0; cellId < neighbors.length; cellId++) {
        if (distanceField[cellId] !== prevDistance) continue;

        for (const neighborId of neighbors[cellId]) {
          if (distanceField[neighborId] === this.UNMARKED) {
            distanceField[neighborId] = distance;
            marked++;
          }
        }
      }
    }
  }

  /**
   * mark Grid features (ocean, lakes, islands) and calculate distance field
   */
  markupGrid() {
    TIME && console.time("markupGrid");
    Math.random = Alea(seed); // get the same result on heightmap edit in Erase mode

    const { h: heights, c: neighbors, b: borderCells, i } = grid.cells;
    const cellsNumber = i.length;
    const distanceField = new Int8Array(cellsNumber); // gird.cells.t
    const featureIds = new Uint16Array(cellsNumber); // gird.cells.f
    const features = [];

    const queue = [0];
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      featureIds[firstCell] = featureId;

      const land = heights[firstCell] >= 20;
      let border = false; // set true if feature touches map edge

      while (queue.length) {
        const cellId = queue.pop();
        if (!border && borderCells[cellId]) border = true;

        for (const neighborId of neighbors[cellId]) {
          const isNeibLand = heights[neighborId] >= 20;

          if (land && !isNeibLand) {
            distanceField[cellId] = this.LAND_COAST;
            distanceField[neighborId] = this.WATER_COAST;
          }

          if (land === isNeibLand && featureIds[neighborId] === this.UNMARKED) {
            featureIds[neighborId] = featureId;
            queue.push(neighborId);
          }
        }
      }

      const type = land ? "island" : border ? "ocean" : "lake";
      features.push({ i: featureId, land, border, type });

      queue[0] = featureIds.indexOf(this.UNMARKED); // find unmarked cell
    }

    // markup deep ocean cells
    this.markup({
      distanceField,
      neighbors,
      start: this.DEEP_WATER,
      increment: -1,
      limit: -10
    });
    // markup land cells distance to coast via BFS
    const landQueue = [];
    for (let cellId = 0; cellId < cellsNumber; cellId++) {
      if (distanceField[cellId] === this.LAND_COAST) landQueue.push(cellId);
    }
    let head = 0;
    while (head < landQueue.length) {
      const curr = landQueue[head++];
      const d = distanceField[curr];
      for (const n of neighbors[curr]) {
        if (heights[n] >= 20 && distanceField[n] === this.UNMARKED) {
          distanceField[n] = Math.min(120, d + 1);
          landQueue.push(n);
        }
      }
    }
    grid.cells.t = distanceField;
    grid.cells.f = featureIds;
    grid.features = [0, ...features];

    TIME && console.timeEnd("markupGrid");
  }

  /**
   * mark PackedGraph features (oceans, lakes, islands) and calculate distance field
   */
  markupPack() {
    const defineHaven = cellId => {
      const waterCells = neighbors[cellId].filter(index => isWater(index, pack));
      const distances = waterCells.map(neibCellId => distanceSquared(cells.p[cellId], cells.p[neibCellId]));
      const closest = distances.indexOf(Math.min.apply(Math, distances));

      haven[cellId] = waterCells[closest];
      harbor[cellId] = waterCells.length;
    };

    const getCellsData = (featureType, firstCell) => {
      if (featureType === "ocean") return [firstCell, []];

      const getType = cellId => featureIds[cellId];
      const type = getType(firstCell);
      const ofSameType = cellId => getType(cellId) === type;
      const ofDifferentType = cellId => getType(cellId) !== type;

      const startCell = findOnBorderCell(firstCell);
      const featureVertices = getFeatureVertices(startCell);
      return [startCell, featureVertices];

      function findOnBorderCell(firstCell) {
        const isOnBorder = cellId => borderCells[cellId] || neighbors[cellId].some(ofDifferentType);
        if (isOnBorder(firstCell)) return firstCell;

        const startCell = cells.i.filter(ofSameType).find(isOnBorder);
        if (startCell === undefined) throw new Error(`Markup: firstCell ${firstCell} is not on the feature or map border`);

        return startCell;
      }

      function getFeatureVertices(startCell) {
        const startingVertex = cells.v[startCell].find(v => vertices.c[v].some(ofDifferentType));
        if (startingVertex === undefined) throw new Error(`Markup: startingVertex for cell ${startCell} is not found`);

        return connectVertices({
          vertices,
          startingVertex,
          ofSameType,
          closeRing: false
        });
      }
    };

    const addFeature = ({ firstCell, land, border, featureId, totalCells }) => {
      const type = land ? "island" : border ? "ocean" : "lake";
      const [startCell, featureVertices] = getCellsData(type, firstCell);
      const points = clipPoly(featureVertices.map(vertex => vertices.p[vertex]), graphWidth, graphHeight);
      const area = polygonArea(points); // feature perimiter area
      const absArea = Math.abs(rn(area));

      const feature = {
        i: featureId,
        type,
        land,
        border,
        cells: totalCells,
        firstCell: startCell,
        vertices: featureVertices,
        area: absArea,
        shoreline: [],
        height: 0
      };

      if (type === "lake") {
        if (area > 0) feature.vertices = feature.vertices.reverse();
        feature.shoreline = Lakes.defineShoreline(feature);
        feature.height = Lakes.getHeight(feature);
      }

      return feature;
    };

    TIME && console.time("markupPack");

    const { cells, vertices } = pack;
    const { c: neighbors, b: borderCells, i } = cells;
    const packCellsNumber = i.length;
    if (!packCellsNumber) return; // no cells -> there is nothing to do

    const distanceField = new Int8Array(packCellsNumber); // pack.cells.t
    const featureIds = new Uint16Array(packCellsNumber); // pack.cells.f
    const haven = createTypedArray({
      maxValue: packCellsNumber,
      length: packCellsNumber
    }); // haven: opposite water cell
    const harbor = new Uint8Array(packCellsNumber); // harbor: number of adjacent water cells
    const features = [];

    const queue = [0];
    for (let featureId = 1; queue[0] !== -1; featureId++) {
      const firstCell = queue[0];
      featureIds[firstCell] = featureId;

      const land = isLand(firstCell, pack);
      let border = Boolean(borderCells[firstCell]); // true if feature touches map border
      let totalCells = 1; // count cells in a feature

      while (queue.length) {
        const cellId = queue.pop();
        if (borderCells[cellId]) border = true;

        for (const neighborId of neighbors[cellId]) {
          const isNeibLand = isLand(neighborId, pack);

          if (land && !isNeibLand) {
            distanceField[cellId] = this.LAND_COAST;
            distanceField[neighborId] = this.WATER_COAST;
            if (!haven[cellId]) defineHaven(cellId);
          } else if (land && isNeibLand) {
            if (distanceField[neighborId] === this.UNMARKED && distanceField[cellId] === this.LAND_COAST)
              distanceField[neighborId] = this.LANDLOCKED;
            else if (distanceField[cellId] === this.UNMARKED && distanceField[neighborId] === this.LAND_COAST)
              distanceField[cellId] = this.LANDLOCKED;
          }

          if (!featureIds[neighborId] && land === isNeibLand) {
            queue.push(neighborId);
            featureIds[neighborId] = featureId;
            totalCells++;
          }
        }
      }

      features.push(addFeature({ firstCell, land, border, featureId, totalCells }));
      queue[0] = featureIds.indexOf(this.UNMARKED); // find unmarked cell
    }

    this.markup({
      distanceField,
      neighbors,
      start: this.DEEPER_LAND,
      increment: 1
    }); // markup pack land
    this.markup({
      distanceField,
      neighbors,
      start: this.DEEP_WATER,
      increment: -1,
      limit: -10
    }); // markup pack water

    pack.cells.t = distanceField;
    pack.cells.f = featureIds;
    pack.cells.haven = haven;
    pack.cells.harbor = harbor;
    pack.features = [0, ...features];
    TIME && console.timeEnd("markupPack");
  }

  /**
   * define feature groups (ocean, sea, gulf, continent, island, isle, freshwater lake, salt lake, etc.)
   */
  defineGroups() {
    const gridCellsNumber = grid.cells.i.length;
    const OCEAN_MIN_SIZE = gridCellsNumber / 25;
    const SEA_MIN_SIZE = gridCellsNumber / 1000;
    const CONTINENT_MIN_SIZE = gridCellsNumber / 10;
    const ISLAND_MIN_SIZE = gridCellsNumber / 1000;

    const defineIslandGroup = feature => {
      const prevFeature = pack.features[pack.cells.f[feature.firstCell - 1]];
      if (prevFeature && prevFeature.type === "lake") return "lake_island";
      if (feature.cells > CONTINENT_MIN_SIZE) return "continent";
      if (feature.cells > ISLAND_MIN_SIZE) return "island";
      return "isle";
    };

    const defineOceanGroup = feature => {
      if (feature.cells > OCEAN_MIN_SIZE) return "ocean";
      if (feature.cells > SEA_MIN_SIZE) return "sea";
      return "gulf";
    };

    const defineLakeGroup = feature => {
      if (feature.temp < -3) return "frozen";
      if (feature.height > 60 && feature.cells < 10 && feature.firstCell % 10 === 0) return "lava";

      if (!feature.inlets && !feature.outlet) {
        if (feature.evaporation > feature.flux * 4) return "dry";
        if (feature.cells < 3 && feature.firstCell % 10 === 0) return "sinkhole";
      }

      if (!feature.outlet && feature.evaporation > feature.flux) return "salt";

      return "freshwater";
    };

    const defineGroup = feature => {
      if (feature.type === "island") return defineIslandGroup(feature);
      if (feature.type === "ocean") return defineOceanGroup(feature);
      if (feature.type === "lake") return defineLakeGroup(feature);
      throw new Error(`Markup: unknown feature type ${feature.type}`);
    };

    for (const feature of pack.features) {
      if (!feature || feature.type === "ocean") continue;

      if (feature.type === "lake") feature.height = Lakes.getHeight(feature);
      feature.group = defineGroup(feature);
    }
  }
}

export const Features = new FeatureModule();
