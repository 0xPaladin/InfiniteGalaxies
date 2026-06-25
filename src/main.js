import "./engine/mixins.js"

import "../lib/chance.slim.js"
const chance = new Chance()

import "../lib/localforage.min.js"
const DB = localforage.createInstance({
  name: "InfinteGalaxies",
  storeName: 'galaxies',
})

import { html, render, Component } from 'https://esm.sh/htm/preact/standalone';
_.html = html;

import GUI from '../lib/lil-gui.0.20.js';

import { Galaxy } from './engine/galaxy/galaxy.js';
import { MajorSector } from './engine/galaxy/sector.js';
import * as UI from './UI.js';
import { System } from "./engine/system/starSystem.js"

import { setupGalaxyGUI } from './UI/galaxyUI.js';
import { setupSectorGUI, getSystemInfo } from './UI/sectorUI.js';
import { setupSystemGUI } from './UI/systemUI.js';
import { setupPlanetGUI, getPlanetInfo } from './UI/planetUI.js';

import { init as initThree, resizeView, setGalaxyView, setSectorView, setSystemView, setCrosshair, upgradeSystemPlanet, zoomToPlanet } from './engine/render/galaxy-render.js';

class App extends Component {
  constructor() {
    super();
    this.state = {
      show: "Galaxy",
      dialog: "",
      info: "",
    };

    window.App = this;

    this.DB = DB
    this.html = html

    this.active = {}
    this.toSave = new Set();

    this.guiOpts = {
      galArr: [],
      galSel: '',
      galF() {
        window.App.load(this.galSel);
      },
      secArr: [],
      secSel: '',
      secF() {
        let [x, y] = this.secSel.split(",").map(Number);
        window.App.getSector(x, y);
      },
      sysArr: [],
      sysSel: '',
      sysF() {
        let sys = window.App.active[this.sysSel];
        let [x, y] = sys.pid.split(",").map(Number);
        window.App.getSector(x, y);
        window.App.sector.refresh(sys.seed, window.App.active);
      }
    }

    this.gui = new GUI({
      title: "Infinite Galaxies"
    });
    this.gui._load = this.gui.addFolder("Load Saved");
    this.gui._nav = this.gui.addFolder("Nav");

    this.gui.reset = (id, what) => {
      let g = this.gui;

      g._load.destroy();
      let go = this.guiOpts;
      go.galArr.length > 0 ? g._load = g.addFolder("Load Saved") : null;

      ['gal.Galaxy', 'sec.Sector', 'sys.System'].forEach(w => {
        let [_id, name] = w.split(".");
        if (go[`${_id}Arr`].length == 0) return;
        go[`${_id}Sel`] = name;
        g._load.add(go, `${_id}Sel`, go[`${_id}Arr`]).name(name).onChange(v => go[`${_id}F`](v));
      })

      g._nav.destroy();
      g._nav = g.addFolder("Nav");

      g._f ? g._f.destroy() : null;
      g._f = g.addFolder(id);
      return { f: g._f, nav: g._nav }
    };

    this._bindGalaxyCallbacks = (galaxy) => {
      galaxy._onClick = (self, event, data) => {
        if (event === 'galaxySectorClick' && self._viewBtn) {
          self._viewBtn.name("View Sector " + data.gx + "," + data.gy);
        }
      };
      galaxy._display = (self, events) => setGalaxyView(self, events);
      galaxy._setCrosshair = (x, y) => setCrosshair(x, y);
      galaxy._save = (data) => {
        this.active[this.galaxy.seed] = data;
        DB.setItem(this.galaxy.seed, this.active);
      };
    };

    this._bindSectorCallbacks = (sector) => {
      sector._onClick = (self, event, data) => {
        if (event === 'sectorStarClick') {
          this.updateState("info", getSystemInfo(data.system));
          setupSectorGUI(self);
        }
      };
      sector._display = (self, events) => setSectorView(self, events);
      sector._setCrosshair = (x, y, z) => setCrosshair(x, y, z);
    };

    this._bindSystemCallbacks = (system) => {
      system._onClick = (self, event, data) => {
        if (event === 'systemDisplay') {
          this.updateState("info", getSystemInfo(self));
          setupSystemGUI(self);
        } else if (event === 'systemPlanetClick') {
          const { planet, group } = data;
          planet._upgradeCallback = () => {
            if (group) {
              upgradeSystemPlanet(group, planet);
              zoomToPlanet(group, planet);
            }
          };
          this.updateState("info", getPlanetInfo(planet));
          setupPlanetGUI(planet);
          if (planet._upgradeCallback) planet._upgradeCallback();
        }
      };
      system._display = (self, events) => setSystemView(self, events);
    };
  }

  async componentDidMount() {
    const container = document.getElementById('threeHost');
    if (container) initThree(container);

    this.random();

    DB.iterate((value, key) => {
      this.guiOpts.galArr.push(key);
    }).then(() => {
      setupGalaxyGUI(this.galaxy);
    })

    setInterval(() => {
      this.refresh();
    }, 1000)

    window.addEventListener("resize", () => {
      resizeView();
    });
  }

  componentWillUnmount() { }

  random() {
    ['sec', 'sys'].forEach(w => {
      this.guiOpts[`${w}Arr`] = [];
      this.guiOpts[`${w}Sel`] = '';
    })
    this.galaxy = new Galaxy();
    this.galaxy.app = this;
    this._bindGalaxyCallbacks(this.galaxy);
    this.galaxy.display();
    setupGalaxyGUI(this.galaxy);
  }

  load(_id) {
    DB.getItem(_id).then((saved) => {
      this.galaxy = new Galaxy(saved[_id]);
      this.galaxy.app = this;
      this._bindGalaxyCallbacks(this.galaxy);
      this.mapActive(saved);
      this.galaxy.display();
      setupGalaxyGUI(this.galaxy);
    })
  }

  getSector(x, y) {
    let _id = [x, y].join();
    let saved = this.galaxy._mods.sectors[_id] || this.active[_id] || {};
    this.sector = new MajorSector({ id: [x, y], galaxy: this.galaxy, saved });
    this._bindSectorCallbacks(this.sector);
    this.sector.refresh(-1);
    this.sector.display();
    setupSectorGUI(this.sector);
  }

  mapActive(data) {
    let go = this.guiOpts;
    ['sec', 'sys'].forEach(w => {
      go[`${w}Arr`] = [];
      go[`${w}Sel`] = '';
    })
    this.active = data;

    const addKey = (key) => {
      if (key == this.galaxy.seed) return;
      if (key.includes(",")) {
        if (!go.secArr.includes(key)) go.secArr.push(key);
      } else {
        if (!go.sysArr.includes(key)) go.sysArr.push(key);
      }
    };

    Object.keys(data).forEach(addKey);
    Object.keys(this.galaxy._mods.sectors).forEach(addKey);
    Object.keys(this.galaxy._mods.systems).forEach(addKey);
  }

  notify(text, type = "success") {
    let opts = {
      theme: "relax",
      type,
      text,
      layout: "center"
    }
    new Noty(opts).show();
  }

  async updateState(what, val = "") {
    let s = {}
    s[what] = val
    await this.setState(s)
  }
  refresh() {
    this.show = this.state.show
    this.dialog = this.state.dialog
  }

  set show(what) {
    this.updateState("show", what)
  }

  get show() {
    let [what, id] = this.state.show.split(".")
    return UI[what] ? UI[what](this) : this[what] ? this[what][id].UI ? this[what][id].UI() : "" : ""
  }

  set dialog(what) {
    this.state.newData = undefined
    this.state.selected = ""
    this.updateState("dialog", what)
  }

  get dialog() {
    let [what, id] = this.state.dialog.split(".")
    return what == "" ? "" : UI.Dialog(this)
  }

  cancel() {
    this.show = ""
    this.dialog = "Main"
  }

  render({ }, { info }) {
    return html`
	<div class="fixed top-0 left-0 w-100 h-100">
      <div id="threeHost"></div>
      <div id="overlay" class="z-1 absolute top-0 left-0 pa2">${info}</div>
      ${this.show}
    </div>
    ${this.dialog}
    `
  }
}

function reportWindowSize() {
  App.gui.what.display();
}

window.onresize = reportWindowSize;

render(html`<${App}/>`, document.body);
