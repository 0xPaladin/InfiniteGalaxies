# Infinite Galaxies — Implementation Plan (Phases 1 → 4: through Region generation)

> Companion to `VISION.md`. This document is the **buildable** counterpart: concrete files, function
> signatures, bug fixes, and acceptance criteria.
>
> **Scope:** Phase 1 (Rogue MVP) through Phase 4 (Region generation) — i.e. everything **up to but not
> including** the Phase 5 population effort. Phase 5 hooks are designed in (see §8) so the Conway sim can
> be dropped in without reworking the seed chain, but no population simulation is built here.
>
> **Buildings are cut from this plan's scope entirely** — see §0. They require a population signature to
> place and size meaningfully, and that signature doesn't exist until Phase 5. Building this plan builds
> nothing that would need to be thrown away or reworked once Phase 5 lands.

---

## 0. Hard rule: generation and display are separate, always

This governs every phase below, not just the new code — it's the one architectural rule this plan will
not compromise on for convenience.

- **A generator returns a plain data object.** No DOM, no `ROT.Display` calls, no canvas/WebGL handles,
  no closures over a renderer. `generateSector`, `generateSystem`, `generateSurface`, `generateRegion` —
  all of them — take a seed (+ opts) and return JSON-serializable data. `JSON.stringify(generateX(...))`
  must always succeed with no loss (round-trips back to an equivalent object). If it can't be
  `structuredClone`d, it's not a valid generator output.
- **A renderer is a pure function of that object.** `RogueSector(sector, display)` reads `sector`, draws,
  and — today — stashes a `tiles` Map back onto the object for click lookup. That's the one exception
  that's grandfathered in for Phase 1 (§3.2 formalizes it as a `TileIndex` returned alongside, not
  mutated in); **new renderers (planet, region) must not write back onto the generated object at all.**
  Click/hit-testing data comes back as a separate return value from the renderer, e.g.
  `RogueRegion(region, display) -> { index: TileIndex }`.
- **The same generated object must be renderable by more than one renderer without modification.** Rogue
  ASCII is the only renderer built in this plan, but the object shapes (`PlanetSurface`, region grids,
  sector/system data) are designed so an SVG or Three.js renderer could consume them later with zero
  changes to the generator. Concretely: renderers do not require or invent object shapes the generator
  didn't already produce — no "if rendering, compute X on the object first." If a renderer needs derived
  data (screen coords, glyph choice, color), it computes that itself, from the generic fields
  (`type`, `HI`, `biome`, `elev`, `pos`), and keeps it local.
  Practical test before any renderer PR: **could this same object be handed to a hypothetical SVG
  renderer with no changes to the generator file?** If not, something generation-specific leaked into the
  renderer's expectations of the object shape — push it back into the generator as a plain field.
- **Where this already breaks today, fix it in place rather than build around it:**
  - `RogueSystem` (`src/engine/rogue/system.js`) computes orbit *positions* — that's generation
    (layout), not display, and it's currently buggy (§1.3.2). Move position assignment into
    `generateSystem`/a layout step in `galaxy/system.js`, so the object already carries `{x, y}` (or
    polar `{au, angle}`) per body, and the renderer just projects+draws.
  - `RogueSector` mutates `sector.tiles` in place (§1.3.4) — acceptable for Phase 1 per the
    grandfather clause above, but slated to become a returned `TileIndex` in §3.2 so `sector` itself
    stays a pure data object.
- **App-layer code (`src/rogue.js`) is the only place allowed to call both a generator and a renderer in
  the same function** — it's the glue layer, not part of the engine.

---

## 1. Where the code actually is today

Audit of `rogue` branch as of this plan.

### 1.1 Working / keep

| File | State |
|---|---|
| `src/engine/random.js` | `PRNG` (alea) — the RNG source of truth. Solid. |
| `src/engine/galaxy/sector.js` | `generateSector(seed, opts)` → `{systems, seed, H, W, D}`. New standard. Works, has gaps (§1.3). |
| `src/engine/galaxy/system.js` | `generateSystem(seed, opts)` → `{seed, star, planets, HI}`. Works. |
| `src/engine/galaxy/stars.js` | `generateStar` — works. |
| `src/engine/galaxy/planet.js` | `generatePlanet` / `generateMoon` — works but has a real bug (§1.3). |
| `src/engine/constants/astrophysics.js` | `planetTypeData`, `HI()` (1 earthlike → 5 inimical). Keep — this is the classification backbone. |
| `src/engine/rogue/sector.js` | `RogueSector(sector, display)` — ASCII sector map + `tiles` Map. |
| `src/engine/rogue/system.js` | `RogueSystem(system, display)` — ASCII orbit map. Has bugs (§1.3). |
| `src/rogue.js` / `rogue.html` | Plain-DOM entry, ROT.Display + lil-gui + localforage. No Preact, no Chance. |

### 1.2 Slated for removal (Phase 2)

The entire World-Engine planet stack, all currently dead-or-dying weight on the rogue path:

- `src/engine/render/planet-render.js` (1105 lines)
- `src/engine/render/planet-shaders.js` (382)
- `src/engine/render/sun-shaders.js` (255)
- `src/engine/system/we-planet.js` (713)
- `src/engine/system/planet.js` (231) — superseded by `galaxy/planet.js`
- `src/engine/system/starSystem.js` (195) — superseded by `galaxy/system.js`
- `src/engine/galaxy/planetMap/` (index.js 801, sphere-mesh, halfedge-mesh, colormap)
- `src/engine/constants/colormap.js`, `src/engine/constants/sphere-mesh.js`

`src/rogue.js:11-13` currently imports `planetMap/index.js` and calls `console.log(genPlanetMap())` at
module load. That is the only live tie between the rogue page and the doomed stack — it pulls three CDN
ESM deps (`simplex-noise`, `flatqueue`, `gl-matrix`) into the rogue page for nothing. **Delete it first.**

`index.html` / `src/main.js` (the Three.js page) still use `galaxy/galaxy.js`, `galaxy/sector_old.js`,
`render/galaxy-render.js` and the global `Chance`. Phase 2 decides that page's fate (§4.1).

### 1.3 Known bugs to fix as part of this work

These are confirmed by reading the source, not speculative:

1. **`src/engine/galaxy/planet.js:103`** — `base.moons = Array.from({length: n}, (_, j) => { ... })`
   with a block body and no `return`. `moons` is an array of `undefined`. Only `moonHI` survives.
   *Blocks Phase 3 moon rendering.*
2. **`src/engine/rogue/system.js:16-18`** — `const radians = Math.PI * angle` is computed then unused;
   `Math.cos(angle)` is fed **degrees**. And `const y = Math.round(cx + au * Math.sin(angle))` uses `cx`
   where it needs `cy`. Orbits are therefore garbage-positioned.
   *Correct form:* `const rad = angle * Math.PI / 180`, `y = cy + au * Math.sin(rad)`.
3. **`src/engine/galaxy/sector.js:62`** — `let nSystems = 0` with the real default commented out, so
   without `opts.nSystems` only the habitable seeds are generated. Restore a real default.
4. **`src/engine/rogue/sector.js`** — `tiles.set('x,y', sys)` with no collision handling: two systems
   landing on one tile silently drop one. Also `getSpherePosition` returns **negative** coords while the
   projection assumes `0..H`, so half a spherical sector renders off-grid. Needs a real projection (§3.2).
5. **Seed-chain delimiters are inconsistent** — `sector.js` uses `[seed, i].join(':')`, `system.js` uses
   `seed + '-star'`, `planet.js` uses `[parent.seed, seed].join(':')`. Works today, but collides the
   moment a seed string legitimately contains `:` or `-`. Standardize (§2).

### 1.4 Not present

- **`AFMGData` is not vendored, cloned, or referenced anywhere in the tree.** Its API surface is unknown.
  This is the single largest unknown in the plan and gates Phase 2/4 — hence the spike in §4.0.

---

## 2. Foundation: the seed chain contract (Phase 1 work, do first)

Everything else depends on this. One helper, used everywhere, no exceptions.

**New file: `src/engine/seed.js`**

```js
// Single delimiter, escaped parts, deterministic and collision-free.
export function childSeed(parentSeed, ...parts) { ... }   // "parent|planet|3"
export function coordSeed(parentSeed, kind, ...coords) { ... } // "parent|region|12,7"
```

Rules:
- Every generator takes a seed **string** as its first argument and derives children only via `childSeed`.
- No `Date.now()`, no `crypto.randomUUID()`, no `Math.random()` inside `src/engine/`. Entropy enters
  only at the app layer (`src/rogue.js`) when the user asks for a *new* galaxy.
- Chain, per `VISION.md` §4.5:
  `galaxy → sector(gx,gy) → system(i) → planet(i) → region(rx,ry) → building(cx,cy)`

**Refactor tasks**
- `galaxy/sector.js`, `galaxy/system.js`, `galaxy/planet.js`, `galaxy/stars.js` → route all seed
  derivation through `childSeed`. Fixes §1.3.5.
- Add `test/determinism.js` (plain module + a `test.html`, or `node --test` — no bundler needed):
  generate the same sector twice from one seed, deep-compare JSON. This test is extended at every phase
  and is the guard for Success Criterion #2.

**Acceptance:** `generateSector('ABC', opts)` twice → byte-identical `JSON.stringify`. No `Math.random`
or `Date.now` anywhere under `src/engine/` (grep-checkable).

---

## 3. Phase 1 — Rogue MVP: galaxy → sector → system

Goal: the full click chain works end-to-end in ASCII, on deterministic seeds, with no World-Engine code
in the page.

### 3.1 Detach the rogue page from the old stack
- `src/rogue.js`: delete lines 11-13 (`genPlanetMap` import + `console.log`). Rogue page now pulls zero
  CDN ESM deps except lil-gui.
- Confirm `rogue.html` loads: `rot.min.js`, `localforage.min.js`, `src/rogue.js`. Drop `d3.v7.min.js`
  unless a concrete use appears (currently unused on the rogue page).

### 3.2 View-model layer: `src/engine/rogue/view.js` (new)

The `RogueSector`/`RogueSystem` functions currently do projection, glyph choice, drawing, and tile
indexing all at once. Split them so the deeper levels can reuse the machinery:

```js
// Pure: world objects → grid cells. No ROT dependency.
export function project(items, { getPos, srcBounds, width, height }) -> Map<"x,y", item[]>
export class TileIndex { set(x,y,obj); at(x,y); }   // handles multi-occupancy
```

- `project` normalizes source coords (handles the negative sphere coords of §1.3.4) into `0..width-1`.
- Collisions: `TileIndex` keeps an **array** per tile. Renderer draws the highest-priority glyph
  (brightest star / lowest HI) and marks the tile as stacked (e.g. inverted bg). Click on a stacked tile
  opens a disambiguation list in the info panel.
- `RogueSector` and `RogueSystem` are rewritten as thin renderers over this.

### 3.3 Galaxy view (new level, currently missing on the rogue path)

`VISION.md` §3 starts at a galaxy view; `rogue.js` starts at a sector. Close the gap:

- **New: `src/engine/galaxy/galaxy_gen.js`** — a plain-function galaxy generator, mirroring the
  `generateSector` style. **Do not reuse `galaxy/galaxy.js`**: it depends on globals `chance`/`Chance`
  and constructs `Cultures`, which is Phase 5 territory.
  ```js
  generateGalaxy(seed, { radius, sectorSize }) -> { seed, radius, sectorSize, sectors: /* coord list */ }
  ```
  Sectors are **coordinates only** — no system generation until a sector is clicked (Success Criterion:
  "generate only visited children").
- **New: `src/engine/rogue/galaxy.js`** — `RogueGalaxy(galaxy, display)`. Renders the sector grid; glyph
  density is a placeholder constant now, and becomes the **population signature** in Phase 5 (§8).
- `generateSector` gains `(gx, gy)` coords so its seed is `childSeed(galaxySeed, 'sector', gx, gy)`.

### 3.4 App shell: `src/rogue.js`

Replace the ad-hoc `view` string + folder-destroying `_updateInfo` with an explicit stack:

```js
this.stack = [ {level:'galaxy', data}, {level:'sector', data}, ... ]
push(level, data) / pop()   // pop = "back", bound to Escape and a GUI button
```

- One `render()` dispatching on `stack.at(-1).level` → `RogueGalaxy | RogueSector | RogueSystem`.
- `_updateInfo` rebuilds only the level-specific folder, not all four.
- Breadcrumb line above the display: `GALAXY ▸ Sector 3,-2 ▸ Vela ▸ Vela IV`.
- Persistence: save `{galaxySeed, path:[...coords]}` to localforage — never save generated objects.
  Reload = replay the path through the seed chain. This is the real test of determinism.

### 3.5 Fixes folded in
Bugs §1.3.2 (`RogueSystem` orbit math) and §1.3.3 (`nSystems` default) land here.

**Phase 1 acceptance**
1. Load `rogue.html` → galaxy grid of sectors renders.
2. Click a sector → sector ASCII map, colored star glyphs, no off-grid systems, stacked tiles marked.
3. Click a star → system view: primary at center, companions and planets at correct orbital radii.
4. Click a planet → placeholder panel (no crash).
5. Escape walks back up; breadcrumb tracks.
6. Reload restores the same view from the saved path; every glyph identical.
7. Console clean; no CDN planet-gen requests in the network tab.

---

## 4. Phase 2 — Remove the old planet layer, establish the planet-type interface

### 4.0 Spike (blocking, do before any Phase 2 code) — `AFMGData`

`AFMGData` (`git@github.com:0xPaladin/AFMGData.git`) is unknown to this repo. Timebox one session:

- Clone it. Determine: module format (ESM? UMD? raw JSON data?), entry points, whether it is
  **generator code** or **pre-generated map data**, its RNG (can it be seeded from our `PRNG`?),
  and its output shape (grid? cells? heightmap? biome ids? burgs/population?).
- Decide vendoring strategy: **vendor into `lib/afmg/`** (consistent with how `rot.js`/`chance` are
  handled; no bundler, no submodule fragility) vs. git submodule. Default recommendation: vendor.
- **Write the findings into `docs/afmg-integration.md`** — the output shape recorded there is the input
  contract for §4.2 and §6.
- **Risk:** if AFMGData turns out to be unseeded or data-only, Phase 3/4 for habitable worlds falls back
  to the in-house generator path (§4.3), which is why that path is built to cover *all* types anyway.

### 4.1 Deletion
- Delete every file in §1.2.
- `index.html` / `src/main.js` / `render/galaxy-render.js`: **recommendation — delete the Three.js page
  too** and make `rogue.html` the index. It is the only remaining consumer of `Chance`,
  `galaxy/sector_old.js`, and `render/`, and keeping it alive doubles the maintenance surface for a
  display the vision says is being replaced. *If the 3D page must survive as a reference, freeze it: no
  further changes, and it stops being part of the build/verify loop.* **Decision needed from you.**
- Remove `lib/chance.slim.js` and its `<script>` tags once nothing references `Chance` (grep first;
  `region/region.js`, `peoples/*` currently use the `Chance` global — see §6.1).
- Update `AGENTS.md`: its engine table still documents `render/`, `system/we-planet.js`, `planetMap/`.

### 4.2 The planet-type interface (`VISION.md` §4.4 note)

Per §0, this is a pure data contract — no renderer concerns leak into it, and no field exists only
because ASCII display needs it.

**New: `src/engine/planet/types.js`** — one shape, whatever the source. **Corrected per the AFMG spike**
(`docs/afmg-integration.md`): AFMGData's output is an irregular Voronoi cell list, not a dense `w×h`
array, so `PlanetSurface.cells` is a list, positions in the source's own native space — forcing it into
a rectangular grid would mean rasterizing inside the generator, a display concern (§0 violation):

```js
/** @typedef {Object} PlanetSurface
 *  seed, type,            // 'habitable'|'rocky'|'icy'|'hostile'|'barren'|'airless-moon'|'gas giant'
 *  HI,                    // 1..5 from astrophysics.js — the existing classification, reused
 *  radius, gravity, hydrographics, atmosphere, meanTempC,
 *  bounds: {minX,maxX,minY,maxY}, // native coordinate space of `cells` (lon/lat degrees for the
 *                                 // habitable/AFMG path, arbitrary planar units for in-house ones)
 *  cells: [ {x, y, elev, temp, moisture, biome} ],  // point cloud, NOT row/col addressable
 *  regions: [ {rx, ry, biome, popSeedHint} ],
 *  palette                 // biome id -> {glyph, fg, bg}
 */
export async function generateSurface(planet, opts) -> Promise<PlanetSurface>
```

`generateSurface` dispatches on classification:
- `HI <= 2` and non-gas-giant → **AFMG adapter** (`src/engine/planet/afmg-adapter.js`), which calls the
  vendored `generateMap({mode:'planet', seed, planetRadius, ...})`, restores `Math.random` in a
  `finally` block afterward (AFMGData reseeds it globally — see the spike doc), and maps `pack.cells`
  into the shared `cells` shape above.
- everything else → **in-house generators** (§4.3), synchronous.

`generateSurface` is declared `async` because the AFMG path genuinely awaits work; in-house branches just
return a resolved value through the same `async` function — callers always `await` it, uniformly.
Both branches return the *identical* `PlanetSurface`. The Rogue renderer never learns which source
produced it, and buckets `cells` into terminal columns/rows itself via `rogue/view.js`'s
`project()`/`TileIndex` (the same machinery already used for sector/system in Phase 1) — that bucketing
is projection, a renderer job, not generation.
Classification comes from the **existing** `astrophysics.js` `HI()` + `planetTypeData` — do not invent a
second taxonomy. AFMGData's own per-biome `habitability` (0-100) is available as an input signal, not a
replacement for `HI`.

### 4.3 In-house non-habitable generators — `src/engine/planet/`

One file per type, common core:
- `noise.js` — seeded value/simplex noise from `PRNG` (no CDN simplex-noise import; that came with the
  deleted stack).
- `rocky.js` — craters (Poisson-disc impacts), basins, ridged highlands.
- `icy.js` — ice sheets, fracture lines / chaos terrain, cryo-plains.
- `hostile.js` — volcanism, acid seas, high-pressure lowlands (Venus-like).
- `barren.js` — regolith plains, dust seas, minimal relief.
- `airless-moon.js` — `rocky.js` with atmosphere 0, harder crater contrast, mare basins.

Each: `generate(seed, {radius, insolation, gravity, ...}) -> {grid, palette, regions}`.
Also fix bug §1.3.1 here (`moons` array), since airless moons become real explorable bodies.

**Phase 2 acceptance**
1. `grep -r "we-planet\|planetMap\|planet-render\|planet-shaders" src/` → no hits.
2. `docs/afmg-integration.md` exists and documents the real API.
3. `generateSurface()` returns a valid `PlanetSurface` for each of the 6 types + gas giant, from seed
   alone, deterministically.
4. Rogue page loads with zero references to deleted modules.

---

## 5. Phase 3 — Planet Rogue display

- **New: `src/engine/rogue/planet.js`** — `RoguePlanet(surface, display) -> { index: TileIndex }`, per
  §0: reads `surface`, draws, hands back hit-test data instead of writing onto `surface`.
- Render `surface.grid` as an ASCII map, glyph+color per biome from `surface.palette`
  (`~` ocean, `≈` shallows, `.` plains, `"` grass, `♠` forest, `^` hills, `▲` mountain, `*` ice,
  `∴` regolith, `≡` lava, `○` crater).
- **Projection choice:** equirectangular grid for v1 — simple, cheap, click-mappable. A `projection`
  option leaves room for a later hemisphere/orthographic view; do not build it now.
- Overlay toggles in lil-gui: `elevation | temperature | moisture | biome | regions`.
- Gas giants get a banded-latitude renderer (no surface grid, no region drill-down — clicking a gas
  giant offers its **moons** instead).
- Click a tile → region cell highlighted, info panel shows biome/elev/temp, toast offers "descend".
- `RogueSystem` planet glyphs start using `HI` and type consistently (currently `p.color[0]` with
  `color` sometimes the string `"brown"` — normalize `color` to always be an array in `planet.js`).

**Phase 3 acceptance**
1. Click a planet from system view → full-planet ASCII map, correct type-specific terrain.
2. All 6 types + gas giant render without a crash.
3. Overlay toggles redraw in place, no regeneration.
4. Same planet seed → identical map across reloads.
5. Escape returns to the system view with the system unchanged.

---

## 6. Phase 4 — Region generation (stop here)

**Buildings are explicitly out of scope for this plan.** A building's placement, density, and kind are
functions of population — how many people live where, what they need, what they can support. That
signature does not exist until the Phase 5 Game-of-Life sim runs. Generating buildings before then means
either faking a population number (which gets thrown away and redone in Phase 5, contradicting §0's own
"nothing built here needs rework later" goal) or placing buildings arbitrarily, which is not generation,
it's decoration. So this plan's deepest level is the **region** — terrain, features, and settlement
*sites* (a marked location, not a populated, placed structure). Buildings resume in a Phase 5-adjacent
follow-up plan, once `populationOf(region)` (§8) is real.

### 6.1 Region generation

- `regionSeed = coordSeed(planetSeed, 'region', rx, ry)`.
- **New: `src/engine/planet/region.js`** — `async generateRegion(surface, rx, ry)` → a plain data object
  (`async` for the same reason as `generateSurface`, §4.2 — the AFMG branch genuinely awaits, the
  in-house branch just returns through the same async function), per §0 no different in kind from any
  other generator output. Same cell-list correction from §4.2 applies here (AFMG spike,
  `docs/afmg-integration.md`) — no dense `w×h` array:
  ```js
  { seed, rx, ry, bounds: {minX,maxX,minY,maxY},
    cells: [ {x, y, elev, temp, moisture, biome} ],  // local high-res point cloud, refined from
                                                       // the parent planet's nearest cell(s)
    features: [ {kind, x, y, ...} ],            // rivers, coastlines, resource deposits, ruins
    sites: [ {kind, x, y, seedHint} ]            // settlement/POI *locations* only — no population,
  }                                              // no buildings, no occupants. A site is a place a
                                                  // later (population-aware) pass could build on.
  ```
  Terrain is sub-sampled from the parent planet's nearest cell(s) — since `surface.cells` is a point
  cloud, "the parent cell" means nearest-neighbor lookup by (x,y), not an array index — so elevation/
  moisture/biome are inherited (a mountain region can't render as ocean) plus local detail noise on top.
  - Habitable: AFMG's `mode: 'region'` (`generateMap({mode:'region', seed: regionSeed, width, height})`)
    where the §4.0 spike says it's usable — same `Math.random`-restore wrapper as the planet path, same
    `async` signature.
  - Everything else: in-house refinement of the parent cell (reuses `src/engine/planet/noise.js` from
    Phase 2), synchronous.
- **`src/engine/region/region.js` (382 lines, existing)** is Chance-global-based fantasy region/faction
  content, and it goes further than this plan does (factions, population-flavored features). **Decision:
  do not import it as-is.** Harvest what's usable at the terrain/feature level (feature tables, resource
  tables) into the new PRNG-based module; leave population/faction machinery in place, untouched, for
  whoever picks up Phase 5+.
- **New: `src/engine/rogue/region.js`** — `RogueRegion(region, display) -> { index: TileIndex }`, per §0
  a pure renderer: reads `region`, draws, returns hit-test data as its own value rather than writing back
  onto `region`.
- Click a site in the region view → info panel shows its kind/coords; no drill-down past this (no
  `RogueSite`, no building renderer — that's the follow-up plan's job).

**Phase 4 acceptance**
1. Click a planet tile → region generates and renders in ASCII, terrain consistent with the parent cell.
2. `region.sites` are present and distinguishable in the display, with no population/building data
   anywhere on the object.
3. `galaxy → sector → system → planet → region` completes from one seed (**Success Criterion #1**,
   scoped to this plan — buildings are the next plan's success criterion).
4. Full-chain determinism test passes at every level (**Success Criterion #2**).
5. Nothing is generated for unvisited children — verified by instrumenting the generators with a counter.
6. Every generator output in the chain (`sector` through `region`) round-trips through
   `structuredClone`/`JSON.stringify` with no loss, and no renderer file exists that isn't paired with a
   generator file it merely reads (§0 spot-check).

---

## 7. Ordering & dependencies

```
§2 seed chain ─┬─> Phase 1 (galaxy/sector/system rogue chain)
               │
§4.0 AFMG spike┴─> Phase 2 (deletion + planet-type interface + in-house generators)
                        └─> Phase 3 (planet rogue display)
                                └─> Phase 4 (region generation)
                                        └─> [Buildings — follow-up plan, needs Phase 5 population first]
                                        └─> [Phase 5 — population, NOT in this plan]
```

The AFMG spike is independent of Phase 1 and should be started immediately in parallel — it is the
long-lead unknown.

---

## 8. Phase 5 seams (built now, unused now)

So the Conway sim drops in without rework:

| Seam | Placed in | Phase-4 stand-in | Phase-5 replacement |
|---|---|---|---|
| `galaxy.populationGrid` | `galaxy_gen.js` | absent / uniform | Conway cell grid |
| `sector.populationSignature` | `generateSector` return | constant | derived from galaxy cell |
| `system.populationSignature` | `generateSystem` return | constant | derived from sector |
| `planet.populationHint` | `PlanetSurface` | f(HI, biome, seed) | derived from system |
| `region.populationHint` | `generateRegion` | f(biome, HI, seed) | derived from planet |
| `region.sites[].populationHint` | `generateRegion` | f(hint, seed) — location only, no occupants | derived from region hint; this is also where **buildings** first become generatable |

Rule: every consumer reads the hint through one accessor, `populationOf(node)`. Phase 5 changes what
that accessor returns and nothing else. Buildings are not built in this plan (§6) — the seam exists so
the follow-up plan can generate them straight from `region.sites` + `populationOf(region)` with no
rework of anything above region level.

**Explicitly out of scope for this plan:** the Conway Game-of-Life simulation itself, population
propagation, `peoples/*` and faction integration, `region/region.js` revival, building generation and
rendering, and richer-than-ASCII visuals.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `AFMGData` is data-only or unseedable | Habitable worlds lose their source | §4.0 spike first; in-house generators (§4.3) are built to cover all types, so habitable falls back to a 7th in-house profile |
| Grid resolution: a planet at readable ASCII size (~120×60) may be too coarse for meaningful regions | Region drill-down feels arbitrary | Planet grid is the *index*; regions are generated at their own resolution from the parent cell, not sliced out of it (§6.1) |
| Deleting the Three.js page loses reference material | Rework later | Git history retains it; tag the commit before deletion (`pre-3d-removal`) |
| Determinism silently breaking as generators change | Success Criterion #2 fails late | The `test/determinism.js` guard is extended in *every* phase, not written at the end |
| Rogue ASCII scope creep into a permanent renderer | Phase 6 churn | `VISION.md` §7 open question — treat ASCII as **permanent classic mode**; the `PlanetSurface`/region data models are renderer-agnostic either way |

---

## 10. Decisions needed from you

1. **Three.js page** (`index.html`, `src/main.js`, `render/`): delete in Phase 2, or freeze as reference?
   *Recommendation: delete — tag the commit first.*
2. **AFMGData vendoring**: `lib/afmg/` vendored copy vs. git submodule. *Recommendation: vendor.*
3. **`src/engine/region/region.js`** (existing fantasy region/faction generator): harvest tables into the
   new PRNG-based module (recommended), or port it wholesale in Phase 4?
