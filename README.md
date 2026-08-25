# Infinite Galaxies

A seeded, procedural universe you explore in ASCII — click your way down from an entire galaxy to
a single patch of terrain on a planet. Everything you see is generated on the fly from one seed:
same seed in, same galaxy out, every time.

```
galaxy → sector → system → planet → region
```

At the top, a Conway's-Game-of-Life-style simulation grows cultures across the galaxy over 40
generations, the way civilizations might actually spread and collapse. Each culture has a bioform
(species type), a technology level (TL 4.0 to 5.9, advancing probabilistically each generation with
a chance of transcendence at TL 5+), and trait vectors (expansionist, industrial, alien alignment).

**Every system in a sector traces back to something that actually happened there.** A sector's
systems aren't a flat random count — they're read directly off that sector's own slice of
simulation history (birth, resettlement, sustained habitation, conflict, death, extinction,
transcendence), one system per event, scaled by the founding culture's bioform (a wide-affinity
bioform like machine sprawls across more marginal worlds per event than a picky one like
gasborne). A sector no culture ever reached isn't empty either — it gets a small, distance-faded
mix of neutral outposts, pre-spacefaring native-culture candidates, ancient ruins, and lawless
trouble spots (pirates, derelicts, rogue military), fading out the further it sits from any
sector a culture actually touched. Cultures build cities/outposts/megastructures on planets
according to their TL, bioform affinity, and industrial sophistication; some planets stay empty,
others fill with dozens of settlements. Ruins mark the territory of extinct cultures, flavored by
their extinction cause (died-out vs. transcended) — or, in untouched space, by a precursor culture
that predates anything the live simulation ever modeled.

See `VISION.md` for the original target experience, `IMPLEMENTATION_PLAN.md` for the phased build
plan (galaxy → region), and `POPULATION_PLAN.md` for the culture simulation specifically. This file
is the practical "what is this and how do I use it" doc.

> **History note:** the project originally rendered in 3D with Three.js. That renderer was removed
> once the ASCII version covered the same ground — it's still recoverable from the `pre-3d-removal`
> git tag if it's ever needed for reference.

---

## Running it

There's no build step. It's plain ES modules plus a handful of vendored/CDN scripts, so any static
file server works:

```bash
python3 -m http.server
```

then open `index.html` in a browser.

---

## Using it

You start in a **galaxy view** — a field of glyphs, one per 1000-light-year sector, colored by
whichever culture currently holds that stretch of space:

| Glyph | Meaning |
|---|---|
| `☉` `*` `:` `.` | Core → settled → frontier → fringe territory, colored by the owning culture |
| `.` (dim gray) | Abandoned — once claimed, no one lives there now |
| ` ` (blank) | Never claimed |

Click a sector to generate and enter it. Its systems are read off that sector's own culture
history (see above) rather than a flat count, so a sector's star field is now legible: a system's
glyph is tinted by *why* it's there — a normal spectral color for anything a living culture
actually founded/held/fought over, but ruins read as dull gold, trouble spots as red,
transcension sites as violet, native-culture candidates as green, neutral outposts as cyan. Click
a system to generate and enter it, where you'll see the primary star, any companion stars, and
planets arranged by orbital distance (a deterministic Fibonacci/golden-angle spiral, not randomly
scattered) — the info panel also shows that system's origin (which historical event created it,
and its founding bioform if it has one).

Click a planet — or a moon orbiting a gas giant — to descend to its **surface**. Unlike every other
level, the planet view isn't ASCII: it's two side-by-side [d3](https://d3js.org/) orthographic
hemispheres (near side / far side), each surface cell filled with its color only. A dropdown still
re-colors the same cells by elevation, temperature, or moisture instead of biome. Any planet-level
habitat gets a marker glyph at its actual surface position too (orbital-only habitats — stations,
shipyards — have no surface position and don't get one), drawn on whichever hemisphere it's actually
facing, so a settled world reads as settled before you drill into any one region. Click a cell to
drill into its **region** — every surface cell IS a region (an equal-area square, its side length
honest-measured from the cell's local density, so tiny moons get small regions and huge planets
don't). Each region's terrain elevation ramps from that cell's own value to its 8 neighbors' at the
edges/corners, with fine detail from 3D noise (seam-continuous across all boundaries). Generated via
the vendored AFMG engine for geologically-plausible shapes. Shows real **habitats** (settlements,
outposts, cities, orbital stations, megastructures — or ruins if the region fell within a dead
empire's territory) with actual populations, and **features** (mountain peaks, water, rivers,
coastlines). Deep-space stations and capital ships also appear as separate glyphs in the sector
view. Gas giants have no surface to drill into — click a moon (rendered as a dot) instead.

**Finding content quickly:** hunting for the one system or planet with something on it, glyph by
glyph, doesn't scale once a sector holds 100+ systems. The sector view's GUI panel shows a "Systems
w/ content" count with **◂ Prev / Next content system ▸** buttons that jump straight into the next
qualifying system (by sector order, wrapping) — "qualifying" meaning it has a stellar megastructure
or at least one planet that would get a habitat. The system view has the equivalent one level down:
**◂ Prev / Next habitat planet ▸**, jumping straight into the next planet that actually has a
habitat. Both checks are cheap (no AFMG/in-house terrain generation triggered just to answer "is
there anything here"), so they work instantly even on systems/planets nobody's visited yet.

**Controls:**

| Action | How |
|---|---|
| Descend | Click a sector / star / planet surface cell / region-terrain tile |
| Go back up one level | `Escape`, or the **Back** button in the GUI panel |
| Jump to the next/prev system or planet with content | **◂ Prev / Next content system ▸** (sector view) / **◂ Prev / Next habitat planet ▸** (system view) in the GUI panel |
| Step the culture simulation forward/back | **Step Forward ▸** / **◂ Step Back** in the GUI panel — no ceiling; stepping past what's been computed so far extends the simulation live instead of recomputing from scratch. Sector content is now a function of the current step, so stepping while below the galaxy view drops you back to it (a sector generated at one step is stale the moment the step changes) |
| New galaxy | **New Galaxy** in the GUI panel (uses a fresh random seed) |
| Save / Load / Delete Save | GUI panel buttons |

Region displays use fixed 2km-per-tile resolution, so a small region (say, 40km side) renders at
20×20 tiles while a large one (450km) fills 225×225 tiles, keeping fine detail legible without
over-rendering tiny regions into a sparsely-populated grid. The terrain is fully rasterized via a
multi-source BFS fill: even though the underlying AFMG mesh is capped at 25k cells (for generation
speed), every display tile gets painted from the nearest source cell, guaranteeing 100% coverage
with no black areas.

The right-hand **GUI panel** (via [lil-gui](https://lil-gui.georgealways.com/)) also shows live
info for whatever you're currently looking at (star count, spectral class, planet HI rating, region
site/feature counts, current culture-simulation generation, a system's origin/founding bioform,
etc.), and lets you tweak a sector's **Density** (0.5×–2×, a multiplier on every history-derived
system count, not an absolute) with a live regenerate.

A breadcrumb bar above the display always shows where you are (`GALAXY ▸ Sector 3,-2 ▸ Vrecaur ▸
Planet 2 ▸ Region (14.2°,-38.7°)`), and every click pops up a short toast with details about what you
just selected.

**Determinism, and what actually gets saved:** nothing you see is ever written to disk. What's
persisted is just the galaxy seed, your navigation path (which sector/star/planet/tile you clicked
down through), and which generation of the culture simulation you're viewing. Reloading the page
*replays* that path back through generation from scratch — which is also the sharpest available
test that generation stayed deterministic, since any drift would be immediately visible as "the
save doesn't restore correctly."

---

## Project outline & tech stack

**No build step, no bundler, no `package.json`.** Everything loads as native ES modules
(`<script type="module">`) directly in the browser. A few libraries are vendored under `lib/` as
plain scripts or loaded from CDN via an import map in `index.html`:

| Library | Role |
|---|---|
| [ROT.js](https://ondras.github.io/rot.js/hp/) | ASCII display for every level except the planet view |
| [d3](https://d3js.org/) + [d3-geo-voronoi](https://github.com/Fil/d3-geo-voronoi) | The planet-level view: two orthographic-projection hemispheres, cell fills built from a spherical Voronoi mesh over the surface cells |
| [lil-gui](https://lil-gui.georgealways.com/) | The control/info panel (loaded from CDN via ESM `import`) |
| [localForage](https://localforage.github.io/localForage/) | Browser-storage persistence (seed + path only) |
| [aleaPRNG](https://github.com/macmcmeans/aleaPRNG) | The seeded RNG every generator is built on |
| [AFMGData](https://github.com/0xPaladin/AFMGData) (vendored, `lib/afmg/`) | Terrain/hydrology simulation, used for EVERY planet type's regions now (not just habitable worlds) — see `docs/afmg-integration.md` |
| tachyons.css | Base CSS utility classes |

AFMGData brings its own CDN dependencies (d3, alea, simplex-noise, delaunator, polylabel,
lineclip), declared in `index.html`'s import map. `d3`/`d3-geo-voronoi` load on every session now
(the planet view needs them regardless of planet type); AFMG's heavier terrain-sim dependencies
(alea, simplex-noise, delaunator, polylabel, lineclip) still load lazily, only once a region is
actually entered.

### Directory map

```
index.html            entry point
src/
  rogue.js             app shell — the ONLY file allowed to call both a generator and a renderer
  main.css
  engine/
    seed.js             the seed-chain contract (childSeed / coordSeed)
    random.js            PRNG (alea-backed)
    random_name.js       name generation
    mixins.js             small math/string helpers on `window._`
    constants/            static data: astrophysics tables, colors, HI() habitability scale
    galaxy/                galaxy → sector → system → planet generators
                              - archetypes.js: turns a sector's population history (or its distance
                                from one that has any) into the plain "system spec" list
                                generateSector() actually builds systems from
    planet/                 planet-surface generators (5 in-house types + AFMG habitable adapter)
                              - cell-terrain.js: per-cell custom heightmap generator; compass-aligned
                                ramp from cell's own elevation to neighbors' + 3D-noise detail
                              - sphere-geo.js: bearing/distance math, equal-area square sizing from
                                local density, dynamic cell count scaled to target region size
                              - region.js: per-cell region generator (every surface cell is one region)
                              - profiles.js: each in-house type's own biome/moisture/temp logic
    population/              the culture / Game-of-Life simulation + habitat placement
                              - sim.js: the main simulation with TL/bioform/trait evolution
                              - bioform.js: 6 bioforms, affinity table (which worlds each prefers)
                              - tech.js: Technology Level (4.0–5.9), advancement, transcendence
                              - habitat.js: catalog of 16 habitat types (outposts through ringworlds)
                              - context.js: CultureContext lookup for a given sector
                              - habitation.js: placement engine for planet/system/sector habitats
                              - native.js: pre-spacefaring culture generation
                              - ledger.js: turns simulation history into a per-sector timeline of
                                events (birth/resettle/sustained/conflict/death/extinction/
                                transcension) — what galaxy/archetypes.js reads to decide sector content
    rogue/                    renderers — one per level, mirrors the generator folders. ASCII/ROT.Display
                              for every level except planet.js, which renders via d3 (see above)
lib/                    vendored third-party scripts, including AFMGData
docs/afmg-integration.md   notes from integrating the vendored AFMGData generator
IMPLEMENTATION_PLAN.md  phased build plan (galaxy through region)
POPULATION_PLAN.md      the culture-simulation design doc
VISION.md               original target-experience document
```

### The one architectural rule

**Generation and display are completely separate, everywhere.** This is deliberate and
non-negotiable — see `IMPLEMENTATION_PLAN.md` §0 for the full reasoning, but the short version:

- **Generators** (`generate*` functions under `src/engine/{galaxy,planet,population}/`) take a
  seed string (plus options) and return a plain, `structuredClone`-safe data object — no DOM
  access, no drawing, no live references back to a parent object (that creates reference cycles,
  which breaks cloning and saving).
- **Renderers** (`Rogue*` functions under `src/engine/rogue/`) take that data object, draw it (to a
  `ROT.Display` for every level except `planet.js`, which draws to a plain DOM element via d3 — see
  the tech-stack table above), and hand back hit-test data (or, for the d3 planet view, wire click
  callbacks directly). They never mutate what they're given.
- **`src/rogue.js`** is the app-layer glue — the only file allowed to call both a generator and a
  renderer in the same function.

The payoff: the ASCII renderer today could be swapped for an SVG or Three.js renderer later without
touching a single generator, because nothing about the data model assumes how it'll be drawn.

Every generator derives its seeds through `childSeed`/`coordSeed` in `src/engine/seed.js` — one
delimiter, no ad-hoc string concatenation — so the full seed chain (`galaxy → sector → system →
planet → region`, and `galaxy → population → culture`) stays collision-free and fully
reproducible. Nothing under `src/engine/` calls `Math.random()`, `Date.now()`, or
`crypto.randomUUID()` — entropy enters the system in exactly one place, `src/rogue.js`, when the
user asks for a brand-new galaxy.

---

## API — the generators

These are the functions that actually produce content. Each one takes a seed and returns a plain
object; none of them draw anything.

### Galaxy / sector / system / planet chain (`src/engine/galaxy/`)

| Function | Signature | Returns |
|---|---|---|
| `generateGalaxy` | `(seed, {radius, sectorSize})` | `{seed, radius, sectorSize, sectors: [{gx, gy, seed}]}` — coordinates only, no sector content until clicked |
| `generateSector` | `(seed, {bounds, gx, gy, pop, uptoStep, touchHorizon, densityScale, ctx})` | `{seed, gx, gy, systems: [...], habitation: {...}}` — systems come from `archetypes.js`'s history-derived plan (`pop`/`uptoStep`/`touchHorizon` required to build it; no `pop` -> zero systems, since there's nothing to justify inventing any). Each system carries its own `.ctx`/`.origin` from that plan. `ctx` here is only the sector's CURRENT dominant-owner context, used for sector-WIDE assets (`habitation`'s deep space stations/capital ships) — `densityScale` (0.5–2×) is a flat multiplier on every derived count |
| `generateSystem` | `(seed, opts)` | `{seed, star, planets}` — orbital positions (`.pos = {au, angleDeg, x, y}`) are assigned here, at generation time, not by the renderer |
| `generateStar` | `(rng, opts)` | a star record (spectral class, temperature, etc.) |
| `generatePlanet` / `generateMoon` | `(seed, opts)` | a planet/moon record; `kind: 'planet'\|'moon'`, `parentSeed` (a string, never a live object reference) |
| `planTouchedSector` | `(pop, gx, gy, uptoStep, seed, densityScale)` *(galaxy/archetypes.js)* | system specs for a sector at least one culture has ever claimed — one per ledger event (birth/resettle/death/extinction/transcension/conflict/contested), scaled by the founding culture's bioform breadth; `sustained` steps accumulate per culture into a diminishing-returns handful of "deepening" systems instead of one per step |
| `planUntouchedSector` | `(pop, gx, gy, uptoStep, touchHorizon, seed, densityScale)` *(galaxy/archetypes.js)* | system specs for a sector NO culture has ever claimed — a 4/4/4 baseline (neutral outposts or native-culture candidates / ancient ruins / trouble spots), faded out by ring-distance to the nearest ever-touched sector (full strength at ring 1, nothing by ring 6) |

### Planet surfaces & regions (`src/engine/planet/`)

| Function | Signature | Returns |
|---|---|---|
| `generateSurface` | `async (planet, opts)` | a `PlanetSurface`: `{seed, type, bounds, cells: [{x, y, elev, temp, moisture, biome}], palette}` — `type` is one of `rocky \| icy \| hostile \| barren \| airless-moon \| habitable \| gas giant` |
| `classify` | `(planet)` | which of those types a planet resolves to, from its existing `HI`/temperature/atmosphere fields |
| `generateRegion` | `async (surface, cellIndex, opts)` | one surface cell's local region: `{seed, cellIndex, lon, lat, sideKm, bounds, cells, features, sites, palette}` — bounds are an equal-area square (side length measured from the cell's own k-nearest-neighbor density, so it's honest about real local spacing, not a flat ~100km claim). Terrain elevation ramps from this cell's own value to its 8 cardinal neighbors' at the region's edges/corners; fine detail layered via 3D-sphere-sampled noise (exactly seam-continuous across all region boundaries). `opts.habitats`/`opts.ctx` drive site placement same as before. |
| `regionCellIndexFor` | `(surface, x, y)` | which surface cell (by index) a clicked point is nearest to |

Every planet type's regions now route through the vendored AFMGData generator (for its
geologically-plausible terrain shape) via a custom heightmap function (`cell-terrain.js`),
not a pre-baked template. Non-habitable types (rocky/icy/hostile/barren/airless-moon) then
discard AFMG's own Earth-biome classification and re-derive biome/moisture through that
type's own calibrated profile (`profiles.js`) instead — see `region.js`'s comments for why.
Surface generation itself (not regions) is unchanged: habitable surfaces still route through
AFMGData, the other five types are still generated in-house from seeded value noise.

**Habitable regions now bias their biome toward the parent surface cell's actual climate:**
without this, a region's biome came entirely from AFMG's own from-scratch regional climate
sim, blind to what the parent cell actually was — clicking a forest surface cell could just as
easily generate a desert region. Now the region rescales its moisture toward the parent cell's
actual moisture (from the planet-scale simulation), then reclassifies biome via AFMG's own
moisture × temperature matrix. The result is a region that predominantly comes out forest when
clicked from a forest tile, while still preserving AFMG's per-cell noise-driven local variation
(a patch of grassland inside a forest region, etc.) rather than a flat, artificial override.

**Empty-shoreline lakes no longer crash the generator:** a pre-existing bug in the vendored
AFMG code threw when a lake's shoreline array was empty (no land cell touches its boundary) —
which is now common on per-cell custom heightmaps that regularly produce small land patches
entirely surrounded by ocean. The crash occurred inside `Lakes.defineClimateData()`, called
from `Rivers.generate()`, matching the "error at rivers" symptom. Fixed: an empty shoreline
now correctly means "no land path to an outlet", so the lake is treated as closed instead of
crashing the whole region generation.

**Fully-open-ocean regions no longer crash either:** a second, unrelated bug hit when the
*entire* region was deep water with no coastline anywhere in it (e.g. clicking an open-ocean
surface cell) — AFMG's packing step deliberately drops "deep ocean" points as a performance
optimization for its usual continent-scale maps, which left zero cells to pack and crashed a
few steps later for the same underlying reason (`pack.features` never got set). Fixed by
falling back to packing the raw grid unfiltered whenever the coastal-proximity filter would
otherwise leave nothing at all — the region now correctly renders as solid water.

**Surface cells were silently missing temp/moisture:** `PlanetSurface.cells[].temp` and
`.moisture` were reading a field (`pack.cells.temp`/`.prec`) that doesn't exist on AFMG's
packed cell set — that data lives on the finer simulation grid instead, addressed indirectly
through a grid-reference index. The bug was silent (a `?:` guard just returned `null`), so
every surface cell's temp/moisture came back empty, which is also why the biome-bias fix above
had nothing real to bias with until this was found and fixed.

#### Region heightmap generation (`cell-terrain.js`)

Each region's elevation is built in two layers: a coarse "ramp" from the surface cell's own
elevation to its 8 cardinal neighbors' at the region's edges and corners (so two adjacent
regions agree exactly at the shared anchor points), plus fine detail from 3D fractal noise
sampled in the planet's real sphere-space (making this layer exactly seam-continuous
everywhere, regardless of region boundaries). The noise amplitude auto-scales to the local
relief, so flat cells stay flat and rugged neighborhoods stay rugged. Cardinal neighbors are
found via compass-sector bucketing (one nearest per 45° wedge), making the ramp
geographically plausible even on irregular point clouds (Fibonacci-sphere habitable surfaces
and jittered lon/lat in-house grids alike).

#### Equal-area square sizing

A region's side length (km) is measured from the cell's k-nearest-neighbor local density —
standard point-process technique, robust regardless of how the point cloud is laid out. This
is what makes the sizing *honest*: a lon/lat jittered grid's equatorial cells are ~3× larger
than its polar cells in real km, and the sizing reflects that. Every region's bounds are an
actual equal-area square centered on the cell, not a flat ~100km claim that ignored latitude
compression.

#### Dynamic surface cell count

Habitable worlds and in-house rocky/icy/hostile/barren/airless-moon planets now compute their
surface cell count dynamically from their actual radius, targeting ~450km-per-region-side
(guaranteeing <500km under real-world spacing, leaving margin). Small bodies (1000km radius)
get ~300–400 cells; large ones (15000km) can reach ~14k cells. This trades surface-generation
CPU time for honest region sizing across the full body-size range, since every region reads
its own neighborhood, not a one-size-fits-all template — on a tiny moon, 14k would be absurd,
but so would claiming a 100km-side region covers a 2000km-radius body.

### Population / culture simulation (`src/engine/population/`)

| Function | Signature | Returns |
|---|---|---|
| `generatePopulation` | `(seed, {radius, steps})` | `{seed, radius, steps, history: [snapshot, ...], cultures: {id: cultureRecord}}` — runs the whole simulation in one shot |
| `initPopulation` / `advancePopulation` | `(seed, opts)` / `(state, toStep)` | the live/extensible form — `initPopulation` sets up genesis only, `advancePopulation` runs it forward in place. Used by `rogue.js` so "step forward" has no ceiling: stepping past what's computed so far extends the same live state instead of recomputing from scratch, and produces byte-identical results either way (every step's RNG derives from the absolute step number, never from how many steps came before it) |
| `populationView` | `(state)` | the plain, `structuredClone`-safe `{seed, radius, sectorSize, steps, history, cultures}` shape every renderer/context reads, derived from a live state object |
| `buildSnapshotIndex` | `(snapshot)` | a `Map` from `"gx,gy"` to that cell's data, for O(1) lookup by renderers/generators |
| `populationOf` | `(node, popIndex)` | *(in `galaxy/galaxy_gen.js`)* — the one place anything reads a sector's development score from |
| `cultureContextFor` | `(popIndex, cultures, gx, gy)` | a `CultureContext` object: the culture data + development state for a given sector |
| `generatePlanetHabitation` | `(seed, ctx, surface)` | `{seed, habitats: [...]}` — all settlements/outposts/cities/stations on a planet, placed by culture TL and bioform |
| `planetHasHabitats` | `(seed, ctx, surfaceType)` | `boolean` — whether a planet would get any habitat, without generating its full surface first (same RNG-deterministic result `generatePlanetHabitation` would produce, just skipping the surface-dependent site-position lookup); powers the sector/system "jump to next content" navigation |
| `generateSystemHabitation` | `(seed, ctx)` | stellar megastructures (collectors, ringworld segments) attached to a system's star |
| `generateSectorHabitation` | `(seed, ctx, bounds)` | sector-level habitats (deep space stations, capital ships, derelicts, pirate havens) |
| `generateNativeCulture` | `(seed, ctx, surface)` | a pre-spacefaring (TL 0–3) native culture on a planet, or null if none arose; entirely outside the main sim |
| `buildTouchHorizon` | `(pop)` *(population/ledger.js)* | `Map<cellKey, earliestStep>` — the earliest step each sector cell was EVER claimed by a culture; computed once per population and cached (`rogue.js`), not per sector-entry |
| `ringDistanceToTouched` | `(touchHorizon, gx, gy, uptoStep, maxRing)` *(population/ledger.js)* | Chebyshev ring-distance from a sector to the nearest one touched at or before `uptoStep` — what fades untouched-sector content out with distance |
| `sectorLedger` | `(pop, gx, gy, uptoStep)` *(population/ledger.js)* | the chronological event timeline for one sector cell — `birth\|resettle\|sustained\|contested\|conflict\|death\|extinction\|transcension`, each with that culture's bioform/TL/traits AS OF that step (not its current/final state) |
| `settlementBreadth` | `(bioform)` *(population/bioform.js)* | how many world types (of 7) a bioform can plausibly settle (affinity >= 0.3) — derived from the existing affinity table, not a separate tuned value; drives how many systems a bioform's presence accounts for in `planTouchedSector` |

A culture record now includes:

```js
{
  id, parent, bornStep, deadStep, color, origin,
  inheritKind: 'successor'|'schism'|null, // null = fresh genesis founding
  bioform: 'terran'|'cryophile'|...,
  tl: 4.0..5.9,
  traits: { expansionist, industrial, insular, alien },
  extinctionCause: 'died-out'|'transcended'|null
}
```

Cultures are **append-only** — a culture is never edited or deleted. When one dies out, surviving
former territory can spark new "successor" cultures; when one grows large enough, it can split in
two geographically. Both cases create a *new* culture id pointing back at the old one via `parent`,
so the full lineage is always reconstructable. See `POPULATION_PLAN.md` for the full mechanics —
it's a Game of Life variant with TL advancement, transcendence rolls, bioform drift, and habitatplacement all baked in.

### Rendering (`src/engine/rogue/`)

Every renderer follows the same shape: `Rogue<Level>(generatedData, display, opts) -> {index}`,
where `index` is a `TileIndex` (from `rogue/view.js`) that the app layer uses to figure out what
was clicked. `rogue/view.js` also exports `project()`, the shared world-space → screen-grid
projection every renderer uses, so coordinate math is written once.

---

## What's not built yet

The core population ↔ habitation loop is complete (Phase 6). Still on the horizon:

- **Culture-flavored naming:** place names that reflect a culture's bioform, personality, and
  history — deliberately deferred to Phase 8+.
- **Buildings:** visual/structural detail on individual habitats — planned for a future phase, would
  require a sub-level below region with actual architecture simulation.

**Known limitation (§19 of `POPULATION_PLAN.md`):** The per-habitat population scaling with TL works
correctly (high-TL habitats hold fewer people), but the aggregate effect goes the opposite way — a
TL 5.9 culture's *total* civilization population is ~300x higher than a TL 4.0 one, because TL 5+
unlocks five new megastructure types with enormous scale bands (ringworld segments up to 1e9
population each). The qualitative story ("old cultures live in orbitals and megastructures, not on
planets") holds; the "fewer total people" narrative doesn't. See `POPULATION_PLAN.md` §19 for
options if this matters to you.

Everything from galaxy down through region is otherwise complete and click-through-able end to end
from a single seed.
