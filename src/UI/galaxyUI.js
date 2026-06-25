import { Galaxy } from '../engine/galaxy/galaxy.js';
import { setClaimsVisible, getClaimsVisible } from '../engine/render/galaxy-render.js';

export function setupGalaxyGUI(galaxy) {
  let o = {
    seed: galaxy.seed,
    radius: galaxy._R / 1000,
    twist: galaxy._twist * 10,
    cultureSeed: galaxy._cultures.seed,
    cultureCount: galaxy._cultures.birth,
    generations: galaxy._cultures._steps,
    x: 0, y: 0, z: 0,
    showCultures() {
      setClaimsVisible(!getClaimsVisible());
    },
    random() { App.random(); },
    save() {
      const go = App.guiOpts;
      if (!go.galArr.includes(galaxy.seed)) go.galArr.push(galaxy.seed);
      App.active[galaxy.seed] = galaxy.data;
      App.DB.setItem(galaxy.seed, App.active);
    },
    viewSector() {
      let x = galaxy._sectorX != null ? galaxy._sectorX : this.x;
      let y = galaxy._sectorY != null ? galaxy._sectorY : this.y;
      let z = galaxy._sectorZ != null ? galaxy._sectorZ : this.z;
      App.getSector(x, y, z);
    },
    update() {
      App.galaxy = new Galaxy(this);
      App.galaxy.app = App;
      App._bindGalaxyCallbacks(App.galaxy);
      App.galaxy.display();
      setupGalaxyGUI(App.galaxy);
    }
  };

  let { f, nav } = App.gui.reset('Galaxy', galaxy);

  nav.add(o, 'random').name("Random Galaxy");
  nav.add(o, 'showCultures').name("View Culture Claims");

  f.add(o, 'seed');
  f.add(o, 'radius', 40, 60, 1);
  f.add(o, 'twist', 30, 150, 1);

  const cf = f.addFolder("Cultures");
  cf.add(o, 'cultureSeed').name("Seed");
  cf.add(o, "cultureCount", 33, 128, 1).name("Initial Cultures");
  cf.add(o, "generations", 1, 64, 1).name("Generations");

  f.add(o, 'update');
  f.add(o, 'save');

  let sr = galaxy._bounds.map(v => Math.round(v / 2));
  const updateGUI = (v, isX = false) => {
    let key = isX ? "y" : "x";
    let max = galaxy.ellipse(Number(v), isX);
    max = isNaN(max) ? 0 : max;
    o[key] = o[key] > max ? max : o[key];
    o["_c" + key].min(-max).max(max);
    o._view.name("View Sector " + [o.x, o.y]);
    galaxy.addCrosshair(o.x, o.y);
  };

  let fs = f.addFolder('Sector Select');
  o._view = fs.add(o, 'viewSector').name('View Sector');
  galaxy._viewBtn = o._view;
}
