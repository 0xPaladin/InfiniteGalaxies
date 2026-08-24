import * as d3 from "d3";
import { createNoise2D } from "simplex-noise";
import Alea from "alea";
import { minmax, rn, rand } from "../utils/index.js";
import { grid, seed, config, graphWidth, graphHeight } from "../src/state.js";
import { DEBUG } from "../utils/debug.js";

// temperature model: vertical gradient across defined height with 2D atmospheric turbulence and continentality
export function calculateTemperatures() {
    const cells = grid.cells;
    cells.temp = new Int8Array(cells.i.length); // temperature array

    const [tempNorth, tempCenter, tempSouth] = config.tempRange;
    const exponent = config.heightExponent;
    const noise2D = createNoise2D(Alea(seed + "temp"));

    for (let rowCellId = 0; rowCellId < cells.i.length; rowCellId += grid.cellsX) {
        const [, y] = grid.points[rowCellId];
        const fractionY = minmax(y / graphHeight, 0, 1); // 0 at north edge, 1 at south edge
        const baseSeaLevel = calculateBaseSeaLevelTemp(fractionY);
        DEBUG.temperature && console.info(`y=${rn(fractionY, 2)} sea temperature: ${rn(baseSeaLevel)}°C`);

        for (let cellId = rowCellId; cellId < rowCellId + grid.cellsX; cellId++) {
            const [px, py] = grid.points[cellId];
            // 2D atmospheric thermal turbulence: multi-scale organic temperature waves
            const n1 = noise2D((px / graphWidth) * 3, (py / graphHeight) * 3);
            const n2 = noise2D((px / graphWidth) * 7 + 0.5, (py / graphHeight) * 7 + 0.5) * 0.4;
            const noiseOffset = (n1 + n2) * 4.0; // +/- ~5.6°C organic variation

            // Continentality: inland areas have more extreme seasonal swings / higher continental heating/cooling
            let continentalityMod = 0;
            const dist = cells.t ? cells.t[cellId] : 0;
            if (dist > 0) {
                // inland: distance from coast
                const distFactor = Math.min(dist / 15, 1);
                // Warmer base temperatures heat up inland; cold areas cool down inland
                continentalityMod = baseSeaLevel >= 15 ? distFactor * 2.5 : -distFactor * 3.5;
            }

            const tempSeaLevel = baseSeaLevel + noiseOffset + continentalityMod;
            const tempAltitudeDrop = getAltitudeTemperatureDrop(cells.h[cellId]);
            cells.temp[cellId] = minmax(Math.round(tempSeaLevel - tempAltitudeDrop), -128, 127);
        }
    }

    // piecewise linear interpolation from north edge (y=0) to center (y=0.5) to south edge (y=1)
    function calculateBaseSeaLevelTemp(t) {
        if (t <= 0.5) {
            const localT = t / 0.5;
            return tempNorth + (tempCenter - tempNorth) * localT;
        } else {
            const localT = (t - 0.5) / 0.5;
            return tempCenter + (tempSouth - tempCenter) * localT;
        }
    }

    // temperature drops by 6.5°C per 1km of altitude
    function getAltitudeTemperatureDrop(h) {
        if (h < 20) return 0;
        const height = Math.pow(h - 18, exponent);
        return rn((height / 1000) * 6.5);
    }
}

// temperature-based moisture holding capacity
// Calibrated so temperate zones (0°C to 20°C, e.g. Europe) hold rich moisture across the landmass
export function getTemperatureMoistureCapacity(tempC) {
    const clampedTemp = minmax(tempC, -30, 45);
    // Baseline 1.0 around 10°C (cool temperate), scaling gently
    // Cold 0°C still holds ~0.65 capacity, 12°C holds ~1.1, 20°C holds ~1.65
    return Math.max(0.35, Math.exp((clampedTemp - 10) * 0.045));
}

// precipitation model with realistic atmospheric moisture transport, physical scaling, and thermal capacity
export function generatePrecipitation() {
    const cells = grid.cells;
    const cellsX = grid.cellsX;
    const cellsY = grid.cellsY;
    cells.prec = new Uint8Array(cells.i.length); // precipitation array

    const precInputModifier = (config.prec ?? 50) / 100;
    // Physical distance represented per cell step in km
    const kmPerCellX = (config.width || 5000) / cellsX;
    const kmPerCellY = (config.height || 5000) / cellsY;
    const avgKmPerCell = (kmPerCellX + kmPerCellY) / 2;

    const westerly = [];
    const easterly = [];
    let southerly = 0;
    let northerly = 0;

    const MAX_PASSABLE_ELEVATION = 85;
    const windTiers = Array.isArray(config.winds) && config.winds.length ? config.winds : [225, 45, 90, 90, 45, 225];
    const numWindTiers = windTiers.length;

    // define wind strengths based on temperature moisture capacity and wind tiers
    d3.range(0, cells.i.length, cellsX).forEach(function (c, i) {
        const fractionY = minmax(i / cellsY, 0, 1);
        const cellTemp = cells.temp[c];
        const tempCapacity = getTemperatureMoistureCapacity(cellTemp);

        const tierIndex = Math.min(numWindTiers - 1, Math.max(0, Math.floor(fractionY * numWindTiers)));
        const { isWest, isEast, isNorth, isSouth } = getWindDirections(tierIndex);

        // Primary and secondary wind influx so both ocean coasts and interior receive moisture
        // Westerlies in temperate regions (like Europe) carry strong oceanic moisture
        const westWeight = isWest ? 1.0 : 0.6;
        const eastWeight = isEast ? 1.0 : 0.6;

        westerly.push([c, tempCapacity * westWeight, tierIndex]);
        easterly.push([c + cellsX - 1, tempCapacity * eastWeight, tierIndex]);

        if (isNorth) northerly++;
        if (isSouth) southerly++;
    });

    // Distribute winds from both ocean directions with robust baseline moisture
    if (westerly.length) passWind(westerly, 180 * precInputModifier, 1, cellsX);
    if (easterly.length) passWind(easterly, 180 * precInputModifier, -1, cellsX);

    const vertT = southerly + northerly || 1;
    if (northerly) {
        const northCap = getTemperatureMoistureCapacity(cells.temp[0]);
        const maxPrecN = (northerly / vertT) * 90 * precInputModifier * northCap;
        passWind(d3.range(0, cellsX, 1), maxPrecN, cellsX, cellsY);
    }

    if (southerly) {
        const southEdgeIndex = cells.i.length - cellsX;
        const southCap = getTemperatureMoistureCapacity(cells.temp[southEdgeIndex]);
        const maxPrecS = (southerly / vertT) * 90 * precInputModifier * southCap;
        passWind(d3.range(cells.i.length - cellsX, cells.i.length, 1), maxPrecS, -cellsX, cellsY);
    }

    // Multi-pass 2D Moisture Diffusion & Atmospheric Convection
    diffusePrecipitation(4);

    function getWindDirections(tier) {
        const angle = windTiers[tier];
        const isWesterly = angle < 90 || angle > 270;
        const isEasterly = angle > 90 && angle < 270;
        const isSoutherly = angle > 0 && angle < 180;
        const isNortherly = angle > 180 && angle < 360;

        return { isWest: isWesterly, isEast: isEasterly, isNorth: isNortherly, isSouth: isSoutherly };
    }

    function passWind(source, maxPrec, next, steps) {
        const maxPrecInit = maxPrec;

        for (let first of source) {
            if (first[0] !== undefined && typeof first === "object") {
                maxPrec = Math.min(maxPrecInit * first[1], 255);
                first = first[0];
            }

            let humidity = maxPrec - cells.h[first];
            if (humidity <= 0) continue;

            for (let s = 0, current = first; s < steps; s++, current += next) {
                const t = cells.temp[current];
                const thermalFactor = t < 0 ? Math.max(0.4, (t + 30) / 30) : 1;

                if (cells.h[current] < 20) {
                    // water cell: strong atmospheric recharge
                    const waterRechargeCap = maxPrec * thermalFactor;
                    if (cells.h[current + next] >= 20) {
                        cells.prec[current + next] += Math.max(humidity / rand(6, 12), 2); // coastal precipitation
                    } else {
                        humidity = Math.min(humidity + 18 * precInputModifier * thermalFactor, waterRechargeCap);
                        cells.prec[current] += 5 * precInputModifier * thermalFactor;
                    }
                    continue;
                }

                // land cell
                const isPassable = cells.h[current + next] <= MAX_PASSABLE_ELEVATION;
                const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
                cells.prec[current] += Math.round(precipitation);

                // Evapotranspiration moisture recycling over land (forests/vegetation transpire back ~80%)
                const evaporation = precipitation * 0.80;
                // Sustained atmospheric humidity floor so interior temperate plains stay green
                const minLandHumidity = maxPrec * 0.28 * thermalFactor;
                humidity = isPassable ? minmax(humidity - precipitation + evaporation, minLandHumidity, maxPrec) : 0;
            }
        }
    }

    function getPrecipitation(humidity, i, n) {
        // Controlled moisture loss rate so maritime & continental air masses penetrate deep inland
        const lossRate = 60;
        const normalLoss = Math.max(humidity / (lossRate * precInputModifier), 0.6);
        const diff = Math.max(cells.h[i + n] - cells.h[i], 0);
        const mod = (cells.h[i + n] / 75) ** 1.8; // orographic lift over hills/mountains
        return minmax(normalLoss + diff * mod, 0.6, humidity);
    }

    function diffusePrecipitation(passes = 3) {
        const neighbors = cells.c;
        const noise2D = createNoise2D(Alea(seed + "prec"));

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

        // Blend in organic 2D atmospheric convective variations so interior moisture is richly textured
        for (let i = 0; i < cells.i.length; i++) {
            if (cells.h[i] < 20) continue;
            const [px, py] = grid.points[i];
            const n = noise2D((px / graphWidth) * 4, (py / graphHeight) * 4) * 3.5;
            cells.prec[i] = Math.max(2, Math.min(255, Math.round(cells.prec[i] + n)));
        }
    }
}
