import { System } from '../engine/system/starSystem.js';

export function setupSystemGUI(system) {
  let parent = system.parent;

  let o = Object.assign(system.data, {
    s: system,
    save() {
      applyMod({});
      App.galaxy.save();
    },
    addPlanet() {
      let np = this.s._children.length + 1;
      this.update(np);
    },
    viewGalaxy() {
      App.galaxy.display();
    },
    viewSector() {
      this.s.parent.display();
    }
  });

  let { f, nav } = App.gui.reset(system.name + ' System', system);

  nav.add(o, 'viewGalaxy').name('View Galaxy');
  nav.add(o, 'viewSector').name('View Sector');

  f.add(o, 'name').name('Name').onFinishChange(v => applyMod({ name: v }));
  f.add(o, 'seed').name('Seed').onFinishChange(v => applyMod({ seed: v }));
  f.add(o, 'starClass', ["O", "B", "A", "F", "G", "K", "M"]).name('Star Class').onChange(v => applyMod({ starClass: v }));
  f.add(o, 'np', 0, 24, 1).name('# of Planets').onFinishChange(v => applyMod({ np: v }));
  f.add(o, 'save').name('Save');

  const applyMod = (_mod) => {
    let opts = Object.assign({ parent }, system.data, _mod, { onClick: parent._onClick, display: parent._display });
    let sys = new System(opts);
    App.active[sys._seed] = sys.data;
    parent._systems[sys._seed] = sys;
    sys.display();
  };
}
