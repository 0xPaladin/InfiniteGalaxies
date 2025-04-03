//https://andrewdcampbell.github.io/galaxy-sim/assets/cubemaps/BlueNebular_back.jpg
//https://github.com/snorpey/circlepacker
//import {CirclePacker} from '../lib/circlepacker.esm.min.js';

import { FillGalaxy, BBox, Display as ShowStars } from './starryHost.js';

import { Cultures } from './cultures.js';

/*
  Galaxy Dimensions 
  Light years
*/
const SECTOR = 100
const MAJORSECTOR = 1000


/*
  Voronoi for Planets 
*/
const SetVoronoi = (G) => {
  let RNG = new Chance(G.seed)

  console.time('Voronoi')
  var platePoints = {
    type: "FeatureCollection",
    features: d3.range(200).map(function () {
      return {
        type: "Point",
        coordinates: [360 * RNG.random(), 90 * (RNG.random() - RNG.random())],
        tris: []
      }
    })
  }

  var topoPoints = {
    type: "FeatureCollection",
    features: d3.range(5000).map(function () {
      return {
        type: "Point",
        coordinates: [360 * RNG.random(), 90 * (RNG.random() - RNG.random())]
      }
    })
  }

  //geo voronoi 
  let projection = d3.geoOrthographic()
    , path = d3.geoPath().projection(projection);

  G.voronoi = {
    plates: d3.geoVoronoi()(platePoints),
    topo: d3.geoVoronoi()(topoPoints),
    projection,
    path
  }
  console.timeEnd('Voronoi')
  console.log(G)
}

/*
  Galaxy Class 
*/
class Galaxy {
  constructor(opts = {}) {
    this.app = App

    //object info 
    this.what = "Galaxy"

    //seed for rng 
    this.seed = opts.seed || chance.string({
      alpha: true,
      length: 10,
      casing: 'upper'
    })

    this._sectors = new Map()

    //start generation 
    let RNG = new Chance(this.seed)

    //Radius and twist 
    let _R = RNG.randBetween(8, 12);
    this._R = (opts.radius || _R) * 5000;
    let _twist = RNG.randBetween(30, 150);
    this._twist = (opts.twist || _twist) / 10;

    //create star backdrop 
    console.time('Starry Host')
    FillGalaxy(this)
    console.timeEnd('Starry Host')
    this._bounds = [BBox[2] - BBox[0], BBox[3] - BBox[1]];

    this._factions = [];
    this._show = 'Galaxy'
    this._option = []
    this._filter = "Factions"

    //pause and create culture
    console.time('Cultures')
    this._cultureSeed = opts.cultureSeed || this.seed;
    this._cultureCount = opts.cultureCount || 77;
    this._generations = opts.generations || 33;
    this._cultures = new Cultures(this._cultureSeed, this._R, this._cultureCount, this._generations);
    console.timeEnd('Cultures')

    //pause for display and then create standard voronoi
    setTimeout(() => SetVoronoi(this), 2000)
  }

  get data () {
    return {
      seed: this.seed,
      radius: this._R / 5000,
      twist: this._twist * 10,
      cultureSeed : this._cultureSeed,
      cultureCount : this._cultureCount,
      generations : this._generations
    }
  }

  //GUI options
  gui() {
    //galaxy options 
    let o = this.options = Object.assign(this.data,{
      x: 0,
      y: 0,
      showCultures () {
        let g = SVG.find('#claims');
        g.visible()[0] ? g.hide() : g.show();
      },
      random() { App.random(); },
      save() { 
        App.galaxy.save(); 
        App.galaxy.display();
      },
      viewSector() {
        App.getSector(this.x, this.y);
      },
      update() {
        //create new galaxy and display 
        App.galaxy = new Galaxy(this);
        App.galaxy.display();
      }
    });

    // galaxy folder 
    let { f, nav } = App.gui.reset('Galaxy', this);

    //nav 
    nav.add(o, 'random').name("Random Galaxy");
    nav.add(o, 'showCultures').name("View Culture Claims");

    //add controls 
    f.add(o, 'seed');
    f.add(o, 'radius', 8, 12, 0.2);
    f.add(o, 'twist', 30, 150, 1);
    //add culture input
    f.add(o, 'cultureSeed').name("Culture Seed");
    f.add(o,"cultureCount",33,128,1).name("Initial Cultures");
    f.add(o,"generations",8,64,1).name("Generations"); 
    //buttons
    f.add(o, 'update');
    f.add(o, 'save');

    let sr = this._bounds.map(v => Math.round(v / 2));
    const updateGUI = (v, isX = false) => {
      let key = isX ? "y" : "x";
      //calculate bounds for other val 
      let max = this.ellipse(Number(v), isX);
      max = isNaN(max) ? 0 : max;
      o[key] = o[key] > max ? max : o[key];
      //update gui 
      o["_c" + key].min(-max).max(max);
      o._view.name("View Sector " + [o.x, o.y]);
      //crosshairs 
      this.addCrosshair(o.x * 100, o.y * 100);
    }
    //add sector selector
    let fs = f.addFolder('Sector Select')
    o._cx = fs.add(o, 'x').min(-sr[0]).max(sr[0]).step(1).listen().onFinishChange(v => updateGUI(Number(v), true));
    o._cy = fs.add(o, 'y').min(-sr[1]).max(sr[1]).step(1).listen().onFinishChange(v => updateGUI(Number(v)));
    o._view = fs.add(o, 'viewSector').name('View Sector');
  }

  //sectors
  get allSectors() {
    let r = this._R / MAJORSECTOR;
    let AS = []
    //push ids 
    for (let x = -r; x < r; x++) {
      for (let y = -r; y < r; y++) {
        let _r2 = x * x + y * y;
        //create a new cell if distance less than r 
        _r2 < r * r ? AS.push([x, y]) : null;
      }
    }

    return AS
  }
  //save 
  save() {
    //add to galaxy array
    App.guiOpts.galArr.includes(this.seed) ? null : App.guiOpts.galArr.push(this.seed);
    //set active edit 
    App.active[this.seed] = this.data;
    //save the whole active state 
    App.DB.setItem(this.seed, App.active);
  }

  /*
    Features of the galaxy 
  */

    /*
    Get culture data 
  */
  get allCultures() {
    return this._cultures.cultures;
  }
  //active cultures
  get cultures() {
    return this._cultures.cultures.filter(c => c.isAlive);
  }

  ellipse(v, isX = false) {
    //ellipse eq x^2/a^2+y^2/b^2 = 1
    let [a2, b2] = this._bounds.map(p => p * p / 4);
    let r2 = (1 - v * v / (isX ? a2 : b2)) * (isX ? b2 : a2);
    return Math.floor(Math.sqrt(r2));
  }

  /*
  SVG
  */
  addCrosshair(x, y) {
    let r = this._R;
    let crosshairs = SVG.find("#crosshairs");
    crosshairs.clear();
    //styles 
    let s = { color: "white", width: 200 };
    let xl = crosshairs.line(x, -r, x, 2 * r).stroke(s);
    let yl = crosshairs.line(-2 * r, y, 2 * r, y).stroke(s);
  }

  display() {
    if (SVG('svg')) {
      SVG.find('svg').remove()
    }

    App.refresh();
    //add gui controls
    this.gui();

    //show 
    SVG.find('#starryHost').show();
    ShowStars();

    let mapBBox = document.querySelector("#starryHost").getBoundingClientRect()
    let [w, h] = [mapBBox.width, mapBBox.height];

    //svg and groups 
    let svg = SVG().addTo('#map').size(w, h);
    let claimmap = svg.group().attr('id', 'claims');
    let crosshairs = svg.group().attr('id', 'crosshairs');

    let r = this._R;
    svg.click(e => {
      //DETERMINE bounds
      let isH = h > w;
      let bound = w < h ? w : h;
      //adjust to sector scale 
      let m = this._R * 2 / bound / 100;
      //adjust for padding 
      let remadj = 8;
      //get position and adjust to sector 
      let [x, y] = [e.pageX, e.pageY];
      let [gx, gy] = [x - w / 2 - remadj, y - h / 2 - remadj].map(v => v * m);
      //is the point within the galaxy 
      let [maxx, maxy] = this._bounds.map(v => v / 2);
      let isWithin = Math.abs(gx) < maxx && Math.abs(gy) < maxy;
  
      if (isWithin) {
        //update crosshairs and options 
        this.addCrosshair(gx * 100, gy * 100)
        let sxy = [Math.round(gx), Math.round(gy)];
        this.options._view.name("View Sector " + sxy)
        this.options.x = sxy[0];
        this.options.y = sxy[1];

        //pull culture cell - adjust by 10, culture cells are 1000 ly 
        let cell = this._cultures._cells.get(sxy.map(v=> v < 0 ? Math.ceil(v/10) : Math.floor(v/10)).join());
        console.log(sxy,cell)
      }
    })

    let C = this._cultures;
    let SIZE = 1000;

    //show claims 
    [...C._cells.values()].forEach(c => {
      let _color = C._colors[c._claims[0]];
      if (c.state == 0 && c._claims.length > 0) {
        let rect = claimmap.rect(SIZE, SIZE).fill(_color).move(c.x*SIZE,c.y*SIZE);
        rect.addClass('quiet');
      }
      else if (c.state == 1) {
        let rect = claimmap.rect(SIZE, SIZE).fill(_color).move(c.x*SIZE, c.y*SIZE);
      }
    })

    claimmap.hide();

    //viewbox
    svg.attr('viewBox', [-r, -r, 2 * r, 2 * r].join(" "))
  }
  /*
    UI
  */
  get filter() {}
  
  get UI() {
    const { html } = App
    const header = '';
    const left = '';
    const right = '';

    return {
      header,
      left,
      right
    }
  }
}

export { Galaxy }
