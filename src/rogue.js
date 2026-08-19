// Rogue Galaxies — plain JS entry point
// No Preact, no Chance. Uses ROT for ASCII display, lil-gui for controls,
// localforage for persistence, PRNG for randomness.

import "./engine/mixins.js"
import { GUI } from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

import { PRNG } from './engine/random.js';
import { generateSector } from './engine/galaxy/sector.js';
import { generateSystem } from './engine/galaxy/system.js';

// ── Rogue Map─────────────────────────────────────────────────────────
import { RogueSector } from './engine/rogue/sector.js';
import { RogueSystem } from './engine/rogue/system.js';

// ── Globals ──────────────────────────────────────────────────────────
const DB_KEY = 'rogue-galaxies';
let App = null;

// ── Toast ────────────────────────────────────────────────────────────
function toast(msg, ms = 2500) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), ms);
}

// ── Persistence ──────────────────────────────────────────────────────
async function saveGame(data) {
    await localforage.setItem(DB_KEY, data);
    toast('Saved');
}
async function loadGame() {
    return await localforage.getItem(DB_KEY);
}
async function deleteSave() {
    await localforage.removeItem(DB_KEY);
    toast('Save deleted');
}

// ── Helpers ──────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ── App ──────────────────────────────────────────────────────────────
class RogueApp {
    constructor() {
        this.display = null;       // ROT.Display instance
        this.gui = null;           // lil-gui instance
        this.map = null;           // current map data
        this.view = 'sector';      // 'sector' | 'system'
        this.currentSystem = null; // system object when in system view
        this.active = {};          // saved games keyed by seed
        this.sectorSeed = null;
        this.systemSeed = null;
        this._resizeHandler = this._resizeHandler.bind(this);

        //sector
        this.nHab = 8;
        this.totalSystems = 100;
    }

    // ── Lifecycle ──────────────────────────────────────────────────
    async init() {
        this.display = new ROT.Display({
            width: 100,
            height: 100,
            font: 'monospace',
            fontSize: 14,
            spacing: 1,
            forceSquareRatio: true,
            maxWidth: 1200,
            maxHeight: 800
        });
        const host = $('display');
        host.appendChild(this.display.getContainer());

        // Click handling
        const container = this.display.getContainer();
        container.addEventListener('click', (ev) => this._onClick(ev));
        container.style.cursor = 'crosshair';

        // Resize
        window.addEventListener('resize', this._resizeHandler);

        // lil-gui
        this.gui = new GUI({ title: 'Rogue Galaxies' });
        this._buildGui();

        // Load saves
        this.active = (await loadGame()) || {};
        this._populateLoadDropdown();

        // Generate initial sector
        this._genNewSector();
    }

    _resizeHandler() {
        if (this.display) this.display.resize();
    }

    // ── GUI ────────────────────────────────────────────────────────
    _buildGui() {
        const g = this.gui;

        // Generate folder
        const genFolder = g.addFolder('Generate');
        genFolder.add(this, '_genNewSector').name('New Sector');
        genFolder.add(this, '_genNewSystem').name('New System');
        genFolder.add(this, '_saveGame').name('Save');
        genFolder.add(this, '_loadGame').name('Load');
        genFolder.add(this, '_deleteSave').name('Delete Save');

        this.sectorFolder = g.addFolder('Sector');
        this.systemFolder = g.addFolder('System');
        this.infoFolder = g.addFolder('Info');
        this._infoControllers = {};
        this.viewFolder = g.addFolder('View');
    }

    _genNewSector() {
        this.sectorSeed = crypto.randomUUID();
        this._renderSector();
        toast('New sector generated');
    }

    _genNewSystem() {
        this.systemSeed = crypto.randomUUID();
        this._renderSystem();
        toast('New system generated');
    }

    _saveGame() {
        saveGame(this.active);
    }

    async _loadGame() {
        const data = await loadGame();
        if (data) {
            this.active = data;
            this._populateLoadDropdown();
            toast('Loaded');
        } else {
            toast('No save found');
        }
    }

    _deleteSave() {
        deleteSave();
        this.active = {};
        this._populateLoadDropdown();
    }

    _populateLoadDropdown() {
        // TODO: wire to GUI dropdown
    }

    // ── Rendering ──────────────────────────────────────────────────
    _renderSector() {
        const { nHab, totalSystems } = this;

        this.view = 'sector';
        this.currentSystem = null;
        this.map = generateSector(this.sectorSeed, {
            bounds: { w: 1000, h: 1000, d: 1000 },
            nHab,
            nSystems: totalSystems
        });

        this.display.clear();
        this._updateInfo();
        this.display.setOptions({
            width: 100,
            height: 100,
            fontSize: 8
        });

        //do the display 
        RogueSector(this.map, this.display);

        toast(`Sector ${this.sectorSeed} — ${this.map.systems.length} systems`);
        return console.log(this.map);
    }

    _renderSystem() {
        this.view = 'system';
        this.map = this.map.seed === this.systemSeed ? this.map : generateSystem(this.systemSeed || this.sectorSeed, {});
        this.currentSystem = this.map;

        this.display.clear();
        this._updateInfo();

        const sys = this.map;
        if (!sys || !sys.star) {
            toast('No system data');
            return;
        }

        //do the display
        RogueSystem(this.map, this.display)

        toast(`System ${this.systemSeed} — ${this.map.planets.length} planets`);
        console.log(this.map);
    }

    _updateInfo() {
        const g = this.gui;
        const iC = this._infoControllers;

        // Folders
        this.sectorFolder ? this.sectorFolder.destroy() : null;
        this.systemFolder ? this.systemFolder.destroy() : null;
        this.infoFolder ? this.infoFolder.destroy() : null;
        this.viewFolder ? this.viewFolder.destroy() : null;

        this.infoFolder = g.addFolder('Info');
        if (this.view === 'sector' && this.map) {
            const sf = this.sectorFolder = g.addFolder('Sector');
            sf.add(this, 'sectorSeed').name('Seed').onFinishChange(v => this._renderSector());
            sf.add(this, 'nHab', 0, 20, 1).name('# Habitable').onChange(v => this._renderSector());
            sf.add(this, 'totalSystems', 20, 150, 2).name('# Total Systems').onChange(v => this._renderSector());
        }
        else if (this.view === 'system' && this.currentSystem) {

        }
    }

    // ── Click ──────────────────────────────────────────────────────
    _onClick(ev) {
        if (!this.display) return;
        const container = this.display.getContainer();

        const [x, y] = this.display.eventToPosition(ev);
        const obj = this.map.tiles.get([x, y].join(','));

        if (this.view === 'sector' && obj) {
            this.map = obj;
            this.systemSeed = obj.seed;
            toast(`Jumping to ${obj.name || 'system ' + obj.seed}`);
            this._renderSystem();
        } else if (this.view === 'system' && obj) {
            console.log(obj);
            if (obj.parent) {
                toast(`Planet ${obj.i + 1} — HI ${obj.HI}`);
            }
            else {
                toast(`Star - ${obj.role}`);
            }
        }
    }
}

// ── Boot ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    App = new RogueApp();
    App.init().catch(err => {
        console.error(err);
        toast('Error: ' + err.message);
    });
});
