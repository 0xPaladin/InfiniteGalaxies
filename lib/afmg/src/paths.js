// Registry of the two generation paths (geometries) supported by generateMap().
// "region" is a flat xy grid; "planet" is a full 3D globe using spherical geo-voronoi.
// Each path bundles the modules and defaults specific to its geometry so main.js
// can stay geometry-agnostic and simply dispatch through path.<step>().

import {
  generateGrid as regionGenerateGrid,
  reGraph as regionReGraph,
  getPackPolygon as regionGetPackPolygon
} from "../utils/graphUtils.js";
import {
  generateGrid as planetGenerateGrid,
  reGraph as planetReGraph,
  getPackPolygon as planetGetPackPolygon
} from "../utils/planet_graph.js";

import { HeightmapGenerator as RegionHeightmapGenerator } from "../generators/heightmap-generator.js";
import { HeightmapGenerator as PlanetHeightmapGenerator } from "../generators/planet_heightmap.js";

import { Features as RegionFeatures } from "../generators/features.js";
import { Features as PlanetFeatures } from "../generators/planet_features.js";

import {
  addLakesInDeepDepressions as regionAddLakesInDeepDepressions,
  openNearSeaLakes as regionOpenNearSeaLakes
} from "../generators/lakes.js";
import {
  addLakesInDeepDepressions as planetAddLakesInDeepDepressions,
  openNearSeaLakes as planetOpenNearSeaLakes
} from "../generators/planet_lakes.js";

import {
  calculateTemperatures as regionCalculateTemperatures,
  generatePrecipitation as regionGeneratePrecipitation
} from "../generators/climate.js";
import {
  calculateTemperatures as planetCalculateTemperatures,
  generatePrecipitation as planetGeneratePrecipitation
} from "../generators/planet_climate.js";

import { Rivers as RegionRivers } from "../generators/river-generators.js";
import { Rivers as PlanetRivers } from "../generators/planet_river.js";

import { Biomes as RegionBiomes } from "../generators/biomes.js";
import { Biomes as PlanetBiomes } from "../generators/planet_biomes.js";

import { Ice } from "../generators/ice.js";

// Configure graph pixel dimensions based on aspect ratio of the region's width/height (km)
function setupRegionDimensions(config, setGraphSize) {
  const BASE = 1000;
  setGraphSize(config.width || BASE, config.height || BASE);
}

export const paths = {
  region: {
    id: "region",
    defaults: {
      template: null, // random of continents|oldWorld|shattered, picked in main.js
      tempRange: [0, 12, 20],
      winds: [225, 45, 90, 90, 45, 225]
    },
    setupDimensions: (config, setGraphSize) => setupRegionDimensions(config, setGraphSize),
    generateGrid: regionGenerateGrid,
    reGraph: regionReGraph,
    getPackPolygon: regionGetPackPolygon,
    Heightmap: RegionHeightmapGenerator,
    Features: RegionFeatures,
    Lakes: {
      addLakesInDeepDepressions: regionAddLakesInDeepDepressions,
      openNearSeaLakes: regionOpenNearSeaLakes
    },
    calculateTemperatures: regionCalculateTemperatures,
    generatePrecipitation: regionGeneratePrecipitation,
    Rivers: RegionRivers,
    Biomes: RegionBiomes,
    Ice
  },
  planet: {
    id: "planet",
    defaults: {
      template: "plates",
      tempRange: [-20, 27, -20],
      winds: [240, 250, 260, 280, 290, 300],
      planetRadius: 6371
    },
    setupDimensions: () => { }, // a globe has no px aspect ratio to configure
    generateGrid: planetGenerateGrid,
    reGraph: planetReGraph,
    getPackPolygon: planetGetPackPolygon,
    Heightmap: PlanetHeightmapGenerator,
    Features: PlanetFeatures,
    Lakes: {
      addLakesInDeepDepressions: planetAddLakesInDeepDepressions,
      openNearSeaLakes: planetOpenNearSeaLakes
    },
    calculateTemperatures: planetCalculateTemperatures,
    generatePrecipitation: planetGeneratePrecipitation,
    Rivers: PlanetRivers,
    Biomes: PlanetBiomes,
    Ice
  }
};

const PLANET_ALIASES = new Set(["planet", "globe", "world", "sphere"]);
const REGION_ALIASES = new Set(["region", "flat", "local"]);

export function normalizeMode(mode) {
  const m = (mode || "region").toString().trim().toLowerCase();
  if (PLANET_ALIASES.has(m)) return "planet";
  if (REGION_ALIASES.has(m)) return "region";
  return "region";
}

export function resolvePath(mode) {
  return paths[normalizeMode(mode)];
}
