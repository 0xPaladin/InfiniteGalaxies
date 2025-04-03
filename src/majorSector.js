import { MakeName } from './random_name.js';

import { StarsInSector } from './starryHost.js';
import { System } from './starSystem.js';

//seed generator
const getSeed = (RNG = chance,length=12) => RNG.string({length,casing:'upper',alpha:true});

/*
  Isometric 
*/

const toIsometric = (_x, _y, _z) => {
  return {
    x: (_x - _y) * 0.866025,
    y: _z + (_x + _y) * 0.5
  }
}

/*
  Sector Class 
*/

const SECTOR = 100
// sector size in LY 

class MajorSector {
  constructor(opts = {}) {
    this.what = "Sector"
    this.filter = "All"

    //sector id - x,y
    this.id = opts.id || [0, 0];
    let _id = this.id.join();
    //update with options from active state 
    opts = Object.assign(opts, (App.active[_id] ? App.active[_id].opts : {}));

    //seed for randomization 
    this._seed = opts.seed || 0;
    //seed for RNG 
    this.seed = [App.galaxy.seed, _id, this._seed].join(".");

    //establish random gen 
    let RNG = new Chance(this.seed)

    let alignment = this.alignment = "neutral"
    let alMod = [5, 3, 0, -3, -5][['chaotic', 'evil', 'neutral', 'good', 'lawful'].indexOf(alignment)]
    let sR = RNG.d12() + alMod
    this.safety = sR <= 1 ? ["safe", 3] : sR <= 3 ? ["unsafe", 2] : sR <= 9 ? ["dangerous", 1] : ["perilous", 0]

    //number of systems
    this._ns = opts.ns || 32; 

    //always compute 256 IDS and names 
    this._names = [];
    this._sysSeeds = [];
    _.fromN(256,i=> {
      MakeName(this._names, RNG);
      //make and push to systems - account for any mods
      this._sysSeeds.push(getSeed(RNG));
    })

    //add to galaxy sectors
    App.galaxy._sectors.set(this.id.join(), this);
  }

  // gui 
  gui() {
    let o = this.options = {
      s: this,
      seed: this._seed,
      filter: "All",
      ns : this._ns,
      async update() {
        let _id = this.s.id.join();
        let opts = {
          id : this.s.id,
          seed : this.seed,
          ns : this.ns
        };

        //save opts and mods 
        App.active[_id] = opts;

        //update display
        App.sector = new MajorSector(opts)  
        App.sector.refresh();
        App.sector.display();
      },
      save () {
        //save the whole active state 
        App.galaxy.save();
      },
      viewGalaxy() {
        App.galaxy.display();
      },
      viewSystem() {
        this.s.selectedSystem.display();
      }
    }

    // sector folder 
    let { f, nav } = App.gui.reset('Sector ' + this.id.join(), this);

    //nav 
    nav.add(o, "viewGalaxy").name("View Galaxy");

    //system filter
    f.add(o, 'seed').name("Seed").onFinishChange(v => this.options.update());
    f.add(o, 'ns',32,256,1).name("# of Systems").onFinishChange(v => this.options.update());
    f.add(o, 'save').name('Save');

    //systems 
    let sys = this.selectedSystem;
    let asf = f.addFolder('System');
    asf.add(o, 'filter', ["All", "Earthlike", "Survivable", "Modded"]).name("System Filter").listen().onChange(function (e) {
      //display stars with filter
      let { s, filter } = this.object;
      s.display({ filter });
    });
    asf.add(sys, 'name').name('Name').listen();
    asf.add(sys, 'x', 1, 100).step(0.2).name('X').onFinishChange(v=>showMove(0,v));
    asf.add(sys, 'y', 1, 100).step(0.2).name('Y').onFinishChange(v=>showMove(1,v));
    asf.add(sys, 'z', 1, 100).step(0.2).name('Z').onFinishChange(v=>showMove(2,v));
    asf.add(sys, 'starClass', ["O", "B", "A", "F", "G", "K", "M"]).name('Star Class').onChange(v => {
      //get selected system data
      let sys = this.selectedSystem;
      //use for system update options
      let opts = Object.assign(sys.data,{parent:this, starClass:v});
      //create updated system 
      let ns = new System(opts);
      this._systems[sys._seed] = ns;
      //mod 
      App.active[sys._seed] = sys.data; 
      //display
      this.display();
      this.addCrosshair(ns._loc[0]/10,ns._loc[1]/10);
    });
    asf.add(o, 'viewSystem').name('View System');

    const showMove = (id,v) => {
      //update location
      let sys = this.selectedSystem;
      sys._loc[id] = v*10;
      //mod
      App.active[sys._seed] = sys.data; 
      //display
      this.display();
      this.addCrosshair(sys._loc[0]/10,sys._loc[1]/10);
    };
  }

  /*
    Functions 
  */
  refresh(show = -1) {
    let parent = this;
    let { safety } = this
    //systems 
    this._loc = []
    this._systems = {}

    //number of base systems 
    for (let i = 0; i < this._ns; i++) {
      let name = this._names[i];
      //make and push to systems - account for any mods
      let seed = this._sysSeeds[i];
      this._systems[seed] = new System({ seed, name, parent });
    }

    let _id = this.id.join();
    //find saved systems within sector 
    App.guiOpts.sysArr.filter(sid => App.active[sid].pid == _id).forEach(sid => {
      this._systems[sid] = new System(Object.assign({},App.active[sid],{parent}));
    });

    if(show != -1) {
      this._systems[show].display();
    }

    console.log(this);
  }

  /*
    add a system to the sector
    options 
      _name
      loc [x,y,z]
      starClass ["O", "B", "A", "F", "G", "K", "M"]
      nPlanets
    */
  addSystem(opts = {}) {
    this._newSystems.push(opts);
    this.refresh();
    this.display();
  }

  //get habitable systems
  get habitable() {
    return BuildArray(4, (_, i) => {
      let planets = []
      let moons = []
      this.systems.forEach(s => {
        planets = planets.concat(s.planetHI[i])
        moons = moons.concat(s.moonHI[i])
      }
      )

      return {
        planets,
        moons
      }
    }
    )
  }
  get systems() {
    return Object.values(this._systems);
  }
  showSystems(filter) {
    //["All","Earthlike", "Survivable", "Factions", "Ruins", "Gates", "Resources", "Outposts", "Dwellings", "Landmarks"]

    let hab = ["Earthlike", "Survivable"]
    let poi = ["Settlements", "Ruins", "Gates", "Resources", "Outposts", "Dwellings", "Landmarks"]
    let res = []

    if (filter == "Modded") {
      res = this.systems.filter(s => this._mods[s.id])
    }
    else if (hab.includes(filter)) {
      res = this.systems.filter(s => s.HI == hab.indexOf(filter) + 1)
    } else if (filter == "Factions") {
      res = this.systems.filter(s => s.POI && s.POI.reduce((state, poi) => {
        return state || poi.f || poi.creator
      }
        , false))
    } else if (filter == "Ruins") {
      res = this.systems.filter(s => s.POI && s.POI.reduce((state, poi) => {
        return state || poi.what == "Ruin" || poi.isRuin
      }
        , false))
    } else if (poi.includes(filter)) {
      let what = filter.slice(0, -1)
      res = this.systems.filter(s => s.POI && s.POI.reduce((state, poi) => {
        return state || poi.what == what || poi.type == what
      }
        , false))
    } else {
      res = this.systems
    }

    return res.sort((a, b) => a.name < b.name ? -1 : 1)
  }
  get system() {
    return this.systems[this._system]
  }
  get features() {
    return Object.values(this._features).flat()
  }
  /*
    Sector Data lookup 
  */
  distance(x, y) {
    let [sx, sy] = this.id
    let dx = x - sx
      , dy = y - sy;
    let d = Math.sqrt(dx * dx + dy * dy)
    return d
  }

  //check for same sector 
  isSameSector(x, y) {
    return this.id[0] == x && this.id[1] == y
  }
  /*
    faction information 
  */
  get cultureCell() {
    //transform Sector to MajorSector which is used by culture 
    let mid = this.id.map(v => Math.floor(v / 10)).join();
    return App.galaxy._cultures._cells.get(mid);
  }

  //only look for active cultures
  get closestCulture() {
    let fd = this.galaxy.cultures.map(c => c.cells.map(s => [this.distance(s.x, s.y), c])).flat().sort((a, b) => a[0] - b[0])
    return fd[0][1]
  }

  get pastCultures() {
    return this.allCultures.filter(c => cf.isAlive);
  }

  get allCultures() {
    return this.cultureCell._claims.map(id => App.galaxy.allCultures[id]);
  }

  addCrosshair(x, y) {
    let crosshairs = SVG.find("#crosshairs");
    crosshairs.clear();
    //styles 
    let s = { color: "white", width: 0.5 };
    let xl = crosshairs.line(x, 0, x, 100).stroke(s);
    let yl = crosshairs.line(0, y, 100, y).stroke(s);
  }

  async display(opts = {}) {
    if (SVG('svg')) {
      SVG.find('svg').remove();
    }
    SVG.find('#starryHost').hide();

    //gui 
    this.selectedSystem = this.selectedSystem || this.systems[0];
    this.gui();

    //svg disolay
    let app = App
    let svg = SVG().addTo('#map').size('100%', '100%');
    let crosshairs = svg.group().attr('id', 'crosshairs');

    //get display options 
    let { filter = this.filter, isometric = false } = opts
    this.options.filter = this.filter = filter

    let [sx, sy] = [0, 0];
    let n = 5;
    let grid = SECTOR / n
    let _z = 50
    //create the grid 
    let gridmap = svg.group().attr('id', 'gridmap')
    gridmap.back()

    _.fromN(n, (i) => _.fromN(n, (j) => {
      let xyz = [[sx + i * grid, sy + j * grid, _z], [sx + i * grid + grid, sy + j * grid, _z], [sx + i * grid + grid, sy + j * grid + grid, _z], [sx + i * grid, sy + j * grid + grid, _z]].map(_xyz => {
        let { x, y } = isometric ? toIsometric(..._xyz) : {
          x: _xyz[0],
          y: _xyz[1]
        }
        return [x, y].join(",")
      }
      ).join(" ")
      gridmap.add(svg.polygon(xyz).addClass('grid'))
    }
    ))

    //create the stars 
    let stars = svg.group().attr('id', 'stars')
    let systems = this.showSystems(filter)

    systems.forEach((s) => {
      let sector = this
      let G = App.galaxy
      let _p = s.point
      let { x, y } = isometric ? toIsometric(..._p) : {
        x: _p[0],
        y: _p[1]
      }

      //adjust x,y for being created 0 to 1000
      let _star = svg.circle(s._r * 0.75).attr({
        cx: x / 10,
        cy: y / 10
      }).fill(s._color).addClass('star').data({
        seed: s._seed
      }).click(async function () {
        let seed = this.data("seed")

        let _s = sector.systems.find(s => s._seed == seed)
        let _POI = _s.POI || []
        console.log(_s)

        //update gui  
        sector.addCrosshair(x/10,y/10);
        sector.selectedSystem = _s;
        sector.gui();
      })

      stars.add(_star)
    }
    )

    //adjust viewbox to see sector 
    svg.attr('viewBox', [0, 0, SECTOR, SECTOR].join(" "));
  }
  /*
    UI
  */
  get UI() {
    let { app, galaxy } = this
    const { html } = app
    let { showBars } = app.state

    const systemFilters = ["All", "Earthlike", "Survivable", "Factions", "Settlements", "Ruins", "Gates", "Resources", "Outposts", "Dwellings", "Landmarks"]
    let showSystems = this.showSystems(this.filter)

    const SectorSystemUI = (s) => html`
    <div class="pointer flex items-center justify-between db ba br2 ma1 pa2" onClick=${() => galaxy.show = s}>
    	<div>${s.name}</div>
    	<div>
    		${s._planets.length}<div class="d-circle-sm"div class="d-circle-sm" style="background-color:${s.UIColor}"></div>
    	</div>
    </div>`

    const SlideBarRight = html`<div class="db tc v-mid pointer dim ba br2 mh1 pa2 ${showBars[1] ? "" : "rotate-180"}" onClick=${() => app.updateState("showBars", showBars, showBars[1] = !showBars[1])}>➤</div>`
    const SlideBarLeft = html`<div class="db f4 tc v-mid pointer dim ba br2 mr1 pa2 ${showBars[0] ? "rotate-180" : ""}" onClick=${() => app.updateState("showBars", showBars, showBars[0] = !showBars[0])}>➤</div>`

    const linkCSS = "b pointer underline-hover hover-blue flex mh1"
    const header = html`
	<div class="flex">
		<span class="${linkCSS}" onClick=${() => galaxy.show = galaxy}>Galaxy</span>::
		<span class="${linkCSS}" onClick=${() => galaxy.show = this}>Sector [${this.id.join()}]</span>
	</div>`

    //filter 
    const left = html`
    ${galaxy._option.length == 0 ? "" : galaxy._option[1]}
	<div class="flex" style="background-color: rgba(255,255,255,0.5);">
		${SlideBarLeft}
		<div class="dropdown" style="direction: ltr;">
			<div class="f4 tc pointer dim underline-hover hover-blue db pa2 ba br2">System Filter: ${this.filter} [${showSystems.length}]</div>
	        <div class="dropdown-content w-100 bg-white ba bw1 pa1">
	    	    ${systemFilters.map(sf => html`
	    		<div class="link pointer underline-hover" onClick=${() => app.refresh(this.filter = sf, galaxy.display())}>${sf}</div>`)}
	    	</div>
		</div>
	</div>
	<div class="${showBars[0] ? "" : "dn-ns"}">
		<div class="vh-75 overflow-x-hidden overflow-auto">${showSystems.map(s => SectorSystemUI(s))}</div>
	</div>`

    const right = html``

    return {
      header,
      left,
      right
    }
  }
}

const History = () => {
  G.eraList.filter((e, i) => i <= G.eraList.indexOf(G._era)).forEach((e, i) => {
    let ef = this.allFactions.filter(f => f.era == e)
    //keep all systems if empty 
    if (_fs.length == 0) {
      _fs = ef.map(f => f.systems).flat()
      return
    }
    //if not empty, see what will be kept 
    if (ef.length == 0) {
      /*
          Settlements 'Orbital,Planet,Moon,Asteroid'
          Sites 'Dwelling,Outpost,Resource'
          May disappear due to progression of time 
        */
      _fs = _fs.filter(f => 'Planet,Resource'.includes(f.type) ? true : f.type == 'Orbital' ? Likely(75, RNG) : RNG.bool()).map(s => Object.assign(s, {
        isRuin: true
      }))
    } else {
      let tsum = 0
        , nfs = _fs.length;
      //if multiple factions split between 
      ef.map(f => {
        tsum += f.tier
        return f.tier
      }
      ).map((t, j) => Math.floor(nfs * t / tsum)).map(n => _fs.splice(0, n)).forEach((_efs, j) => _efs.forEach(sArr => {
        let _f = ef[j]
        //see what the new faction keeps
        let cfs = _f.systems
        //core systems of the faction 
        let core = cfs.splice(0, _f.claims.length)
        //keep certain items, set faction to current 
        let kfs = sArr.filter(s => 'Planet,Resource'.includes(s.type) ? true : s.type == 'Orbital' ? Likely(85, RNG) : 'Moon,Asteroid'.includes(s.type) ? Likely(65, RNG) : RNG.bool()).map(s => Object.assign(s, {
          f: _f,
          isRuin: false
        }))
        //if keep systems is less than faction systems, push 
        let dk = cfs.length - kfs.length
        dk <= 0 ? null : BuildArray(dk, () => kfs.push(cfs.splice(0, 1)))
        //add core and kept 
        _fs.push(...kfs, ...core)
      }
      ))
    }
  }
  )

}

export { MajorSector }
