import { PRNG } from '../random.js';
import { planetTypeData } from '../constants/astrophysics.js';
import { GasGiantColors, RockyColors, TerrainColors } from "../constants/data.js"

function generatePlanetoid(parent, i, opts = {}) {
    let { seed = i, insolation, orbit } = opts;

    const _seed = parent ? [parent.seed, seed].join(":") : seed;
    const prng = new PRNG(_seed);

    //orbit, eccentricity, and minor axis
    orbit = orbit || parent.orbits[i];
    let _e = prng.weighted(['200.800', '5.200'], [1, 3]).split(".").map(Number);
    let e = prng.range(..._e) / 1000;
    let b = Math.sqrt(orbit * orbit * (1 - e * e));

    return {
        parent,
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
    const color = RNG.pickone(RockyColors).name;

    let _r = parent.type == "rocky" || isMinor ? RNG.range(50, 2500) : RNG.range(template.radius[0], template.radius[1]);
    const radius = opts.radius ? opts.radius * 1000 : _r;
    const dense = RNG.range(template.density[0], template.density[1]);
    const density = opts.density || _dense;
    const hydrographics = Number(template.hydrographics(RNG, parent.insolation, radius, density));
    const atmosphere = template.atmosphere(RNG, parent.insolation, radius, density, hydrographics);

    return Object.assign(base,
        template.HI(parent.insolation, radius, density, hydrographics, atmosphere),
        { type, color, radius, density, hydrographics, atmosphere })
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
    const color = _type == "gas giant" ? [RNG.pick(GasGiantColors).name, RNG.pick(GasGiantColors).name] : _type == "rocky" ? RNG.pick(RockyColors).name : "brown";

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

    //update base
    Object.assign(base, { type: _type, radius, density, hydrographics, atmosphere, color });

    const moonHI = [[], [], [], [], []];
    base.moons = Array.from({ length: nMajor + nMinor }, (_, j) => {
        const moon = generateMoon(base, Object.assign({
            i: j,
            insolation: base.insolation,
            isMinor: !(j < nMajor)
        }, mods[j] || {}));

        //record hi
        moonHI[moon.HI - 1].push(j);
    })
    base.moonHI = moonHI;

    return base;
}