// Sector "development" score (POPULATION_PLAN.md §6.1) — how settled a cell
// reads, derived purely from its culture's live-cell footprint. Pure function
// of already-computed snapshot data; no randomness, nothing stateful.

const TIERS = [
  { name: 'core', min: 0.80 },
  { name: 'settled', min: 0.55 },
  { name: 'frontier', min: 0.30 },
  { name: 'fringe', min: 0.10 },
  { name: 'abandoned', min: 0 }
];

/**
 * @param {{gx:number, gy:number, alive:boolean, culture:number|null}} cell
 * @param {Object} cultureStats - snapshot.cultures (id -> {com, radius, ...})
 * @returns {number} 0..1
 */
export function developmentOf(cell, cultureStats) {
  if (cell.culture == null) return 0;
  const stats = cultureStats[cell.culture];
  if (!stats || stats.radius <= 0) return cell.alive ? 1.0 : 0.4;

  const dist = Math.hypot(cell.gx - stats.com[0], cell.gy - stats.com[1]);
  const proximity = Math.min(1, Math.max(0, 1 - dist / stats.radius));
  return (cell.alive ? 1.0 : 0.4) * proximity;
}

export function tierOf(development) {
  return TIERS.find(t => development >= t.min).name;
}
