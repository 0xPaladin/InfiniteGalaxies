/*
  V0.3
*/

/*
  Mixins for standard functions
  Array, Math, Sting...
*/
import "./mixins.js"

/*
  Chance RNG
*/
import "../lib/chance.slim.js"
const chance = new Chance()

/*
  Storage - localforage
  https://localforage.github.io/localForage/
*/
import "../lib/localforage.min.js"
const DB = localforage.createInstance({
  name: "InfinteGalaxies",
  storeName: 'galaxies',
})
/*
  SVG
  https://svgjs.dev/docs/3.0/getting-started/
*/

/*
  UI Resources  
*/
//Preact
import { h, Component, render } from '../lib/preact.module.js';
import htm from '../lib/htm.module.js';
// Initialize htm with Preact
const html = _.html = htm.bind(h);
//lil GUI
import GUI from '../lib/lil-gui.0.20.js';

/*
  App Sub UI
*/
import { Galaxy } from './galaxy.js';
import { MajorSector } from './majorSector.js';
import *as UI from './UI.js';
import { System } from "./starSystem.js"

/*
  Declare the main App 
*/


class App extends Component {
  constructor() {
    super();
    this.state = {
      show: "Galaxy",
      saved: [],
      sub: "",
      reveal: [],
      dialog: "",
      //for UI selection 
      galaxyView: "Sector",
      isometric: "Flat",
      mission: "",
      filter: "",
      filterSystem: "All",
      selection: "",
      selected: "",
      showBars: [true, true],
      //time keeping 
      tick: [0, 0, 0]
    };

    //save to global
    window.App = this;

    this.DB = DB
    //use in other views 
    this.html = html

    //active objects
    this.active = {}
    this.toSave = new Set();

    /*
      Gui and data for gui
    */
    this.guiOpts = {
      galArr: [],
      galSel: '',
      galF () {
        window.App.load(this.galSel);
      },
      secArr: [],
      secSel: '',
      secF () {
        let [x,y] = this.secSel.split(",").map(Number);
        window.App.getSector(x,y);
      },
      sysArr: [],
      sysSel: '',
      sysF () {
        let sys = window.App.active[this.sysSel];
        //create sector 
        let [x,y] = sys.pid.split(",").map(Number);
        window.App.getSector(x,y);
        window.App.sector.refresh(sys.seed);
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
      //establish load if active exist
      let go = this.guiOpts;
      go.galArr.length > 0 ? g._load = g.addFolder("Load Saved") : null;
      
      //add gui selectors if available
      ['gal.Galaxy', 'sec.Sector', 'sys.System'].forEach(w => {
        let [_id, name] = w.split(".");
        //if no data, skip
        if(go[`${_id}Arr`].length == 0) {
          return;
        }
        //set selector and gui 
        go[`${_id}Sel`] = name;
        g._load.add(go, `${_id}Sel`, go[`${_id}Arr`]).name(name).onChange(v => go[`${_id}F`](v));
      })

      //add nav for ui 
      g._nav.destroy();
      g._nav = g.addFolder("Nav");

      //data folder 
      g._f ? g._f.destroy() : null;
      g._f = g.addFolder(id);
      return {
        f: g._f,
        nav: g._nav
      }
    };


  }

  // Lifecycle: Called whenever our component is created
  async componentDidMount() {
    //generate galaxy and display 
    this.random();

    //now get ids for saves 
    DB.iterate((value, key) => {
      // Resulting key/value pair
      this.guiOpts.galArr.push(key);
    }).then(() => {
      this.galaxy.gui();
    })

    //timer 
    setInterval(() => {
    }, 1000)

    //Watch for browser/canvas resize events
    window.addEventListener("resize", () => {
      this.galaxy.display()
      this.refresh()
    }
    );
  }

  // Lifecycle: Called just before our component will be destroyed
  componentWillUnmount() { }

  random () {
    ['sec','sys'].forEach(w => {
      this.guiOpts[`${w}Arr`] = [];
      this.guiOpts[`${w}Sel`] = '';
    })
    //generate galaxy and display 
    this.galaxy = new Galaxy();
    this.galaxy.display();
  }

  load (_id) {
    //pull from db 
    DB.getItem(_id).then((saved) => {
      //galaxy data 
      this.galaxy = new Galaxy(saved[_id]);
      //update active state with all other saved data
      this.mapActive(saved);
      //display
      this.galaxy.display();
    })
  }

  getSector (x,y) {
    this.sector = new MajorSector({ id: [x,y] });
    this.sector.refresh();
    this.sector.display();
  }

  mapActive(data) {
    let go = this.guiOpts;
    ['sec','sys'].forEach(w => {
      go[`${w}Arr`] = [];
      go[`${w}Sel`] = '';
    })
    //set active
    this.active = data;

    //run through data looking for IDs 
    Object.keys(data).forEach(key => {
      if (key == this.galaxy.seed) {
        return;
      }
      if (key.includes(",")) {
        go.secArr.push(key);
      }
      else {
        go.sysArr.push(key);
      }
    })
  }

  /*
    Render functions 
  */

  notify(text, type = "success") {
    let opts = {
      theme: "relax",
      type,
      text,
      layout: "center"
    }

    new Noty(opts).show();
  }

  //main function for updating state 
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

  //clears current UI 
  cancel() {
    this.show = ""
    this.dialog = "Main"
  }

  //main page render 
  render({ }, { show, active, selected, filter, filterSystem, isometric, galaxyView }) {
    let G = this.galaxy

    //final layout 
    return html`
	<div class="absolute z-0 top-0 left-0 w-100 h-100 pa2">
      <canvas id="starryHost" class="w-100 h-100"></canvas>
      <div id="map" class="z-0 absolute top-0 left-0 w-100 h-100 pa2"></div>
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
