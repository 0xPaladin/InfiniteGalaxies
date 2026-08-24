// Biases a habitable region's AFMG-generated moisture/biome toward the
// parent surface cell's ACTUAL climate (its real temp/moisture from the
// planet-scale simulation, already carried on every surface cell). Without
// this, a region's biome is whatever AFMG's own from-scratch regional
// climate model happens to produce — clicking a forest surface cell could
// just as easily generate a desert region, since AFMG's region-mode climate
// sim has no idea what biome the parent cell actually was. cell-terrain.js
// already solves this for elevation (ramp to the parent's own value); this
// does the equivalent for moisture/biome.
//
// tempC bias (passed to generateCellRegion -> AFMG's tempRange config)
// already nudges AFMG's own local generation in roughly the right direction;
// this reclassification pass guarantees the final biome distribution
// actually centers on the parent's real climate, while still preserving
// AFMG's own per-cell noise-driven local variation (a patch of grassland
// inside a forest region, etc.) rather than a flat, artificial override.

// Reproduces AFMGData's own moisture x temperature biome classification
// (lib/afmg/generators/biomes.js) — duplicated here rather than imported
// because AFMG's own BiomesGenerator has no per-region climate context to
// bias with; we need the matrix as a standalone pure function instead.
const BIOME_NAMES = [
  'Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland',
  'Tropical seasonal forest', 'Temperate deciduous forest', 'Tropical rainforest',
  'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'
];

// hot <-> cold [>19C; <-4C]; dry <-> wet -- see lib/afmg/generators/biomes.js
const BIOMES_MATRIX = [
  [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10],
  [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10],
  [5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 5, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10]
];

function isWetland(moisture, temperature, elevation) {
  if (temperature <= -2) return false;
  if (moisture > 40 && elevation < 25) return true;
  if (moisture > 24 && elevation > 24 && elevation < 60) return true;
  return false;
}

/** Same classification AFMG's own Biomes generator uses, as a pure function. */
export function classifyBiome(moisture, temperature, elevation) {
  if (elevation < 20) return 'Marine';
  if (temperature < -7) return 'Glacier';
  if (temperature < -4 && moisture < 10) return 'Tundra';
  if (temperature >= 26 && moisture < 4) return 'Hot desert';
  if (isWetland(moisture, temperature, elevation)) return 'Wetland';

  let moistureBand = 0;
  if (moisture >= 20) moistureBand = 4;
  else if (moisture >= 12) moistureBand = 3;
  else if (moisture >= 5) moistureBand = 2;
  else if (moisture >= 3) moistureBand = 1;

  const temperatureBand = Math.min(Math.max((20 - temperature) | 0, 0), 25);
  return BIOME_NAMES[BIOMES_MATRIX[moistureBand][temperatureBand]];
}

/**
 * Rescales every land cell's moisture so the region's own mean moisture
 * matches the parent surface cell's real moisture, then reclassifies biome
 * from the rescaled moisture + (already tempC-biased) temperature. Marine
 * cells are left untouched — water/land boundary comes from the heightmap,
 * not from climate.
 *
 * @param {Array<{x,y,elev,temp,moisture,biome}>} cells
 * @param {{moisture?: number}} parentCell
 */
export function biasHabitableRegion(cells, parentCell) {
  const land = cells.filter(c => c.elev >= 20);
  if (!land.length || parentCell.moisture == null) return cells;

  const meanMoisture = land.reduce((s, c) => s + (c.moisture || 0), 0) / land.length;
  const scale = Math.max(0.35, Math.min(3, parentCell.moisture / Math.max(meanMoisture, 5)));

  return cells.map(c => {
    if (c.elev < 20) return c;
    const moisture = Math.max(0, Math.min(100, c.moisture * scale));
    return { ...c, moisture, biome: classifyBiome(moisture, c.temp, c.elev) };
  });
}
