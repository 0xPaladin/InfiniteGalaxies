import { PRNG } from '../random.js';
import { childSeed } from '../seed.js';
import { rollBioform, driftBioform, alienBaselineOf } from './bioform.js';
import { TL_MIN, successorTL } from './tech.js';

// Three axes that roll uniformly and drift freely toward each other with no
// pull back to a baseline. `alien` is handled separately (see rollAlien/
// driftAlien below) because its founding roll is bioform-centered, not uniform —
// POPULATION_PLAN.md §12.2.
const TRAIT_AXES = ['expansionist', 'industrial', 'insular'];
const TRAIT_DRIFT = 0.15;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = n => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function randColor(rng) {
  const h = rng.range(0, 360);
  const s = rng.range(30, 100);
  const l = rng.range(20, 80);
  return hslToHex(h, s, l);
}

function rollTraits(rng) {
  const traits = {};
  TRAIT_AXES.forEach(axis => { traits[axis] = +rng.rand().toFixed(3); });
  return traits;
}

function driftTraits(parentTraits, rng) {
  const traits = {};
  TRAIT_AXES.forEach(axis => {
    traits[axis] = +clamp01(parentTraits[axis] + rng.range(-TRAIT_DRIFT, TRAIT_DRIFT)).toFixed(3);
  });
  return traits;
}

// Seeds from the bioform's baseline at founding; every generation after that
// drifts freely with no pull back toward the baseline — a terran lineage can
// become completely alien over enough generations (§12.2, decision #2).
function rollAlien(bioform, rng) {
  return +clamp01(alienBaselineOf(bioform) + rng.range(-TRAIT_DRIFT, TRAIT_DRIFT)).toFixed(3);
}

function driftAlien(parentAlien, rng) {
  return +clamp01(parentAlien + rng.range(-TRAIT_DRIFT, TRAIT_DRIFT)).toFixed(3);
}

/**
 * Append-only culture registry. A culture's identity (bioform, parent, origin,
 * traits) is set once at founding and never changes. Two fields ARE mutated in
 * place after that, deliberately: `deadStep`/`extinctionCause` (set once, by
 * markDead) and `tl` (ticks upward over the culture's life via setTL — advancing
 * technology isn't a lineage event, it doesn't get a new id).
 */
export class CultureRegistry {
  constructor(seed) {
    this.seed = seed;
    this.byId = new Map();
    this._nextId = 0;
  }

  /**
   * Found a new culture.
   * `opts.parent` (a culture id) makes this a successor/schism child.
   * `opts.inheritKind`: 'successor' (dark-age TL penalty, §12A.2) or 'schism'
   * (TL carries over exactly). Ignored/unused for a fresh founding (no parent).
   */
  found(step, origin, opts = {}) {
    const id = this._nextId++;
    const rng = new PRNG(childSeed(this.seed, 'culture', id));
    const parentRecord = opts.parent != null ? this.byId.get(opts.parent) : null;

    let bioform, tl, traits;
    if (!parentRecord) {
      bioform = rollBioform(rng);
      tl = TL_MIN;
      traits = { ...rollTraits(rng), alien: rollAlien(bioform, rng) };
    } else {
      bioform = driftBioform(parentRecord.bioform, rng);
      tl = opts.inheritKind === 'successor' ? successorTL(parentRecord.tl, rng) : parentRecord.tl;
      traits = { ...driftTraits(parentRecord.traits, rng), alien: driftAlien(parentRecord.traits.alien, rng) };
    }

    const record = {
      id,
      parent: opts.parent ?? null,
      // 'successor' | 'schism' | null (fresh founding) — distinguishes a
      // dark-age revival from a geographic split from a genesis founding.
      // Set once, never changes, same append-only spirit as everything else
      // on this record. Read by galaxy/archetypes.js to flavor birth/resettle
      // systems differently for each origin kind.
      inheritKind: opts.inheritKind ?? null,
      bornStep: step,
      deadStep: null,
      extinctionCause: null,
      color: randColor(rng),
      origin,
      bioform,
      tl: +tl.toFixed(1),
      traits
    };
    this.byId.set(id, record);
    return record;
  }

  /** @param {'died-out'|'transcended'} cause */
  markDead(id, step, cause) {
    const r = this.byId.get(id);
    if (r && r.deadStep == null) { r.deadStep = step; r.extinctionCause = cause; }
  }

  setTL(id, tl) {
    const r = this.byId.get(id);
    if (r) r.tl = +tl.toFixed(1);
  }

  get(id) {
    return this.byId.get(id);
  }

  /** Living cultures (deadStep === null), in ascending id order (deterministic). */
  living() {
    return [...this.byId.values()].filter(r => r.deadStep == null).sort((a, b) => a.id - b.id);
  }

  toPlainObject() {
    const out = {};
    for (const [id, rec] of this.byId) out[id] = rec;
    return out;
  }
}
