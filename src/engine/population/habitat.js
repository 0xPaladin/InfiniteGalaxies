// The habitat catalog (POPULATION_PLAN.md §13) — pure data + predicates. Nothing
// here rolls randomness itself; callers (habitation.js) own the RNG and seed
// chain, this module only answers "is X eligible here, and how likely/big."

import { affinityFor } from './bioform.js';
import { populationFactor } from './tech.js';

const SURFACE_TYPES = ['habitable', 'rocky', 'icy', 'hostile', 'barren', 'airless-moon'];

// `class` drives the TL-5+ preference shift (§15.1): 'surface' habitats get
// deprioritized once a culture goes constructed/orbital; 'constructed' ones
// (all gated minTL >= 5.0 anyway) get boosted; 'industrial' dips slightly;
// anything left as 'neutral' is unaffected by TL either way.
//
// `baseChance` is a rough placement-likelihood constant — these are tuned
// defaults, not derived from anything, and the first thing worth adjusting
// once real galaxies can be inspected (see POPULATION_PLAN.md §16 test 4/7).
export const HABITATS = {
  // §13.0a — baseline (TL 4.0+)
  outpost: { level: 'planet', class: 'surface', attachesTo: SURFACE_TYPES, minTL: 4.0, minDev: 0.10, scale: [10, 1e3], affinitySource: 'bioform', baseChance: 0.50 },
  'mining outpost': { level: 'planet', class: 'industrial', attachesTo: ['barren', 'rocky', 'airless-moon', 'icy'], minTL: 4.0, minDev: 0.15, scale: [1e2, 1e4], affinitySource: 'industrial', baseChance: 0.40 },
  'gas mine': { level: 'planet', class: 'industrial', attachesTo: ['gas giant'], minTL: 4.0, minDev: 0.20, scale: [1e2, 1e4], affinitySource: 'industrial', baseChance: 0.35 },
  town: { level: 'planet', class: 'surface', attachesTo: SURFACE_TYPES, minTL: 4.0, minDev: 0.30, scale: [1e3, 1e5], affinitySource: 'bioform', baseChance: 0.35 },
  'orbital station': { level: 'orbit', class: 'neutral', attachesTo: 'any', minTL: 4.2, minDev: 0.40, scale: [1e3, 1e6], affinitySource: 'flat:0.6', baseChance: 0.30 },
  'deep space station': { level: 'sector', class: 'neutral', attachesTo: 'sector', minTL: 4.2, minDev: 0.30, scale: [1e3, 1e5], affinitySource: 'flat:0.5', baseChance: 0.30 },
  dome: { level: 'planet', class: 'surface', attachesTo: ['barren', 'airless-moon', 'hostile', 'icy'], minTL: 4.3, minDev: 0.30, scale: [1e3, 1e6], affinitySource: 'bioform-min:0.4', baseChance: 0.30 },
  'research station': { level: 'planet', class: 'neutral', attachesTo: SURFACE_TYPES, bonusOn: ['hostile', 'icy', 'airless-moon'], minTL: 4.3, minDev: 0.45, scale: [10, 1e3], affinitySource: 'flat:0.5', baseChance: 0.25 },
  city: { level: 'planet', class: 'surface', attachesTo: SURFACE_TYPES, minTL: 4.5, minDev: 0.55, scale: [1e5, 1e8], affinitySource: 'bioform', baseChance: 0.25 },
  'cloud city': { level: 'planet', class: 'surface', attachesTo: ['gas giant'], minTL: 4.5, minDev: 0.55, scale: [1e4, 1e7], affinitySource: 'bioform', baseChance: 0.20 },
  shipyard: { level: 'orbit', class: 'industrial', attachesTo: 'any', minTL: 4.6, minDev: 0.70, scale: [1e4, 1e5], affinitySource: 'industrial', baseChance: 0.15 },

  // §13.0b — megastructures (TL 5.0+). Preferred over surface habitats once a
  // culture reaches this bracket (§15.1), not just "also available."
  'orbital habitat': { level: 'orbit', class: 'constructed', attachesTo: 'any', minTL: 5.0, minDev: 0.40, scale: [1e5, 1e7], affinitySource: 'flat:0.6', baseChance: 0.20, megastructure: true },
  arcology: { level: 'planet', class: 'constructed', attachesTo: SURFACE_TYPES, minTL: 5.0, minDev: 0.60, scale: [1e6, 1e8], affinitySource: 'bioform', baseChance: 0.12, megastructure: true },
  'capital ship': { level: 'sector', class: 'constructed', attachesTo: 'sector', minTL: 5.2, minDev: 0.50, scale: [1e4, 1e6], affinitySource: 'flat:0.5', baseChance: 0.10, megastructure: true, mobile: true },
  'stellar collector': { level: 'star', class: 'constructed', attachesTo: 'star', minTL: 5.4, minDev: 0.70, scale: [1e3, 1e5], affinitySource: 'flat:0.5', baseChance: 0.08, megastructure: true },
  'ringworld segment': { level: 'star', class: 'constructed', attachesTo: 'star', minTL: 5.7, minDev: 0.85, scale: [1e7, 1e9], affinitySource: 'flat:0.5', baseChance: 0.03, megastructure: true }
};

// §13.2 — unclaimed/abandoned-space occupants. Not tied to a living culture, so
// they carry no bioform/TL gating; habitation.js rolls these independently.
export const OCCUPANTS = {
  derelict: { level: 'sector' },
  'pirate haven': { level: 'sector' }
};

const TL_PREFERENCE = {
  surface: { low: 1.0, high: 0.5 },
  constructed: { low: 1.0, high: 1.5 }, // gated minTL>=5.0, so "low" branch never applies in practice
  industrial: { low: 1.0, high: 0.8 },
  neutral: { low: 1.0, high: 1.0 }
};

function tlPreference(habitat, tl) {
  const pref = TL_PREFERENCE[habitat.class] || TL_PREFERENCE.neutral;
  return tl >= 5.0 ? pref.high : pref.low;
}

function resolveAffinity(habitat, ctx, surfaceType) {
  const src = habitat.affinitySource;
  if (src === 'bioform') return affinityFor(ctx.bioform, surfaceType);
  if (src.startsWith('bioform-min:')) return Math.max(affinityFor(ctx.bioform, surfaceType), Number(src.slice(12)));
  if (src === 'industrial') return ctx.traits.industrial;
  if (src.startsWith('flat:')) return Number(src.slice(5));
  return 0;
}

export function habitatEligible(habitat, ctx, surfaceType) {
  if (ctx.tl < habitat.minTL) return false;
  if (ctx.development < habitat.minDev) return false;
  if (habitat.attachesTo === 'sector' || habitat.attachesTo === 'star' || habitat.attachesTo === 'any') return true;
  return habitat.attachesTo.includes(surfaceType);
}

/** All habitats at a given level (`'planet'|'orbit'|'sector'|'star'`) this context/surface qualifies for. */
export function eligibleHabitats(level, ctx, surfaceType) {
  return Object.entries(HABITATS)
    .filter(([, h]) => h.level === level && habitatEligible(h, ctx, surfaceType))
    .map(([name, h]) => ({ name, ...h }));
}

/**
 * Placement likelihood for one habitat at one candidate site (§15). A caller
 * rolls against this with its own seeded rng — nothing here consumes entropy.
 */
export function placementChance(habitat, ctx, surfaceType) {
  const affinity = resolveAffinity(habitat, ctx, surfaceType);
  const expansionistFactor = 0.5 + ctx.traits.expansionist;
  const bonus = habitat.bonusOn && habitat.bonusOn.includes(surfaceType) ? 1.5 : 1;
  return ctx.development * affinity * habitat.baseChance * expansionistFactor * tlPreference(habitat, ctx.tl) * bonus;
}

/** Log-uniform population roll within the habitat's scale band, then scaled by context. */
export function rollPopulation(habitat, ctx, surfaceType, rng) {
  const affinity = resolveAffinity(habitat, ctx, surfaceType);
  const [lo, hi] = habitat.scale;
  const base = Math.pow(10, rng.range(Math.log10(lo), Math.log10(hi)));
  return Math.max(1, Math.round(base * ctx.development * affinity * populationFactor(ctx.tl)));
}
