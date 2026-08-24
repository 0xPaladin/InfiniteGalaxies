// Rogue Galaxies — plain JS entry point
// No Preact, no Chance. Uses ROT for ASCII display, lil-gui for controls,
// localforage for persistence, PRNG for randomness.
//
// This is the only "glue" file allowed to call both a generator and a
// renderer (IMPLEMENTATION_PLAN.md §0). Generators never draw; renderers
// never generate.

import "./engine/mixins.js"
import { GUI } from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

import { generateGalaxy } from './engine/galaxy/galaxy_gen.js';
import { generateSector } from './engine/galaxy/sector.js';
import { generateSurface } from './engine/planet/types.js';
import { generateRegion } from './engine/planet/region.js';
import { initPopulation, advancePopulation, populationView, buildSnapshotIndex } from './engine/population/sim.js';
import { cultureContextFor } from './engine/population/context.js';
import { generatePlanetHabitation, generateSystemHabitation } from './engine/population/habitation.js';
import { generateNativeCulture } from './engine/population/native.js';

import { RogueGalaxy } from './engine/rogue/galaxy.js';
import { RogueSector } from './engine/rogue/sector.js';
import { RogueSystem } from './engine/rogue/system.js';
import { RoguePlanet } from './engine/rogue/planet.js';
import { RogueRegion } from './engine/rogue/region.js';

const PLANET_OVERLAYS = ['biome', 'elevation', 'temperature', 'moisture'];

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
// Only the seed + navigation path is ever persisted — never generated
// content. Reloading replays the path through the seed chain, which is
// also the sharpest available test of determinism (IMPLEMENTATION_PLAN.md §2).
async function saveGame(data) {
    await localforage.setItem(DB_KEY, data);
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

// ── App ──────────────────────────────────────────────────────────────
class RogueApp {
    constructor() {
        this.display = null;       // ROT.Display instance
        this.gui = null;           // lil-gui instance
        this.stack = [];           // [{level: 'galaxy'|'sector'|'system', data, index}]
        this.galaxySeed = null;
        this._resizeHandler = this._resizeHandler.bind(this);
        this._keyHandler = this._keyHandler.bind(this);

        // sector generation params (not yet biased by population — see
        // POPULATION_PLAN.md §9 step 5, deferred)
        this.nHab = 8;
        this.totalSystems = 100;

        this.planetOverlay = 'biome';

        // population sim (decision #1: Milky-Way scale) — generated once per
        // galaxy, alongside its sector grid; `popStep` scrubs through history.
        this.galaxyRadius = 50;
        this.popSteps = 40;
        this.population = null;
        this.popStep = 0;

        // The CultureContext (population/context.js) for whichever sector is
        // currently active — computed once on sector entry, read by every
        // level below it (system/planet/region habitation calls all share the
        // one sector's culture data; the sim has no finer resolution than that).
        this.currentCtx = null;
    }

    get top() { return this.stack[this.stack.length - 1]; }

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

        // Click handling (ROT-ASCII levels only — the d3-driven planet view wires
        // its own per-element click handlers directly, see _render()'s 'planet' branch)
        const container = this.display.getContainer();
        container.addEventListener('click', (ev) => this._onClick(ev));
        container.style.cursor = 'crosshair';

        // The d3 planet view's host — a sibling of #display, toggled visible only
        // at the 'planet' level (_setViewMode)
        this.planetHost = $('planetDisplay');

        // Resize / keys
        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('keydown', this._keyHandler);

        // lil-gui
        this.gui = new GUI({ title: 'Rogue Galaxies' });
        this._buildGui();

        // Restore or start fresh
        const saved = await loadGame();
        if (saved && saved.galaxySeed) {
            await this._restore(saved.galaxySeed, saved.path || [], saved.popStep);
        } else {
            this._genNewGalaxy();
        }
    }

    _resizeHandler() {
        if (this.display) this.display.resize();
    }

    _keyHandler(ev) {
        if (ev.key === 'Escape') this._back();
    }

    // ── GUI ────────────────────────────────────────────────────────
    _buildGui() {
        const g = this.gui;

        const genFolder = g.addFolder('Navigate');
        genFolder.add(this, '_genNewGalaxy').name('New Galaxy');
        genFolder.add(this, '_back').name('Back (Esc)');
        genFolder.add(this, '_saveGame').name('Save');
        genFolder.add(this, '_loadGame').name('Load');
        genFolder.add(this, '_deleteSave').name('Delete Save');

        const popFolder = g.addFolder('Population');
        popFolder.add({ fn: () => this._stepPopulation(-1) }, 'fn').name('◂ Step Back');
        popFolder.add({ fn: () => this._stepPopulation(1) }, 'fn').name('Step Forward ▸');

        this.infoFolder = g.addFolder('Info');
    }

    _genNewGalaxy() {
        this.galaxySeed = crypto.randomUUID();
        this._enterGalaxy();
        this._persist();
        toast('New galaxy generated');
    }

    _saveGame() {
        this._persist().then(() => toast('Saved'));
    }

    async _loadGame() {
        const data = await loadGame();
        if (data && data.galaxySeed) {
            await this._restore(data.galaxySeed, data.path || [], data.popStep);
            toast('Loaded');
        } else {
            toast('No save found');
        }
    }

    _deleteSave() {
        deleteSave();
    }

    // ── Navigation (push/pop a view stack; each level is generate-then-render) ──
    _enterGalaxy() {
        const data = generateGalaxy(this.galaxySeed, { radius: this.galaxyRadius });
        // `_popState` is the LIVE, extensible simulation (sim.js's initPopulation/
        // advancePopulation) — `this.population` is just the plain snapshot view of
        // it (populationView), same shape every renderer/context already expects.
        this._popState = initPopulation(this.galaxySeed, { radius: this.galaxyRadius });
        advancePopulation(this._popState, this.popSteps);
        this.population = populationView(this._popState);
        this.popStep = this.population.steps; // default to the most-developed generation computed so far
        this.stack = [{ level: 'galaxy', data }];
        this._render();
    }

    // Step forward has no ceiling — stepping past what's been computed so far
    // extends the live simulation (sim.js's advancePopulation) instead of
    // recomputing from scratch, so scrubbing far past the original cap stays cheap.
    _stepPopulation(delta) {
        if (!this._popState) return;
        const next = Math.max(0, this.popStep + delta);
        if (next === this.popStep) return;
        if (next > this._popState.step) {
            advancePopulation(this._popState, next);
            this.population = populationView(this._popState);
        }
        this.popStep = next;
        if (this.top && this.top.level === 'galaxy') this._render();
        this._persist();
    }

    _enterSector(sectorStub) {
        const snapshot = this.population ? this.population.history[this.popStep] : null;
        const popIndex = snapshot ? buildSnapshotIndex(snapshot) : null;
        this.currentCtx = cultureContextFor(popIndex, snapshot ? snapshot.cultures : {}, sectorStub.gx, sectorStub.gy);

        const data = generateSector(sectorStub.seed, {
            bounds: { r: 50 },
            nHab: this.nHab,
            nSystems: this.totalSystems,
            gx: sectorStub.gx,
            gy: sectorStub.gy,
            ctx: this.currentCtx
        });
        this.stack.push({ level: 'sector', data });
        this._render();
        this._persist();
    }

    _enterSystem(system) {
        // Star-level megastructures (§13.0b) — rolled here rather than baked
        // into the sector's system list, so systems nobody visits never pay
        // for it (IMPLEMENTATION_PLAN.md's "generate only visited children").
        const habitation = generateSystemHabitation(system.seed, this.currentCtx);
        this.stack.push({ level: 'system', data: system, habitation });
        this._render();
        this._persist();
    }

    // `planet` here is any generatePlanet()/generateMoon() output — moons are
    // structurally the same shape, so descending into a gas giant's moon works
    // through this same entry point (see engine/rogue/planet.js's moon view).
    async _enterPlanet(planet) {
        const surface = await generateSurface(planet);
        const habitation = generatePlanetHabitation(planet._seed, this.currentCtx, surface);
        const native = generateNativeCulture(planet._seed, this.currentCtx, surface);
        this.stack.push({ level: 'planet', data: surface, planet, habitation, native });
        this._render();
        this._persist();
    }

    // `surface` comes from the current top-of-stack 'planet' frame — a region is
    // one surface cell (POPULATION_PLAN.md: "each planet cell is a region"),
    // addressed by its index into that surface's cells, not a coordinate grid
    // (see engine/planet/region.js). `habitats` lets the region surface real
    // sites instead of inventing them (POPULATION_PLAN.md §14.2).
    async _enterRegion(cellIndex) {
        const surface = this.top.data;
        const habitats = this.top.habitation ? this.top.habitation.habitats : [];
        const region = await generateRegion(surface, cellIndex, { habitats, ctx: this.currentCtx });
        this.stack.push({ level: 'region', data: region });
        this._render();
        this._persist();
    }

    // Re-run the current sector's generator with updated params (nHab/totalSystems edits).
    _regenerateSector() {
        if (!this.top || this.top.level !== 'sector') return;
        const { seed, gx, gy } = this.top.data;
        const data = generateSector(seed, {
            bounds: { r: 50 },
            nHab: this.nHab,
            nSystems: this.totalSystems,
            gx, gy,
            ctx: this.currentCtx
        });
        this.stack[this.stack.length - 1] = { level: 'sector', data };
        this._render();
        this._persist();
    }

    _back() {
        if (this.stack.length <= 1) return;
        this.stack.pop();
        this._render();
        this._persist();
    }

    async _restore(galaxySeed, path, popStep) {
        this.galaxySeed = galaxySeed;
        this._enterGalaxy(); // resets popStep to the default cap
        if (popStep != null) {
            const target = Math.max(0, popStep);
            if (target > this._popState.step) {
                advancePopulation(this._popState, target);
                this.population = populationView(this._popState);
            }
            this.popStep = target;
        }
        if (!path.length) this._render(); // still at galaxy level — reflect the restored step
        for (const step of path) {
            if (step.level === 'sector') {
                const stub = this.top.data.sectors.find(s => s.gx === step.gx && s.gy === step.gy);
                if (!stub) break;
                this._enterSector(stub);
            } else if (step.level === 'system' && this.top.level === 'sector') {
                const sys = this.top.data.systems[step.index];
                if (!sys) break;
                this._enterSystem(sys);
            } else if (step.level === 'planet' && step.from === 'system' && this.top.level === 'system') {
                const planetObj = this.top.data.planets[step.index];
                if (!planetObj) break;
                await this._enterPlanet(planetObj);
            } else if (step.level === 'planet' && step.from === 'planet' && this.top.level === 'planet') {
                const moonObj = this.top.planet.moons[step.index];
                if (!moonObj) break;
                await this._enterPlanet(moonObj);
            } else if (step.level === 'region' && this.top.level === 'planet') {
                await this._enterRegion(step.cellIndex);
            } else {
                break;
            }
        }
    }

    async _persist() {
        await saveGame({ galaxySeed: this.galaxySeed, path: this._path(), popStep: this.popStep });
    }

    // Derive the persistable path (coords/indices only — never generated objects).
    _path() {
        const path = [];
        for (let i = 1; i < this.stack.length; i++) {
            const frame = this.stack[i];
            const prev = this.stack[i - 1];
            if (frame.level === 'sector') {
                path.push({ level: 'sector', gx: frame.data.gx, gy: frame.data.gy });
            } else if (frame.level === 'system') {
                path.push({ level: 'system', index: prev.data.systems.indexOf(frame.data) });
            } else if (frame.level === 'planet' && prev.level === 'system') {
                path.push({ level: 'planet', from: 'system', index: prev.data.planets.indexOf(frame.planet) });
            } else if (frame.level === 'planet' && prev.level === 'planet') {
                path.push({ level: 'planet', from: 'planet', index: prev.planet.moons.indexOf(frame.planet) });
            } else if (frame.level === 'region') {
                path.push({ level: 'region', cellIndex: frame.data.cellIndex });
            }
        }
        return path;
    }

    // ── Rendering ──────────────────────────────────────────────────
    // Only the 'planet' level renders via d3/SVG into #planetDisplay; every
    // other level draws into the shared ROT.Display (#display). Toggling which
    // container is visible is the only thing that needs to happen to switch —
    // both renderers already redraw their own content unconditionally each call.
    _setViewMode(level) {
        const rotVisible = level !== 'planet';
        $('display').style.display = rotVisible ? 'flex' : 'none';
        this.planetHost.style.display = rotVisible ? 'none' : 'flex';
    }

    _render() {
        if (!this.top) return;
        const { level, data } = this.top;

        this._setViewMode(level);
        this.display.clear();
        this._updateBreadcrumb();
        this._updateInfo();

        if (level === 'galaxy') {
            this.display.setOptions({ width: 100, height: 100, fontSize: 8 });
            const snapshot = this.population ? this.population.history[this.popStep] : null;
            const popIndex = snapshot ? buildSnapshotIndex(snapshot) : null;
            const cultures = this.population ? this.population.cultures : null;
            this.top.index = RogueGalaxy(data, this.display, { popIndex, cultures }).index;
            toast(`Galaxy — ${data.sectors.length} sectors — generation ${this.popStep}/${this.population?.steps ?? 0}`);
        } else if (level === 'sector') {
            this.display.setOptions({ width: 100, height: 100, fontSize: 8 });
            this.top.index = RogueSector(data, this.display).index;
            const habCount = (data.habitation && data.habitation.habitats.length) || 0;
            toast(`Sector ${data.gx},${data.gy} — ${data.systems.length} systems${habCount ? `, ${habCount} habitats` : ''}`);
        } else if (level === 'system') {
            this.top.index = RogueSystem(data, this.display).index;
            const mega = (this.top.habitation && this.top.habitation.habitats.length) || 0;
            toast(`${data.name || 'System'} — ${data.planets.length} planets${mega ? `, ${mega} stellar megastructure(s)` : ''}`);
        } else if (level === 'planet') {
            RoguePlanet(this.top.planet, data, this.planetHost, {
                overlay: this.planetOverlay,
                onCellClick: (cellIndex) => {
                    toast(`Descending to region ${cellIndex}...`);
                    this._enterRegion(cellIndex).catch(err => { console.error(err); toast('Error: ' + err.message); });
                },
                onMoonClick: (moon) => {
                    toast(`Descending to moon...`);
                    this._enterPlanet(moon).catch(err => { console.error(err); toast('Error: ' + err.message); });
                }
            });
            const habCount = (this.top.habitation && this.top.habitation.habitats.length) || 0;
            const nativeNote = this.top.native ? ` — native ${this.top.native.bioform} culture (TL ${this.top.native.tl})` : '';
            toast((data.type === 'gas giant'
                ? `Gas giant — ${(this.top.planet.moons || []).length} moons`
                : `${data.type} world — HI ${data.HI}`) + (habCount ? `, ${habCount} habitats` : '') + nativeNote);
        } else if (level === 'region') {
            this.top.index = RogueRegion(data, this.display).index;
            toast(`Region (${data.lon.toFixed(1)}°,${data.lat.toFixed(1)}°) — ${data.template} — ${data.sites.length} sites`);
        }
        console.log(this.top);
    }

    _updateBreadcrumb() {
        const el = $('breadcrumb');
        if (!el) return;
        const parts = this.stack.map(frame => {
            if (frame.level === 'galaxy') return 'GALAXY';
            if (frame.level === 'sector') return `Sector ${frame.data.gx},${frame.data.gy}`;
            if (frame.level === 'system') return frame.data.name || 'System';
            if (frame.level === 'planet') return frame.planet.kind === 'moon' ? 'Moon' : `Planet ${(frame.planet.i ?? 0) + 1}`;
            if (frame.level === 'region') return `Region (${frame.data.lon.toFixed(1)}°,${frame.data.lat.toFixed(1)}°)`;
            return frame.level;
        });
        el.textContent = parts.join(' ▸ ');
    }

    _updateInfo() {
        this.infoFolder ? this.infoFolder.destroy() : null;
        this.infoFolder = this.gui.addFolder('Info');

        const { level, data } = this.top;
        if (level === 'galaxy') {
            this.infoFolder.add({ v: data.sectors.length }, 'v').name('Sectors').disable();
            this.infoFolder.add({ v: `${this.popStep} / ${this.population?.steps ?? 0}` }, 'v').name('Generation').disable();
            if (this.population) {
                const living = Object.values(this.population.cultures).filter(c => c.bornStep <= this.popStep && (c.deadStep == null || c.deadStep > this.popStep));
                this.infoFolder.add({ v: living.length }, 'v').name('Living cultures').disable();
            }
        } else if (level === 'sector') {
            this.infoFolder.add(this, 'nHab', 0, 20, 1).name('# Habitable').onChange(() => this._regenerateSector());
            this.infoFolder.add(this, 'totalSystems', 20, 150, 2).name('# Total Systems').onChange(() => this._regenerateSector());
            this.infoFolder.add({ v: data.systems.length }, 'v').name('Systems').disable();
            if (this.currentCtx && this.currentCtx.cultureId != null) {
                this.infoFolder.add({ v: `${this.currentCtx.bioform} (TL ${this.currentCtx.tl})` }, 'v').name('Culture').disable();
                this.infoFolder.add({ v: this.currentCtx.tier }, 'v').name('Tier').disable();
            }
            this.infoFolder.add({ v: (data.habitation && data.habitation.habitats.length) || 0 }, 'v').name('Sector habitats').disable();
        } else if (level === 'system') {
            this.infoFolder.add({ v: data.name || data.seed }, 'v').name('Name').disable();
            this.infoFolder.add({ v: data.star.primary.spectral }, 'v').name('Spectral').disable();
            this.infoFolder.add({ v: data.star.multiplicity }, 'v').name('Multiplicity').disable();
            this.infoFolder.add({ v: data.planets.length }, 'v').name('Planets').disable();
            this.infoFolder.add({ v: (this.top.habitation && this.top.habitation.habitats.length) || 0 }, 'v').name('Stellar megastructures').disable();
        } else if (level === 'planet') {
            this.infoFolder.add({ v: data.type }, 'v').name('Type').disable();
            this.infoFolder.add({ v: data.HI }, 'v').name('HI').disable();
            if (data.type !== 'gas giant') {
                this.infoFolder.add(this, 'planetOverlay', PLANET_OVERLAYS).name('Overlay').onChange(() => this._render());
            } else {
                this.infoFolder.add({ v: (this.top.planet.moons || []).length }, 'v').name('Moons').disable();
            }
            this.infoFolder.add({ v: (this.top.habitation && this.top.habitation.habitats.length) || 0 }, 'v').name('Habitats').disable();
            if (this.top.native) {
                this.infoFolder.add({ v: `${this.top.native.bioform}, TL ${this.top.native.tl}, pop ~${this.top.native.population.toLocaleString()}` }, 'v').name('Native culture').disable();
            }
        } else if (level === 'region') {
            this.infoFolder.add({ v: `${data.lon.toFixed(1)}°, ${data.lat.toFixed(1)}°` }, 'v').name('Coords').disable();
            this.infoFolder.add({ v: data.template }, 'v').name('Template').disable();
            this.infoFolder.add({ v: data.sites.length }, 'v').name('Sites').disable();
            this.infoFolder.add({ v: data.features.length }, 'v').name('Features').disable();
        }
    }

    // ── Click ──────────────────────────────────────────────────────
    _onClick(ev) {
        if (!this.display || !this.top || !this.top.index) return;
        const [x, y] = this.display.eventToPosition(ev);
        const items = this.top.index.at(x, y);
        if (!items.length) return;

        const { level } = this.top;
        if (level === 'galaxy') {
            const sector = items[0];
            toast(`Jumping to sector ${sector.gx},${sector.gy}`);
            this._enterSector(sector);
        } else if (level === 'sector') {
            const obj = items[0];
            if (obj.star) {
                toast(`Jumping to ${obj.name || 'system ' + obj.seed}`);
                this._enterSystem(obj);
            } else {
                // a sector-level habitat (deep space station, capital ship, derelict,
                // pirate haven) — no system/planet underneath it, nothing to descend into
                toast(`${obj.type}${obj.population ? ` — pop ~${obj.population.toLocaleString()}` : ''}`);
            }
        } else if (level === 'system') {
            const obj = items[0];
            if (obj.kind === 'planet') {
                toast(`Descending to planet ${obj.i + 1}...`);
                this._enterPlanet(obj).catch(err => { console.error(err); toast('Error: ' + err.message); });
            } else {
                toast(`Star — ${obj.role}`);
            }
        } else if (level === 'region') {
            const obj = items[0];
            if (obj.kind) {
                // a site or feature — no drill-down past this (Phase 4 stops at regions)
                toast(`${obj.kind} — (${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`);
            } else {
                toast(`${obj.biome} — elev ${obj.elev}, moisture ${obj.moisture}`);
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
