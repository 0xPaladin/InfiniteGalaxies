import * as d3 from "d3";
import { createNoise3D } from "simplex-noise";
import Alea from "alea";
import {
    minmax,
    rn,
    rand,
    toCartesian,
    deltaLongitude
} from "../utils/index.js";
import { grid, seed, config } from "../src/state.js";
import { DEBUG } from "../utils/debug.js";

/**
 * Temperature model reflecting the whole globe:
 * - Latitude-dependent thermal zones from North Pole (-90°) to Equator (0°) to South Pole (90°)
 * - Seamless 3D atmospheric thermal turbulence (noise on unit sphere without seam/distortion)
 * - Continentality (inland distance heating/cooling)
 * - Altitude lapse rate drop (6.5°C per 1km)
 */
export function calculateTemperatures() {
    const cells = grid.cells;
    cells.temp = new Int8Array(cells.i.length); // temperature array

    // config.tempRange is [northPole, equator, southPole] in °C
    const [tempNorth, tempEquator, tempSouth] = config.tempRange;

    const exponent = config.heightExponent ?? 1;
    const planetRadius = config.planetRadius || 6371; // km
    const noise3D = createNoise3D(Alea(seed + "temp"));

    // Average physical distance in km between adjacent Voronoi cell centers on the sphere
    const avgKmPerStep = Math.sqrt((4 * Math.PI) / cells.i.length) * planetRadius;

    const tropics = [16, -20]; // [northTropicLat, southTropicLat]
    const tropicalGradient = 0.15;

    const tempNorthTropic = tempEquator - tropics[0] * tropicalGradient;
    const northernGradient = (tempNorthTropic - tempNorth) / (90 - tropics[0]);

    const tempSouthTropic = tempEquator + tropics[1] * tropicalGradient;
    const southernGradient = (tempSouthTropic - tempSouth) / (90 + tropics[1]);

    for (let cellId = 0; cellId < cells.i.length; cellId++) {
        const [lon, lat] = grid.points[cellId];
        const baseSeaLevel = calculateSeaLevelTemp(lat);

        // 3D atmospheric thermal turbulence on unit sphere (seamless across antimeridian and poles)
        const [nx, ny, nz] = toCartesian([lon, lat]);
        const n1 = noise3D(nx * 1.5, ny * 1.5, nz * 1.5);
        const n2 = noise3D(nx * 3.5 + 0.5, ny * 3.5 + 0.5, nz * 3.5 + 0.5) * 0.4;
        const noiseOffset = (n1 + n2) * 4.0; // +/- ~5.6°C organic variation

        // Continentality: inland areas have more extreme seasonal swings / higher continental heating/cooling
        // Scaled by actual physical distance from coast (cells.t * avgKmPerStep)
        // Tropical zones have weaker continentality: maritime equatorial air keeps inland climates stable
        let continentalityMod = 0;
        const distSteps = cells.t ? cells.t[cellId] : 0;
        if (distSteps > 0) {
            const distKm = distSteps * avgKmPerStep;
            // Full continental effect reaches saturation around ~2000 km inland
            const distFactor = Math.min(distKm / 2000, 1);
            const isTropical = Math.abs(lat) <= 23.5;
            const tropicalDamping = isTropical ? 0.4 : 1.0; // damp continental swings in the tropics
            // Warmer base temperatures heat up inland; cold polar/subpolar areas cool down inland
            continentalityMod =
                baseSeaLevel >= 15 ? distFactor * 3.0 * tropicalDamping : -distFactor * 4.0 * tropicalDamping;
        }

        // Equatorial temperature floor: keep sea-level equatorial climates in the tropical range.
        // Dampen negative noise so lowland equator stays >= ~20°C (tropical biome threshold).
        let dampedNoise = noiseOffset;
        if (Math.abs(lat) <= 10 && baseSeaLevel >= 24) {
            // Only allow positive half of noise near the equator; halve negative dips
            dampedNoise = noiseOffset > 0 ? noiseOffset : noiseOffset * 0.5;
        }

        const tempSeaLevel = baseSeaLevel + dampedNoise + continentalityMod;
        DEBUG.temperature && console.info(`${rn(lat, 1)}° lat sea temperature: ${rn(tempSeaLevel)}°C`);

        const tempAltitudeDrop = getAltitudeTemperatureDrop(cells.h[cellId]);
        cells.temp[cellId] = minmax(Math.round(tempSeaLevel - tempAltitudeDrop), -128, 127);
    }

    // Calculate baseline sea level temperature by latitude on the whole globe
    function calculateSeaLevelTemp(latitude) {
        if (latitude <= tropics[0] && latitude >= tropics[1]) {
            return tempEquator - Math.abs(latitude) * tropicalGradient;
        }
        return latitude > 0
            ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
            : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
    }

    // Temperature drops by 6.5°C per 1km of altitude above sea level
    // Land elevation h ranges from 20 (sea level, 0m) to 100 (extreme mountain peaks, ~6,000-7,000m)
    // Physical mapping calibrated for spherical terrain:
    // Lowlands and rolling hills (h=20-45) experience gentle elevation cooling (-0 to -5°C),
    // while uplands and mountain ranges (h=60-100) experience sharp alpine cooling (-12 to -39°C).
    function getAltitudeTemperatureDrop(h) {
        if (h < 20) return 0;
        const normalized = (h - 20) / 80;
        const altitudeKm = 6.0 * Math.pow(normalized, Math.max(exponent * 1.7, 1.7));
        return rn(altitudeKm * 6.5);
    }
}

/**
 * Temperature-based moisture holding capacity (Clausius-Clapeyron approximation).
 * Calibrated so temperate zones (0°C to 20°C) hold rich moisture across landmasses.
 */
export function getTemperatureMoistureCapacity(tempC) {
    const clampedTemp = minmax(tempC, -30, 45);
    // Baseline 1.0 around 10°C (cool temperate), scaling gently
    // Cold 0°C still holds ~0.65 capacity, 12°C holds ~1.1, 20°C holds ~1.65
    return Math.max(0.35, Math.exp((clampedTemp - 10) * 0.045));
}

/**
 * Precipitation model reflecting the whole globe:
 * - Prevailing planetary wind bands across latitudes (Hadley, Ferrel, Polar cells)
 * - Moisture simulation through spherical Voronoi neighbor graph (antimeridian and polar wrap-safe)
 * - Realistic thermal moisture capacity, water recharge, orographic lift & rain shadow, and evapotranspiration
 * - Multi-pass neighbor diffusion and 3D atmospheric convective texture
 */
export function generatePrecipitation() {
    const cells = grid.cells;
    cells.prec = new Uint8Array(cells.i.length); // precipitation array
    const rawPrec = new Float32Array(cells.i.length);

    const planetRadius = config.planetRadius || 6371; // km (Earth default = 6,371 km)
    // Average physical distance in km between adjacent Voronoi cell centers on the spherical surface
    const avgKmPerStep = Math.sqrt((4 * Math.PI) / cells.i.length) * planetRadius;

    // Physical scale calibration: reference step is ~160 km (Earth @ 20,000 cells)
    const referenceKmPerStep = 160;
    const physicalScaleFactor = avgKmPerStep / referenceKmPerStep;

    const precInputModifier = (config.prec ?? 50) / 100;

    const MAX_PASSABLE_ELEVATION = 85;

    // Planetary atmospheric circulation continuous latitude moisture modifier:
    // - ITCZ / Equator (0°-10°): High convective precipitation (~1.8-1.4)
    // - Subtropical Highs / Horse Latitudes (10°-35°): Descending dry air (~0.33-0.75) -> Sahara, Arabian, Kalahari, Australian deserts
    // - Temperate Storm Tracks (35°-65°): Frontal rainfall / westerlies (~0.75-1.35)
    // - Polar Highs (65°-90°): Cold, dry polar deserts (~0.30-0.75)
    function getLatitudeCirculationModifier(lat) {
        const absLat = Math.abs(lat);
        if (absLat <= 10) {
            return 1.8 - (absLat / 10) * 0.4; // 1.8 -> 1.4
        } else if (absLat <= 35) {
            const t = (absLat - 10) / 25;
            return 1.4 - t * 0.65 - Math.sin(t * Math.PI) * 0.72; // Dips to ~0.33 around 22°-26°
        } else if (absLat <= 65) {
            const t = (absLat - 35) / 30;
            return 0.75 + Math.sin(t * Math.PI) * 0.60; // Rises to ~1.35 around 50°
        } else {
            const t = minmax((absLat - 65) / 25, 0, 1);
            return 0.75 - t * 0.45; // 0.75 -> 0.30
        }
    }

    // Planetary wind vector (u: East-West, v: North-South) at latitude
    // Hadley Cell (0°-30°): Trade Winds blow westward (u < 0) converging towards Equator
    // Ferrel Cell (30°-60°): Prevailing Westerlies blow eastward (u > 0) towards poles
    // Polar Cell (60°-90°): Polar Easterlies blow westward (u < 0)
    function getWindVector(lat) {
        const absLat = Math.abs(lat);
        let u = 0;
        let v = 0;
        if (absLat < 30) {
            u = -1.0;
            v = lat > 0 ? -0.25 : 0.25;
        } else if (absLat < 60) {
            u = 1.0;
            v = lat > 0 ? 0.25 : -0.25;
        } else {
            u = -1.0;
            v = lat > 0 ? -0.2 : 0.2;
        }
        const len = Math.hypot(u, v) || 1;
        return { u: u / len, v: v / len };
    }

    // Initialize atmospheric humidity field across the full globe
    const humidity = new Float32Array(cells.i.length);
    const capacity = new Float32Array(cells.i.length);

    for (let i = 0; i < cells.i.length; i++) {
        const [, lat] = grid.points[i];
        const cellTemp = cells.temp[i];
        const tempCap = getTemperatureMoistureCapacity(cellTemp);
        const latCirc = getLatitudeCirculationModifier(lat);
        capacity[i] = 140 * precInputModifier * tempCap * latCirc;
        if (cells.h[i] < 20) {
            // Water cells start saturated with maritime moisture
            humidity[i] = capacity[i];
        }
    }

    // Precompute directional neighbor advection weights on the sphere
    // Uses true spherical metric: dx = dLon * cos(lat), dy = dLat
    const advectionWeights = new Array(cells.i.length);
    for (let i = 0; i < cells.i.length; i++) {
        const [lon, lat] = grid.points[i];
        const radLat = (lat * Math.PI) / 180;
        const cosLat = Math.cos(radLat);
        const { u, v } = getWindVector(lat);
        const neighbors = cells.c[i];
        const weights = [];
        let totalW = 0;

        if (neighbors && neighbors.length > 0) {
            for (const nId of neighbors) {
                const [nLon, nLat] = grid.points[nId];
                const dLon = deltaLongitude(lon, nLon);
                const dLat = nLat - lat;
                const dx = dLon * cosLat;
                const dy = dLat;
                const dist = Math.hypot(dx, dy) || 1;
                // Cosine of angle between spherical displacement and wind vector
                const cosTheta = (dx * u + dy * v) / dist;

                if (cosTheta > 0.05) {
                    const w = Math.pow(cosTheta, 2.0);
                    weights.push({ nId, w });
                    totalW += w;
                }
            }
        }

        if (totalW > 0) {
            for (const entry of weights) {
                entry.w /= totalW; // normalized distribution
            }
        }
        advectionWeights[i] = weights;
    }

    // Run continuous atmospheric advection and precipitation simulation
    // Iteratively transports humidity downwind across all continents simultaneously
    const numAdvectionSteps = 30;
    const baseDecayKm = 2800;
    const lossFractionPerStep = avgKmPerStep / (baseDecayKm * precInputModifier);

    for (let step = 0; step < numAdvectionSteps; step++) {
        const nextHumidity = new Float32Array(humidity.length);

        for (let i = 0; i < cells.i.length; i++) {
            const h = cells.h[i];
            const currentH = humidity[i];
            if (currentH <= 0.1) continue;

            const weights = advectionWeights[i];
            if (!weights || weights.length === 0) continue;

            for (const { nId, w } of weights) {
                const transportAmount = currentH * w;
                const targetH = cells.h[nId];

                if (targetH < 20) {
                    // Moving into water cell: moisture recharges towards atmospheric capacity
                    nextHumidity[nId] = Math.max(nextHumidity[nId], capacity[nId]);
                    rawPrec[nId] += 0.2 * precInputModifier;
                } else {
                    // Moving into land cell: precipitation through distance decay & orographic lift
                    const elevationDiff = Math.max(targetH - h, 0);
                    const orographicMod = (targetH / 55) ** 2.0;
                    const precDrop = Math.min(
                        transportAmount * (lossFractionPerStep + (elevationDiff / 50) * orographicMod * 0.4),
                        transportAmount * 0.85
                    );

                    rawPrec[nId] += precDrop;

                    // Evapotranspiration moisture recycling over land (~55%)
                    const remainingMoisture = Math.max(
                        0,
                        (transportAmount - precDrop * 0.45)
                    );
                    nextHumidity[nId] += remainingMoisture;
                }
            }
        }

        // Apply newly transported humidity and enforce water recharge
        for (let i = 0; i < cells.i.length; i++) {
            if (cells.h[i] < 20) {
                humidity[i] = capacity[i];
            } else {
                humidity[i] = Math.min(nextHumidity[i], capacity[i]);
            }
        }
    }

    // Write raw accumulated precipitation into integer grid
    for (let i = 0; i < cells.i.length; i++) {
        cells.prec[i] = minmax(Math.round(rawPrec[i]), 0, 255);
    }

    // Multi-pass 3D spherical Moisture Diffusion & Atmospheric Convection (3 passes for smooth continuous fields)
    diffusePrecipitation(3);

    /**
     * Find the neighbor of a cell that is most aligned with the given wind direction on the sphere.
     */
    function findNeighborInDirection(cellId, direction) {
        const neighbors = cells.c[cellId];
        if (!neighbors || neighbors.length === 0) return -1;

        const [lon, lat] = grid.points[cellId];
        let bestNeighbor = -1;
        let bestScore = -Infinity;

        for (const neighborId of neighbors) {
            const [nLon, nLat] = grid.points[neighborId];
            const dLon = deltaLongitude(lon, nLon);
            const dLat = nLat - lat;

            let score = 0;
            switch (direction) {
                case "west":
                    // West: decreasing longitude
                    score = -dLon;
                    break;
                case "east":
                    // East: increasing longitude
                    score = dLon;
                    break;
                case "north":
                    // North: increasing latitude
                    score = dLat;
                    break;
                case "south":
                    // South: decreasing latitude
                    score = -dLat;
                    break;
                default:
                    score = 0;
            }

            if (score > bestScore) {
                bestScore = score;
                bestNeighbor = neighborId;
            }
        }

        return bestNeighbor;
    }

    function getPrecipitation(humidity, fromCell, toCell) {
        // Physical distance-based moisture loss rate:
        // Base characteristic maritime penetration length is ~2,500 km across landmasses
        const baseCharacteristicDecayKm = 2500;
        const lossFractionPerStep = (avgKmPerStep / (baseCharacteristicDecayKm * precInputModifier));
        const normalLoss = Math.max(humidity * lossFractionPerStep, 0.8);

        const diff = Math.max(cells.h[toCell] - cells.h[fromCell], 0);
        // Orographic precipitation lift over rising slopes and mountains
        const mod = (cells.h[toCell] / 60) ** 2.0;
        return minmax(normalLoss + diff * mod, 0.8, humidity);
    }

    function diffusePrecipitation(passes = 3) {
        const neighbors = cells.c;
        const noise3D = createNoise3D(Alea(seed + "prec"));

        // Multi-pass neighbor diffusion
        for (let p = 0; p < passes; p++) {
            const precCopy = new Uint8Array(cells.prec);
            for (let i = 0; i < cells.i.length; i++) {
                if (cells.h[i] < 20) continue;
                const neibs = neighbors[i];
                if (!neibs || !neibs.length) continue;

                let sum = precCopy[i];
                let count = 1;
                for (const neib of neibs) {
                    if (cells.h[neib] >= 20) {
                        sum += precCopy[neib];
                        count++;
                    }
                }
                cells.prec[i] = Math.min(255, Math.round(sum / count));
            }
        }

        // Blend in organic 3D atmospheric convective variations across the sphere
        for (let i = 0; i < cells.i.length; i++) {
            if (cells.h[i] < 20) continue;
            const [lon, lat] = grid.points[i];
            const [nx, ny, nz] = toCartesian([lon, lat]);
            const n = noise3D(nx * 2.5, ny * 2.5, nz * 2.5) * 3.5;
            cells.prec[i] = Math.max(2, Math.min(255, Math.round(cells.prec[i] + n)));
        }
    }
}
