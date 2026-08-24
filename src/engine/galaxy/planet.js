import { PRNG } from '../random.js';
import { childSeed } from '../seed.js';
import { layoutPosition } from './layout.js';
import { planetTypeData } from '../constants/astrophysics.js';
import { GasGiantColors, RockyColors, TerrainColors } from "../constants/data.js"

// NOTE: `parent` is used to read data during generation only — it is never stored
// on the returned object (a raw parent ref would make the output circular and
// break structuredClone/JSON.stringify; see IMPLEMENTATION_PLAN.md §0).
// `parentSeed` is stored instead, so the relationship is still recoverable.
function generatePlanetoid(parent, i, opts = {}) {
    let { seed = i, insolation, orbit } = opts;

    const _seed = parent ? childSeed(parent.seed, seed) : seed;
    const prng = new PRNG(_seed);

    //orbit, eccentricity, and minor axis
    orbit = orbit || parent.orbits[i];
    let _e = prng.weighted(['200.800', '5.200'], [1, 3]).split(".").map(Number);
    let e = prng.range(..._e) / 1000;
    let b = Math.sqrt(orbit * orbit * (1 - e * e));

    return {
        parentSeed: parent ? parent.seed : null,
        seed,
        _seed,
        i,
        orbit,
        eccentricity: e,
        minorAxis: b,
        insolation: insolation || parent.star.luminosity / Math.pow(orbit, 2),
        rmin: 0.4 * prng.range(5, 20) / 10,
        rmax: 50 * prng.range(5, 20) / 10
    }
}

function generateMoon(parent, opts) {
    let { i, isMinor } = opts;
    const base = generatePlanetoid(parent, i, opts);

    let RNG = new PRNG(base._seed);

    const template = planetTypeData[0];
    const type = template.classification;  // rocky
    const color = RNG.pick(RockyColors).hex;

    let _r = parent.type == "rocky" || isMinor ? RNG.range(50, 2500) : RNG.range(template.radius[0], template.radius[1]);
    const radius = opts.radius ? opts.radius * 1000 : _r;
    const dense = RNG.range(template.density[0], template.density[1]);
    const density = opts.density || dense;
    const hydrographics = Number(template.hydrographics(RNG, parent.insolation, radius, density));
    const atmosphere = template.atmosphere(RNG, parent.insolation, radius, density, hydrographics);

    return Object.assign(base,
        template.HI(parent.insolation, radius, density, hydrographics, atmosphere),
        { kind: 'moon', type, color, radius, density, hydrographics, atmosphere })
}

export function generatePlanet(parent, opts = {}) {
    const base = generatePlanetoid(parent, opts.i, opts);

    let RNG = new PRNG(base._seed);

    let ti = planetTypeData.map(d => d.classification);
    let template = RNG.weighted(planetTypeData, [base.insolation * 100, 10, 1]);

    template = opts.classification ? planetTypeData[ti.indexOf(opts.classification)] : template;
    let _type = template.classification;

    //core characteristics
    let _r = RNG.range(template.radius[0], template.radius[1]);
    const radius = opts.radius ? opts.radius * 1000 : _r;
    let _dense = RNG.range(template.density[0], template.density[1]);
    const density = opts.density || _dense;
    const hydrographics = Number(template.hydrographics(RNG, base.insolation, radius, density));
    const atmosphere = template.atmosphere(RNG, base.insolation, radius, density, hydrographics);

    //habitability index
    Object.assign(base, template.HI(base.insolation, radius, density, hydrographics, atmosphere));

    //color
    const color = _type == "gas giant" ? [RNG.pick(GasGiantColors).hex, RNG.pick(GasGiantColors).hex] : _type == "rocky" ? [RNG.pick(RockyColors).hex] : "brown";

    //moons
    let nMajor = _type == "rocky" ? RNG.pick([0, 0, 1, 2]) : 1 + RNG.d(4);
    let nMinor = _type == "rocky" ? RNG.pick([0, 0, 1, 2]) : RNG.dice("2d6");
    let mods = [];
    if (opts.moons != null) {
        let total = Array.isArray(opts.moons) ? opts.moons.length : opts.moons;
        mods = Array.isArray(opts.moons) ? opts.moons : [];
        nMajor = Math.min(nMajor, total);
        nMinor = total - nMajor;
    }
    const nm = nMajor + nMinor;

    //orbit of moons 
    const moon_weight = (Math.pow(nm, 2) + nm) * 0.5;
    let io = base.rmin;
    const orbits = Array.from({ length: 12 }, (v, i) => {
        const rvar = RNG.range(0.5, 1);
        io += i / moon_weight * rvar * (base.rmax - base.rmin);
        return io;
    })

    //update base
    Object.assign(base, { kind: 'planet', type: _type, radius, density, hydrographics, atmosphere, color, orbits });

    const moonHI = [[], [], [], [], []];
    base.moons = Array.from({ length: nMajor + nMinor }, (_, j) => {
        const moon = generateMoon(base, Object.assign({
            i: j,
            insolation: base.insolation,
            isMinor: !(j < nMajor)
        }, mods[j] || {}));

        //record hi
        moonHI[moon.HI - 1].push(j);
        // layout: moon's orbital position around this planet, assigned at
        // generation time (see galaxy/layout.js) — renderers only project it
        moon.pos = layoutPosition(moon.orbit, j);
        return moon;
    })
    base.moonHI = moonHI;

    return base;
}