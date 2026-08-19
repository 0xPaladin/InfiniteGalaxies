import { PRNG } from '../random.js';
import { generateStar } from './stars.js';
import { generatePlanet } from './planet.js';

const R_E = 6371;  //radius of earth in km 

export function generateSystem(seed, opts = {}) {
    const starOpts = {
        forceHabitable: opts.forceHabitable || false
    }
    if (opts.primaryType) {
        starOpts.forcedType = opts.primaryType;
    }
    //primary star 
    const star = generateStar(new PRNG(seed + '-star'), starOpts);

    const system = { seed, star };
    const HI = [[], [], [], [], []];
    //generate planets
    let basePlanetData = generateSystemPlanets(seed, star);
    system.planets = basePlanetData.map((p, i) => {
        //classification, radius, density, insolation (parent.star.luminosity), orbit 

        const planet = generatePlanet(system, {
            i,
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
export function generateSystemPlanets(seed, star) {
    const primaryType = star.primary.spectral;
    const companionSepAU = star.multiplicity === 1 ? null : star.companions[0].separationAU;
    const orbits = star.orbits;

    const rand = new PRNG(seed);
    const type = (primaryType || "G").toUpperCase().charAt(0);

    // --- Base occurrence modifiers by spectral type ---
    // Higher values = more planets of that class expected
    const baseRates = {
        //        small/rocky   gas giant
        M: { small: '2d4', giant: '1d3-2' },
        K: { small: '2d3', giant: '1d2' },
        G: { small: '1d4+1', giant: '1d3' },
        F: { small: '1d3-1', giant: '1d4' },
        A: { small: '1d3-1', giant: '1d4' },
        B: { small: 0, giant: '1d3-1' },
        O: { small: 0, giant: '1d3-1' }
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

    let smallRate = rand.dice(rates.small) * suppression;
    let giantRate = rand.dice(rates.giant) * suppression;

    // Expected number of planets (Poisson-ish via sequential draws)
    // Cap total planets for realism
    const maxPlanets = 10;
    const planets = [];

    // Decide how many small planets
    while (smallRate > 0 && planets.length < maxPlanets) {
        const wiggle = rand.range(0.85, 1, 15);
        const a = wiggle * orbits[planets.length];
        // Radius: mostly 0.7–3.5 R⊕, occasional larger sub-Neptune
        let r = 0.6 + rand.rand() * 2.4;
        if (rand.rand() < 0.18) r = 2.8 + rand.rand() * 2.5; // sub-Neptune tail
        planets.push({
            type: r < 1.6 ? "rocky" : (r < 3.5 ? "super-Earth/sub-Neptune" : "Neptune-like"),
            aAU: +a.toFixed(3),
            radiusRE: +r.toFixed(2)
        });
        smallRate--;
    }

    // Decide gas giants (usually fewer)
    while (giantRate > 0 && planets.length < maxPlanets) {
        const wiggle = rand.range(0.85, 1, 15);
        const a = wiggle * orbits[planets.length];
        // Giant radii ~ 8–14 R⊕ (inflated hot Jupiters can be larger)
        let r = 8 + rand.rand() * 6;
        if (a < 1 && rand.rand() < 0.4) r += 2 + rand.rand() * 4; // hot Jupiter inflation
        planets.push({
            type: "gas giant",
            aAU: +a.toFixed(3),
            radiusRE: +r.toFixed(1)
        });
        giantRate--;
    }

    return planets;
}