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
That simulation decides how "developed" any given patch of space is, which drives habitat
placement — developed sectors get more habitable systems, and cultures build cities/outposts/
megastructures on planets according to their TL, bioform affinity, and industrial sophistication.
Some planets stay empty; others fill with dozens of settlements. Ruins mark the territory of
extinct cultures, flavored by their extinction cause (died-out vs. transcended).

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

Click a sector to generate and enter it. Inside, stars are laid out in 3D-ish space; click one to
generate and enter its **system**, where you'll see the primary star, any companion stars, and
planets arranged by orbital distance (a deterministic Fibonacci/golden-angle spiral, not randomly
scattered).

Click a planet — or a moon orbiting a gas giant — to descend to its **surface**. Unlike every other
level, the planet view isn't ASCII: it's two side-by-side [d3](https://d3js.org/) orthographic
hemispheres (near side / far side), each surface cell filled with its color only — no glyphs at this
level. A dropdown still re-colors the same cells by elevation, temperature, or moisture instead of
biome. Click a cell to drill into its **region** — every surface cell IS a region (an equal-area
square, its side length honest-measured from the cell's local density, so tiny moons get small
regions and huge planets don't). Each region's terrain elevation ramps from that cell's own value to
its 8 neighbors' at the edges/corners, with fine detail from 3D noise (seam-continuous across all
boundaries). Generated via the vendored AFMG engine for geologically-plausible shapes. Shows real
**habitats** (settlements, outposts, cities, orbital stations, megastructures — or ruins if the
region fell within a dead empire's territory) with actual populations, and **features** (mountain
peaks, water, rivers, coastlines). Deep-space stations and capital ships also appear as separate
glyphs in the sector view. Gas giants have no surface to drill into — click a moon (rendered as a
dot) instead.

**Controls:**

| Action | How |
|---|---|
| Descend | Click a sector / star / planet surface cell / region-terrain tile |
| Go back up one level | `Escape`, or the **Back** button in the GUI panel |
| Step the culture simulation forward/back | **Step Forward ▸** / **◂ Step Back** in the GUI panel — no ceiling; stepping past what's been computed so far extends the simulation live instead of recomputing from scratch |
| New galaxy | **New Galaxy** in the GUI panel (uses a fresh random seed) |
| Save / Load / Delete Save | GUI panel buttons |

Region displays use fixed 1km-per-tile resolution, so a small region (say, 40km side) renders at
40×40 tiles while a large one (180km) fills 180×180 tiles, keeping fine detail legible without
over-rendering tiny regions into a sparsely-populated grid.

The right-hand **GUI panel** (via [lil-gui](https://lil-gui.georgealways.com/)) also shows live
info for whatever you're currently looking at (star count, spectral class, planet HI rating, region
site/feature counts, current culture-simulation generation, etc.), and lets you tweak a couple of
generation parameters (habitable-system count, total system count per sector) with a live
regenerate.

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
| `generateSector` | `(seed, {bounds, nHab, nSystems, gx, gy, ctx})` | `{seed, gx, gy, systems: [...], habitation: {...}}` — `ctx` (from `cultureContextFor`) biases `nHab` based on culture development; sector-level habitats are placed in `habitation` |
| `generateSystem` | `(seed, opts)` | `{seed, star, planets}` — orbital positions (`.pos = {au, angleDeg, x, y}`) are assigned here, at generation time, not by the renderer |
| `generateStar` | `(rng, opts)` | a star record (spectral class, temperature, etc.) |
| `generatePlanet` / `generateMoon` | `(seed, opts)` | a planet/moon record; `kind: 'planet'\|'moon'`, `parentSeed` (a string, never a live object reference) |

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
surface cell count dynamically from their actual radius, targeting ~180km-per-region-side
(guaranteeing <200km under real-world spacing, leaving margin). Small bodies (1000km radius)
get ~300–400 cells; large ones (15000km) can reach ~87k cells. This trades surface-generation
CPU time for honest region sizing across the full body-size range, since every region reads
its own neighborhood, not a one-size-fits-all template — on a tiny moon, 87k would be absurd,
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
| `generateSystemHabitation` | `(seed, ctx)` | stellar megastructures (collectors, ringworld segments) attached to a system's star |
| `generateSectorHabitation` | `(seed, ctx, bounds)` | sector-level habitats (deep space stations, capital ships, derelicts, pirate havens) |
| `generateNativeCulture` | `(seed, ctx, surface)` | a pre-spacefaring (TL 0–3) native culture on a planet, or null if none arose; entirely outside the main sim |

A culture record now includes:

```js
{
  id, parent, bornStep, deadStep, color, origin,
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
