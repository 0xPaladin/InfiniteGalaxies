// Picks which surface cells count as "neighbors" of a given cell, and which of
// the 14 vendored AFMG heightmap templates (lib/afmg/data/heightmap-templates.js)
// best fits that cell's local context — POPULATION_PLAN.md's per-cell-region
// design: "use the cell, its latitude, and its neighbors to determine which
// region template to use." Pure functions of (cells, index/cell, lat) — no RNG
// consumed here beyond the seeded `rng` a caller passes in for tie-breaking, so
// the whole thing stays deterministic under the existing seed-chain contract.

// Cheap angular-distance approximation on a lon/lat point cloud, good enough at
// the scale neighbors are picked from (this is a heuristic for template choice,
// not a physically exact great-circle calc). Handles longitude wraparound at
// ±180°, which a plain Euclidean distance on raw (lon,lat) would get wrong.
function angularDist(lon1, lat1, lon2, lat2) {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = lat2 - lat1;
  const latRad = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dx = dLon * Math.cos(latRad);
  return Math.sqrt(dx * dx + dLat * dLat);
}

/** The `k` nearest OTHER cells to `cells[index]`, by angular distance. O(n) — fine for a one-off, lazy, per-click call. */
export function findNeighbors(cells, index, k = 8) {
  const center = cells[index];
  return cells
    .map((c, i) => (i === index ? null : { c, d: angularDist(center.x, center.y, c.x, c.y) }))
    .filter(Boolean)
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map(e => e.c);
}

const TEMPLATES_BY_CATEGORY = {
  allWater: ['lowIsland'],
  mostlyWater: ['archipelago', 'atoll'],
  someWater: ['peninsula', 'isthmus', 'mediterranean'],
  desert: ['taklamakan'],
  highRelief: ['highIsland', 'volcano'],
  veryRough: ['fractious', 'shattered'],
  flat: ['pangea', 'continents'],
  default: ['continents', 'oldWorld']
};

function isWaterBiome(biome) {
  return /marine|ocean|sea|lake/i.test(biome || '');
}

/**
 * Which named AFMG heightmap template (POPULATION_PLAN.md) best fits this cell's
 * local neighborhood. In-house planet types (rocky/icy/hostile/barren/airless-moon)
 * have no water biome at all, so `waterFrac` is always 0 for them and the pick
 * falls through to elevation/roughness/desert buckets — appropriate, since
 * "coastal" isn't a meaningful concept on those world types.
 *
 * @param {{x:number,y:number,elev:number,moisture?:number,biome?:string}} cell
 * @param {Array} neighbors - from findNeighbors()
 * @param {number} lat - the cell's own latitude (cell.y)
 * @param {import('../random.js').PRNG} rng - seeded, for picking among tied options
 */
export function selectTemplate(cell, neighbors, lat, rng) {
  const all = [cell, ...neighbors];
  const elevs = all.map(c => c.elev ?? 0);
  const minE = Math.min(...elevs), maxE = Math.max(...elevs);
  const avgE = elevs.reduce((a, b) => a + b, 0) / elevs.length;
  const roughness = maxE - minE;

  const waterFrac = neighbors.length ? neighbors.filter(c => isWaterBiome(c.biome)).length / neighbors.length : 0;
  const cellIsWater = isWaterBiome(cell.biome);
  const isDesert = !cellIsWater && (/desert/i.test(cell.biome || '') || ((cell.moisture ?? 0) < 15 && Math.abs(lat) < 35));

  let bucket;
  if (cellIsWater && waterFrac > 0.8) bucket = 'allWater';
  else if (cellIsWater || waterFrac > 0.5) bucket = 'mostlyWater';
  else if (waterFrac > 0) bucket = 'someWater';
  else if (isDesert) bucket = 'desert';
  else if (avgE > 70) bucket = 'highRelief';
  else if (roughness > 45) bucket = 'veryRough';
  else if (roughness < 15) bucket = 'flat';
  else bucket = 'default';

  const options = TEMPLATES_BY_CATEGORY[bucket];
  return options.length > 1 ? rng.pick(options) : options[0];
}
