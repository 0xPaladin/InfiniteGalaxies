import { MakeName } from '../random_name.js';

import { System } from '../system/starSystem.js';

const getSeed = (RNG = chance, length = 12) => RNG.string({ length, casing: 'upper', alpha: true });

const SECTOR = 1000

const SAFETY = {
  "safe": 3,
  "unsafe": 2,
  "dangerous": 1,
  "perilous": 0,
};

class MajorSector {
  constructor(opts = {}) {
    this.what = "Sector"
    this.filter = "All"
    this.toSave = false;

    this._onClick = opts.onClick || null;
    this._display = opts.display || null;
    this._setCrosshair = opts.setCrosshair || null;

    this.galaxy = opts.galaxy || null;
    this.id = opts.id || [0, 0];
    let _id = this.id.join();

    this.seed = this.galaxy ? [this.galaxy.seed, _id].join(":") : _id;
    let RNG = new Chance(this.seed)

    let alignment = this.alignment = opts.alignment || "neutral";
    let alMod = [5, 3, 0, -3, -5][['chaotic', 'evil', 'neutral', 'good', 'lawful'].indexOf(alignment)]
    let sR = RNG.d12() + alMod
    this._safety = sR <= 1 ? "safe" : sR <= 3 ? "unsafe" : sR <= 9 ? "dangerous" : "perilous";
    this._safety = opts.safety || this._safety;

    this._ns = opts.ns || 32;
    this._names = [];
    this._sysSeeds = [];
    _.fromN(this._ns, i => {
      MakeName(this._names, RNG);
      this._sysSeeds.push(getSeed(RNG));
    })

    if (this.galaxy) {
      this.galaxy._sectors.set(this.id.join(), this);
    }
  }

  get data() {
    return {
      alignment: this.alignment,
      safety: this._safety,
      ns: this._ns
    }
  }

  get safety() {
    const { _safety } = this;
    return [_safety, SAFETY[_safety]];
  }

  refresh(show = -1) {
    let parent = this;
    let { safety } = this
    this._loc = []
    this._systems = {}

    let sysDefaults = { onClick: this._onClick, display: this._display };

    for (let i = 0; i < this._ns; i++) {
      let name = this._names[i];
      let seed = this._sysSeeds[i];
      this._systems[seed] = new System(Object.assign({ seed, name, parent, i }, sysDefaults));
    }

    let _id = this.id.join();
    const savedSystems = this.galaxy?._mods.systems || {};
    Object.entries(savedSystems).forEach(([sid, data]) => {
      const [g, sc, _seed] = sid.split(":");
      if (sc === _id) {
        this._systems[_seed] = new System(Object.assign({}, data, { parent }, sysDefaults));
      }
    });

    if (show != -1) {
      this._systems[show].display();
    }

    console.log(this);
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
    if (!this.galaxy) return null;
    return this.galaxy._cultures._cells.get(this.id.join());
  }

  get cultures() {

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

export { MajorSector }
