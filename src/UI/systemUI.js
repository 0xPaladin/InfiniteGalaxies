import { System } from '../engine/system/starSystem.js';
import { setupGalaxyGUI } from './galaxyUI.js';

export function setupSystemGUI(system) {
  let parent = system.parent;

  let o = Object.assign(system.data, {
    seed: system._seed,
    s: system,
    addPlanet() {
      let np = this.s._children.length + 1;
      this.update(np);
    },
    viewGalaxy() {
      App.galaxy.display();
      App.updateState("info", "");
      setupGalaxyGUI(App.galaxy);
    },
    viewSector() {
      this.s.parent.display();
    }
  });

  let { f, nav } = App.gui.reset(system.name + ' System', system);

  nav.add(o, 'viewGalaxy').name('View Galaxy');
  nav.add(o, 'viewSector').name('View Sector');

  f.add(system, 'toSave').name('To Save');
  f.add(o, 'name').name('Name').onFinishChange(v => applyMod({ name: v }));
  f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({ seed: v }));
  f.add(o, 'starClass', ["O", "B", "A", "F", "G", "K", "M"]).name('Star Class').onChange(v => applyMod({ starClass: v }));
  f.add(o, 'np', 0, 24, 1).name('# of Planets').onFinishChange(v => applyMod({ np: v }));

  const applyMod = (_mod) => {
    let opts = Object.assign({ parent }, system.data, _mod, { onClick: parent._onClick, display: parent._display });
    if (!_mod || !_mod.seed) opts.seed = system._seed;
    let sys = new System(opts);
    App.active[sys._seed] = sys.data;
    parent._systems[sys._seed] = sys;
    App._bindSystemCallbacks(sys);
    sys.display();
  };
}
