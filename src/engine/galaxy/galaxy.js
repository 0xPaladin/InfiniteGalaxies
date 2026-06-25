import { Cultures } from '../peoples/cultures.js';

const MAJORSECTOR = 1000

class Galaxy {
  constructor(opts = {}) {
    this.what = "Galaxy"

    this.app = opts.app || null;
    this._onClick = opts.onClick || null;
    this._display = opts.display || null;
    this._save = opts.save || null;
    this._setCrosshair = opts.setCrosshair || null;

    this.seed = opts.seed || chance.string({
      alpha: true,
      length: 10,
      casing: 'upper'
    })

    this._sectors = new Map()

    let RNG = new Chance(this.seed)

    let _R = RNG.randBetween(40, 60);
    this._R = (opts.radius || _R) * 1000;
    let _twist = RNG.randBetween(30, 150);
    this._twist = (opts.twist || _twist) / 10;

    this._bounds = [this._R / 100 * 2, this._R / 100 * 2];

    this._factions = [];
    this._option = []

    console.time('Cultures')
    const { cultureSeed, cultureCount, generations } = opts;
    this._cultures = new Cultures(cultureSeed || this.seed, this._R, cultureCount, generations);
    console.timeEnd('Cultures')

    this._mods = {
      sectors: opts.sectors || {},
      systems: opts.systems || {},
    }

    console.log(this);
  }

  get data() {
    const systems = {};
    const sectors = {};

    //for each sector save sector or system
    this._sectors.forEach(S => {
      if (S.toSave) {
        let data = S.data
        sectors[S.id.join()] = S.data;
      }

      Object.values(S._systems).forEach(sy => {
        if (sy.toSave) {
          systems[sy.seed] = sy.data;
        };
      })
    });

    return {
      seed: this.seed,
      radius: this._R / 1000,
      twist: this._twist * 10,
      cultureSeed: this._cultures.seed,
      cultureCount: this._cultures.birth,
      generations: this._cultures._steps,
      sectors,
      systems
    }
  }

  get allSectors() {
    let r = this._R / MAJORSECTOR;
    let AS = []
    for (let x = -r; x < r; x++) {
      for (let y = -r; y < r; y++) {
        let _r2 = x * x + y * y;
        _r2 < r * r ? AS.push([x, y]) : null;
      }
    }
    return AS
  }

  get allCultures() {
    return this._cultures.cultures;
  }

  get cultures() {
    return this._cultures.cultures.filter(c => c.isAlive);
  }

  save() {
    if (this._save) this._save(this.data);
  }

  ellipse(v, isX = false) {
    let [a2, b2] = this._bounds.map(p => p * p / 4);
    let r2 = (1 - v * v / (isX ? a2 : b2)) * (isX ? b2 : a2);
    return Math.floor(Math.sqrt(r2));
  }

  addCrosshair(x, y) {
    if (this._setCrosshair) this._setCrosshair(x, y);
  }

  display() {
    if (!this._display) return;
    const galaxy = this;
    this._display(this, {
      onSectorClick(gx, gy) {
        const sxy = [gx, gy, galaxy._sectorZ || 0];
        galaxy._sectorX = sxy[0];
        galaxy._sectorY = sxy[1];
        galaxy._sectorZ = sxy[2];
        galaxy.addCrosshair(gx, gy);
        const cell = galaxy._cultures._cells.get(sxy.slice(0, 2).map(v => v < 0 ? Math.ceil(v / 10) : Math.floor(v / 10)).join());
        console.log(sxy, cell);
        if (galaxy._onClick) galaxy._onClick(galaxy, 'galaxySectorClick', { gx, gy });
      }
    });
  }
}

export { Galaxy }
