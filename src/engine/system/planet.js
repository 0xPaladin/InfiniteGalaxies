import { starTypeData, gravity, blackbody, planetTypeData } from '../constants/astrophysics.js';
import { GasGiantColors, RockyColors, TerrainColors } from "../constants/data.js"

const getSeed = (length = 12, RNG = chance) => RNG.string({ length, casing: 'upper', alpha: true });

class Planetoid {
  constructor(parent, i, opts = {}) {
    let { seed, insolation, orbit } = opts;

    this.parent = parent

    this._i = i;
    this._seed = seed || parent._cSeed[i];
    this.seed = [parent.seed, this._seed].join(".");

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
  get data() {
    return {
      "i": this._i,
      "seed": this._seed,
      "parent": this.what == "Planet" ? "" : this.parent._seed,
      "orbit": Number(this._orbitalRadius.toFixed(3)),
      "type": this.classification,
      "radius": Number((this.radius / 1000).toFixed(3)),
      "density": Number(this.density.toFixed(2)),
      "moons": this._moons.length
    }
  }
}

class Moon extends Planetoid {
  constructor(parent, opts = {}) {
    let { i, isMinor } = opts;
    super(parent, i, opts);

    this.what = "Moon"

    let template = this.template = planetTypeData[0];
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
    template = this.template = opts.type ? planetTypeData[ti.indexOf(opts.type)] : template;
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
    nMajor = opts.moons ? (opts.moons > nMajor ? nMajor : opts.moons) : nMajor;
    let nMinor = _type == "rocky" ? RNG.pickone([0, 0, 1, 2]) : RNG.sumDice("2d6")
    nMinor = opts.moons ? opts.moons - nMajor : nMinor;
    this._nm = nMajor + nMinor;

    this._rvar = _.fromN(this._nm, i => RNG.randBetween(0.5, 1));

    let _mods = this.parent._mods;
    _.fromN(nMajor + nMinor, (j) => {
      let opts = Object.assign({
        i: j,
        insolation: this._insolation,
        isMinor: !(j < nMajor)
      }, _mods[[this._i, j].join(".")] || {})
      this._moons.push(new Moon(this, opts));
    })

    return this;
  }

  get moonHI() {
    return _.fromN(4, (i) => this._moons.filter(m => m.HI == i + 1))
  }
}

export { Planet, Moon }
