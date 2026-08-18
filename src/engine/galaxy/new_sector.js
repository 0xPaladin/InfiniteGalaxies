import {generateStar} from './stars.js';
import { MakeName } from '../random_name.js';

/**
 * Generate a 100×100 ASCII map of a 1000 ly cube
 * (each tile ≈ 10 ly in x/y, full 1000 ly depth collapsed into z)
 *
 * @param {number} seed
 * @returns {object} { map: string, stars: array, stats: object }
 */
function generateSector(seed = Date.now()) {
  const rng = mulberry32(seed | 0);

  const WIDTH = 100;
  const HEIGHT = 100;
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('.'));

  const names = [];
  const stars = [];

  // -------------------------------------------------
  // 1. Seed 6–10 main-sequence habitable candidates
  // -------------------------------------------------
  const habCount = 6 + Math.floor(rng() * 5); // 6–10
  for (let i = 0; i < habCount; i++) {
    const star = generateStar(rng, { forceHabitable: true });
    star.name = MakeName(names, RNG);
    placeStar(star, grid, stars, rng, WIDTH, HEIGHT);
  }

  // -------------------------------------------------
  // 2. Add remaining stars/multiples → total 90–120
  // -------------------------------------------------
  const totalTarget = 90 + Math.floor(rng() * 31); // 90–120
  while (stars.length < totalTarget) {
    const star = generateStar(rng);
    star.name = MakeName(names, RNG);
    placeStar(star, grid, stars, rng, WIDTH, HEIGHT);
  }

  return { stars };
}

/**
 * Place a star on the grid (simple random free-ish placement)
 */
function placeStar(star, grid, stars, rng, W, H) {
  // Try a few times to avoid exact same tile pile-up (still allowed)
  let x, y, attempts = 0;
  do {
    x = Math.floor(rng() * W);
    y = Math.floor(rng() * H);
    attempts++;
  } while (grid[y][x] !== '.' && attempts < 8);

  star.x = x;
  star.y = y;
  stars.push(star);
}