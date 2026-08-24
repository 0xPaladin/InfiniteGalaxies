import { mean } from "d3";
import { createNoise2D } from "simplex-noise";
import Alea from "alea";
import { rn } from "../utils/index.js";
import { pack, grid, seed } from "../src/state.js";
import { TIME } from "../utils/debug.js";

function getDefaultBiomes() {
  const name = [
    "Marine",
    "Hot desert",
    "Cold desert",
    "Savanna",
    "Grassland",
    "Tropical seasonal forest",
    "Temperate deciduous forest",
    "Tropical rainforest",
    "Temperate rainforest",
    "Taiga",
    "Tundra",
    "Glacier",
    "Wetland"
  ];

  const color = [
    "#466eab",
    "#fbe79f",
    "#b5b887",
    "#d2d082",
    "#c8d68f",
    "#b6d95d",
    "#29bc56",
    "#7dcb35",
    "#409c43",
    "#4b6b32",
    "#96784b",
    "#d5e7eb",
    "#0b9131"
  ];
  const habitability = [0, 4, 10, 22, 30, 50, 100, 80, 90, 12, 4, 0, 12];
  const iconsDensity = [0, 3, 2, 120, 120, 120, 120, 150, 150, 100, 5, 0, 250];
  const weightedIcons = [
    {},
    { dune: 3, cactus: 6, deadTree: 1 },
    { dune: 9, deadTree: 1 },
    { acacia: 1, grass: 9 },
    { grass: 1 },
    { acacia: 8, palm: 1 },
    { deciduous: 1 },
    { acacia: 5, palm: 3, deciduous: 1, swamp: 1 },
    { deciduous: 6, swamp: 1 },
    { conifer: 1 },
    { grass: 1 },
    {},
    { swamp: 1 }
  ];
  const cost = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150];
  const icons = weightedIcons.map(iconWeights =>
    Object.entries(iconWeights).flatMap(([icon, weight]) => Array(weight).fill(icon))
  );

  return name.map((name, i) => ({
    i,
    name,
    color: color[i],
    habitability: habitability[i],
    iconsDensity: iconsDensity[i],
    icons: icons[i],
    cost: cost[i]
  }));
}

// hot ↔ cold [>19°C; <-4°C]; dry ↕ wet
const biomesMatrix = [
  // Moisture 0 (Hyper-Arid): Hot Desert -> Cold Desert -> Tundra
  new Uint8Array([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10]),
  // Moisture 1 (Semi-Arid): Savanna -> Grassland -> Cold Steppe -> Taiga -> Tundra
  new Uint8Array([3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10]),
  // Moisture 2 (Subhumid / Moderate): Trop Seasonal Forest -> Deciduous Forest -> Taiga -> Tundra
  new Uint8Array([5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10]),
  // Moisture 3 (Humid): Tropical Rainforest -> Temp Rainforest / Deciduous -> Taiga -> Tundra
  new Uint8Array([7, 7, 7, 5, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10]),
  // Moisture 4 (Very Wet): Tropical Rainforest -> Temperate Rainforest -> Taiga -> Tundra
  new Uint8Array([7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10])
];

class BiomesGenerator {
  MIN_LAND_HEIGHT = 20;

  getDefault() {
    return getDefaultBiomes();
  }

  generate() {
    pack.biomes = this.getDefault();
    this.define();
  }

  define() {
    TIME && console.time("defineBiomes");
    if (!pack.biomes?.length) pack.biomes = this.getDefault();

    const { fl: flux, r: riverIds, h: heights, c: neighbors, g: gridReference, p: points } = pack.cells;
    const { temp, prec } = grid.cells;
    pack.cells.biome = new Uint8Array(pack.cells.i.length); // biomes array

    const noise2D = createNoise2D(Alea(seed + "biomes"));

    const calculateMoisture = cellId => {
      let moisture = prec[gridReference[cellId]];
      if (riverIds[cellId]) moisture += Math.max(flux[cellId] / 8, 3);

      const moistAround = neighbors[cellId]
        .filter(neibCellId => heights[neibCellId] >= this.MIN_LAND_HEIGHT)
        .map(c => prec[gridReference[c]])
        .concat([moisture]);
      return rn(mean(moistAround));
    };

    for (let cellId = 0; cellId < heights.length; cellId++) {
      const height = heights[cellId];
      if (height < this.MIN_LAND_HEIGHT) {
        pack.cells.biome[cellId] = 0; // marine
        continue;
      }

      const moisture = calculateMoisture(cellId);
      const temperature = temp[gridReference[cellId]];
      const [x, y] = points[cellId];

      // Organic low-frequency multi-octave noise at cell level
      const n1 = noise2D(x * 0.005, y * 0.005);
      const n2 = noise2D(x * 0.015 + 10, y * 0.015 + 10) * 0.5;
      const noiseVal = n1 + n2;

      const tempJitter = noiseVal * 2.5;
      const moistJitter = noise2D(x * 0.006 + 50, y * 0.006 + 50) * 3.0;

      pack.cells.biome[cellId] = this.getId(
        moisture + moistJitter,
        temperature + tempJitter,
        height,
        Boolean(riverIds[cellId])
      );
    }

    TIME && console.timeEnd("defineBiomes");
  }

  getId(moisture, temperature, height, hasRiver) {
    if (height < 20) return 0; // all water cells: marine biome
    if (temperature < -7) return 11; // glacier/permafrost biome
    if (temperature < -4 && moisture < 10) return 10; // tundra
    if (temperature >= 26 && !hasRiver && moisture < 4) return 1; // hot desert only when extremely dry & hot
    if (this.isWetland(moisture, temperature, height)) return 12; // wetland

    // Scale moisture into [0-4] band based on calibrated thresholds:
    // 0: hyper-arid (<3), 1: semi-arid (3-5), 2: subhumid (5-12), 3: humid (12-20), 4: very wet (20+)
    let moistureBand = 0;
    if (moisture >= 20) moistureBand = 4;
    else if (moisture >= 12) moistureBand = 3;
    else if (moisture >= 5) moistureBand = 2;
    else if (moisture >= 3) moistureBand = 1;

    const temperatureBand = Math.min(Math.max((20 - temperature) | 0, 0), 25); // [0-25]
    return biomesMatrix[moistureBand][temperatureBand];
  }

  isWetland(moisture, temperature, height) {
    if (temperature <= -2) return false; // too cold
    if (moisture > 40 && height < 25) return true; // near coast
    if (moisture > 24 && height > 24 && height < 60) return true; // off coast
    return false;
  }
}

export const Biomes = new BiomesGenerator();
