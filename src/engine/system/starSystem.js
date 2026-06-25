import { starTypeData, gravity, blackbody, planetTypeData } from '../constants/astrophysics.js';

import { Planet } from './planet.js';

import { CreatePOI } from '../poi.js';

const getSeed = (length = 12, RNG = chance) => RNG.string({ length, casing: 'upper', alpha: true });

class System {
  constructor(opts = {}) {
    this.what = "System";
    this.toSave = false;

    this._onClick = opts.onClick || null;
    this._display = opts.display || null;
    this._parentRef = opts.parent || null;

    this.i = opts.i || 0;
    this._seed = opts.seed || getSeed(16);
    this.seed = [this._parentRef ? this._parentRef.seed : "", this._seed].join(":");

    this._name = opts.name || null;

    let RNG = new Chance(this.seed)

    let _loc = _.fromN(3, () => RNG.floating({ min: 0, max: 1000 }));
    this._loc = opts.xyz || _loc;
    this.x = this._loc[0];
    this.y = this._loc[1];
    this.z = this._loc[2];

    const SPECTRAL = ["O", "B", "A", "F", "G", "K", "M"]
    let star = {}
      , _sC = RNG.weighted([0, 1, 2, 3, 4, 5, 6], [0.0001, 0.2, 1, 3, 8, 12, 20])
      , spectralClass = opts.starClass || SPECTRAL[_sC]
      , spectralIndex = RNG.randBetween(0, 9, RNG)
      , stellarTemplate = starTypeData[spectralClass];

    this.starClass = star.SC = spectralClass;
    star.spectralType = spectralClass + spectralIndex;
    star.luminosity = stellarTemplate.luminosity * (4 / (spectralIndex + 2));
    star.template = stellarTemplate;
    this.star = star

    var [rmin, rmax] = ["6.6,20", "1.8,6.6", "1.4,1.8", "1.1,1.4", "0.9,1.1", "0.7,0.9", "0.1,0.7"][_sC].split(",")
    this.stellarR = Number(rmin) + RNG.random() * (Number(rmax) - Number(rmin))
    let s = Math.log(star.luminosity) + 8;
    s = Math.max(Math.min(s, 20), 2);
    this._r = s

    this._color = star.template.color

    let range = (min, max) => min + RNG.random() * (max - min)

    let _np = RNG.randBetween(...stellarTemplate.planets);
    this._np = opts.np || _np;
    this._cSeed = _.fromN(24, i => getSeed(8, RNG));

    this._rmin = 0.4 * range(0.5, 2);
    this._rmax = 50 * range(0.5, 2);
    this._rvar = _.fromN(this._np, i => range(0.5, 1));

    this._children = _.fromN(this._np, i => {
      return new Planet(this, { i });
    });
    if (opts.children) {
      opts.children.forEach(P => this.replace(new Planet(this, P)));
    }

    let list = this.planets.map(p => p.HI).concat(this.planets.map(p => p._moons.map(m => m.HI)).flat()).sort()
    this.HI = list.length ? list.shift() : 5;

    let _poi = (r) => r <= 2 ? 'raiders' : r <= 4 ? 'unique life' : r <= 6 ? 'hazard' : r == 7 ? 'obstacle' : r <= 12 ? 'site' : 'settlement';
    let _safe = this.parent.safety[1]
    this._pois = _.fromN(2, () => _poi(RNG.d12() + _safe))
    this.POI = [];
  }
  get name() {
    return this._name || this.parent._names[this.id]
  }

  get parent() {
    return this._parentRef;
  }

  get galaxy() {
    return this.parent ? this.parent.galaxy : null;
  }

  get data() {
    return {
      seed: this._seed,
      xyz: this._loc,
      name: this._name,
      starClass: this.star.SC,
      np: this._np,
      children: this.children.map(c => c.data)
    }
  }

  replace(P) {
    let i = this._children.map(c => c._seed).indexOf(P.seed);
    P.i = i;
    this._children[i] = P;
  }

  setGradients(RNG = new Chance(this.seed)) {
    this._children.forEach(p => {
      if (["gas giant", "brown dwarf"].includes(p.classification)) {
        let color1 = d3.color(p.color?.[0]) || d3.color('#888888')
        let color2 = d3.color(p.color?.[1]) || d3.color('#665544')
        let brightSrc = RNG.pickone([color1, color2])
        p._gradient = [
          [0, brightSrc.brighter(RNG.pickone([2, 3]))],
          [0.5, color1],
          [1, color2],
        ]
      }
    })
  }

  get habitable() {
    return _.fromN(2, (i) => this.planetHI[i].concat(this.moonHI[i]))
  }
  get planetHI() {
    return _.fromN(4, (i) => this.planets.filter(m => m.HI == i + 1))
  }
  get children() {
    return this._children;
  }
  get planets() {
    return this._children.filter(c => c.what == "Planet");
  }
  get objects() {
    return this.planets.concat(this.POI || []).sort((a, b) => a._orbitalRadius - b._orbitalRadius)
  }
  get moons() {
    return this.planets.map(c => c._moons).flat();
  }
  get moonHI() {
    return _.fromN(4, (i) => this.moons.filter(m => m.HI == i + 1))
  }

  get orbits() {
    let { _np, _rmin, _rmax, _rvar } = this;
    let total_weight = (Math.pow(_np, 2) + _np) * 0.5;
    let pr = _rmin;

    return _.fromN(_np, i => {
      pr += i / total_weight * _rvar[i] * (_rmax - _rmin);
      return pr;
    })
  }
  get point() {
    return this._loc
  }
  distance(s) {
    let pi = this.point
    let pj = s.point
    let d2 = pj.map((p, i) => (p - pi[i]) * (p - pi[i])).reduce((s, v) => s + v, 0)
    return Math.sqrt(d2)
  }

  get faction() {
    return this.claim > -1 && this.galaxy ? this.galaxy._factions.find(f => f.id == this.claim) : null
  }
  get nearestFactionSystem() {
    return this.parent.systems.filter(s => s.claim > -1).map(s => [s, this.distance(s)]).sort((a, b) => a[1] - b[1])[0][0]
  }

  get svgPad() {
    let SR = 695.700
    let starR = this.stellarR * SR

    return this.objects.reduce((s, p, j) => {
      let _r = p.radius / 1000 < 3 ? 3 : p.radius / 1000
      let dr = j == 0 ? (starR * 0.5 + _r + 10) : (s[j - 1][1] + 2 * _r + 10)
      s.push([p._seed, dr])
      return s
    }, [])
  }

  display() {
    if (!this._display) return;
    const system = this;
    this._display(this, {
      onPlanetClick(planet, group) {
        if (system._onClick) system._onClick(system, 'systemPlanetClick', { planet, group });
      }
    });
    if (system._onClick) system._onClick(system, 'systemDisplay');
  }
}

export { System }
