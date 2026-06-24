# Agent Notes

## Three.js

- Importmap in index.html: `three@0.184.0`, `three/addons/` for OrbitControls
- No bundler; bare CDN imports via importmap

## Engine (`src/engine/`)

All generation and Three.js rendering code lives under `src/engine/`:

| Path | Purpose |
| ---- | ------- |
| `render/threeHost.js` | Three.js rendering host (galaxy/sector/system views) |
| `render/engineAdapter.js` | World Engine procedural mesh adapter |
| `render/colormap-texture.js` | Three.js DataTexture wrapper for WE biome colormaps |
| `render/shaders.js` | WE ShaderMaterials (planet surface, lines, overlays, gas giant, clouds) |
| `render/sun-shaders.js` | WE star/sun shaders (3D noise sphere, camera-facing glow) |
| `render/renderer.js` | WE Three.js renderer (scene, camera, draw pipeline, overlays) |
| `constants/astrophysics.js` | Star/planet physics data & functions |
| `constants/data.js` | Static data (colors, animals, elements) |
| `constants/colormap.js` | WE 64×64 RGBA biome colormap per planet type |
| `constants/defaults.js` | WE shared defaults (seeds, spectral colors, gas giant params) |
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
| `system/` | System (`starSystem.js`), Planets/Moons (`planet.js`), WE planet gen (`planet.js`), WE sphere mesh (`sphere-mesh.js`) |

UI code stays in `src/UI/` and `src/UI.js`.

### Engine Modularity

Engine files under `src/engine/` are standalone — they must NOT import from `render/threeHost.js` or reference `App` directly. Rendering is wired externally via callbacks (see Callback Schema below). Only `main.js` imports both engine classes and Three.js rendering functions and bridges them.

## Three Host (`src/engine/render/threeHost.js`)

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

World Engine source files are now vendored directly into the project:

| Source | Location |
| ------ | -------- |
| Planet generation core (`planet.js`) | `src/engine/system/planet.js` |
| Sphere mesh (`sphere-mesh.js`) | `src/engine/system/sphere-mesh.js` |
| Shared defaults (`defaults.js`) | `src/engine/constants/defaults.js` |
| Colormaps (`colormap.js`) | `src/engine/constants/colormap.js` |
| Population simulation (`world-population.js`) | `src/engine/peoples/world-population.js` |
| Shader materials (`shaders.js`, `sun-shaders.js`) | `src/engine/render/` |
| Renderer (`renderer.js`, `colormap-texture.js`) | `src/engine/render/` |
| Vendor libs (`redblob.lib.js`, `aleaPRNG-1.1.js`) | `lib/` |

- Uses singleton state (`mesh`, `map`, `quadGeometry`) — generate one planet at a time
- Requires Three.js importmap in index.html (three@0.184.0)
- `setSeed(n)`, `setN(n)`, `setPlanetType(str)`, `generateMesh()`, `rebuildColormapTexture(type)`, `createPlanetSurfaceMaterial()`
- Gas giants: `createGasGiantMaterial({...})`
- Sun shader: `generateSunSphereMaterial()`, `generateSunGlowGeometry()`, `createSunGlowMaterial()`

## Engine Adapter (`src/engine/render/engineAdapter.js`)

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

## Engine Design Constraints

Engine files under `src/engine/` are standalone and modular — they must NOT directly reference `App`, import from `render/threeHost.js`, or depend on any UI/application layer.

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

When `display()` is called on a class, it invokes `this._display(this, events)` where `events` contains click handlers that call `this._onClick(this, eventType, data)`. This allows the app layer (in `main.js`) to wire in the threeHost view functions without the engine classes knowing about them.

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

## Interaction Flow

1. **Galaxy click** → raycaster hits z=0 plane → `onSectorClick(gx, gy)` (from `Galaxy._display`) → `Galaxy._onClick('galaxySectorClick')` → `main.js` handler calls `App.getSector()`
2. **Sector star click** → sprite raycaster hit → `onStarClick(system)` (from `MajorSector._display`) → `MajorSector._onClick('sectorStarClick')` → `main.js` updates info + GUI
3. **System planet click** → raycaster walks parent chain for `userData.planet` → `onPlanetClick(planet, group)` (from `System._display`) → `System._onClick('systemPlanetClick')` → `main.js` sets up `planet._upgradeCallback`, updates info + GUI, calls `upgradeSystemPlanet()` + `zoomToPlanet()`

## Key Dependencies (global)

- `window.Chance` — set by `chance.slim.js` side-effect import in `main.js`
- `window._` — set by `mixins.js` (provides `_.fromN`, `_.clamp`, `_.html`, etc.)
- `window.d3` — set by `<script src="lib/d3.v7.min.js">` in `index.html` (used by `setGradients` for `d3.color` and `SetVoronoi` for `d3.geoVoronoi`)
