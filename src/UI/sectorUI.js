import { MajorSector } from '../engine/galaxy/sector.js';
import { System } from '../engine/system/starSystem.js';
import { setupGalaxyGUI } from './galaxyUI.js';

export function setupSectorGUI(sector) {
  let o = {
    s: sector,
    filter: "All",
    ns: sector._ns,
    update() {
      let _id = this.s.id.join();
      let opts = { id: this.s.id, ns: this.ns, galaxy: App.galaxy };
      App.active[_id] = opts;
      App.sector = new MajorSector(opts);
      App._bindSectorCallbacks(App.sector);
      App.sector.refresh(-1);
      App.sector.display();
      setupSectorGUI(App.sector);
    },
    viewGalaxy() {
      App.galaxy.display();
      App.updateState("info", "");
      setupGalaxyGUI(App.galaxy);
    },
    viewSystem() {
      let system = this.s.selectedSystem;
      App._bindSystemCallbacks(system);
      system.display();
    }
  };

  let { f, nav } = App.gui.reset('Sector ' + sector.id.slice(0, 2).join(), sector);

  nav.add(o, "viewGalaxy").name("View Galaxy");

  f.add(sector, 'toSave').name('To Save');
  f.add(o, 'ns', 32, 256, 1).name("# of Systems").onFinishChange(v => o.update());

  let sys = sector.selectedSystem;
  let asf = f.addFolder('System');
  asf.add(o, 'filter', ["All", "Earthlike", "Survivable"]).name("System Filter").listen().onChange(function (e) {
    let { s, filter } = this.object;
    s.display({ filter });
  });
  asf.add(sys, 'name').name('Name').listen();
  asf.add(sys, 'x', 0, 1000).step(1).name('X').onFinishChange(v => showMove(0, v));
  asf.add(sys, 'y', 0, 1000).step(1).name('Y').onFinishChange(v => showMove(1, v));
  asf.add(sys, 'z', 0, 1000).step(1).name('Z').onFinishChange(v => showMove(2, v));
  asf.add(sys, 'starClass', ["O", "B", "A", "F", "G", "K", "M"]).name('Star Class').onChange(v => {
    let opts = Object.assign(sys.data, { parent: sector, starClass: v, onClick: sector._onClick, display: sector._display });
    let ns = new System(opts);
    sector._systems[sys._seed] = ns;
    App.active[sys._seed] = sys.data;
    sector.display();
    sector.addCrosshair(ns._loc[0], ns._loc[1], ns._loc[2]);
    setupSectorGUI(sector);
  });
  asf.add(o, 'viewSystem').name('View System');

  const showMove = (id, v) => {
    let sys = sector.selectedSystem;
    sys._loc[id] = v;
    App.active[sys._seed] = sys.data;
    sector.display();
    sector.addCrosshair(sys._loc[0], sys._loc[1], sys._loc[2]);
    setupSectorGUI(sector);
  };
}

export function refreshSectorGUI(sector) {
  const f = App.gui._f;
  if (!f) return;
  const sys = sector.selectedSystem;
  const asf = Array.isArray(f.folders) ? f.folders.find(fo => fo._title === 'System') : null;
  if (!asf) return;
  ['name', 'x', 'y', 'z', 'starClass'].forEach(prop => {
    const ctrl = asf.controllers.find(c => c.property === prop);
    if (ctrl) ctrl.updateDisplay();
  });
}

export function getSystemInfo(system) {
  let { name, _pois, stellarR, star, habitable } = system;
  let [ne, ns] = habitable.map(h => h.length);
  return _.html`
    <div class="info-box">
      <h3>${name}</h3>
      <div><b>${star.spectralType}</b>, R ${stellarR.toFixed(2)} Sol, Luminosity ${star.luminosity.toFixed(2)} </div>
      ${ne > 0 ? _.html`<div><b>Earthlike:</b> ${habitable[0].map((p, i) => _.html`<span>${p.shortName}${i < ne - 1 ? "; " : ""}</span>`)}</div>` : ""}
      ${ns > 0 ? _.html`<div><b>Survivable:</b> ${habitable[1].map((p, i) => _.html`<span>${p.shortName}${i < ns - 1 ? "; " : ""}</span>`)}</div>` : ""}
      <div><b>POI:</b> ${_pois.join(" & ")}</div>
    </div>`;
}
