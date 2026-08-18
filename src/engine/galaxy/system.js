import { PRNG } from '../random.js';
import { generateStar } from './stars.js';
import { generatePlanet } from './planet.js';

const R_E = 6371;  //radius of earth in km 

export function generateSystem(seed, opts) {
    const starOpts = {
        forceHabitable: opts.forceHabitable || false
    }
    if (opts.primaryType) {
        starOpts.forcedType = opts.primaryType;
    }
    //primary star 
    const star = generateStar(new PRNG(seed + '-star'), starOpts);
    const separation = star.multiplicity === 1 ? null : star.companions[0].separationAU;

    const system = { seed, star };
    const HI = [[], [], [], [], []];
    //generate planets
    let basePlanetData = generateSystemPlanets(seed, star.primary.spectral, separation);
    system.planets = basePlanetData.map((p, i) => {
        //classification, radius, density, insolation (parent.star.luminosity), orbit 

        const planet = generatePlanet(system, {
            classification: p.type === "gas giant" ? "gas giant" : "rocky",
            orbit: p.aAU,
            radius: p.radiusRE * 6371 / 1000, //convert from RE to raw km/1000 
        })
        planet.periodDays = p.periodDays;

        //hi
        HI[planet.HI - 1].push(i);
        planet.moonHI.forEach((arr, hi) => arr.forEach(mi => HI[hi].push([i, mi])));

        return planet;
    })
    system.HI = HI;

    return system;
}

/**
 * Generate planets for a star system
 * @param {string} primaryType - Spectral type: "M", "K", "G", "F", "A", "B", "O"
 * @param {number|null} companionSepAU - Projected/estimated separation of stellar companion in AU (null = single star)
 * @param {number} seed - Integer seed for reproducibility
 * @returns {Array<{type: string, periodDays: number, aAU: number, radiusRE: number}>}
 */
export function generateSystemPlanets(seed, primaryType, companionSepAU = null) {
    const rand = new PRNG(seed);
    const type = (primaryType || "G").toUpperCase().charAt(0);

    // --- Base occurrence modifiers by spectral type ---
    // Higher values = more planets of that class expected
    const baseRates = {
        //        small/rocky   gas giant
        M: { small: 2.2, giant: 0.25 },
        K: { small: 1.3, giant: 0.55 },
        G: { small: 0.9, giant: 0.90 },
        F: { small: 0.55, giant: 1.05 },
        A: { small: 0.30, giant: 1.40 },
        B: { small: 0.10, giant: 0.60 },
        O: { small: 0.05, giant: 0.25 }
    };

    const rates = baseRates[type] || baseRates.G;

    // --- Multiplicity suppression ---
    // Close companions strongly reduce planet formation
    let suppression = 1.0;
    if (companionSepAU != null && companionSepAU > 0) {
        if (companionSepAU < 10) suppression = 0.08;   // very hostile
        else if (companionSepAU < 50) suppression = 0.25;
        else if (companionSepAU < 100) suppression = 0.42;
        else if (companionSepAU < 500) suppression = 0.70;
        else if (companionSepAU < 1500) suppression = 0.88;
        // wider than ~1500 AU → almost no suppression
    }

    const smallRate = rates.small * suppression;
    const giantRate = rates.giant * suppression;

    // Expected number of planets (Poisson-ish via sequential draws)
    // Cap total planets for realism
    const maxPlanets = 8;
    const planets = [];

    // Helper: draw period (days) with a rough power-law bias toward shorter periods
    function drawPeriod(isGiant) {
        // Simple log-uniform-ish with preference for shorter orbits
        const minP = isGiant ? 3 : 0.5;
        const maxP = isGiant ? 4000 : 400;
        const u = rand.rand();
        // Bias shorter: use power
        const p = minP * Math.pow(maxP / minP, Math.pow(u, 0.65));
        return Math.max(minP, Math.min(maxP, p));
    }

    // Approximate semi-major axis from period (Kepler's 3rd, assuming solar-mass scaling)
    // Rough mass scaling by spectral type
    const starMass = { M: 0.4, K: 0.7, G: 1.0, F: 1.3, A: 1.8, B: 5, O: 15 }[type] || 1.0;
    function periodToAU(Pdays) {
        const Pyears = Pdays / 365.25;
        return Math.pow(Pyears * Pyears * starMass, 1 / 3);
    }

    // Decide how many small planets
    let expectedSmall = smallRate * (0.7 + rand.rand() * 0.8); // some variance
    while (expectedSmall > 0.15 && planets.length < maxPlanets) {
        if (rand.rand() < Math.min(0.92, expectedSmall)) {
            const P = drawPeriod(false);
            const a = periodToAU(P);
            // Radius: mostly 0.7–3.5 R⊕, occasional larger sub-Neptune
            let r = 0.6 + rand.rand() * 2.4;
            if (rand.rand() < 0.18) r = 2.8 + rand.rand() * 2.5; // sub-Neptune tail
            planets.push({
                type: r < 1.6 ? "rocky" : (r < 3.5 ? "super-Earth/sub-Neptune" : "Neptune-like"),
                periodDays: +P.toFixed(2),
                aAU: +a.toFixed(3),
                radiusRE: +r.toFixed(2)
            });
        }
        expectedSmall *= 0.55; // diminishing returns / packing
    }

    // Decide gas giants (usually fewer)
    let expectedGiant = giantRate * (0.6 + rand.rand() * 0.9);
    while (expectedGiant > 0.12 && planets.length < maxPlanets) {
        if (rand.rand() < Math.min(0.85, expectedGiant)) {
            const P = drawPeriod(true);
            const a = periodToAU(P);
            // Giant radii ~ 8–14 R⊕ (inflated hot Jupiters can be larger)
            let r = 8 + rand.rand() * 6;
            if (P < 12 && rand.rand() < 0.4) r += 2 + rand.rand() * 4; // hot Jupiter inflation
            planets.push({
                type: "gas giant",
                periodDays: +P.toFixed(1),
                aAU: +a.toFixed(3),
                radiusRE: +r.toFixed(1)
            });
        }
        expectedGiant *= 0.35;
    }

    // Sort by orbital period (innermost first)
    planets.sort((a, b) => a.periodDays - b.periodDays);

    // Very crude dynamical cleanup: remove planets that are way too close to each other
    // (simple period ratio check)
    const cleaned = [];
    for (const p of planets) {
        if (cleaned.length === 0) {
            cleaned.push(p);
            continue;
        }
        const last = cleaned[cleaned.length - 1];
        const ratio = p.periodDays / last.periodDays;
        if (ratio > 1.25) { // rough Hill-stability-ish cut
            cleaned.push(p);
        }
    }

    return cleaned;
}