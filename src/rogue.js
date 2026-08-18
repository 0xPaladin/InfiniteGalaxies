import "./engine/mixins.js"

import "../lib/localforage.min.js"
const DB = localforage.createInstance({
    name: "RogueGalaxies",
    storeName: 'galaxies',
})

import { html, render, Component } from 'https://esm.sh/htm/preact/standalone';
_.html = html;

import GUI from '../lib/lil-gui.0.20.js';

//lil-gui params
const PARAMS = {

}

const initGUI = (app) => {
    const gui = new GUI({
        title: "Rogue Galaxies"
    });

    gui._folders = {};
    gui._folders.load = this.gui.addFolder("Load Saved");
    gui._folders.nav = this.gui.addFolder("Nav");

    gui.reset = (id, what) => {
        let g = app.gui;

        g._folders.load.destroy();
        g._folders.nav.destroy();

        PARAMS.saves.length > 0 ? g._folders.load = g.addFolder("Load Saved") : null;
        g._folders.nav = g.addFolder("Nav");
    };

    app.gui = gui;
}

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
        setInterval(() => {
            this.refresh();
        }, 1000)

        window.addEventListener("resize", () => {
            resizeView();
        });
    }

    componentWillUnmount() { }

    random() {
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
