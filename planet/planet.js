//https://stackoverflow.com/questions/55983221/auto-generate-pixel-planets-in-canvas
//https://github.com/dgreenheck/threejs-procedural-planets

import { starTypeData, gravity, blackbody, planetTypeData } from '../astrophysics.js';
import { GasGiantColors, RockyColors, TerrainColors } from "../data.js"
import { Plate, TopoPoly } from "./plate.js"

//seed generator
const getSeed = (length = 12,RNG = chance) => RNG.string({ length, casing: 'upper', alpha: true });

/*
  Planets 
*/

class Planetoid {
  constructor(parent, i, opts = {}) {
    let {seed, insolation, orbit} = opts; 

    this.parent = parent

    this._i = i; 
    this._seed = seed || parent._cSeed[i];
    this.seed = [parent.seed, this._seed].join(".");

    // Earth incident radiation from Sol == 1
    this._orbitalRadius = orbit || parent.orbits[i];
    this._insolation = insolation || parent.star.luminosity / Math.pow(this._orbitalRadius, 2);

    this._rotate = 1

    this._moons = [];

    //establish planetoid basics 
    let RNG = new Chance(this.seed)
    RNG.range = (min, max) => min + RNG.random() * (max - min)

    //seeds for children 
    this._cSeed = _.fromN(20,i=> getSeed(6,RNG));

    //orbit and eccentricity 
    let a = this._orbitalRadius;
    let _e = RNG.weighted(['200.800', '5.200'], [1, 3]);
    let e = this._eccentricity = RNG.randBetween(..._e.split(".").map(Number)) / 1000;
    let b = this._minorAxis = Math.sqrt(a * a * (1 - e * e));

    //moon orbits 
    this._rmin = 0.4 * RNG.range(0.5, 2);
    this._rmax = 50 * RNG.range(0.5, 2);
  }
  get i () {
    let idx = this.what == "Planet" ? this.parent.objects.map(o=>o._seed) : this.parent._moons.map(o=>o._seed); 
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
  get orbits () {
    let {_nm, _rmin, _rmax, _rvar} = this; 
    let total_weight = (Math.pow(_nm, 2) + _nm) * 0.5; 
    let pr = _rmin;  

    return _.fromN(_nm,i => {
      pr += i / total_weight * _rvar[i] * (_rmax - _rmin);
      return pr; 
    })
  }
  detail() {
    detail.orbitalRadius = this._orbitalRadius.toFixed(2);
    detail.insolation = this.insolation.toFixed(2);
    detail.blackbodyK = blackbody(this.insolation);
  }
  get shortName() {
    let S = this.system
    return `Planet ${this.what == "Planet" ? _.romanNumeral(this.i) : _.romanNumeral(this.parent.i) + ", " + _.suffix((this.i + 1)) + " Moon"}`
  }
  get name() {
    let S = this.what == "Planet" ? this.parent : this.parent.parent
    return `${S.name} ${this.what == "Planet" ? _.romanNumeral(this.i) : _.romanNumeral(this.parent.i) + ", " + _.suffix((this.i + 1)) + " Moon"}`
  }
  get info() {
    let { classification, _orbitalRadius, gravity, atmosphere, temp, radius, description, shortName} = this
    let m = classification == "rocky" ? 6378 : 69911;   // radius of earth or jupiter
    let dif = radius/m;

    let info = _.html`
    <div class="f4 pa1 bg-white-50">
      <h3 class="ma0">${shortName}</h3>
      <div>${_orbitalRadius.toFixed(1)} ${this.what == "Planet" ? "AU" : "LD"}, ${classification}, ${dif.toFixed(2)} ${classification == "rocky" ? "Earth" : "Jupiter"}</div>
      <div>${gravity.toFixed(2)}g, ${temp}, ${atmosphere.toLowerCase()} atmosphere</div>
      <div>${description}</div>
    </div>`;
    return info;
  }
  get cssClass() {
    let _type = this.classification
    return _type == "gas giant" ? "gasGiant" : _type == "brown dwarf" ? "brownDwarf" : this.HI == 1 ? "earthlike" : _type
  }
  /*
    Favorites 
  */
  get isFavorite() {
    return this.system._favorites.includes(this.seed)
  }
  manageFavorites() {
    this.system.manageFavorites(this.seed)
  }
  /*
    Topograpy 
  */
  setTopo() {
    if (this._topo)
      return

    console.time('Planet Topo')
    //get basic voronoi 
    let { plates, topo } = this.galaxy.voronoi
    let pD = plates.delaunay
    let tD = topo.delaunay

    //planet info 
    let hydro = Number(this.hydrographics) / 100
    let isHI = hydro > 0 && this.HI < 3

    //establish topo object 
    let t = this._topo = {
      pids: [],
      plates: [],
      polys: []
    }

    let RNG = new Chance(this.seed)

    //create a plate 
    let createPlate = () => t.plates.push(new Plate(this, t.plates.length, RNG.randBetween(56, 750) / 1000));

    //group plates 
    let remain = d3.range(pD.polygons.length).map(i => i)
    let pi = 0
    let pushPlate = (id, _plate) => {
      t.pids[id] = pi
      remain.splice(remain.indexOf(id), 1)
      _plate.push(id)
      return _plate
    }
    while (remain.length > 0) {
      //create plate 
      createPlate()
      //random number and reduce 
      let n = RNG.d6() + 1
      n = n > remain.length ? remain.length : n
      //set start poly plate 
      let _plate = pushPlate(RNG.pickone(remain), [])
      //group polys by neighbor 
      while (_plate.length < n) {
        let j = 0
        //only select neighbors that remain 
        let cn = pD.neighbors[RNG.pickone(_plate)].filter(pid => remain.includes(pid))
        //pick different if no neighbor, but keep loop to 10 
        while (cn.length == 0 && j < 10) {
          cn = pD.neighbors[RNG.pickone(_plate)].filter(pid => remain.includes(pid))
          j++
        }
        if (cn.length > 0) {
          pushPlate(RNG.pickone(cn), _plate)
        } else {
          //break loop if no cn 
          break;
        }
      }
      //step plate 
      pi++
    }

    let nPlate = t.plates.length
    //run topo if a rocky world 
    if (this.classification == "rocky") {
      topo.polygons().features.forEach((poly, i) => {
        let site = poly.properties.site.coordinates
        let pi = t.pids[pD.find(...site)]
        t.polys.push(new TopoPoly(t.plates[pi], poly, i, (RNG.randBetween(0, 100) - 50) / 1000))
      }
      )

      //also create mountain ranges 
      RNG.shuffle(t.plates).slice(0, 10 + RNG.sumDice("2d6")).forEach(p => {
        //mountain range height
        let me = RNG.randBetween(200, 550) / 1000
        //border 
        let bi = RNG.pickone(Object.keys(p.borders))
        let border = p.borders[bi]
        let bids = border.map(b => b.i)
        let elevated = []
        //run through border adding height 
        border.forEach(bp => {
          bp.e += me
          bp.isMountain = true
          //increase neighbor elevations 
          bp.NData.forEach(n => {
            if (!(elevated.includes(n.i) || bids.includes(n.i))) {
              n.e += me / 2
              elevated.push(n.i)
            }
          }
          )
        }
        )
      }
      )
    } else {
      //gas giant 
      plates.polygons().features.forEach((poly, i) => {
        let pi = t.pids[i]
        t.polys.push(Object.assign({}, poly, {
          i,
          pi,
          e: 0.5,
          color: "brown"
        }))
      }
      )
    }

    console.timeEnd('Planet Topo')
    console.log(this)
  }
  /*
    UI 
  */
  //slider for planet rotate
  get slider() {
    let html = this.app.html

    //get basic voronoi 
    let { projection, path } = this.galaxy.voronoi

    let Rotate = (val) => {
      this._rotate = val
      projection.rotate([val, 0]);
      d3.select("svg").selectAll('path').attr('d', path);
    }

    return html`
    <div class='flex'>
      <span class="mh1">Rotate</span>
      <input class="w-100 slider" type="range" min="1" max="360" value="${this._rotate}" onChange="${(e) => Rotate(Number(e.target.value))}"></input>
      <span class="mh1"></span>
    </div>`
  }
  //click functionality in sysyem 
  onClick() {
    this.gui();
    App.updateState("info",this.info);
    console.log(this);
  }
  //planet display 
  display(shader = "Surface") {
    //set topo 
    this.setTopo()

    console.time('Planet Draw')
    //get svg 
    let svg = d3.select("svg")
    //clear 
    svg.selectAll("*").remove()

    let P = this
    //get basic voronoi s
    let { plates, topo, projection, path } = this.galaxy.voronoi
    let pTopo = this._topo

    //make a gradient for gass giants 
    let makeGradient = (p) => {
      return SVG('svg').gradient('linear', function (add) {
        p._gradient.forEach(_g => add.stop(..._g))
        add.stop(0.95, '#fff')
        add.stop(1, p.color)
      }).attr("gradientTransform", "rotate(90)")
    }

    svg.append('path').attr('id', 'planetoid').attr('class', this.cssClass).datum({
      type: "Sphere"
    }).attr('d', path).attr('fill', this.cssClass == "gasGiant" ? makeGradient(this) : "none")

    svg.append('g').attr('class', `polygons ${this.cssClass}`).selectAll('path').data(pTopo.polys).enter().append('path').attr('class', 'poly').attr('d', path).attr('fill', this._gradient ? "white" : function (d, i) {
      return d.color
    }
    ).on("click", (e, d) => {
      const [x, y] = d3.pointer(e)
      console.log(d)
    }
    )

    //size 
    let { x, y, height, width } = SVG('#planetoid').bbox()
    //viewbox
    svg.attr('viewBox', [0, y, x + width + 10, height + 10].join(" "))
    console.timeEnd('Planet Draw')
  }
  /*
    GUI
  */
  get data () {
    return {
      "i" : this._i,
      "seed" : this._seed, 
      "parent" : this.what == "Planet" ? "" : this.parent._seed, 
      "orbit" : Number(this._orbitalRadius.toFixed(3)), 
      "type" : this.classification, 
      "radius" : Number((this.radius/1000).toFixed(3)), 
      "density" : Number(this.density.toFixed(2)), 
      "moons" : this._moons.length 
    }
  }

  gui() {
    let {what, parent, system} = this;

    let o = this.options = Object.assign(this.data,{
      p: this,
      color: this.color,
      data() {
        return Object.fromEntries(dataIds.map(key => [key, this[key]]));
      },
      viewGalaxy() {
        //remove sector folder 
        App.galaxy.display();
      },
      viewSector() {
        this.p.sector.display();
      },
      viewSystem() {
        this.p.system.display();
      },
      save() {
        //to make sure everything is updated and save to 
        applyMod({});
        //save the whole active state 
        App.galaxy.save();
      }
    })

    // planet folder 
    let { f, nav } = App.gui.reset(this.shortName, this);

    //nav 
    nav.add(o, 'viewGalaxy').name('View Galaxy');
    nav.add(o, 'viewSector').name('View Sector');
    nav.add(o, 'viewSystem').name('View System');

    //planet folder
    f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({seed:v}));
    what == "Planet" ? f.add(o, 'type', ["rocky", "gas giant", "brown dwarf"]).name('Type').onChange(v => {
      let data = planetTypeData.find(d => d.classification == v);
      //update options with correct data
      //radius
      let [rmin, rmax] = data.radius.map(v => v / 1000);
      let radius = o.radius = Math.round((rmax + rmin) / 2);
      f.controllers.find(c => c.property == "radius").min(rmin).max(rmax);
      //density
      let [dmin, dmax] = data.density;
      let density = o.density = Math.round((dmax + dmin) / 2);
      f.controllers.find(c => c.property == "density").min(dmin).max(dmax);
      //mod 
      applyMod({type:v,radius,density});
    }) : null;
    f.add(o, 'orbit',0.2,100,0.2).name('Orbital Radius').decimals(1).onFinishChange(v => applyMod({orbit:v}));
    f.add(o, 'radius', ...this.template.radius.map(v => v / 1000)).name('Radius (km)').decimals(0).listen().onFinishChange(v => applyMod({radius:v}));
    f.add(o, 'density', ...this.template.density).name('Density').decimals(2).listen().onFinishChange(v => applyMod({density:v}));
    what == "Planet" ? f.add(o, 'moons',0,20,1).name('# of Moons').onFinishChange(v => applyMod({moons:v})) : null;
    f.add(o, 'save').name('Save');

    //set info 
    App.updateState("info",this.info);

    //apply mod 
    const applyMod = (_mod) => {
      let opts = Object.assign({},this.data,_mod);
      what == "Moon" ? opts.insolation = parent._insolation : null; 
      //new planet/moon
      let P = what == "Planet" ? new Planet(parent,opts) : new Moon(parent,opts);
      //get seed to set mod data 
      let _id = what == "Planet" ? opts.i : [parent._i,opts.i].join(".");
      //mod 
      system._mods[_id] = P.data;
      App.active[system._seed] = system.data; 
      //replace 
      parent[what == "Planet" ? "_children" : "_moons"][opts.i] = P;
      //display
      system.display();
      P.gui();
    }
  }
  /*
    UI 
  */
  get UI() {}
}

class Moon extends Planetoid {
  constructor(parent, opts = {}) {
    let { i, isMinor } = opts;
    //call parent Planetoid 
    super(parent, i, opts);

    this.what = "Moon"

    //planet template 
    let template = this.template = planetTypeData[0];
    //always rocky
    this.classification = template.classification;

    let RNG = new Chance(this.seed);
    RNG.range = (min, max) => min + RNG.random() * (max - min);
    //calculations 
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
    //call parent Planetoid 
    super(parent, opts.i, opts);

    //set basics 
    this.what = "Planet";

    let RNG = new Chance(this.seed)
    RNG.range = (min, max) => min + RNG.random() * (max - min)

    //planet template 
    let ti = planetTypeData.map(d => d.classification);
    let template = RNG.weighted(planetTypeData, [this._insolation * 100, 10, 1]);
    template = this.template = opts.type ? planetTypeData[ti.indexOf(opts.type)] : template;
    let _type = this.classification = template.classification;

    //calculations 
    let _r = RNG.randBetween(template.radius[0], template.radius[1]);
    this.radius = opts.radius ? opts.radius * 1000 : _r;
    let _dense = RNG.randBetween(template.density[0], template.density[1]);
    this.density = opts.density || _dense;
    this.hydrographics = template.hydrographics(RNG, this._insolation, this.radius, this.density);
    this.atmosphere = template.atmosphere(RNG, this._insolation, this.radius, this.density, this.hydrographics);

    Object.assign(this, this.template.HI(this._insolation, this.radius, this.density, Number(this.hydrographics), this.atmosphere))
    this.color = _type == "gas giant" ? RNG.pickone(GasGiantColors).name : _type == "rocky" ? RNG.pickone(RockyColors).name : "brown"

    //moons 
    let nMajor = _type == "rocky" ? RNG.pickone([0, 0, 1, 2]) : 1 + RNG.d4();
    nMajor = opts.moons ? (opts.moons > nMajor ? nMajor : opts.moons) : nMajor;
    let nMinor = _type == "rocky" ? RNG.pickone([0, 0, 1, 2]) : RNG.sumDice("2d6")
    nMinor = opts.moons ? opts.moons - nMajor : nMinor;
    this._nm = nMajor + nMinor;

    //moon orbit variability 
    this._rvar = _.fromN(this._nm,i=> RNG.randBetween(0.5, 1));

    let _mods = this.parent._mods; 
    //create moons
    _.fromN(nMajor + nMinor, (j) => {
      let opts = Object.assign({
        i : j,
        insolation : this._insolation,
        isMinor: !(j < nMajor)
      },_mods[[this._i,j].join(".")] || {})
      this._moons.push(new Moon(this, opts ));
    }
    )

    return this;
  }

  get moonHI() {
    return _.fromN(4, (i) => this._moons.filter(m => m.HI == i + 1))
  }
  get svgPad() {
    let _r = this.radius / 1000 < 3 ? 3 : this.radius / 1000

    return this._moons.reduce((s, m, j) => {
      let pad = 10
      let _mr = m.radius / 1000 < 3 ? 3 : m.radius / 1000
      j == 0 ? s.push(50 + _r + _mr + pad) : s.push(s[j - 1] + 2 * _mr + pad)
      return s
    }
      , [])
  }
  //svg for system display
  svg(svg, pG) {
    let p = this
    //make a gradient for gas giants 
    let makeGradient = () => {
      return svg.gradient('linear', function (add) {
        p._gradient.forEach(_g => add.stop(..._g))
      }).attr("gradientTransform", "rotate(90)")
    }

    //data for svg display 
    let pad = this.parent.svgPad.find(_pad => _pad[0] == this._seed)[1]
    let _r = this.radius / 1000 < 3 ? 3 : this.radius / 1000
    let cx = pad - _r

    let psvg = svg.circle(2 * _r).attr({
      cx,
      cy: 0
    }).addClass('planet').addClass(this.cssClass).fill(["gasGiant", "brownDwarf"].includes(this.cssClass) ? makeGradient() : this.color).click(() => p.onClick())
    //add to group 
    pG.add(psvg)

    let mPad = this.svgPad
    this._moons.forEach((m, i) => {
      let _mr = m.radius / 1000 < 3 ? 3 : m.radius / 1000

      let moon = svg.circle(2 * _mr).attr({
        cx,
        cy: mPad[i] - _mr
      }).addClass('planet').fill(m.color).data({
        i
      }).click(() => m.onClick())
      //add to group 
      pG.add(moon)
    }
    )
  }
}

export { Planet }
