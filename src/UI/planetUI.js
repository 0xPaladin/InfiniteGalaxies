import { planetTypeData } from '../engine/constants/astrophysics.js';
import { Planet, Moon } from '../engine/system/planet.js';

export function setupPlanetGUI(planet) {
  let { what, parent, system } = planet;

  let o = Object.assign(planet.data, {
    p: planet,
    color: planet.color,
    data() {
      return Object.fromEntries(Object.keys(planet.data).map(key => [key, this[key]]));
    },
    viewGalaxy() {
      App.galaxy.display();
    },
    viewSector() {
      this.p.sector.display();
    },
    viewSystem() {
      this.p.system.display();
    },
    save() {
      applyMod({});
      App.galaxy.save();
    }
  });

  let { f, nav } = App.gui.reset(planet.shortName, planet);

  nav.add(o, 'viewGalaxy').name('View Galaxy');
  nav.add(o, 'viewSector').name('View Sector');
  nav.add(o, 'viewSystem').name('View System');

  f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({ seed: v }));
  if (what == "Planet") {
    f.add(o, 'type', ["rocky", "gas giant", "brown dwarf"]).name('Type').onChange(v => {
      let data = planetTypeData.find(d => d.classification == v);
      let [rmin, rmax] = data.radius.map(v => v / 1000);
      let radius = o.radius = Math.round((rmax + rmin) / 2);
      f.controllers.find(c => c.property == "radius").min(rmin).max(rmax);
      let [dmin, dmax] = data.density;
      let density = o.density = Math.round((dmax + dmin) / 2);
      f.controllers.find(c => c.property == "density").min(dmin).max(dmax);
      applyMod({ type: v, radius, density });
    });
  }
  f.add(o, 'orbit', 0.2, 100, 0.2).name('Orbital Radius').decimals(1).onFinishChange(v => applyMod({ orbit: v }));
  f.add(o, 'radius', ...planet.template.radius.map(v => v / 1000)).name('Radius (km)').decimals(0).listen().onFinishChange(v => applyMod({ radius: v }));
  f.add(o, 'density', ...planet.template.density).name('Density').decimals(2).listen().onFinishChange(v => applyMod({ density: v }));
  if (what == "Planet") {
    f.add(o, 'moons', 0, 20, 1).name('# of Moons').onFinishChange(v => applyMod({ moons: v }));
  }
  f.add(o, 'save').name('Save');

  const applyMod = (_mod) => {
    let opts = Object.assign({}, planet.data, _mod);
    if (what == "Moon") opts.insolation = parent._insolation;
    let P = what == "Planet" ? new Planet(parent, opts) : new Moon(parent, opts);
    let _id = what == "Planet" ? opts.i : [parent._i, opts.i].join(".");
    system._mods[_id] = P.data;
    App.active[system._seed] = system.data;
    parent[what == "Planet" ? "_children" : "_moons"][opts.i] = P;
    system.display();
    setupPlanetGUI(P);
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
