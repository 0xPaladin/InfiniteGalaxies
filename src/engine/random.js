export class PRNG {
  constructor(seed, type = "alea") {
    this.prng = type === 'alea' ? aleaPRNG(seed) : mulberry32(seed);
  }

  rand() {
    return this.prng();
  }

  range(min, max) {
    return min + this.rand() * (max - min);
  }

  p(p) {
    return this.rand() < p;
  }

  d(sides) {
    return Math.floor(this.prng() * sides) + 1;
  }

  dice(ndx) {
    const [n, d] = ndx.split('d').map(Number);
    return Array.from({ length: n }, () => this.d(d)).reduce((s, val) => s + val, 0);
  }

  pick(arr) {
    return arr[Math.floor(this.prng() * arr.length)];
  }

  weighted(arr, weights) {
    const total = weights.reduce((s, val) => s + val, 0);
    let r = this.prng() * total;

    //Find the item that corresponds to the random number
    for (let i = 0; i < arr.length; i++) {
      if (r < weights[i]) {
        return arr[i];
      }
      r -= weights[i];
    }
  }
}

/**
 * Create a mulberry32 PRNG function from a numeric seed.
 * @param {number} seed - 32-bit integer seed
 * @returns {function(): number} A function that returns a float in [0, 1)
 */
export function mulberry32(seed) {
  let s = typeof seed === 'string' ? seedFromString(str) : seed;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string to a numeric seed (32-bit).
 * @param {string} str - The string to hash
 * @returns {number} A 32-bit integer seed
 */
export function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash; // 32-bit clamp
  }
  return Math.abs(hash) || 42;
}