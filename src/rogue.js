// Rogue Galaxies — plain JS entry point
// No Preact, no Chance. Uses ROT for ASCII display, lil-gui for controls,
// localforage for persistence, PRNG for randomness.

import { PRNG } from './engine/random.js';
import { generateSector } from './engine/galaxy/sector.js';
import { generateSystem } from './engine/galaxy/system.js';

// ── Rogue Map─────────────────────────────────────────────────────────
import {RogueSector} from './engine/rogue/sector.js';
import {RogueSystem} from './engine/rogue/system.js';

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
    }

    // ── Lifecycle ──────────────────────────────────────────────────
    async init() {
        this.display = new ROT.Display({
            width: 100,
            height: 40,
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
        this.gui = new lil.Gui({ title: 'Rogue Galaxies' });
        this._buildGui();

        // Load saves
        this.active = (await loadGame()) || {};
        this._populateLoadDropdown();

        // Generate initial sector
        this.sectorSeed = Math.floor(ROT.RNG.uniform() * 1e9);
        this._renderSector();
    }

    _resizeHandler() {
        if (this.display) this.display.resize();
    }

    // ── GUI ────────────────────────────────────────────────────────
    _buildGui() {
        const g = this.gui;

        // View folder
        const viewFolder = g.addFolder('View');
        viewFolder.add(this, 'view', ['sector', 'system']).name('Mode').onChange((v) => {
            if (v === 'system' && this.currentSystem) {
                this._renderSystem();
            } else {
                this._renderSector();
            }
        });

        // Generate folder
        const genFolder = g.addFolder('Generate');
        genFolder.add(this, '_genNewSector').name('New Sector');
        genFolder.add(this, '_genNewSystem').name('New System');
        genFolder.add(this, '_saveGame').name('Save');
        genFolder.add(thRogueSectoris, '_loadGame').name('Load');
        genFolder.add(this, '_deleteSave').name('Delete Save');

        // Info
        const infoFolder = g.addFolder('Info');
        this._infoControllers = {};
        this._infoControllers.systemName = infoFolder.add({ v: '—' }, 'v').name('System').disable();
        this._infoControllers.starType = infoFolder.add({ v: '—' }, 'v').name('Star Type').disable();
        this._infoControllers.planets = infoFolder.add({ v: '—' }, 'v').name('Planets').disable();
        this._infoControllers.hi = infoFolder.add({ v: '—' }, 'v').name('HI').disable();
    }

    _genNewSector() {
        this.sectorSeed = Math.floor(ROT.RNG.uniform() * 1e9);
        this._renderSector();
        toast('New sector generated');
    }

    _genNewSystem() {
        this.systemSeed = Math.floor(ROT.RNG.uniform() * 1e9);
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
        this.view = 'sector';
        this.currentSystem = null;
        this.map = generateSector(this.sectorSeed, {
            bounds: { w: 100, h: 100, d: 100 }
        });

        this.display.clear();
        this._updateInfo();

        const {map, glyphs } = RogueSector(this.map);

        // Draw star field
        for (const {xy, mapobj} of map) {
            const [x,y] = xy.split(".").map(Number);
            const {glyph} = mapobj;
            const {fg,bg} = glyphs[glyph];

            this.display.draw(x, y, glyph, fg, bg);
        }

        // Crosshair
        this.display.draw(cx, cy, '+', '#fff');
        toast(`Sector ${this.sectorSeed} — ${systems.length} systems`);
    }

    _renderSystem() {
        this.view = 'system';
        this.map = generateSystem(this.systemSeed || this.sectorSeed, {});
        this.currentSystem = this.map;

        this.display.clear();
        this._updateInfo();

        const sys = this.map;
        if (!sys || !sys.star) {
            toast('No system data');
            return;
        }

        const cx = 50;
        const cy = 20;

        // Draw star
        const st = sys.star.primary;
        let glyph = '*';
        let fg = '#ff0';
        if (st && st.spectral) {
            const s = st.spectral;
            if (s[0] === 'O' || s[0] === 'B') { glyph = '*'; fg = '#9af'; }
            else if (s[0] === 'A' || s[0] === 'F') { glyph = '*'; fg = '#bff'; }
            else if (s[0] === 'G' || s[0] === 'K') { glyph = '*'; fg = '#ffd'; }
            else { glyph = '·'; fg = '#f80'; }
        }
        this.display.draw(cx, cy, glyph, fg);

        // Draw planets in a row
        const planets = sys.planets || [];
        const spacing = 8;
        const baseX = 10;
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            const px = baseX + i * spacing;
            const py = cy + 6;

            let pglyph = '∘';
            let pfg = '#aaa';
            if (p.classification === 'gas giant') {
                pglyph = '○';
                pfg = '#8cf';
            } else if (p.HI >= 3 && p.HI <= 4) {
                pglyph = '●';
                pfg = '#fc0';
            } else if (p.HI >= 1 && p.HI <= 2) {
                pglyph = '●';
                pfg = '#0f0';
            } else {
                pglyph = '·';
                pfg = '#666';
            }
            this.display.draw(px, py, pglyph, pfg);
            // Label
            this.display.draw(px, py + 2, String(i + 1), '#fff');
        }

        toast(`System ${this.systemSeed} — ${planets.length} planets`);
    }

    _updateInfo() {
        if (!this._infoControllers) return;
        if (this.view === 'sector' && this.map) {
            this._infoControllers.systemName.setValue('—');
            this._infoControllers.starType.setValue('—');
            this._infoControllers.planets.setValue(String(this.map.systems.length));
            this._infoControllers.hi.setValue('—');
        } else if (this.view === 'system' && this.currentSystem) {
            const sys = this.currentSystem;
            this._infoControllers.systemName.setValue(String(this.systemSeed));
            this._infoControllers.starType.setValue(sys.star && sys.star.primary ? sys.star.primary.spectral || '—' : '—');
            this._infoControllers.planets.setValue(String((sys.planets || []).length));
            this._infoControllers.hi.setValue('—');
        }
    }

    // ── Click ──────────────────────────────────────────────────────
    _onClick(ev) {
        if (!this.display) return;
        const container = this.display.getContainer();
        const rect = container.getBoundingClientRect();
        const x = Math.floor((ev.clientX - rect.left) / rect.width * this.display._options.width);
        const y = Math.floor((ev.clientY - rect.top) / rect.height * this.display._options.height);

        if (this.view === 'sector' && this.map) {
            this._onSectorClick(x, y);
        } else if (this.view === 'system' && this.currentSystem) {
            this._onSystemClick(x, y);
        }
    }

    _onSectorClick(x, y) {
        const { systems, H, W } = this.map;
        const cx = Math.floor(W / 2);
        const cy = Math.floor(H / 2);

        // Find nearest star
        let best = null;
        let bestDist = Infinity;
        for (const s of systems) {
            const sx = Math.floor(s.pos.x + cx);
            const sy = Math.floor(s.pos.y + cy);
            const dx = sx - x;
            const dy = sy - y;
            const d = dx * dx + dy * dy;
            if (d < bestDist) {
                bestDist = d;
                best = s;
            }
        }

        if (best && bestDist < 25) {
            this.systemSeed = best.seed;
            this._renderSystem();
            toast(`Jumping to ${best.name || 'system ' + best.seed}`);
        }
    }

    _onSystemClick(x, y) {
        // Detect planet click
        const sys = this.currentSystem;
        if (!sys || !sys.planets) return;
        const spacing = 8;
        const baseX = 10;
        const cy = 20;
        for (let i = 0; i < sys.planets.length; i++) {
            const px = baseX + i * spacing;
            const py = cy + 6;
            if (Math.abs(px - x) < 4 && Math.abs(py - y) < 4) {
                toast(`Planet ${i + 1} — HI ${sys.planets[i].HI}`);
                return;
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
