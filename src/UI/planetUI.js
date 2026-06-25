import { planetTypeData } from '../engine/constants/astrophysics.js';
import { Planet, Moon } from '../engine/system/planet.js';
import { setupGalaxyGUI } from './galaxyUI.js';

export function setupPlanetGUI(planet) {
  let { what, parent, system } = planet;

  let o = Object.assign(planet.data, {
    p: planet,
    color: planet.color,
    moons: planet.what == "Planet" ? planet._nm : 0,
    data() {
      return Object.fromEntries(Object.keys(planet.data).map(key => [key, this[key]]));
    },
    viewGalaxy() {
      App.galaxy.display();
      App.updateState("info", "");
      setupGalaxyGUI(App.galaxy);
    },
    viewSector() {
      this.p.sector.display();
    },
    viewSystem() {
      this.p.system.display();
    }
  });

  let { f, nav } = App.gui.reset(planet.shortName, planet);

  nav.add(o, 'viewGalaxy').name('View Galaxy');
  nav.add(o, 'viewSector').name('View Sector');
  nav.add(o, 'viewSystem').name('View System');

  f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({ seed: v }));
  if (what == "Planet") {
    f.add(o, 'classification', ["rocky", "gas giant", "brown dwarf"]).name('Type').onChange(v => {
      let data = planetTypeData.find(d => d.classification == v);
      let [rmin, rmax] = data.radius.map(v => v / 1000);
      let radius = o.radius = Math.round((rmax + rmin) / 2);
      f.controllers.find(c => c.property == "radius").min(rmin).max(rmax);
      let [dmin, dmax] = data.density;
      let density = o.density = Math.round((dmax + dmin) / 2);
      f.controllers.find(c => c.property == "density").min(dmin).max(dmax);
      applyMod({ classification: v, radius, density });
    });
  }
  f.add(o, 'orbit', 0.2, 100, 0.2).name('Orbital Radius').decimals(1).onFinishChange(v => applyMod({ orbit: v }));
  f.add(o, 'radius', ...planet.template.radius.map(v => v / 1000)).name('Radius (km)').decimals(0).listen().onFinishChange(v => applyMod({ radius: v }));
  f.add(o, 'density', ...planet.template.density).name('Density').decimals(2).listen().onFinishChange(v => applyMod({ density: v }));
  f.add(o, 'moons', 0, 20, 1).name('# of Moons').onFinishChange(v => applyMod({ moons: v }));

  const applyMod = (_mod) => {
    let sysData = system.data;
    let children = sysData.children;

    if (what == "Moon") {
      let pIdx = children.findIndex(c => c.seed === parent._seed);
      let moons = children[pIdx].moons;
      let mIdx = moons.findIndex(m => m.seed === planet._seed);
      moons[mIdx] = Object.assign({}, moons[mIdx], _mod);
    } else {
      let pIdx = children.findIndex(c => c.seed === planet._seed);
      children[pIdx] = Object.assign({}, children[pIdx], _mod);
    }

    sysData.children = children;
    let sector = system.parent;
    let opts = Object.assign({ parent: sector }, sysData, { onClick: sector._onClick, display: sector._display });
    if (!opts.seed) opts.seed = system._seed;
    let sys = new System(opts);
    App.active[sys._seed] = sys.data;
    sector._systems[sys._seed] = sys;
    App._bindSystemCallbacks(sys);
    sys.display();

    if (what == "Moon") {
      let p = sys.children.find(c => c._seed === parent._seed);
      let m = p._moons.find(m => m._seed === planet._seed);
      setupPlanetGUI(m);
    } else {
      let p = sys.children.find(c => c._seed === planet._seed);
      setupPlanetGUI(p);
    }
  };
}

export function getPlanetInfo(planet) {
  let { classification, _orbitalRadius, gravity, atmosphere, temp, radius, description, shortName } = planet;
  let m = classification == "rocky" ? 6378 : 69911;
  let dif = radius / m;
  return _.html`
    <div class="info-box">
      <h3>${shortName}</h3>
      <div>${_orbitalRadius.toFixed(1)} ${planet.what == "Planet" ? "AU" : "LD"}, ${classification}, ${dif.toFixed(2)} ${classification == "rocky" ? "Earth" : "Jupiter"}</div>
      <div>${gravity.toFixed(2)}g, ${temp}, ${atmosphere.toLowerCase()} atmosphere</div>
      <div>${description}</div>
    </div>`;
}
