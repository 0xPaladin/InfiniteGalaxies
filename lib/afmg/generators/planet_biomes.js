import { mean } from "d3";
import { createNoise3D } from "simplex-noise";
import Alea from "alea";
import { rn, toCartesian } from "../utils/index.js";
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
    "Wetland",
    "Alpine tundra",
    "Montane snow"
  ];

  const color = [
    "#466eab", // 0: Marine
    "#fbe79f", // 1: Hot desert (sandy tan)
    "#b5b887", // 2: Cold desert (dusty khaki)
    "#d8c874", // 3: Savanna (warm acacia grassland / golden-olive)
    "#a4c878", // 4: Grassland / Steppe (soft meadow green)
    "#6dbd45", // 5: Tropical seasonal forest (vibrant yellow-green jungle canopy)
    "#34a352", // 6: Temperate deciduous forest (classic leafy green)
    "#126e38", // 7: Tropical rainforest (deep lush equatorial rainforest green)
    "#2d8058", // 8: Temperate rainforest (cool coastal emerald green)
    "#3d5932", // 9: Taiga / Boreal forest (dark pine needle green)
    "#96784b", // 10: Tundra (earthy brown)
    "#d5e7eb", // 11: Glacier (ice white-cyan)
    "#1a856a", // 12: Wetland (deep swamp teal)
    "#808872", // 13: Alpine tundra (rocky slate-green)
    "#f0f6f8"  // 14: Montane snow (snow white)
  ];
  const habitability = [0, 4, 10, 22, 30, 50, 100, 80, 90, 12, 4, 0, 12, 2, 0];
  const iconsDensity = [0, 3, 2, 120, 120, 120, 120, 150, 150, 100, 5, 0, 250, 2, 0];
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
    { swamp: 1 },
    { grass: 1 },
    {}
  ];
  const cost = [10, 200, 150, 60, 50, 70, 70, 80, 90, 200, 1000, 5000, 150, 1500, 8000];
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

    const noise3D = createNoise3D(Alea(seed + "biomes"));

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
      const [lon, lat] = points[cellId];

      // Organic low-frequency multi-octave 3D noise across the unit sphere
      const [nx, ny, nz] = toCartesian([lon, lat]);
      const n1 = noise3D(nx * 5, ny * 5, nz * 5);
      const n2 = noise3D(nx * 15 + 10, ny * 15 + 10, nz * 15 + 10) * 0.5;
      const noiseVal = n1 + n2;

      const tempJitter = noiseVal * 2.5;
      const moistJitter = noise3D(nx * 6 + 50, ny * 6 + 50, nz * 6 + 50) * 3.0;

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

    // Extreme high alpine / montane ice & snow (highest peaks & polar heights)
    if (temperature < -7) return 11; // glacier/permafrost biome
    // True snowcapped peaks: high elevation with below-freezing temperatures
    if (height >= 85 && temperature < 0) return 14; // high alpine / montane permanent snow
    // Alpine tundra: high mountain scrub/scree
    if (height >= 75 && temperature < 4) return 13; // alpine tundra

    if (temperature < -4 && moisture < 12) return 10; // lowland tundra
    if (this.isWetland(moisture, temperature, height)) return 12; // wetland

    // Effective Moisture Index (Aridity / Potential Evapotranspiration scaling)
    // Higher temperatures accelerate evaporation and plant water stress,
    // requiring greater precipitation to maintain tropical and seasonal forests.
    const heatStress = Math.max(0, (temperature - 8) * 0.04);
    const effectiveMoisture = moisture / (1 + heatStress);

    // Calibrated moisture bands based on effective moisture:
    // 0: hyper-arid / desert (< 6)
    // 1: semi-arid / savanna / grassland (6 - 18)
    // 2: subhumid / seasonal & deciduous forest (18 - 32)
    // 3: humid / rainforest (32 - 45)
    // 4: very wet / dense rainforest (45+)
    let moistureBand = 0;
    if (effectiveMoisture >= 45) moistureBand = 4;
    else if (effectiveMoisture >= 32) moistureBand = 3;
    else if (effectiveMoisture >= 18) moistureBand = 2;
    else if (effectiveMoisture >= 6) moistureBand = 1;

    // Pure Tropical Zone (>= 18°C): Equatorial lowlands & plateaus
    if (temperature >= 18) {
      if (moistureBand >= 3) return 7; // Tropical rainforest (#7dcb35)
      if (moistureBand === 2) return 5; // Tropical seasonal forest (#b6d95d)
      if (moistureBand === 1) return 3; // Savanna (#d2d082)
      return 1; // Hot desert (#fbe79f)
    }

    // Warm Subtropical Zone (13°C - 18°C): Blends tropical & warm temperate biomes
    if (temperature >= 13) {
      if (moistureBand >= 3) return 8; // Temperate rainforest (#409c43)
      if (moistureBand === 2) return 5; // Tropical seasonal / subtropical forest (#b6d95d)
      if (moistureBand === 1) return 3; // Savanna / warm grassland (#d2d082)
      return 1; // Hot desert (#fbe79f)
    }

    // Temperate Zone (5°C - 13°C): Mid-latitude forests and steppes
    if (temperature >= 5) {
      if (moistureBand >= 3) return 8; // Temperate rainforest (#409c43)
      if (moistureBand === 2) return 6; // Temperate deciduous forest (#29bc56)
      if (moistureBand === 1) return 4; // Grassland / steppe (#c8d68f)
      return 2; // Cold desert (#b5b887)
    }

    // Boreal / Subpolar Zone (< 5°C): Taiga and Tundra
    if (moistureBand >= 2) return 9; // Taiga (#4b6b32)
    if (moistureBand === 1) return 4; // Cold steppe (#c8d68f)
    return 10; // Tundra (#96784b)
  }

  isWetland(moisture, temperature, height) {
    if (temperature <= -2) return false; // too cold
    if (moisture > 40 && height < 22) return true; // near coast
    return false;
  }
}

export const Biomes = new BiomesGenerator();
