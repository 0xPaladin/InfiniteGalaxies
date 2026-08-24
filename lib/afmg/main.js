import {
  grid,
  pack,
  config,
  setGrid,
  setPack,
  setSeed,
  setGraphSize
} from "./src/state.js";
import { resolvePath } from "./src/paths.js";
import { generateSeed, rand } from "./utils/index.js";

const REGION_TEMPLATE_DEFAULTS = ["continents", "oldWorld", "shattered"];

// apply the selected path's defaults for keys the caller didn't explicitly supply
function applyPathDefaults(config, path, options) {
  if (options.template === undefined) config.template = path.defaults.template;
  if (options.tempRange === undefined) config.tempRange = path.defaults.tempRange;
  if (options.winds === undefined) config.winds = path.defaults.winds;
  if (path.defaults.planetRadius !== undefined && options.planetRadius === undefined) {
    config.planetRadius = path.defaults.planetRadius;
  }
}

function mergeOptions(config, options) {
  if (options.width !== undefined) config.width = Number(options.width);
  if (options.height !== undefined) config.height = Number(options.height);
  if (Array.isArray(options.tempRange) && options.tempRange.length >= 3) {
    config.tempRange = [Number(options.tempRange[0]), Number(options.tempRange[1]), Number(options.tempRange[2])];
  }
  if (options.cells) config.cells = Number(options.cells);
  if (options.prec !== undefined) config.prec = Number(options.prec);
  if (options.winds) config.winds = options.winds;
  if (options.heightExponent !== undefined) config.heightExponent = Number(options.heightExponent);
  if (options.lakeElevationLimit !== undefined) config.lakeElevationLimit = Number(options.lakeElevationLimit);
  if (options.resolveDepressionsSteps !== undefined) {
    config.resolveDepressionsSteps = Number(options.resolveDepressionsSteps);
  }
  // planet options
  if (options.planetRadius !== undefined) config.planetRadius = Number(options.planetRadius);
  if (options.nPlates !== undefined) config.nPlates = Number(options.nPlates);
  if (options.mountainPower !== undefined) config.mountainPower = Number(options.mountainPower);
  if (options.template) config.template = options.template;
}

export async function generateMap(options = {}) {
  const path = resolvePath(options.mode);

  applyPathDefaults(config, path, options);
  mergeOptions(config, options);

  if (!config.template) {
    config.template = REGION_TEMPLATE_DEFAULTS[Math.floor(rand() * REGION_TEMPLATE_DEFAULTS.length)];
  }

  const seedValue = options.seed || generateSeed();
  config.seed = seedValue;
  setSeed(seedValue);

  path.setupDimensions(config, setGraphSize);

  const g = path.generateGrid();
  setGrid(g);

  grid.cells.h = await path.Heightmap.generate(grid);
  setPack({});

  path.Features.markupGrid();
  path.Lakes.addLakesInDeepDepressions();
  path.Lakes.openNearSeaLakes();

  path.calculateTemperatures();
  path.generatePrecipitation();

  path.reGraph(grid);
  path.Features.markupPack();

  path.Rivers.generate();
  path.Biomes.generate();
  path.Features.defineGroups();

  path.Ice.generate();

  return { grid, pack, mode: path.id, getPackPolygon: path.getPackPolygon };
}
