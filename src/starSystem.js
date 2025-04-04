import { starTypeData, gravity, blackbody, planetTypeData } from './astrophysics.js';

import { Planet } from './planet/planet.js';

import { CreatePOI } from './poi.js';

//seed generator
const getSeed = (length = 12, RNG = chance) => RNG.string({ length, casing: 'upper', alpha: true });

//generating a system based upon a seed 
class System {
  constructor(opts = {}) {
    this.what = "System"

    //sector 
    this._parent = opts.parent ? opts.parent.id : null;

    this._seed = opts.seed || getSeed(16);
    this.seed = [App.galaxy.seed, this._seed].join(".");
    this._name = opts.name || null

    let RNG = new Chance(this.seed)

    //location in sector 
    let _loc = _.fromN(3, () => RNG.randBetween(1, 1000));
    this._loc = opts.xyz || _loc;
    this.x = this._loc[0] / 10;
    this.y = this._loc[1] / 10;
    this.z = this._loc[2] / 10;

    //star detail 
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

    //radius 
    var [rmin, rmax] = ["6.6,20", "1.8,6.6", "1.4,1.8", "1.1,1.4", "0.9,1.1", "0.7,0.9", "0.1,0.7"][_sC].split(",")
    this.stellarR = Number(rmin) + RNG.random() * (Number(rmax) - Number(rmin))
    let s = Math.log(star.luminosity) + 8;
    s = Math.max(Math.min(s, 20), 2);
    this._r = s

    //color 
    this._color = star.template.color

    let range = (min, max) => min + RNG.random() * (max - min)

    //planets - check if child ids are defined 
    let _np = RNG.randBetween(...stellarTemplate.planets);
    this._np = opts.np || _np; 
    this._cSeed = _.fromN(24,i=> getSeed(8,RNG));

    //orbits 
    this._rmin = 0.4 * range(0.5, 2);
    this._rmax = 50 * range(0.5, 2);
    this._rvar = _.fromN(this._np,i=> range(0.5, 1));
    
    //planet modifications
    this._mods = opts.mods || {};
    //initialize planets
    this._children = _.fromN(this._np, i=> {
      return new Planet(this, this._mods[i] || {i});
    });

    //order for filtering 
    let list = this.planets.map(p => p.HI).concat(this.planets.map(p => p._moons.map(m => m.HI)).flat()).sort()
    this.HI = list.length ? list.shift() : 5;

    //POI 
    let _poi = (r) => r <= 2 ? 'raiders' : r <= 4 ? 'unique life' : r <= 6 ? 'hazard' : r == 7 ? 'obstacle' : r <= 12 ? 'site' : 'settlement';
    let _safe = this.parent.safety[1]
    //always make two, only use as defined by ssytem and rand 
    this._pois = _.fromN(2, () => _poi(RNG.d12() + _safe))
    //generate and assign
    this.POI = [];//poiArr.map((p,i)=>CreatePOI[p] ? CreatePOI[p](this, new Chance([this.seed, "POI", i].join("."))) : null)
  }
  get name() {
    return this._name || this.parent._names[this.id]
  }

  //parent 
  get parent() {
    return this._parent ? this.galaxy._sectors.get(this._parent.join()) : null;
  }

  get galaxy() {
    return App.galaxy
  }

  get data() {
    return {
      pid: this.parent.id.join(),
      seed: this._seed,
      xyz: this._loc,
      name: this._name,
      starClass: this.star.SC,
      np : this._np,
      mods: this._mods
    }
  }

  // gui 
  gui() {
    let parent = this.parent;

    let o = this.options = Object.assign(this.data, {
      s: this,
      save() {
        //to make sure everything is updated and save to 
        applyMod({});
        //save the whole active state 
        App.galaxy.save();
      },
      addPlanet () {
        let np = this.s._children.length + 1; 
        this.update(np);
      },
      viewGalaxy() {
        App.galaxy.display();
      },
      viewSector() {
        this.s.parent.display();
      }
    })

    // system folder 
    let { f, nav } = App.gui.reset(this.name + ' Sytsem', this);

    //nav 
    nav.add(o, 'viewGalaxy').name('View Galaxy');
    nav.add(o, 'viewSector').name('View Sector');

    // data  
    f.add(o, 'name').name('Name').onFinishChange(v => applyMod({name:v}));
    f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({seed:v}));
    f.add(o, 'starClass', ["O", "B", "A", "F", "G", "K", "M"]).name('Star Class').onChange(v => applyMod({starClass:v}));
    f.add(o, 'np',0,24,1).name('# of Planets').onFinishChange(v => applyMod({np:v}));
    f.add(o, 'save').name('Save');

    //apply mod 
    const applyMod = (_mod) => {
      let opts = Object.assign({parent},this.data,_mod);
      //create new system 
      let sys = new System(opts); 
      //mod 
      App.active[sys._seed] = sys.data; 
      parent._systems[sys._seed] = sys;
      //display
      sys.display();
    }
  }

  /*
    Functions 
  */
  // replace a planet 
  replace(P) {
    let i = this._children.map(c => c._seed).indexOf(P._seed);
    this._children[i] = P;
  }

  setGradients(RNG = new Chance(this.seed)) {
    this._children.forEach(p => {
      if (["gas giant", "brown dwarf"].includes(p.classification)) {
        let c = d3.color(p.color)
        let bright = RNG.pickone([0, 1])
        let color = () => RNG.pickone([c.brighter(), c.darker(), c])
        let n = RNG.randBetween(4, 10)
        p._gradient = _.fromN(n, (i) => [i / n + (RNG.random() * 0.15 - 0.075), i % 2 == bright ? c.brighter(3) : color()])
      }
    }
    )
  }
  /*
    Celestial Bodies 
  */
  get habitable() {
    return _.fromN(2, (i) => this.planetHI[i].concat(this.moonHI[i]))
  }
  get planetHI() {
    return _.fromN(4, (i) => this.planets.filter(m => m.HI == i + 1))
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
  /*
    Location and Distance, Orbits
  */
  get orbits () {
    let {_np, _rmin, _rmax, _rvar} = this; 
    let total_weight = (Math.pow(_np, 2) + _np) * 0.5; 
    let pr = _rmin;  

    return _.fromN(_np,i => {
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
  /*
    Factions 
  */
  get faction() {
    return this.claim > -1 ? this.galaxy._factions.find(f => f.id == this.claim) : null
  }
  get nearestFactionSystem() {
    return this.parent.systems.filter(s => s.claim > -1).map(s => [s, this.distance(s)]).sort((a, b) => a[1] - b[1])[0][0]
  }
  /*
    UI
  */
  get info () {
    let {name, _pois, stellarR, star, habitable} = this;
    let [ne,ns] = habitable.map(h => h.length);

    let info = _.html`
    <div class="f4 pa1 bg-white-50">
      <h3 class="ma0">${name}</h3>
      <div><b>${star.spectralType}</b>, R ${stellarR.toFixed(2)} Sol, Luminosity ${star.luminosity.toFixed(2)} </div>
      ${ne > 0 ? _.html`<div><b>Earthlike:</b> ${habitable[0].map((p,i) => _.html`<span>${p.shortName}${i<ne-1?"; ":""}</span>`)}</div>` : ""}
      ${ns > 0 ? _.html`<div><b>Survivable:</b> ${habitable[1].map((p,i) => _.html`<span>${p.shortName}${i<ns-1?"; ":""}</span>`)}</div>` : ""}
      <div><b>POI:</b> ${_pois.join(" & ")}</div>
    </div>`;
    return info;
  }
  
  get svgPad() {
    //show star 
    let SR = 695.700
    //1000 km 
    let starR = this.stellarR * SR

    // run through the planets 
    return this.objects.reduce((s, p, j) => {
      let pad = 10
      let _r = p.radius / 1000 < 3 ? 3 : p.radius / 1000
      let dr = j == 0 ? (starR * 0.5 + _r + pad) : (s[j - 1][1] + 2 * _r + pad)
      s.push([p._seed, dr])
      return s
    }
      , [])
  }
  get UIColor() {
    return ["green", "blue", "yellow", "red", "black"][this.HI - 1]
  }
  display() {
    if (SVG('svg')) {
      SVG.find('svg').remove();
    }
    SVG.find('#starryHost').hide();

    //GUI
    this.gui();
    //write info 
    App.updateState("info",this.info);

    //set gas giant gradients 
    this.setGradients()

    let svg = SVG().addTo('#map').size('100%', '100%').addClass("system")

    //show system
    let S = this

    //show star 
    let SR = 695.700
    //1000 km 
    let starR = this.stellarR * SR
    svg.circle(2 * starR).attr({
      cx: 0 - starR * 0.75,
      cy: 0
    }).addClass('star').fill(S._color)

    //create & place svg for planets and moons 
    let planetGroup = svg.group().attr('id', 'planets')
    this.objects.forEach((o, i) => o.svg(svg, planetGroup, i))

    //size 
    let { x, y, height, width } = planetGroup.bbox()
    //viewbox
    svg.attr('viewBox', [0, y, x + width + 10, height + 10].join(" "))

    //log 
    console.log(this)
  }
  /*
    UI 
  */
  get UI() {
  }
}

export { System }
