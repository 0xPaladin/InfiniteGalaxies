import Alea from "alea";
import { createNoise3D } from "simplex-noise";
import { toCartesian, createTypedArray, minmax } from "../utils/index.js";
import { seed, config } from "../src/state.js";
import { TIME } from "../utils/debug.js";

/**
 * Multi-octave 3D Simplex noise generator
 */
function createFbmNoise(prng) {
    const noise3D = createNoise3D(prng);
    const persistence = 2 / 3;
    const octaves = 5;
    const amplitudes = Array.from({ length: octaves }, (_, i) => Math.pow(persistence, i));
    const sumOfAmplitudes = amplitudes.reduce((acc, v) => acc + v, 0);

    return function fbm(nx, ny, nz) {
        let sum = 0;
        for (let octave = 0; octave < octaves; octave++) {
            const frequency = 1 << octave;
            sum += amplitudes[octave] * noise3D(nx * frequency, ny * frequency, nz * frequency);
        }
        return sum / sumOfAmplitudes;
    };
}

/**
 * 3D vector helper utilities for calculations on the unit sphere
 */
const vec3 = {
    subtract: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    normalize: a => {
        const len = Math.hypot(a[0], a[1], a[2]);
        return len > 0 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
    }
};

/**
 * Pick P unique random cell IDs for plate seeds
 */
function pickRandomRegions(numRegions, count, randInt) {
    const chosen = new Set();
    const target = Math.min(count, numRegions);
    while (chosen.size < target) {
        chosen.add(randInt(numRegions));
    }
    return chosen;
}

/**
 * Generate plates on the spherical grid and assign 3D velocity vectors.
 * Based on Red Blob Games planet generation (lines 352-408).
 */
function generatePlates(grid, r_xyz, nPlates, prng) {
    const numRegions = grid.points.length;
    const r_plate = new Int32Array(numRegions);
    r_plate.fill(-1);

    const randInt = max => Math.floor(prng() * max);
    const plate_r = Array.from(pickRandomRegions(numRegions, nPlates, randInt));

    const queue = [...plate_r];
    for (const r of plate_r) {
        r_plate[r] = r;
    }

    // Flood fill using randomized BFS for organic plate boundaries
    for (let queue_out = 0; queue_out < queue.length; queue_out++) {
        const pos = queue_out + randInt(queue.length - queue_out);
        const current_r = queue[pos];
        queue[pos] = queue[queue_out];

        const neighbors = grid.cells.c[current_r] || [];
        for (const neighbor_r of neighbors) {
            if (r_plate[neighbor_r] === -1) {
                r_plate[neighbor_r] = r_plate[current_r];
                queue.push(neighbor_r);
            }
        }
    }

    // Assign a movement vector for each plate tangential to the sphere
    const plate_vec = {};
    for (const center_r of plate_r) {
        const neighbors = grid.cells.c[center_r] || [];
        const p0 = [r_xyz[3 * center_r], r_xyz[3 * center_r + 1], r_xyz[3 * center_r + 2]];

        if (neighbors.length > 0) {
            const neighbor_r = neighbors[randInt(neighbors.length)];
            const p1 = [r_xyz[3 * neighbor_r], r_xyz[3 * neighbor_r + 1], r_xyz[3 * neighbor_r + 2]];
            plate_vec[center_r] = vec3.normalize(vec3.subtract(p1, p0));
        } else {
            // Fallback random tangent vector
            const rx = prng() * 2 - 1;
            const ry = prng() * 2 - 1;
            const rz = prng() * 2 - 1;
            const randomVec = [rx, ry, rz];
            // Project onto tangent plane of sphere at p0
            const dot = p0[0] * rx + p0[1] * ry + p0[2] * rz;
            plate_vec[center_r] = vec3.normalize([rx - dot * p0[0], ry - dot * p0[1], rz - dot * p0[2]]);
        }
    }

    return { plate_r, r_plate, plate_vec };
}

/**
 * Randomized BFS distance field from a set of seed cells, stopping at stop_r cells.
 * Based on Red Blob Games planet generation (lines 411-446).
 */
function assignDistanceField(grid, seeds_r, stop_r, prng) {
    const randInt = max => Math.floor(prng() * max);
    const numRegions = grid.points.length;
    const r_distance = new Float32Array(numRegions);
    r_distance.fill(Infinity);

    const queue = [];
    for (const r of seeds_r) {
        queue.push(r);
        r_distance[r] = 0;
    }

    for (let queue_out = 0; queue_out < queue.length; queue_out++) {
        const pos = queue_out + randInt(queue.length - queue_out);
        const current_r = queue[pos];
        queue[pos] = queue[queue_out];

        const neighbors = grid.cells.c[current_r] || [];
        for (const neighbor_r of neighbors) {
            if (r_distance[neighbor_r] === Infinity && !stop_r.has(neighbor_r)) {
                r_distance[neighbor_r] = r_distance[current_r] + 1;
                queue.push(neighbor_r);
            }
        }
    }

    return r_distance;
}

/**
 * Collision analysis across plate boundaries simulating movement over deltaTime.
 * Based on Red Blob Games planet generation (lines 449-502).
 */
const COLLISION_THRESHOLD = 0.65;

function findCollisions(grid, r_xyz, plate_is_ocean, r_plate, plate_vec) {
    const deltaTime = 1e-2;
    const numRegions = grid.points.length;
    const mountain_r = new Set();
    const coastline_r = new Set();
    const ocean_r = new Set();

    for (let current_r = 0; current_r < numRegions; current_r++) {
        let bestCompression = -Infinity;
        let best_r = -1;
        const neighbors = grid.cells.c[current_r] || [];

        for (const neighbor_r of neighbors) {
            if (r_plate[current_r] !== r_plate[neighbor_r]) {
                const current_pos = [r_xyz[3 * current_r], r_xyz[3 * current_r + 1], r_xyz[3 * current_r + 2]];
                const neighbor_pos = [r_xyz[3 * neighbor_r], r_xyz[3 * neighbor_r + 1], r_xyz[3 * neighbor_r + 2]];

                const current_v = plate_vec[r_plate[current_r]] || [0, 0, 0];
                const neighbor_v = plate_vec[r_plate[neighbor_r]] || [0, 0, 0];

                const next_current_pos = vec3.add(current_pos, vec3.scale(current_v, deltaTime));
                const next_neighbor_pos = vec3.add(neighbor_pos, vec3.scale(neighbor_v, deltaTime));

                const distanceBefore = vec3.distance(current_pos, neighbor_pos);
                const distanceAfter = vec3.distance(next_current_pos, next_neighbor_pos);

                const compression = distanceBefore - distanceAfter;
                if (compression > bestCompression) {
                    best_r = neighbor_r;
                    bestCompression = compression;
                }
            }
        }

        if (best_r !== -1) {
            const collided = bestCompression > COLLISION_THRESHOLD * deltaTime;
            const current_is_ocean = plate_is_ocean.has(r_plate[current_r]);
            const best_is_ocean = plate_is_ocean.has(r_plate[best_r]);

            if (current_is_ocean && best_is_ocean) {
                // Ocean-ocean boundary: collision creates island arcs / shallow ridges, separation forms deep ocean
                (collided ? coastline_r : ocean_r).add(current_r);
            } else if (!current_is_ocean && !best_is_ocean) {
                // Continental-continental: collision forms mountain ranges
                if (collided) {
                    mountain_r.add(current_r);
                }
            } else {
                // Continental-oceanic subduction / collision:
                // Continental coast: establish coastline and place mountain uplift slightly inland
                // Ocean side: forms subduction trench / ocean
                if (current_is_ocean) {
                    ocean_r.add(current_r);
                } else {
                    coastline_r.add(current_r);
                    if (collided) {
                        // Mark inland neighbors on the same continental plate for mountain uplift
                        const inlandNeighbors = neighbors.filter(n => r_plate[n] === r_plate[current_r]);
                        for (const inNeib of inlandNeighbors) {
                            mountain_r.add(inNeib);
                        }
                    }
                }
            }
        }
    }

    return { mountain_r, coastline_r, ocean_r };
}

/**
 * Assign region elevations combining distance fields and 3D fBm simplex noise.
 * Based on Red Blob Games planet generation (lines 505-543).
 */
function assignRegionElevation(grid, { r_xyz, plate_is_ocean, r_plate, plate_vec }, prng, options = {}) {
    const epsilon = 1e-3;
    const numRegions = grid.points.length;
    const mountainPower = options.mountainPower ?? config.mountainPower ?? 1.2;
    const fbmNoise = createFbmNoise(prng);

    const { mountain_r, coastline_r, ocean_r } = findCollisions(
        grid,
        r_xyz,
        plate_is_ocean,
        r_plate,
        plate_vec
    );

    // Ensure plate center seeds are populated
    for (let r = 0; r < numRegions; r++) {
        if (r_plate[r] === r) {
            (plate_is_ocean.has(r) ? ocean_r : coastline_r).add(r);
        }
    }

    const stop_r = new Set([...mountain_r, ...coastline_r, ...ocean_r]);

    const r_distance_a = assignDistanceField(grid, mountain_r, ocean_r, prng);
    const r_distance_b = assignDistanceField(grid, ocean_r, coastline_r, prng);
    const r_distance_c = assignDistanceField(grid, coastline_r, stop_r, prng);

    const rawElevation = new Float32Array(numRegions);
    let minRaw = Infinity;
    let maxRaw = -Infinity;

    for (let r = 0; r < numRegions; r++) {
        const a = r_distance_a[r] + epsilon;
        const b = r_distance_b[r] + epsilon;
        const c = r_distance_c[r] + epsilon;

        let e = 0.1;
        if (a !== Infinity || b !== Infinity) {
            e = (1 / a - 1 / b) / (1 / a + 1 / b + 1 / c);
        }

        // Add spherical 3D simplex fBm noise
        const nx = r_xyz[3 * r];
        const ny = r_xyz[3 * r + 1];
        const nz = r_xyz[3 * r + 2];
        e += 0.15 * fbmNoise(nx, ny, nz);

        rawElevation[r] = e;
        if (e < minRaw) minRaw = e;
        if (e > maxRaw) maxRaw = e;
    }

    // Convert raw elevation [-1, 1] range to AFMG [0, 100] scale where sea level = 20
    const heights = createTypedArray({
        maxValue: 100,
        length: numRegions
    });

    for (let r = 0; r < numRegions; r++) {
        const e = rawElevation[r];
        let h;
        if (e < 0) {
            // Ocean range: map [minRaw, 0] -> [5, 19]
            const t = minRaw < 0 ? minmax((e - minRaw) / (0 - minRaw), 0, 1) : 0.5;
            h = Math.round(5 + t * 14);
        } else {
            // Land range: map [0, maxRaw] -> [20, 95]
            const t = maxRaw > 0 ? minmax(e / maxRaw, 0, 1) : 0.5;
            // Progressive elevation profile:
            // - Lowlands/coastal plains (20-40)
            // - Rolling hills & plateaus (40-65)
            // - Mountain ranges & cordilleras (65-85)
            // - Alpine crests (85-95)
            const curved = Math.pow(t, mountainPower || 1.2);
            h = Math.round(20 + curved * 75);
        }

        heights[r] = minmax(h, 0, 100);
    }

    return heights;
}

export class PlateTectonicsModule {
    generate(grid, options = {}) {
        TIME && console.time("generatePlatesHeightmap");
        const prng = Alea(seed);
        const nPlates = options.nPlates || config.nPlates || 20;
        const numRegions = grid.points.length;

        // Convert all [lon, lat] points to 3D Cartesian coordinates on unit sphere
        const r_xyz = new Float32Array(numRegions * 3);
        for (let i = 0; i < numRegions; i++) {
            const [x, y, z] = toCartesian(grid.points[i]);
            r_xyz[3 * i] = x;
            r_xyz[3 * i + 1] = y;
            r_xyz[3 * i + 2] = z;
        }

        // 1. Generate plates and their velocity vectors
        const { plate_r, r_plate, plate_vec } = generatePlates(grid, r_xyz, nPlates, prng);

        // 2. Assign ~50-60% of plates as ocean plates
        const plate_is_ocean = new Set();
        for (const r of plate_r) {
            if (prng() < 0.55) {
                plate_is_ocean.add(r);
            }
        }
        // Guarantee at least one land plate and one ocean plate
        if (plate_is_ocean.size === 0 && plate_r.length > 0) {
            plate_is_ocean.add(plate_r[0]);
        } else if (plate_is_ocean.size === plate_r.length && plate_r.length > 1) {
            plate_is_ocean.delete(plate_r[0]);
        }

        // 3. Compute elevation via collisions and distance fields
        const heights = assignRegionElevation(
            grid,
            { r_xyz, plate_is_ocean, r_plate, plate_vec },
            prng,
            { mountainPower: options.mountainPower ?? config.mountainPower ?? 1.2 }
        );

        TIME && console.timeEnd("generatePlatesHeightmap");
        return heights;
    }
}

export const PlateTectonicsGenerator = new PlateTectonicsModule();
