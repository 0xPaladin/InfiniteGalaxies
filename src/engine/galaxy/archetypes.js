// Turns a sector's population history (or, for a sector no culture ever
// touched, its distance from one that was) into a plain list of "system
// specs" — what generateSector() (sector.js) actually builds systems from,
// replacing the old flat nHab/nSystems loops. Nothing here generates a
// system itself; each spec just says what seed/forceHabitable/ctx/origin a
// system should get. Pure functions of (pop, gx, gy, uptoStep, seed) — same
// inputs always produce the same plan.
import { childSeed } from '../seed.js';
import { PRNG } from '../random.js';
import { rollBioform, settlementBreadth } from '../population/bioform.js';
import { sectorLedger, ringDistanceToTouched } from '../population/ledger.js';

// Mean settlementBreadth across all 6 bioforms (2,3,3,5,6,7 -> 26/6) — the
// per-event system-count multiplier is normalized against this, so an
// average-breadth bioform (terran/cryophile, 3) contributes close to 1 system
// per event while a sprawling one (machine, 7) contributes noticeably more
// and a picky one (gasborne, 2) noticeably less.
const MEAN_BREADTH = 26 / 6;

// Measured against a real run: a heavily-churned sector (41 ledger events)
// was coming out at only 6-7 systems — thin next to an UNTOUCHED sector's
// 12-system baseline for a place nothing ever actually happened. This lifts
// touched sectors back above that bar (~2.5x -> roughly 15-18 for the same
// sector) while leaving the relative bioform ratios this factor encodes
// untouched — it's a flat multiplier on breadthFactor's output, not a
// separate knob, so it feeds identically into both the per-event and the
// per-sustained-culture counts below.
const TOUCHED_BASE_MULTIPLIER = 2.5;

function breadthFactor(bioform) {
  return (bioform ? settlementBreadth(bioform) / MEAN_BREADTH : 1) * TOUCHED_BASE_MULTIPLIER;
}

// Fractional multipliers need to show up in AGGREGATE across many events, not
// just round to the same integer every time — probabilistic rounding (seeded,
// so still fully deterministic) does that: a 1.4x factor gives an extra system
// 40% of the time rather than either always or never.
function probRound(rng, value) {
  const whole = Math.floor(value);
  const frac = value - whole;
  return whole + (rng.p(frac) ? 1 : 0);
}

function livingCtx(record, development, tier) {
  return {
    cultureId: record.id, bioform: record.bioform, tl: record.tl, traits: record.traits,
    development: development ?? 0.5, tier: tier ?? 'frontier', alive: true, formerClaims: []
  };
}

function deadCtx(record) {
  return {
    cultureId: null, bioform: null, tl: null, traits: null,
    development: 0, tier: 'abandoned', alive: false,
    formerClaims: record
      ? [{ cultureId: record.id, bioform: record.bioform, tl: record.tl, extinctionCause: record.extinctionCause }]
      : []
  };
}

const LIVING_KINDS = new Set(['birth', 'resettle', 'sustained', 'conflict', 'contested']);

function specForEvent(e, seedTag) {
  const ctx = LIVING_KINDS.has(e.kind) ? livingCtx(e.record, e.development, e.tier) : deadCtx(e.record);
  return {
    seedTag,
    forceHabitable: true, // every ledger-driven system traces back to a culture that actually lived there
    ctx,
    origin: { kind: e.kind, step: e.step, cultureId: e.cultureId, bioform: e.record ? e.record.bioform : null }
  };
}

/**
 * System specs for a sector at least one culture has ever claimed, as of
 * `uptoStep`. One system per historical event (birth/resettle/death/
 * extinction/transcension/conflict/contested), scaled by the OWNING
 * culture's bioform breadth (a wide-affinity bioform like machine claims more
 * marginal systems per event than a picky one like gasborne). `sustained`
 * steps don't add a system per step — they accumulate per culture and convert
 * to a small, diminishing-returns handful of "deepening" systems instead, so
 * a sector held by the same culture for 40 steps reads as thoroughly
 * developed, not as 40 near-duplicate colonies.
 *
 * @param {Object} pop - populationView() output
 * @param {number} gx
 * @param {number} gy
 * @param {number} uptoStep
 * @param {string} seed - the sector's own seed
 * @param {number} [densityScale] - GUI multiplier (0.5-2x), applied to every
 *   per-event/per-sustained count alongside the bioform breadth factor
 * @returns {Array} system specs (see module doc)
 */
export function planTouchedSector(pop, gx, gy, uptoStep, seed, densityScale = 1) {
  const events = sectorLedger(pop, gx, gy, uptoStep);
  const specs = [];
  let seedIdx = 0;
  const rng = new PRNG(childSeed(seed, 'archetype-touched'));

  const sustainedByCulture = new Map(); // cid -> {count, lastEvent}
  for (const e of events) {
    if (e.kind === 'sustained') {
      const s = sustainedByCulture.get(e.cultureId) || { count: 0, lastEvent: e };
      s.count++; s.lastEvent = e;
      sustainedByCulture.set(e.cultureId, s);
      continue;
    }
    const count = Math.max(1, probRound(rng, breadthFactor(e.record ? e.record.bioform : null) * densityScale));
    for (let i = 0; i < count; i++) {
      specs.push(specForEvent(e, childSeed(seed, 'system', seedIdx++)));
    }
  }

  for (const [, s] of sustainedByCulture) {
    const base = Math.ceil(Math.log2(1 + s.count)); // diminishing returns
    const count = Math.max(0, probRound(rng, base * breadthFactor(s.lastEvent.record ? s.lastEvent.record.bioform : null) * densityScale));
    for (let i = 0; i < count; i++) {
      specs.push(specForEvent(s.lastEvent, childSeed(seed, 'system', seedIdx++)));
    }
  }

  return specs;
}

const UNTOUCHED_BASE_COUNT = 4; // interesting / ruins / trouble each start here at ring 1

// Falls off linearly from ring 1 (full strength) to ring 6 (nothing) — a
// sector immediately adjacent to culture history reads as a real frontier;
// six sectors out, deep space is genuinely empty again.
function ringFalloff(ring) {
  if (!isFinite(ring) || ring < 1) return 0;
  return Math.max(0, 1 - (ring - 1) / 5);
}

const OCCUPANT_TYPES = ['pirate haven', 'derelict', 'rogue military'];

function neutralOutpostSpec(rng, seedTag) {
  const bioform = rollBioform(rng);
  const development = rng.range(0.2, 0.45);
  return {
    seedTag, forceHabitable: true,
    ctx: {
      cultureId: `neutral:${seedTag}`, bioform, tl: +rng.range(4.0, 4.6).toFixed(1),
      traits: { expansionist: rng.range(0.3, 0.7), industrial: rng.range(0.3, 0.7), insular: rng.range(0.3, 0.7), alien: rng.range(0.1, 0.4) },
      development, tier: development >= 0.3 ? 'frontier' : 'fringe', alive: true, formerClaims: []
    },
    origin: { kind: 'neutral-outpost', cultureId: null, bioform }
  };
}

function nativeCandidateSpec(seedTag) {
  // No living ctx at all — deliberately leaves the system's habitable world
  // (forceHabitable ensures one exists) for generateNativeCulture's own
  // independent, lazily-rolled TL 0-3 culture at planet-entry (native.js is
  // already designed for exactly this "no living interstellar ctx" case).
  return {
    seedTag, forceHabitable: true,
    ctx: { cultureId: null, bioform: null, tl: null, traits: null, development: 0, tier: 'abandoned', alive: false, formerClaims: [] },
    origin: { kind: 'native-candidate', cultureId: null, bioform: null }
  };
}

function ruinSpec(rng, seedTag) {
  const bioform = rollBioform(rng);
  const extinctionCause = rng.p(0.7) ? 'died-out' : 'transcended';
  return {
    seedTag, forceHabitable: true,
    ctx: {
      cultureId: null, bioform: null, tl: null, traits: null, development: 0, tier: 'abandoned', alive: false,
      // A precursor culture that predates (or lies outside) anything the
      // live sim ever modeled — not a real CultureRegistry id, just enough
      // shape for region.js's ruinSiteFromLocalCells to flavor a ruin from.
      formerClaims: [{ cultureId: `ancient:${seedTag}`, bioform, tl: +rng.range(4.0, 5.6).toFixed(1), extinctionCause }]
    },
    origin: { kind: 'ruins', cultureId: null, bioform }
  };
}

function troubleSpec(rng, seedTag) {
  const occupant = rng.pick(OCCUPANT_TYPES);
  const population = occupant === 'derelict' ? 0 : Math.round(Math.pow(10, rng.range(1, 4)));
  return {
    seedTag, forceHabitable: rng.p(0.5),
    ctx: { cultureId: null, bioform: null, tl: null, traits: null, development: 0, tier: 'abandoned', alive: false, formerClaims: [] },
    origin: { kind: 'trouble', cultureId: null, bioform: null, occupant },
    // Resolved eagerly (cheap, no surface needed) rather than deferred to
    // system-entry — same pattern generateSectorHabitation already uses for
    // sector-level derelicts/pirate havens.
    habitation: { seed: childSeed(seedTag, 'occupant'), habitats: [{ type: occupant, level: 'system', cultureId: null, population, pos: null }] }
  };
}

/**
 * System specs for a sector NO culture has ever claimed, as of `uptoStep`.
 * Starts from a baseline of 4 "interesting" (a neutral long-range outpost/
 * colony, or a candidate for a TL<=3 native culture), 4 ruins (precursor
 * flavor, not tied to any real registry culture), and 4 "trouble" (pirates,
 * derelicts, rogue military) — then fades all three out with ring-distance
 * from the nearest sector any culture has actually touched, so deep space
 * far from all history is genuinely empty rather than uniformly sparse.
 *
 * @param {Object} pop
 * @param {number} gx
 * @param {number} gy
 * @param {number} uptoStep
 * @param {Map} touchHorizon - ledger.js's buildTouchHorizon(pop) output
 * @param {string} seed - the sector's own seed
 * @param {number} [densityScale] - GUI multiplier (0.5-2x) on the 4/4/4 baseline
 */
export function planUntouchedSector(pop, gx, gy, uptoStep, touchHorizon, seed, densityScale = 1) {
  const ring = ringDistanceToTouched(touchHorizon, gx, gy, uptoStep);
  const falloff = ringFalloff(ring);
  if (falloff <= 0) return [];

  const rng = new PRNG(childSeed(seed, 'archetype-untouched'));
  const base = UNTOUCHED_BASE_COUNT * densityScale;
  const target = n => Math.max(0, probRound(rng, n * falloff));
  const nInteresting = target(base);
  const nRuins = target(base);
  const nTrouble = target(base);

  const specs = [];
  let seedIdx = 0;
  for (let i = 0; i < nInteresting; i++) {
    const seedTag = childSeed(seed, 'untouched', seedIdx++);
    specs.push(rng.p(0.5) ? neutralOutpostSpec(rng, seedTag) : nativeCandidateSpec(seedTag));
  }
  for (let i = 0; i < nRuins; i++) {
    specs.push(ruinSpec(rng, childSeed(seed, 'untouched', seedIdx++)));
  }
  for (let i = 0; i < nTrouble; i++) {
    specs.push(troubleSpec(rng, childSeed(seed, 'untouched', seedIdx++)));
  }
  return specs;
}
