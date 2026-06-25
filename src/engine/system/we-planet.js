// Planet generation core: mesh gen, plates, elevation, rivers, climate, colormap
import { SimplexNoise, FlatQueue, vec3 } from '../../../lib/redblob.lib.js';
import aleaPRNG from '../../../lib/aleaPRNG-1.1.js';
import { makeSphere } from '../constants/sphere-mesh.js';
import {
    DEFAULT_SEED, DEFAULT_N, DEFAULT_P, DEFAULT_JITTER, DEFAULT_ROTATION,
    DEFAULT_DRAW_MODE, DEFAULT_PLANET_TYPE, DEFAULT_BARREN_SUBTYPE,
    DEFAULT_DRAW_PLATE_VECTORS, DEFAULT_DRAW_PLATE_BOUNDARIES,
    DEFAULT_DRAW_CULTURE_OVERLAY, DEFAULT_DRAW_STATE_BORDERS,
    DEFAULT_DRAW_STATE_OVERLAY, DEFAULT_DRAW_PROVINCE_OVERLAY,
    DEFAULT_DRAW_PROVINCE_BORDERS, DEFAULT_DRAW_BURG_OVERLAY,
    COLLISION_THRESHOLD,
} from '../constants/defaults.js';

let _randomNoise;
let rotation = DEFAULT_ROTATION;
let drawMode = DEFAULT_DRAW_MODE;
let draw_plateVectors = DEFAULT_DRAW_PLATE_VECTORS;
let draw_plateBoundaries = DEFAULT_DRAW_PLATE_BOUNDARIES;
let _planetType = DEFAULT_PLANET_TYPE;
let _barrenSubtype = DEFAULT_BARREN_SUBTYPE;
const persistence = 2 / 3;
const amplitudes = Array.from({ length: 5 }, (_, octave) => Math.pow(persistence, octave));

// 5-octave fractal Brownian motion via simplex noise
function fbm_noise(nx, ny, nz) {
    let sum = 0, sumOfAmplitudes = 0;
    for (let octave = 0; octave < amplitudes.length; octave++) {
        let frequency = 1 << octave;
        sum += amplitudes[octave] * _randomNoise.noise3D(nx * frequency, ny * frequency, nz * frequency);
        sumOfAmplitudes += amplitudes[octave];
    }
    return sum / sumOfAmplitudes;
}

// Compute centroid xyz for every triangle from its 3 corner regions
function generateTriangleCenters(mesh, { r_xyz }) {
    let { numTriangles } = mesh;
    let t_xyz = new Float32Array(3 * numTriangles);
    for (let t = 0; t < numTriangles; t++) {
        let a = mesh.s_begin_r(3 * t),
            b = mesh.s_begin_r(3 * t + 1),
            c = mesh.s_begin_r(3 * t + 2);
        let ax = r_xyz[3 * a], ay = r_xyz[3 * a + 1], az = r_xyz[3 * a + 2],
            bx = r_xyz[3 * b], by = r_xyz[3 * b + 1], bz = r_xyz[3 * b + 2],
            cx = r_xyz[3 * c], cy = r_xyz[3 * c + 1], cz = r_xyz[3 * c + 2];
        t_xyz[3 * t] = (ax + bx + cx) / 3;
        t_xyz[3 * t + 1] = (ay + by + cy) / 3;
        t_xyz[3 * t + 2] = (az + bz + cz) / 3;
    }
    return t_xyz;
}

// Build per-side triangle strip geometry for flat/centroid rendering, colored by region
function generateVoronoiGeometry(mesh, { r_xyz, t_xyz }, r_color_fn) {
    const { numSides } = mesh;
    let xyz = new Float32Array(3 * 3 * numSides),
        tm = new Float32Array(3 * 2 * numSides);

    for (let s = 0; s < numSides; s++) {
        let inner_t = mesh.s_inner_t(s),
            outer_t = mesh.s_outer_t(s),
            begin_r = mesh.s_begin_r(s);
        let rgb = r_color_fn(begin_r);
        for (let i = 0; i < 3; i++) {
            xyz[9 * s + 0 + i] = t_xyz[3 * inner_t + i];
        }
        for (let i = 0; i < 3; i++) {
            xyz[9 * s + 3 + i] = r_xyz[3 * begin_r + i];
        }
        for (let i = 0; i < 3; i++) {
            xyz[9 * s + 6 + i] = t_xyz[3 * outer_t + i];
        }
        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 2; i++) {
                tm[6 * s + 2 * j + i] = rgb[i];
            }
        }
    }
    return { xyz, tm };
}

// Geometry container for quads (shaded) draw mode: interleaved vertex xyz + elevation/moisture tm
class QuadGeometry {
    constructor() {
    }

    // Apply temperature/rainfall/water-level offsets to UV data in-place (no mesh rebuild)
    applyClimate(numRegions, numTriangles, r_elevation, r_moisture, t_elevation, t_moisture, tempOff, rainOff, waterOff) {
        const { tm } = this;
        let p = 0;
        let scale = tempOff > 0 ? 1 / (1 + tempOff * 3) : (1 + Math.abs(tempOff) * 2);
        for (let r = 0; r < numRegions; r++) {
            let e = r_elevation[r] - waterOff;
            tm[p++] = e > 0 ? e * scale : e;
            tm[p++] = Math.min(1, Math.max(0, r_moisture[r] + rainOff));
        }
        for (let t = 0; t < numTriangles; t++) {
            let e = t_elevation[t] - waterOff;
            tm[p++] = e > 0 ? e * scale : e;
            tm[p++] = Math.min(1, Math.max(0, t_moisture[t] + rainOff));
        }
    }

    // Allocate index/xyz/tm buffers sized to mesh dimensions
    setMesh({ numSides, numRegions, numTriangles }) {
        this.I = new Int32Array(3 * numSides);
        this.xyz = new Float32Array(3 * (numRegions + numTriangles));
        this.tm = new Float32Array(2 * (numRegions + numTriangles));
    }

    // Fill xyz/tm/I buffers from generated map data; valley vs ridge side selection for rivers
    setMap(mesh, { r_xyz, t_xyz, r_color_fn, s_flow, r_elevation, t_elevation, r_moisture, t_moisture }) {
        const V = 0.95;
        const { numSides, numRegions, numTriangles } = mesh;
        const { xyz, tm, I } = this;

        xyz.set(r_xyz);
        xyz.set(t_xyz, r_xyz.length);

        let p = 0;
        for (let r = 0; r < numRegions; r++) {
            tm[p++] = r_elevation[r];
            tm[p++] = r_moisture[r];
        }
        for (let t = 0; t < numTriangles; t++) {
            tm[p++] = t_elevation[t];
            tm[p++] = t_moisture[t];
        }

        let i = 0, count_valley = 0, count_ridge = 0;
        let { _halfedges, _triangles } = mesh;
        for (let s = 0; s < numSides; s++) {
            let opposite_s = mesh.s_opposite_s(s),
                r1 = mesh.s_begin_r(s),
                r2 = mesh.s_begin_r(opposite_s),
                t1 = mesh.s_inner_t(s),
                t2 = mesh.s_inner_t(opposite_s);

            let coast = r_elevation[r1] < 0.0 || r_elevation[r2] < 0.0;
            if (coast || s_flow[s] > 0 || s_flow[opposite_s] > 0) {
                I[i++] = r1; I[i++] = numRegions + t2; I[i++] = numRegions + t1;
                count_valley++;
            } else {
                I[i++] = r1; I[i++] = r2; I[i++] = numRegions + t1;
                count_ridge++;
            }
        }
    }
}

// Return a set of N random region indices (used for plate seed placement)
function pickRandomRegions(mesh, N, randInt) {
    let { numRegions } = mesh;
    let chosen_r = new Set();
    while (chosen_r.size < N && chosen_r.size < numRegions) {
        chosen_r.add(randInt(numRegions));
    }
    return chosen_r;
}


// Assign each region to a tectonic plate via seeded random expansion from plate centers
function generatePlates(mesh, r_xyz, params) {
    let { seed = DEFAULT_SEED, nPlates = DEFAULT_P, N = DEFAULT_N } = params || {};
    let r_plate = new Int32Array(mesh.numRegions);
    r_plate.fill(-1);
    let grng = aleaPRNG(seed);
    let grandInt = (n) => Math.floor(grng() * n);
    let plate_r = pickRandomRegions(mesh, Math.min(nPlates, N), grandInt);
    let queue = Array.from(plate_r);
    for (let r of queue) { r_plate[r] = r; }
    let out_r = [];
    let randInt = (n) => Math.floor(aleaPRNG(seed)() * n);

    for (let queue_out = 0; queue_out < queue.length; queue_out++) {
        let pos = queue_out + randInt(queue.length - queue_out);
        let current_r = queue[pos];
        queue[pos] = queue[queue_out];
        mesh.r_circulate_r(out_r, current_r);
        for (let neighbor_r of out_r) {
            if (r_plate[neighbor_r] === -1) {
                r_plate[neighbor_r] = r_plate[current_r];
                queue.push(neighbor_r);
            }
        }
    }

    let plate_vec = [];
    for (let center_r of plate_r) {
        let neighbor_r = mesh.r_circulate_r([], center_r)[0];
        let p0 = r_xyz.slice(3 * center_r, 3 * center_r + 3),
            p1 = r_xyz.slice(3 * neighbor_r, 3 * neighbor_r + 3);
        plate_vec[center_r] = vec3.normalize([], vec3.subtract([], p1, p0));
    }

    return { plate_r, r_plate, plate_vec };
}


// BFS distance from seeds_r outward, stopping at stop_r boundaries (uses shuffled order)
function assignDistanceField(mesh, seeds_r, stop_r, seed = DEFAULT_SEED) {
    let { numRegions } = mesh;
    let r_distance = new Float32Array(numRegions);
    r_distance.fill(Infinity);
    let rng = aleaPRNG(seed);
    let randInt = (n) => Math.floor(rng() * n);

    let queue = [];
    for (let r of seeds_r) {
        queue.push(r);
        r_distance[r] = 0;
    }

    let out_r = [];
    for (let queue_out = 0; queue_out < queue.length; queue_out++) {
        let pos = queue_out + randInt(queue.length - queue_out);
        let current_r = queue[pos];
        queue[pos] = queue[queue_out];
        mesh.r_circulate_r(out_r, current_r);
        for (let neighbor_r of out_r) {
            if (r_distance[neighbor_r] === Infinity && !stop_r.has(neighbor_r)) {
                r_distance[neighbor_r] = r_distance[current_r] + 1;
                queue.push(neighbor_r);
            }
        }
    }
    return r_distance;
}


// Detect convergent/divergent plate boundaries; classify into mountain/ocean/coastline sets
function findCollisions(mesh, r_xyz, plate_is_ocean, r_plate, plate_vec) {
    const deltaTime = 1e-2;
    let { numRegions } = mesh;
    let mountain_r = new Set(),
        coastline_r = new Set(),
        ocean_r = new Set();
    let r_out = [];
    for (let current_r = 0; current_r < numRegions; current_r++) {
        let bestCompression = Infinity, best_r = -1;
        mesh.r_circulate_r(r_out, current_r);
        for (let neighbor_r of r_out) {
            if (r_plate[current_r] !== r_plate[neighbor_r]) {
                let current_pos = r_xyz.slice(3 * current_r, 3 * current_r + 3),
                    neighbor_pos = r_xyz.slice(3 * neighbor_r, 3 * neighbor_r + 3);
                let distanceBefore = vec3.distance(current_pos, neighbor_pos),
                    distanceAfter = vec3.distance(vec3.add([], current_pos, vec3.scale([], plate_vec[r_plate[current_r]], deltaTime)),
                        vec3.add([], neighbor_pos, vec3.scale([], plate_vec[r_plate[neighbor_r]], deltaTime)));
                let compression = distanceBefore - distanceAfter;
                if (compression < bestCompression) {
                    best_r = neighbor_r;
                    bestCompression = compression;
                }
            }
        }
        if (best_r !== -1) {
            let collided = bestCompression > COLLISION_THRESHOLD * deltaTime;
            let current_plate = r_plate[current_r],
                best_plate = r_plate[best_r];
            if (plate_is_ocean.has(current_plate) && plate_is_ocean.has(best_plate)) {
                (collided ? coastline_r : ocean_r).add(current_r);
            } else if (!plate_is_ocean.has(current_plate) && !plate_is_ocean.has(best_plate)) {
                if (collided) mountain_r.add(current_plate);
            } else {
                (collided ? mountain_r : coastline_r).add(current_r);
            }
        }
    }
    return { mountain_r, coastline_r, ocean_r };
}


// Compute elevation per region from plate collisions; uses 3 distance fields + FBM noise
function assignRegionElevation(mesh, { r_xyz, plate_is_ocean, r_plate, plate_vec, /* out */ r_elevation }, seed = DEFAULT_SEED) {
    const epsilon = 1e-3;
    let { numRegions } = mesh;

    let { mountain_r, coastline_r, ocean_r } = findCollisions(
        mesh, r_xyz, plate_is_ocean, r_plate, plate_vec);

    for (let r = 0; r < numRegions; r++) {
        if (r_plate[r] === r) {
            (plate_is_ocean.has(r) ? ocean_r : coastline_r).add(r);
        }
    }

    let stop_r = new Set();
    for (let r of mountain_r) { stop_r.add(r); }
    for (let r of coastline_r) { stop_r.add(r); }
    for (let r of ocean_r) { stop_r.add(r); }

    let r_distance_a = assignDistanceField(mesh, mountain_r, ocean_r, seed);
    let r_distance_b = assignDistanceField(mesh, ocean_r, coastline_r, seed);
    let r_distance_c = assignDistanceField(mesh, coastline_r, stop_r, seed);

    for (let r = 0; r < numRegions; r++) {
        let a = r_distance_a[r] + epsilon,
            b = r_distance_b[r] + epsilon,
            c = r_distance_c[r] + epsilon;
        if (a === Infinity && b === Infinity) {
            r_elevation[r] = 0.1;
        } else {
            r_elevation[r] = (1 / a - 1 / b) / (1 / a + 1 / b + 1 / c);
        }
        r_elevation[r] += 0.1 * fbm_noise(r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]);
    }
}


// Average region elevation/moisture onto triangles (simple 3-corner mean)
function assignTriangleValues(mesh, { r_elevation, r_moisture, /* out */ t_elevation, t_moisture }) {
    const { numTriangles } = mesh;
    for (let t = 0; t < numTriangles; t++) {
        let s0 = 3 * t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0 + 1),
            r3 = mesh.s_begin_r(s0 + 2);
        t_elevation[t] = 1 / 3 * (r_elevation[r1] + r_elevation[r2] + r_elevation[r3]);
        t_moisture[t] = 1 / 3 * (r_moisture[r1] + r_moisture[r2] + r_moisture[r3]);
    }
}


let _queue = new FlatQueue();
// Compute downhill direction per triangle (toward lowest neighbor); priority-queue driven
function assignDownflow(mesh, { t_elevation, /* out */ t_downflow_s, /* out */ order_t }) {
    let { numTriangles } = mesh,
        queue_in = 0;
    t_downflow_s.fill(-999);
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] < 0) {
            let best_s = -1, best_e = t_elevation[t];
            for (let j = 0; j < 3; j++) {
                let s = 3 * t + j,
                    e = t_elevation[mesh.s_outer_t(s)];
                if (e < best_e) {
                    best_e = e;
                    best_s = s;
                }
            }
            order_t[queue_in++] = t;
            t_downflow_s[t] = best_s;
            _queue.push(t, t_elevation[t]);
        }
    }
    for (let queue_out = 0; queue_out < numTriangles; queue_out++) {
        let current_t = _queue.pop();
        for (let j = 0; j < 3; j++) {
            let s = 3 * current_t + j;
            let neighbor_t = mesh.s_outer_t(s);
            if (t_downflow_s[neighbor_t] === -999 && t_elevation[neighbor_t] >= 0.0) {
                t_downflow_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
                _queue.push(neighbor_t, t_elevation[neighbor_t]);
            }
        }
    }
}


// Accumulate water flow downstream: moisture → flow per triangle, sum along downflow edges
function assignFlow(mesh, { order_t, t_elevation, t_moisture, t_downflow_s, /* out */ t_flow, /* out */ s_flow }) {
    let { numTriangles, _halfedges } = mesh;
    s_flow.fill(0);
    for (let t = 0; t < numTriangles; t++) {
        if (t_elevation[t] >= 0.0) {
            t_flow[t] = 0.5 * t_moisture[t] * t_moisture[t];
        } else {
            t_flow[t] = 0;
        }
    }
    for (let i = order_t.length - 1; i >= 0; i--) {
        let tributary_t = order_t[i];
        let flow_s = t_downflow_s[tributary_t];
        let trunk_t = (_halfedges[flow_s] / 3) | 0;
        if (flow_s >= 0) {
            t_flow[trunk_t] += t_flow[tributary_t];
            s_flow[flow_s] += t_flow[tributary_t];
            if (t_elevation[trunk_t] > t_elevation[tributary_t]) {
                t_elevation[trunk_t] = t_elevation[tributary_t];
            }
        }
    }
}


var mesh, map = {};
var quadGeometry = new QuadGeometry();

// Full mesh + map generation: create sphere, allocate map arrays, dispatch to type-specific generator
function generateMesh(params = {}) {
    const { seed = DEFAULT_SEED, N = DEFAULT_N, nPlates = DEFAULT_P, jitter = DEFAULT_JITTER } = params;
    let t0 = performance.now();
    _randomNoise = new SimplexNoise(aleaPRNG(seed));
    let result = makeSphere(N, jitter, aleaPRNG(seed));
    mesh = result.mesh;
    quadGeometry.setMesh(mesh);

    map.r_elevation = new Float32Array(mesh.numRegions);
    map.t_elevation = new Float32Array(mesh.numTriangles);
    map.r_moisture = new Float32Array(mesh.numRegions);
    map.t_moisture = new Float32Array(mesh.numTriangles);
    map.t_downflow_s = new Int32Array(mesh.numTriangles);
    map.order_t = new Int32Array(mesh.numTriangles);
    map.t_flow = new Float32Array(mesh.numTriangles);
    map.s_flow = new Float32Array(mesh.numSides);

    map.r_xyz = result.r_xyz;
    map.t_xyz = generateTriangleCenters(mesh, map);
    generateMap(params);
}

// Dispatch to planet-type-specific map generation
function generateMap(params = {}) {
    switch (_planetType) {
        case 'airless': return generateAirlessMap(params);
        case 'star':
        case 'sun': return generateSunMap(params);
        case 'rocky':
        case 'earthlike':
        case 'barren':
        default: {
            const subtype = _planetType === 'rocky' ? _barrenSubtype : _planetType;
            return generateRockyMap(getRockyOptions(subtype), params);
        }
    }
}

function getRockyOptions(subtype) {
    switch (subtype) {
        case 'hostile':
            return { oceanFraction: 0, moistureMin: 0, moistureMax: 0, hasRivers: false, hasDomes: true, hasVolcanoes: false };
        case 'barren':
            return { oceanFraction: 0, moistureMin: 0, moistureMax: 0.15, hasRivers: false, hasVolcanoes: true, hasDomes: false };
        default:
            return { oceanFraction: 0.5, moistureMin: 0.15, moistureMax: 1.0, hasRivers: true, hasVolcanoes: false, hasDomes: false };
    }
}

// Parameterized rocky planet: plates, collision elevation, optional volcanoes/domes/moisture/rivers
function generateRockyMap(opts = {}, params = {}) {
    const {
        oceanFraction = 0.5,
        moistureMin = 0.15,
        moistureMax = 1.0,
        hasRivers = true,
        hasVolcanoes = false,
        hasDomes = false,
    } = opts;

    const {
        seed = DEFAULT_SEED,
        nPlates = DEFAULT_P,
        N = DEFAULT_N,
        waterLevel: waterOff = 0,
        tempOffset: tempOff = 0,
        rainOffset: rainOff = 0,
    } = params;

    let result = generatePlates(mesh, map.r_xyz, { seed, nPlates, N });
    map.plate_r = result.plate_r;
    map.r_plate = result.r_plate;
    map.plate_vec = result.plate_vec;
    map.plate_is_ocean = new Set();
    for (let r of map.plate_r) {
        if (Math.floor(aleaPRNG(r)() * 10) / 10 < oceanFraction) {
            map.plate_is_ocean.add(r);
        }
    }
    assignRegionElevation(mesh, map, seed);

    if (hasVolcanoes) {
        let rng = aleaPRNG(seed + 7777);
        for (let center_r of map.plate_r) {
            if (rng() > 0.4) continue;
            let volcanoStrength = 1.5 + rng() * 1.5;
            map.r_elevation[center_r] *= volcanoStrength;
            let out_r = [];
            mesh.r_circulate_r(out_r, center_r);
            for (let nr of out_r) {
                map.r_elevation[nr] *= 1.0 + (volcanoStrength - 1.0) * 0.5;
            }
        }
    }

    if (hasDomes) {
        let rng = aleaPRNG(seed + 8888);
        let out_r = [];
        for (let center_r of map.plate_r) {
            if (rng() > 0.3) continue;
            let domeHeight = 0.3 + rng() * 0.5;
            let spread = 2 + Math.floor(rng() * 4);
            let queue_domes = [center_r];
            let visited = new Set();
            visited.add(center_r);
            for (let i = 0; i < queue_domes.length && i < spread * 10; i++) {
                let current_r = queue_domes[i];
                map.r_elevation[current_r] += domeHeight * (1 - i / (spread * 10));
                mesh.r_circulate_r(out_r, current_r);
                for (let nr of out_r) {
                    if (!visited.has(nr) && queue_domes.length < spread * 10) {
                        visited.add(nr);
                        queue_domes.push(nr);
                    }
                }
            }
        }
    }

    for (let r = 0; r < mesh.numRegions; r++) {
        let n = 0.5 + 0.5 * fbm_noise(map.r_xyz[3 * r], map.r_xyz[3 * r + 1], map.r_xyz[3 * r + 2]);
        if (moistureMin === moistureMax) {
            map.r_moisture[r] = moistureMin;
        } else {
            map.r_moisture[r] = Math.max(moistureMin, Math.min(moistureMax, n));
        }
    }

    assignTriangleValues(mesh, map);

    if (hasRivers) {
        assignDownflow(mesh, map);
        assignFlow(mesh, map);
    } else {
        map.t_downflow_s.fill(-999);
        map.order_t.fill(0);
        map.t_flow.fill(0);
        map.s_flow.fill(0);
    }

    quadGeometry.setMap(mesh, map);

    if (tempOff !== 0 || rainOff !== 0 || waterOff !== 0) {
        quadGeometry.applyClimate(
            mesh.numRegions, mesh.numTriangles,
            map.r_elevation, map.r_moisture, map.t_elevation, map.t_moisture,
            tempOff, rainOff, waterOff
        );
    }
}

// Generate cratered elevation: 30–70 bowl+rim+ejecta craters on FBM baseline, normalized to [-0.8, 0.8]
function generateCraterElevation(mesh, r_xyz, seed = DEFAULT_SEED) {
    const numRegions = mesh.numRegions;
    const elevation = new Float32Array(numRegions);
    let rng = aleaPRNG(seed + 9999);

    for (let r = 0; r < numRegions; r++) {
        elevation[r] = 0.15 * fbm_noise(r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]);
    }

    const numCraters = 30 + Math.floor(rng() * 40);
    for (let c = 0; c < numCraters; c++) {
        const theta = 2 * Math.PI * rng();
        const phi = Math.acos(2 * rng() - 1);
        const cx = Math.cos(theta) * Math.sin(phi);
        const cy = Math.sin(theta) * Math.sin(phi);
        const cz = Math.cos(phi);

        const craterRadius = 0.05 + rng() * 0.2;
        const depth = 0.1 + rng() * 0.35;
        const rimHeight = depth * (0.08 + rng() * 0.12);

        const innerCos = Math.cos(craterRadius * 0.6);
        const rimCos = Math.cos(craterRadius);
        const outerCos = Math.cos(craterRadius * 1.4);

        for (let r = 0; r < numRegions; r++) {
            const dot = cx * r_xyz[3 * r] + cy * r_xyz[3 * r + 1] + cz * r_xyz[3 * r + 2];
            if (dot < outerCos) continue;

            if (dot < rimCos) {
                const t = (dot - outerCos) / (rimCos - outerCos);
                elevation[r] += rimHeight * t;
            } else if (dot < innerCos) {
                const t = (dot - rimCos) / (innerCos - rimCos);
                elevation[r] += rimHeight * (1 - t);
            } else {
                const d2 = 1 - dot;
                const innerD2 = 1 - innerCos;
                const frac = d2 / innerD2;
                elevation[r] -= depth * (1 - frac * frac);
            }
        }
    }

    let min = Infinity, max = -Infinity;
    for (let r = 0; r < numRegions; r++) {
        if (elevation[r] < min) min = elevation[r];
        if (elevation[r] > max) max = elevation[r];
    }
    const range = max - min;
    for (let r = 0; r < numRegions; r++) {
        elevation[r] = -0.8 + 1.6 * (elevation[r] - min) / range;
    }

    return elevation;
}

// Airless: single flat plate, crater elevation, zero moisture, no rivers
function generateAirlessMap(params = {}) {
    const {
        seed = DEFAULT_SEED,
        waterLevel: waterOff = 0,
        tempOffset: tempOff = 0,
        rainOffset: rainOff = 0,
    } = params;

    map.plate_r = [0];
    map.r_plate = new Int32Array(mesh.numRegions);
    map.r_plate.fill(0);
    map.plate_vec = [vec3.fromValues(0, 0, 0)];
    map.plate_is_ocean = new Set();

    map.r_elevation = generateCraterElevation(mesh, map.r_xyz, seed);
    map.r_moisture.fill(0);

    for (let t = 0; t < mesh.numTriangles; t++) {
        let s0 = 3 * t;
        let r1 = mesh.s_begin_r(s0),
            r2 = mesh.s_begin_r(s0 + 1),
            r3 = mesh.s_begin_r(s0 + 2);
        map.t_elevation[t] = (map.r_elevation[r1] + map.r_elevation[r2] + map.r_elevation[r3]) / 3;
        map.t_moisture[t] = 0;
    }

    map.t_downflow_s.fill(-999);
    map.order_t.fill(0);
    map.t_flow.fill(0);
    map.s_flow.fill(0);

    quadGeometry.setMap(mesh, map);

    if (tempOff !== 0 || rainOff !== 0 || waterOff !== 0) {
        quadGeometry.applyClimate(
            mesh.numRegions, mesh.numTriangles,
            map.r_elevation, map.r_moisture, map.t_elevation, map.t_moisture,
            tempOff, rainOff, waterOff
        );
    }
}



// Sun: uniform 0.5 elevation, zero moisture, single flat plate — visual via 4D simplex shader
function generateSunMap(params = {}) {
    const { seed = DEFAULT_SEED } = params;
    map._sunSeed = seed;
    map.plate_r = [0];
    map.r_plate = new Int32Array(mesh.numRegions);
    map.r_plate.fill(0);
    map.plate_vec = [vec3.fromValues(0, 0, 0)];
    map.plate_is_ocean = new Set();

    map.r_elevation.fill(0.5);
    map.r_moisture.fill(0);

    for (let t = 0; t < mesh.numTriangles; t++) {
        map.t_elevation[t] = 0.5;
        map.t_moisture[t] = 0;
    }

    map.t_downflow_s.fill(-999);
    map.order_t.fill(0);
    map.t_flow.fill(0);
    map.s_flow.fill(0);

    quadGeometry.setMap(mesh, map);
}

let draw_cultureOverlay = DEFAULT_DRAW_CULTURE_OVERLAY;
let draw_stateBorders = DEFAULT_DRAW_STATE_BORDERS;
let draw_stateOverlay = DEFAULT_DRAW_STATE_OVERLAY;
let draw_provinceOverlay = DEFAULT_DRAW_PROVINCE_OVERLAY;
let draw_provinceBorders = DEFAULT_DRAW_PROVINCE_BORDERS;
let draw_burgOverlay = DEFAULT_DRAW_BURG_OVERLAY;

export function getRotation() { return rotation; }
export function setRotation(v) { rotation = v; }
export function getDrawMode() { return drawMode; }
export function setDrawMode(v) { drawMode = v; }
export function getDrawPlateVectors() { return draw_plateVectors; }
export function setDrawPlateVectors(v) { draw_plateVectors = v; }
export function getDrawPlateBoundaries() { return draw_plateBoundaries; }
export function setDrawPlateBoundaries(v) { draw_plateBoundaries = v; }
export function getDrawCultureOverlay() { return draw_cultureOverlay; }
export function setDrawCultureOverlay(v) { draw_cultureOverlay = v; }
export function getDrawStateBorders() { return draw_stateBorders; }
export function setDrawStateBorders(v) { draw_stateBorders = v; }
export function getDrawStateOverlay() { return draw_stateOverlay; }
export function setDrawStateOverlay(v) { draw_stateOverlay = v; }
export function getDrawProvinceOverlay() { return draw_provinceOverlay; }
export function setDrawProvinceOverlay(v) { draw_provinceOverlay = v; }
export function getDrawProvinceBorders() { return draw_provinceBorders; }
export function setDrawProvinceBorders(v) { draw_provinceBorders = v; }
export function getDrawBurgOverlay() { return draw_burgOverlay; }
export function setDrawBurgOverlay(v) { draw_burgOverlay = v; }

export function getPlanetType() { return _planetType; }
export function setPlanetType(v) { _planetType = v; }

export function getBarrenSubtype() { return _barrenSubtype; }
export function setBarrenSubtype(v) { _barrenSubtype = v; }

export {
    mesh, map, quadGeometry,
    fbm_noise, generateTriangleCenters, generateVoronoiGeometry,
    generatePlates, assignRegionElevation,
    assignTriangleValues, assignDownflow, assignFlow,
    generateMesh, generateMap, generateRockyMap,
    draw_stateOverlay, draw_provinceOverlay, draw_provinceBorders,
};
