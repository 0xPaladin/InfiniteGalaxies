import { generateMap } from '../../../lib/afmg/main.js';
import { dynamicCellCount, TARGET_REGION_SIDE_KM } from './sphere-geo.js';

// AFMGData reseeds the GLOBAL Math.random for the duration of generation
// (Math.random = Alea(seed) — see docs/afmg-integration.md). Restore it afterward
// so that mutation doesn't leak into anything else running in the page.
async function withRestoredRandom(fn) {
  const saved = Math.random;
  try {
    return await fn();
  } finally {
    Math.random = saved;
  }
}

function biomeGlyph(name) {
  if (/marine/i.test(name)) return '~';
  if (/desert/i.test(name)) return '.';
  if (/rainforest|forest/i.test(name)) return '♠';
  if (/glacier/i.test(name)) return '*';
  if (/tundra/i.test(name)) return '"';
  if (/wetland/i.test(name)) return '≈';
  if (/savanna|grassland/i.test(name)) return ',';
  if (/taiga/i.test(name)) return '^';
  return '.';
}

// AFMGData's pack.cells is parallel typed arrays over an irregular Voronoi point
// cloud, not a dense grid — see docs/afmg-integration.md. Map it into our shared
// PlanetSurface.cells shape (IMPLEMENTATION_PLAN.md §4.2) without rasterizing.
//
// temp/prec are NOT pack.cells fields — AFMG's climate sim runs on the finer
// simulation grid (grid.cells.temp / grid.cells.prec) and pack cells only
// carry `.g`, a reference index back into that grid (see e.g. AFMG's own
// generators/biomes.js: `temp[gridReference[cellId]]`). Reading `pack.cells.temp`
// directly (as this used to) always came back undefined, so every surface
// cell's temp/moisture silently landed as `null` — this is why region.js's
// habitable-biome bias had nothing to bias with.
function mapPackCells(pack, grid) {
  const { cells, biomes } = pack;
  const n = cells.i.length;
  const out = new Array(n);
  for (let idx = 0; idx < n; idx++) {
    const [x, y] = cells.p[idx];
    const biomeDef = biomes[cells.biome[idx]] || { name: 'unknown' };
    const g = cells.g[idx];
    out[idx] = {
      x, y,
      elev: cells.h[idx],
      temp: grid.cells.temp ? grid.cells.temp[g] : null,
      moisture: grid.cells.prec ? grid.cells.prec[g] : null,
      biome: biomeDef.name
    };
  }
  return out;
}

function mapPalette(biomes) {
  const palette = {};
  biomes.forEach(b => {
    palette[b.name] = { glyph: biomeGlyph(b.name), fg: b.color, bg: '#000000' };
  });
  return palette;
}

/**
 * Habitable-world surface via the vendored AFMGData generator (mode: 'planet').
 * Async because generateMap() genuinely awaits multi-stage work — see
 * IMPLEMENTATION_PLAN.md §4.2. Returns the same PlanetSurface shape as the
 * synchronous in-house generators (src/engine/planet/{rocky,icy,...}.js).
 */
export async function generateHabitableSurface(seed, planet, opts = {}) {
  const radiusKm = planet.radius || 6371; // planet.radius is already km (astrophysics.js)

  // Cell count sized so each surface cell's equivalent region comes out under
  // ~200km a side (region.js's per-cell-region model) — bigger planets get more
  // cells, not a fixed count regardless of size.
  const cells = opts.cells || dynamicCellCount(radiusKm, TARGET_REGION_SIDE_KM);

  const map = await withRestoredRandom(() => generateMap({
    mode: 'planet',
    seed,
    planetRadius: radiusKm,
    cells
  }));

  return {
    seed,
    type: 'habitable',
    HI: planet.HI,
    radius: planet.radius,
    gravity: planet.g,
    hydrographics: planet.hydrographics,
    atmosphere: planet.atmosphere,
    meanTempC: planet.tempC,
    bounds: { minX: -180, maxX: 180, minY: -90, maxY: 90 },
    cells: mapPackCells(map.pack, map.grid),
    regions: [],
    palette: mapPalette(map.pack.biomes)
  };
}

const LAND_FEATURE_TYPES = new Set(['island', 'isle', 'continent', 'lake', 'lake_island']);

// pack.features/pack.rivers are cell-id-referencing, not point data — resolve a
// representative x,y from the cell graph so they fit the shared {kind,x,y,...}
// feature shape (IMPLEMENTATION_PLAN.md §6.1).
function mapFeatures(pack) {
  const out = [];
  (pack.features || []).forEach(f => {
    if (!LAND_FEATURE_TYPES.has(f.type)) return; // skip ocean/sea/gulf — already implied by Marine biome
    const p = pack.cells.p[f.firstCell];
    if (!p) return;
    out.push({ kind: f.type, x: p[0], y: p[1], area: f.area });
  });
  (pack.rivers || []).forEach(r => {
    const p = pack.cells.p[r.mouth];
    if (!p) return;
    out.push({ kind: 'river', x: p[0], y: p[1], name: r.name, length: r.length });
  });
  return out;
}

/**
 * A local equal-area-square region via the vendored AFMGData generator
 * (mode: 'region') — AFMGData's own hydrology/climate/biome pipeline for one
 * planet surface cell's worth of local detail (POPULATION_PLAN.md's
 * per-cell-region design). Used for EVERY planet type, not just habitable
 * ones. `opts.heightmap`, from cell-terrain.js's prepareCellTerrain(), ramps
 * from this cell's OWN elevation to its 8 neighbors' at the region's edges —
 * so terrain shape actually reflects where on the planet this region sits,
 * instead of AFMG's internal random template pick.
 *
 * For non-habitable planet types, region.js discards this map's own biome
 * classification (`cells[].biome` below) and re-derives it from that planet
 * type's own profile.biome() instead — AFMGData's biome classifier assumes an
 * Earth-like water cycle that doesn't fit a barren/hostile/icy/airless world;
 * only the geologically-plausible elevation SHAPE this generates gets reused
 * there. Same Math.random-restore wrapper and async signature as
 * generateHabitableSurface above. `sites` is intentionally NOT populated here —
 * AFMGData is a terrain generator, not a population sim; site placement is done
 * by region.js from terrain + habitation data.
 *
 * @param {string} seed
 * @param {{sizeKm: number, cells?: number, heightmap: Function, tempC?: number}} opts -
 *   `tempC`, when given, centers AFMG's own region-mode tempRange config on that
 *   single value (flat — a region is small enough that a north/south gradient
 *   within it isn't meaningful) instead of the generic region-mode default.
 */
export async function generateCellRegion(seed, opts = {}) {
  const size = opts.sizeKm || 100;
  const cells = opts.cells || (size * size) / 4; // adapt for 2km per cell
  const map = await withRestoredRandom(() => generateMap({
    mode: 'region',
    seed,
    width: size,
    height: size,
    cells: cells > 25000 ? 25000 : cells,
    heightmap: opts.heightmap,
    tempRange: opts.tempC != null ? [opts.tempC, opts.tempC, opts.tempC] : undefined
  }));

  return {
    seed,
    bounds: { minX: 0, maxX: size, minY: 0, maxY: size },
    cells: mapPackCells(map.pack, map.grid),
    features: mapFeatures(map.pack),
    palette: mapPalette(map.pack.biomes)
  };
}
