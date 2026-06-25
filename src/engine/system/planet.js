import { starTypeData, gravity, blackbody, planetTypeData } from '../constants/astrophysics.js';
import { GasGiantColors, RockyColors, TerrainColors } from "../constants/data.js"
import { setPlanetType, setBarrenSubtype, generateMesh, mesh, map, quadGeometry } from './we-planet.js';

const HOSTILE_ATMOS = ['Corrosive', 'Toxic', 'Crushing'];

const getSeed = (length = 12, RNG = chance) => RNG.string({ length, casing: 'upper', alpha: true });

class Planetoid {
  constructor(parent, i, opts = {}) {
    let { seed, insolation, orbit } = opts;

    this.parent = parent

    this._i = i;
    this._seed = seed || parent._cSeed[i];
    this.seed = [parent.seed, this._seed].join(":");

    this._orbitalRadius = orbit || parent.orbits[i];
    this._insolation = insolation || parent.star.luminosity / Math.pow(this._orbitalRadius, 2);

    this._rotate = 1

    this._moons = [];

    let RNG = new Chance(this.seed)
    RNG.range = (min, max) => min + RNG.random() * (max - min)

    this._cSeed = _.fromN(20, i => getSeed(6, RNG));

    let a = this._orbitalRadius;
    let _e = RNG.weighted(['200.800', '5.200'], [1, 3]);
    let e = this._eccentricity = RNG.randBetween(..._e.split(".").map(Number)) / 1000;
    let b = this._minorAxis = Math.sqrt(a * a * (1 - e * e));

    this._rmin = 0.4 * RNG.range(0.5, 2);
    this._rmax = 50 * RNG.range(0.5, 2);
  }

  get data() {
    const { _seed, insolation, classification, _orbitalRadius, radius, density, name } = this;
    return {
      name,
      insolation,
      classification,
      seed: _seed,
      orbit: Number(this._orbitalRadius.toFixed(3)),
      radius: Number((this.radius / 1000).toFixed(3)),
      density: Number(this.density.toFixed(2)),
      moons: this._moons.map(m => m.data)
    }
  }

  get i() {
    let idx = this.what == "Planet" ? this.parent.objects.map(o => o._seed) : this.parent._moons.map(o => o._seed);
    return idx.indexOf(this._seed);
  }
  get system() {
    return this.what == "Planet" ? this.parent : this.parent.parent
  }
  get sector() {
    return this.system.parent;
  }
  get ellipse() {
    return [0, 0, this._orbitalRadius, this._minorAxis]
  }
  get gravity() {
    return gravity(this.radius, this.density)
  }
  get orbits() {
    let { _nm, _rmin, _rmax, _rvar } = this;
    let total_weight = (Math.pow(_nm, 2) + _nm) * 0.5;
    let pr = _rmin;

    return _.fromN(_nm, i => {
      pr += i / total_weight * _rvar[i] * (_rmax - _rmin);
      return pr;
    })
  }
  get shortName() {
    let S = this.system
    return `Planet ${this.what == "Planet" ? _.romanNumeral(this.i) : _.romanNumeral(this.parent.i) + ", " + _.suffix((this.i + 1)) + " Moon"}`
  }
  get name() {
    let S = this.what == "Planet" ? this.parent : this.parent.parent
    return `${S.name} ${this.what == "Planet" ? _.romanNumeral(this.i) : _.romanNumeral(this.parent.i) + ", " + _.suffix((this.i + 1)) + " Moon"}`
  }
  get isFavorite() {
    return this.system._favorites.includes(this.seed)
  }
  manageFavorites() {
    this.system.manageFavorites(this.seed)
  }

  getPlanetEngineType() {
    if (this.classification === 'gas giant' || this.classification === 'brown dwarf') {
      return 'gasgiant';
    }
    const atmo = this.atmosphere || '';
    if (atmo === 'Trace') return 'airless';
    if (HOSTILE_ATMOS.includes(atmo)) return 'barren';
    if (this.HI <= 2) return 'earthlike';
    if (this.HI <= 4) return 'barren';
    return 'airless';
  }

  _seedToNum() {
    const s = this.seed;
    if (s) {
      let n = 0;
      for (let i = 0; i < s.length; i++) n += s.charCodeAt(i);
      return n;
    }
    const s2 = this._seed;
    if (s2) {
      let n = 0;
      for (let i = 0; i < s2.length; i++) n += s2.charCodeAt(i);
      return n;
    }
    return Date.now();
  }

  generatePlanet(opts = {}) {
    const engineType = this._engineType || this.getPlanetEngineType();
    const isBarren = engineType === 'barren';
    const barrenSubtype = isBarren && HOSTILE_ATMOS.includes(this.atmosphere) ? 'hostile' : 'barren';

    setPlanetType(engineType);
    setBarrenSubtype(barrenSubtype);
    generateMesh({
      seed: this._seedToNum(),
      N: opts.N,
      nPlates: opts.nPlates,
      jitter: opts.jitter,
      waterLevel: opts.waterLevel,
      tempOffset: opts.tempOffset,
      rainOffset: opts.rainOffset,
    });

    this._mesh = mesh;
    this._map = { ...map };
    this._quadData = { I: quadGeometry.I, xyz: quadGeometry.xyz, tm: quadGeometry.tm };
    this._engineType = engineType;

    return { mesh, map, quadGeometry };
  }
}

class Moon extends Planetoid {
  constructor(parent, opts = {}) {
    let { i, isMinor } = opts;
    super(parent, i, opts);

    this.what = "Moon"

    let template = this.template = opts.classification ? planetTypeData[ti.indexOf(opts.classification)] : planetTypeData[0];
    this.classification = template.classification;

    let RNG = new Chance(this.seed);
    RNG.range = (min, max) => min + RNG.random() * (max - min);
    let _r = parent.classification == "rocky" || isMinor ? RNG.randBetween(50, 2500) : RNG.randBetween(template.radius[0], template.radius[1]);
    this.radius = opts.radius ? opts.radius * 1000 : _r;
    let _dense = RNG.randBetween(template.density[0], template.density[1]);
    this.density = opts.density || _dense;
    this.hydrographics = template.hydrographics(RNG, this._insolation, this.radius, this.density);
    this.atmosphere = template.atmosphere(RNG, this._insolation, this.radius, this.density, this.hydrographics);

    Object.assign(this, this.template.HI(this._insolation, this.radius, this.density, Number(this.hydrographics), this.atmosphere))

    this.color = RNG.pickone(RockyColors).name

    return this;
  }
}

class Planet extends Planetoid {
  constructor(parent, opts = {}) {
    super(parent, opts.i, opts);

    this.what = "Planet";

    let RNG = new Chance(this.seed)
    RNG.range = (min, max) => min + RNG.random() * (max - min)

    let ti = planetTypeData.map(d => d.classification);
    let template = RNG.weighted(planetTypeData, [this._insolation * 100, 10, 1]);

    template = this.template = opts.classification ? planetTypeData[ti.indexOf(opts.classification)] : template;
    let _type = this.classification = template.classification;

    let _r = RNG.randBetween(template.radius[0], template.radius[1]);
    this.radius = opts.radius ? opts.radius * 1000 : _r;
    let _dense = RNG.randBetween(template.density[0], template.density[1]);
    this.density = opts.density || _dense;
    this.hydrographics = template.hydrographics(RNG, this._insolation, this.radius, this.density);
    this.atmosphere = template.atmosphere(RNG, this._insolation, this.radius, this.density, this.hydrographics);

    Object.assign(this, this.template.HI(this._insolation, this.radius, this.density, Number(this.hydrographics), this.atmosphere))
    this.color = _type == "gas giant" ? [RNG.pickone(GasGiantColors).name, RNG.pickone(GasGiantColors).name] : _type == "rocky" ? RNG.pickone(RockyColors).name : "brown"

    let nMajor = _type == "rocky" ? RNG.pickone([0, 0, 1, 2]) : 1 + RNG.d4();
    let nMinor = _type == "rocky" ? RNG.pickone([0, 0, 1, 2]) : RNG.sumDice("2d6")
    let mods = [];
    if (opts.moons != null) {
      let total = Array.isArray(opts.moons) ? opts.moons.length : opts.moons;
      mods = Array.isArray(opts.moons) ? opts.moons : [];
      nMajor = Math.min(nMajor, total);
      nMinor = total - nMajor;
    }
    this._nm = nMajor + nMinor;

    this._rvar = _.fromN(this._nm, i => RNG.randBetween(0.5, 1));

    _.fromN(nMajor + nMinor, (j) => {
      let opts = Object.assign({
        i: j,
        insolation: this._insolation,
        isMinor: !(j < nMajor)
      }, mods[j] || {})
      this._moons.push(new Moon(this, opts));
    })

    return this;
  }

  get moonHI() {
    return _.fromN(4, (i) => this._moons.filter(m => m.HI == i + 1))
  }
}

export { Planet, Moon }
