import { MakeName } from '../random_name.js';

import { System } from '../system/starSystem.js';

const getSeed = (RNG = chance, length = 12) => RNG.string({ length, casing: 'upper', alpha: true });

const toIsometric = (_x, _y, _z) => {
  return {
    x: (_x - _y) * 0.866025,
    y: _z + (_x + _y) * 0.5
  }
}

const SECTOR = 1000

class MajorSector {
  constructor(opts = {}) {
    this.what = "Sector"
    this.filter = "All"

    this._onClick = opts.onClick || null;
    this._display = opts.display || null;
    this._setCrosshair = opts.setCrosshair || null;

    this.galaxy = opts.galaxy || null;
    this.id = opts.id || [0, 0, 0];
    let _id = this.id.join();
    let saved = opts.saved || {};
    opts = Object.assign(opts, saved.opts || {});

    this._seed = opts.seed || 0;
    this.seed = this.galaxy ? [this.galaxy.seed, _id, this._seed].join(".") : _id;

    let RNG = new Chance(this.seed)

    let alignment = this.alignment = "neutral"
    let alMod = [5, 3, 0, -3, -5][['chaotic', 'evil', 'neutral', 'good', 'lawful'].indexOf(alignment)]
    let sR = RNG.d12() + alMod
    this.safety = sR <= 1 ? ["safe", 3] : sR <= 3 ? ["unsafe", 2] : sR <= 9 ? ["dangerous", 1] : ["perilous", 0]

    this._ns = opts.ns || 32;

    this._names = [];
    this._sysSeeds = [];
    _.fromN(256, i => {
      MakeName(this._names, RNG);
      this._sysSeeds.push(getSeed(RNG));
    })

    if (this.galaxy) {
      this.galaxy._sectors.set(this.id.join(), this);
    }
  }

  refresh(show = -1, savedSystems = {}) {
    let parent = this;
    let { safety } = this
    this._loc = []
    this._systems = {}

    let sysDefaults = { onClick: this._onClick, display: this._display };

    for (let i = 0; i < this._ns; i++) {
      let name = this._names[i];
      let seed = this._sysSeeds[i];
      this._systems[seed] = new System(Object.assign({ seed, name, parent }, sysDefaults));
    }

    let _id = this.id.join();
    Object.entries(savedSystems).forEach(([sid, data]) => {
      if (data && data.pid && data.pid == _id) {
        this._systems[sid] = new System(Object.assign({}, data, { parent }, sysDefaults));
      }
    });

    if (show != -1) {
      this._systems[show].display();
    }

    console.log(this);
  }

  addSystem(opts = {}) {
    this._newSystems.push(opts);
    this.refresh();
    this.display();
  }

  get habitable() {
    return BuildArray(4, (_, i) => {
      let planets = []
      let moons = []
      this.systems.forEach(s => {
        planets = planets.concat(s.planetHI[i])
        moons = moons.concat(s.moonHI[i])
      })

      return {
        planets,
        moons
      }
    })
  }
  get systems() {
    return Object.values(this._systems);
  }
  showSystems(filter) {
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
      }, false))
    } else if (filter == "Ruins") {
      res = this.systems.filter(s => s.POI && s.POI.reduce((state, poi) => {
        return state || poi.what == "Ruin" || poi.isRuin
      }, false))
    } else if (poi.includes(filter)) {
      let what = filter.slice(0, -1)
      res = this.systems.filter(s => s.POI && s.POI.reduce((state, poi) => {
        return state || poi.what == what || poi.type == what
      }, false))
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

  distance(x, y) {
    let [sx, sy] = this.id
    let dx = x - sx
      , dy = y - sy;
    let d = Math.sqrt(dx * dx + dy * dy)
    return d
  }

  isSameSector(x, y) {
    return this.id[0] == x && this.id[1] == y
  }

  get cultureCell() {
    let mid = this.id.map(v => Math.floor(v / 10)).join();
    if (!this.galaxy) return null;
    return this.galaxy._cultures._cells.get(mid);
  }

  get closestCulture() {
    let fd = this.galaxy.cultures.map(c => c.cells.map(s => [this.distance(s.x, s.y), c])).flat().sort((a, b) => a[0] - b[0])
    return fd[0][1]
  }

  get pastCultures() {
    return this.allCultures.filter(c => cf.isAlive);
  }

  get allCultures() {
    if (!this.cultureCell) return [];
    return this.cultureCell._claims.map(id => this.galaxy.allCultures[id]);
  }

  addCrosshair(x, y, z = 0) {
    if (this._setCrosshair) this._setCrosshair(x, y, z);
  }

  async display(opts = {}) {
    if (!this._display) return;
    this.selectedSystem = this.selectedSystem || this.systems[0];
    let { filter = this.filter } = opts;
    this.filter = filter;

    const sector = this;
    this._display(this, {
      filter,
      onStarClick(system) {
        sector.addCrosshair(system.x, system.y, system.z);
        sector.selectedSystem = system;
        if (sector._onClick) sector._onClick(sector, 'sectorStarClick', { system });
      }
    });
  }
}

const History = () => {
  G.eraList.filter((e, i) => i <= G.eraList.indexOf(G._era)).forEach((e, i) => {
    let ef = this.allFactions.filter(f => f.era == e)
    if (_fs.length == 0) {
      _fs = ef.map(f => f.systems).flat()
      return
    }
    if (ef.length == 0) {
      _fs = _fs.filter(f => 'Planet,Resource'.includes(f.type) ? true : f.type == 'Orbital' ? Likely(75, RNG) : RNG.bool()).map(s => Object.assign(s, {
        isRuin: true
      }))
    } else {
      let tsum = 0
        , nfs = _fs.length;
      ef.map(f => {
        tsum += f.tier
        return f.tier
      }).map((t, j) => Math.floor(nfs * t / tsum)).map(n => _fs.splice(0, n)).forEach((_efs, j) => {
        let _f = ef[j]
        let cfs = _f.systems
        let core = cfs.splice(0, _f.claims.length)
        let kfs = sArr.filter(s => 'Planet,Resource'.includes(s.type) ? true : s.type == 'Orbital' ? Likely(85, RNG) : 'Moon,Asteroid'.includes(s.type) ? Likely(65, RNG) : RNG.bool()).map(s => Object.assign(s, {
          f: _f,
          isRuin: false
        }))
        let dk = cfs.length - kfs.length
        dk <= 0 ? null : BuildArray(dk, () => kfs.push(cfs.splice(0, 1)))
        _fs.push(...kfs, ...core)
      })
    }
  })
}

export { MajorSector }
