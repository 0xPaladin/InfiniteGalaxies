# Agent Notes

## Three.js

- Importmap in index.html: `three@0.184.0`, `three/addons/` for OrbitControls
- No bundler; bare CDN imports via importmap

## Engine (`src/engine/`)

All generation and Three.js rendering code lives under `src/engine/`:

| Path | Purpose |
| ---- | ------- |
| `render/galaxy-render.js` | Three.js rendering host (galaxy/sector/system views) |
| `render/planet-render.js` | World Engine procedural mesh adapter + renderer combined |
| `render/planet-shaders.js` | WE ShaderMaterials (planet surface, lines, overlays, gas giant, clouds) |
| `render/sun-shaders.js` | WE star/sun shaders (3D noise sphere, camera-facing glow) |
| `constants/astrophysics.js` | Star/planet physics data & functions |
| `constants/data.js` | Static data (colors, animals, elements) |
| `constants/colormap.js` | WE 64×64 RGBA biome colormap per planet type |
| `constants/defaults.js` | WE shared defaults (seeds, spectral colors, gas giant params) |
| `constants/sphere-mesh.js` | WE Fibonacci sphere mesh + Delaunay triangulation |
| `peoples/cultures.js` | Culture generation (Game of Life) |
| `peoples/factions.js` | Faction generation |
| `peoples/people.js` | People/race generation |
| `peoples/world-population.js` | WE population simulation (cultures, states, burgs, provinces) |
| `region/region.js` | Region generation |
| `poi.js` | Points of interest generation |
| `random.js` | Random utilities |
| `random_name.js` | Name generation |
| `mixins.js` | Lodash mixins (`window._`) |
| `galaxy/` | Galaxy (`galaxy.js`) and MajorSector (`sector.js`) classes |
| `system/` | System (`starSystem.js`), Planets/Moons (`planet.js`), WE planet gen (`we-planet.js`) |

UI code stays in `src/UI/` and `src/UI.js`.

### Engine Modularity

Engine files under `src/engine/` are standalone — they must NOT import from `render/galaxy-render.js` or reference `App` directly. Rendering is wired externally via callbacks (see Callback Schema below). Only `main.js` imports both engine classes and Three.js rendering functions and bridges them.

## Galaxy Render (`src/engine/render/galaxy-render.js`)

Central rendering controller managing three view modes:

| View   | Camera                                 | Controls                            | Content                                                                           |
| ------ | -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| galaxy | Perspective 60° FOV, 45° polar locked  | OrbitControls, min/max polar locked | BufferGeometry star field (15k points), culture claim InstancedMesh, crosshair    |
| sector | Orthographic, centered frustum         | OrbitControls, zoom 0.5–20          | Grid lines, star sprites (raycaster-pickable), crosshair                          |
| system | Perspective, positioned for planet row | OrbitControls, min/max distance     | Full LOD star group (World Engine), planet meshes at medium LOD, moons at low LOD |

Each view clears prior state: `clearView()` disposes star groups, planet groups, removes click listeners, and empties `viewGroup`.

Crosshair (`setCrosshair()`) draws XZ axis lines; sector view adds a Y (depth) line. Galaxy view uses a large range (200k), sector view offsets by -500 to center the 0..1000 LY range.

Resize (`resizeView()`) handles orthographic frustum recalculation for sector view.

## World Engine Integration

World Engine source files are vendored directly into the project:

| Source | Location |
| ------ | -------- |
| Planet generation core (`we-planet.js`) | `src/engine/system/we-planet.js` |
| Sphere mesh (`sphere-mesh.js`) | `src/engine/constants/sphere-mesh.js` |
| Shared defaults (`defaults.js`) | `src/engine/constants/defaults.js` |
| Colormaps (`colormap.js`) | `src/engine/constants/colormap.js` |
| Population simulation (`world-population.js`) | `src/engine/peoples/world-population.js` |
| Shader materials (`planet-shaders.js`, `sun-shaders.js`) | `src/engine/render/` |
| Vendor libs (`redblob.lib.js`, `aleaPRNG-1.1.js`) | `lib/` |

- Uses singleton state (`mesh`, `map`, `quadGeometry`) — generate one planet at a time
- Requires Three.js importmap in index.html (three@0.184.0)
- `generateMesh(params)` accepts `{ seed, N, nPlates, jitter, waterLevel, tempOffset, rainOffset }` — all singleton setters removed
- Unified `generateRockyMap(opts, params)` replaces `generateEarthlikeMap`, `generateBarrenMap`, `generateHostileMap`, `generateGasGiantMap`; opts control `{ oceanFraction, moistureMin, moistureMax, hasRivers, hasVolcanoes, hasDomes }`
- `generateSunMap(params)`, `generateAirlessMap(params)` accept climate offset params
- Gas giants: `createGasGiantMaterial({...})`
- Sun shader: `generateSunSphereMaterial()`, `generateSunGlowGeometry()`, `createSunGlowMaterial()`

## Planet Render (`src/engine/render/planet-render.js`)

Bridges the InfiniteGalaxies data model to the World Engine API:

| Export                                  | Description                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createStarGroup(starData, seed)` | Full LOD star group: sphere + glow meshes with shader uniforms. Returns `THREE.Group` with `__starState` userData |
| `createPlanetMesh(planet, lod)`         | Generates planet mesh at specified LOD using WE procedural terrain. Returns `THREE.Group` with planet mesh + glow sprite          |
| `upgradePlanetMesh(group, planet, cb)`  | Regenerates planet mesh at N=20000 (high), swaps geometry/material, disposes old resources                                        |
| `createMoonMesh(moon, lod)`             | Moon at specified LOD (default low). Generates as `airless` type                                                                  |
| `createGasGiantMesh(planet, config)`    | Gas giant with `createGasGiantMaterial()` using `_gradient` colors from `System.setGradients()`                                   |
| `createPlanetGlowSprite(color, radius)` | Radial gradient sprite for atmospheric glow                                                                                       |
| `disposeStarGroup(group)`               | Disposes all materials and geometries in `__starState`                                                                            |
| `disposePlanetGroup(group)`             | Disposes mesh, glow sprite, colormap texture                                                                                      |
| `updateStarUniforms(group, camera)`     | Updates `uTime`, `uCamPos`, `uViewProjection`, `uCamUp` on all star shader materials                                              |
| `getPlanetEngineType(planet)`           | Maps HI + classification to WE planet type string                                                                                 |

## LOD Tiers

| Tier   | N (regions) | Sphere Segs | Used For                                         |
| ------ | ----------- | ----------- | ------------------------------------------------ |
| low    | 1000        | 12          | Moons                                            |
| medium | 3000        | 20          | Planets in system view                           |
| high   | 20000       | 48          | Planet detail on click (via `upgradePlanetMesh`) |

## Planet Type Mapping

| Condition               | WE Planet Type                                                 |
| ----------------------- | -------------------------------------------------------------- |
| HI 1–2                  | `earthlike`                                                    |
| HI 3–4                  | `barren`                                                       |
| HI 5+                   | `airless`                                                      |
| gas giant / brown dwarf | `gasgiant` (procedural shader via `createGasGiantMaterial`) |

## Planetoid WE Methods (`src/engine/system/planet.js`)

`Planetoid` (base class for `Planet` and `Moon`) has three methods that encapsulate World Engine calls:

| Method | Description |
| ------ | ----------- |
| `getPlanetEngineType()` | Maps HI + classification to WE planet type string (duplicates `planet-render`'s standalone export for encapsulation) |
| `_seedToNum()` | Converts string seed to numeric seed for WE by summing char codes |
| `generatePlanet(opts)` | Calls `setPlanetType`, `setBarrenSubtype`, then `generateMesh({ seed, N, nPlates, jitter, waterLevel, tempOffset, rainOffset })`; stores results in `this._mesh`, `this._map`, `this._quadData`, `this._engineType` |

## we-planet.js Refactor (`src/engine/system/we-planet.js`)

- All singleton state removed: `_seed`, `N`, `P`, `jitter`, `tempOffset`, `rainOffset`, `waterLevel` and their getter/setter exports no longer exist
- `generateMesh(params)` now accepts `{ seed, N, nPlates, jitter, waterLevel, tempOffset, rainOffset }` as a single parameter object
- `generateRockyMap(opts, params)` replaces `generateEarthlikeMap`, `generateBarrenMap`, `generateHostileMap`, `generateGasGiantMap`:
  - `opts` controls `{ oceanFraction, moistureMin, moistureMax, hasRivers, hasVolcanoes, hasDomes }`
  - `params` passes through climate offsets (`waterLevel`, `tempOffset`, `rainOffset`)
- Colormap texture creation (`colormap-texture.js`) inlined into `planet-render.js` as `makeDataTexture()`
- `shaders.js` renamed to `planet-shaders.js`
- Sphere mesh moved from `system/sphere-mesh.js` to `constants/sphere-mesh.js`

## Engine Design Constraints

Engine files under `src/engine/` are standalone and modular — they must NOT directly reference `App`, import from `render/galaxy-render.js`, or depend on any UI/application layer.

### Callback Schema

Engine classes accept callbacks via constructor opts or direct property assignment. Each callback receives `self` (the instance) as the first argument so the consumer can identify which object triggered the call.

| Class      | Callback       | Signature                                                      | Set by `main.js` to                              |
| ---------- | -------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `Galaxy`   | `_display`     | `(self, events)` — `events: { onSectorClick(gx, gy) }`        | `setGalaxyView(self, events)`                    |
|            | `_onClick`     | `(self, event, data)`                                          | Handle `galaxySectorClick`                       |
|            | `_setCrosshair`| `(x, y)`                                                       | `setCrosshair(x, y)`                             |
|            | `_save`        | `(data)`                                                       | `App.active` + `DB.setItem`                      |
| `MajorSector` | `_display`  | `(self, events)` — `events: { filter, onStarClick(system) }`  | `setSectorView(self, events)`                    |
|            | `_onClick`     | `(self, event, data)`                                          | Handle `sectorStarClick`                         |
|            | `_setCrosshair`| `(x, y, z)`                                                     | `setCrosshair(x, y, z)`                          |
| `System`   | `_display`     | `(self, events)` — `events: { onPlanetClick(planet, group) }`  | `setSystemView(self, events)`                    |
|            | `_onClick`     | `(self, event, data)`                                          | Handle `systemDisplay` / `systemPlanetClick`     |

When `display()` is called on a class, it invokes `this._display(this, events)` where `events` contains click handlers that call `this._onClick(this, eventType, data)`. This allows the app layer (in `main.js`) to wire in the galaxy-render view functions without the engine classes knowing about them.

### Propagation

Child objects inherit callbacks from their parent when not explicitly passed:
- `MajorSector.refresh()` passes `{ onClick: this._onClick, display: this._display }` to each `new System()` it creates
- `System` derives `galaxySeed` from `opts.parent.galaxy.seed` when not provided

### Constructor Parameters

| Class        | Key non-standard opts                                       |
| ------------ | ----------------------------------------------------------- |
| `Galaxy`     | `onClick`, `display`, `save`, `setCrosshair`, `app`         |
| `MajorSector`| `onClick`, `display`, `setCrosshair`, `galaxy`, `saved`     |
| `System`     | `onClick`, `display`, `parent`, `galaxySeed`                |

The `galaxy` opt on MajorSector is a data reference (for accessing `_sectors`, `_cultures`, seed), not a UI dependency. The `app` opt on Galaxy is for backward compat with Region/Faction/POI chains (set by consumer, not the engine).

## Save Architecture

Only the Galaxy view has a "Save" button. Sectors and Systems have "To Save" checkboxes that directly toggle `toSave` on the engine object:

| Object | `toSave` default | Located in |
| ------ | ---------------- | ---------- |
| `MajorSector` | `false` (`sector.js:20`) | `_mods.sectors` (keyed by `"x,y"`) |
| `System` | `false` (`starSystem.js:12`) | `_mods.systems` (keyed by full seed `"galaxySeed:sectorId:sysSeed"`) |

### Save Flow

1. User clicks **Save** in galaxy GUI → `galaxyUI.js:17` → `galaxy.data` (getter, `galaxy.js:46`)
2. `Galaxy.data` iterates `this._sectors`, checks `S.toSave` for sectors and `sy.toSave` for systems
3. Returns `{ seed, radius, twist, culture*, sectors: {...}, systems: {...} }` — only flagged objects included
4. Stored via `_save` callback → `App.active[galaxy.seed] = data` + `DB.setItem(galaxy.seed, App.active)`

### Load Flow

1. `load(id)` → `DB.getItem(id)` → `new Galaxy(saved[id])` — constructor stores `opts.sectors`/`opts.systems` into `_mods`
2. `getSector(x, y)` reads `this.galaxy._mods.sectors[id]` first (new nested format), falls back to `this.active[id]` (legacy), then `{}`
3. `MajorSector.refresh()` reads `this.galaxy._mods.systems` — matches system seeds to sector ID, restores saved systems and their children (planets/moons flow through `system.data.children` → `opts.children` chain)
4. `mapActive()` populates GUI load dropdowns from `data` top-level keys AND `_mods.sectors`/`_mods.systems` keys

### Save Button Locations

| View    | Save button | To Save checkbox |
| ------- | ----------- | ---------------- |
| Galaxy  | `galaxyUI.js:52` | — |
| Sector  | — | `sectorUI.js:33` (binds `sector.toSave`) |
| System  | — | `systemUI.js:27` (binds `system.toSave`) |
| Planet  | — | — |

## Interaction Flow

1. **Galaxy click** → raycaster hits z=0 plane → `onSectorClick(gx, gy)` (from `Galaxy._display`) → `Galaxy._onClick('galaxySectorClick')` → `main.js` handler calls `App.getSector()`
2. **Sector star click** → sprite raycaster hit → `onStarClick(system)` (from `MajorSector._display`) → `MajorSector._onClick('sectorStarClick')` → `main.js` updates info + GUI
3. **System planet click** → raycaster walks parent chain for `userData.planet` → `onPlanetClick(planet, group)` (from `System._display`) → `System._onClick('systemPlanetClick')` → `main.js` sets up `planet._upgradeCallback`, updates info + GUI, calls `upgradeSystemPlanet()` + `zoomToPlanet()`

## Key Dependencies (global)

- `window.Chance` — set by `chance.slim.js` side-effect import in `main.js`
- `window._` — set by `mixins.js` (provides `_.fromN`, `_.clamp`, `_.html`, etc.)
- `window.d3` — set by `<script src="lib/d3.v7.min.js">` in `index.html` (used by `setGradients` for `d3.color` and `SetVoronoi` for `d3.geoVoronoi`)
