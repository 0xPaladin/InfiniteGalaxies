// What kind of life a culture is, and which worlds it wants (POPULATION_PLAN.md §12).
// Deliberately one bioform per world type that currently exists — see the
// expansion-content note below before adding more.

export const BIOFORMS = ['terran', 'cryophile', 'thermophile', 'lithic', 'gasborne', 'machine'];

// Expansion content (not this phase): aquatic/amphibious, hive, and energy/plasma
// bioforms are parked until the world-type list grows enough to give them
// something to want (ocean worlds, hive-density mechanics, non-corporeal habitation).

const ALIEN_BASELINE = {
  terran: 0.10,
  cryophile: 0.45,
  thermophile: 0.50,
  lithic: 0.55,
  gasborne: 0.70,
  machine: 0.85
};

// Founding weights — terran-ish life stays common; cloud-dwellers and machine
// intelligences stay rare enough to feel like a find.
const FOUNDING_WEIGHTS = { terran: 30, lithic: 25, cryophile: 15, thermophile: 15, gasborne: 8, machine: 7 };

// Which bioforms a given one can drift into on inheritance (§12.2) — a plausible
// neighbor set, not a strict linear order. `lithic` is the hub: rock-dwelling
// life plausibly drifts toward almost anything.
const ADJACENT = {
  terran: ['lithic', 'cryophile'],
  cryophile: ['terran', 'lithic'],
  thermophile: ['lithic', 'gasborne'],
  lithic: ['terran', 'thermophile', 'machine'],
  gasborne: ['thermophile', 'machine'],
  machine: ['lithic', 'gasborne']
};

const DRIFT_CHANCE = 0.05;

// Affinity table (§12.1) — how much a bioform wants a given surface type, 0..1.
// No row is all-zeros off its favorite: a terran culture WILL put a mining
// outpost on a barren moon, it just won't build a city there. That's what makes
// non-habitable worlds settleable — affinity multiplies scale, it doesn't gate it.
const AFFINITY = {
  terran: { habitable: 1.00, rocky: 0.50, icy: 0.30, hostile: 0.10, barren: 0.20, 'airless-moon': 0.20, 'gas giant': 0.10 },
  cryophile: { habitable: 0.40, rocky: 0.30, icy: 1.00, hostile: 0.05, barren: 0.20, 'airless-moon': 0.30, 'gas giant': 0.20 },
  thermophile: { habitable: 0.30, rocky: 0.40, icy: 0.05, hostile: 1.00, barren: 0.30, 'airless-moon': 0.10, 'gas giant': 0.30 },
  lithic: { habitable: 0.30, rocky: 0.80, icy: 0.40, hostile: 0.40, barren: 1.00, 'airless-moon': 0.80, 'gas giant': 0.05 },
  gasborne: { habitable: 0.20, rocky: 0.10, icy: 0.10, hostile: 0.30, barren: 0.05, 'airless-moon': 0.05, 'gas giant': 1.00 },
  machine: { habitable: 0.40, rocky: 0.60, icy: 0.60, hostile: 0.70, barren: 0.80, 'airless-moon': 0.90, 'gas giant': 0.40 }
};

export function rollBioform(rng) {
  return rng.weighted(BIOFORMS, BIOFORMS.map(b => FOUNDING_WEIGHTS[b]));
}

/** 95% unchanged, 5% drift to an adjacent bioform (§12.2). */
export function driftBioform(parentBioform, rng) {
  if (!rng.p(DRIFT_CHANCE)) return parentBioform;
  const options = ADJACENT[parentBioform] || [parentBioform];
  return rng.pick(options);
}

export function alienBaselineOf(bioform) {
  return ALIEN_BASELINE[bioform] ?? 0.5;
}

export function affinityFor(bioform, surfaceType) {
  return AFFINITY[bioform]?.[surfaceType] ?? 0;
}
