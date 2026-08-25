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
plan (galaxy → region, plus §11's rework of region generation into a seamless, traversable
continuous field), and `POPULATION_PLAN.md` for the culture simulation specifically. This file is
the practical "what is this and how do I use it" doc.

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
and its founding bioform if it has one). Each planet draws hollow (`○` terrestrial / `◯` gas giant)
or solid (`●` / `⬤`) depending on whether it actually has anything on it — a living culture's
habitats, a former culture's ruins, or a possible pre-spacefaring native culture — without ever
revealing which; that stays a surprise until you visit. The check is cheap (no terrain generation
triggered just to decide a glyph), so it works instantly even on planets nobody's clicked yet.

Click a planet — or a moon orbiting a gas giant — to descend to its **surface**. Unlike every other
level, the planet view isn't ASCII: it's two side-by-side [d3](https://d3js.org/) orthographic
hemispheres (near side / far side). A habitable world's cells fill with real AFMG biome color (a
dropdown re-colors the same cells by elevation, temperature, or moisture instead); every other
solid type (rocky/icy/hostile/barren/airless-moon) always shades by elevation instead — dark at low
elevation, light at high, binned into 10 coarse 0.1-wide steps rather than a smooth gradient (a
terraced, topographic look) using that planet's own base color as the hue, so two rocky worlds with
different colors still read as clearly different planets. A gas giant renders the same
two-hemisphere layout too, just with much bigger/fewer cells (no region to drill into, so fine
detail buys nothing) colored by latitude band from the planet's own hue pair — the same striped
look the old flat renderer had, just following the real sphere now. Every planet-level habitat,
possible ruin, and possible native culture gets a marker glyph at its actual surface position
(orbital-only habitats — stations, shipyards — have no surface position and don't get one), drawn
on whichever hemisphere it's actually facing, so a settled/haunted/inhabited world reads as such
before you drill into any one region — and clicking that exact tile is guaranteed to show the same
content the hemisphere promised, never a re-roll that might disagree. Click a cell to drill into
its **region** — a genuine zoom into that exact spot, not a same-looking-everywhere reconstruction:
a fixed 500km × 500km window at 2km/tile (250×250 tiles), centered exactly on the lon/lat you
clicked, sampled straight out of a continuous planet-wide terrain field (`planet/field.js`) rather
than generated fresh per click. Two regions anywhere on the same planet — adjacent, overlapping, or
clicked minutes apart — agree exactly on the physical ground they share, because they're reading the
same function, not running independent simulations that happen to be stitched at the edges. Colored
the same way the hemisphere view colors that planet type (real AFMG biome for habitable worlds,
elevation-binned for everything else). Local hydrology (`planet/hydrology-local.js`) carves real
streams, rivers, and ponds at 2km resolution — the small-scale water a planet-wide simulation alone
would never produce — while staying consistent with planet-scale drainage
(`planet/hydrology-macro.js`, computed once per planet and shared by every region cut from it): a
major river crossing a region boundary sits in the exact same place on both sides. Shows real
**habitats** (settlements, outposts, cities, orbital stations, megastructures — or ruins if a former
culture once held this exact spot) with actual populations. A populated site sprawls across a
filled disc of tiles around its center instead of a single glyph — radius scales with
`log10(population)` but shrinks as the owning culture's TL rises (an arcology-era city reads
noticeably more compact than a pre-industrial town of the same size, roughly half the footprint by
TL 5.9 vs TL 4.0). Deep-space stations and capital ships also appear as separate glyphs in the
sector view. **Walk to the next region** with the GUI panel's compass buttons (▲▼◂▸) — traversal
re-centers the window and regenerates from the same continuous field, so crossing into the next
region is seamless by construction rather than a jump-cut to unrelated terrain; a brief zoom
animation on the display marks each descent or step so it reads as movement, not a scene change.
East/West traversal is exactly seamless (heights agree to 1e-14 at the overlap). North/South panning
has a subtle artifact at high latitudes (up to ~17 tiles of horizontal shear at lat 60°), a
consequence of tiling a sphere with rectangular grids — this is a display/projection issue, not
terrain generation, and the underlying terrain itself stays position-pure.
Gas giants have no surface to drill into — click a moon (rendered beneath the hemispheres,
orbital-scatter style) instead.

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
| Walk to the next region | **▲ North / ▼ South / ◂ West / East ▸** in the GUI panel (region view) — re-centers the same continuous field, seamlessly |
| Jump to the next/prev system or planet with content | **◂ Prev / Next content system ▸** (sector view) / **◂ Prev / Next habitat planet ▸** (system view) in the GUI panel |
| Step the culture simulation forward/back | **Step Forward ▸** / **◂ Step Back** in the GUI panel — no ceiling; stepping past what's been computed so far extends the simulation live instead of recomputing from scratch. Sector content is now a function of the current step, so stepping while below the galaxy view drops you back to it (a sector generated at one step is stale the moment the step changes) |
| New galaxy | **New Galaxy** in the GUI panel (uses a fresh random seed) |
| Save / Load / Delete Save | GUI panel buttons |

Region displays use a fixed 500km window at 2km-per-tile resolution — always 250×250 tiles,
regardless of body size — because the region is a window onto a continuous field (see below), not a
per-click generation that needs to be sized to fit. Every tile is sampled directly, so there's no
missing-coverage case to patch and nothing to rasterize from a sparser source mesh.

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
| [d3](https://d3js.org/) + [d3-geo-voronoi](https://github.com/Fil/d3-geo-voronoi) | The planet-level view: two orthographic-projection hemispheres, cell fills built from a spherical Voronoi mesh over the surface cells — every solid/gas-giant type now, not just habitable ones |
| [lil-gui](https://lil-gui.georgealways.com/) | The control/info panel (loaded from CDN via ESM `import`) |
| [localForage](https://localforage.github.io/localForage/) | Browser-storage persistence (seed + path only) |
| [aleaPRNG](https://github.com/macmcmeans/aleaPRNG) | The seeded RNG every generator is built on |
| [AFMGData](https://github.com/0xPaladin/AFMGData) (vendored, `lib/afmg/`) | Habitable *surface* (planet-scale) generation only — see `docs/afmg-integration.md`. No longer used for regions: region terrain/hydrology is generated in-house now (`planet/field.js` + `planet/hydrology-{macro,local}.js`), retired for the reasons in `IMPLEMENTATION_PLAN.md` §11 |
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
                              - field.js: continuous position -> elevation/climate/biome field
                                (IMPLEMENTATION_PLAN.md §11.1) — analytic for in-house types, a
                                compact-support-kernel interpolation of surface.cells for habitable;
                                what makes a region a genuine zoom instead of a fresh reconstruction
                              - hydrology-macro.js: planet-scale drainage (flow direction, flux,
                                bounded lake-filling) on the surface cell mesh, computed once and
                                shared by every region generated from that surface (§11.2 Layer 1)
                              - hydrology-local.js: region-scale D8 drainage on field.js's fine
                                heightmap (window+halo, cropped) — real streams/ponds/tributaries at
                                2km resolution, exactly seam-consistent with neighboring regions and
                                with hydrology-macro's continental rivers (§11.2 Layer 2)
                              - region.js: builds one region — a fixed 500km window centered on a
                                clicked cell (or an arbitrary lon/lat for traversal) — from field.js
                                + both hydrology layers; no longer touches AFMG at all
                              - sphere-geo.js: bearing/distance/great-circle math shared by the above
                              - cell-terrain.js / afmg-adapter.js's generateCellRegion: superseded by
                                the above (§11.3) and no longer called by anything — left in place,
                                not deleted, pending a cleanup pass
                              - profiles.js: each in-house type's own biome/moisture/temp logic, plus
                                WATER_BIOMES (which biomes are a body of liquid/lava/acid and so keep
                                a fixed color instead of elevation shading)
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
                              - elevation-color.js: shared dark-to-light, 0.1-binned elevation shading
                                (planet.js's hemisphere view and region.js's terrain both use it) for
                                every non-habitable solid type, keyed off that planet's own base color
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
| `generateSurface` | `async (planet, opts)` | a `PlanetSurface`: `{seed, type, bounds, cells: [{x, y, elev, temp, moisture, biome}], palette}` — `type` is one of `rocky \| icy \| hostile \| barren \| airless-moon \| habitable \| gas giant`. Gas giants get real (much coarser — see "Dynamic surface cell count" below) surface cells now too, position-only (no elevation/biome), for the hemisphere view's latitude-band coloring and so `gas mine`/`cloud city` habitats have somewhere real to be sited |
| `classify` | `(planet)` | which of those types a planet resolves to, from its existing `HI`/temperature/atmosphere fields |
| `generateRegion` | `async (surface, cellIndex, opts)` | a fixed 500km × 500km window (250×250 tiles @ 2km/tile) centered exactly on `surface.cells[cellIndex]`'s own lon/lat — a real zoom into that spot, not a reconstruction: `{seed, cellIndex, type, baseColor, lon, lat, sideKm, bounds, cells: [{x, y, elev, temp, moisture, biome, water}], features: [], sites, palette}`. `cells[].water` is `'stream'\|'river'\|'pond'\|null` from local hydrology. `opts.habitats`/`opts.ruins`/`opts.ctx` drive site placement — both habitat and ruin positions are resolved once at the PLANET level (`generatePlanetHabitation`/`generatePlanetRuins`) and matched here by exact cell position, never re-rolled, so the region always matches whatever the hemisphere view already showed. `opts.baseColor` passes through as `.baseColor` (paired with `.type`) for elevation shading. Every resolved site also carries `.tl` (from `opts.ctx`), used by the region renderer's population-sprawl radius. |
| `generateRegionAt` | `async (surface, lon, lat, opts)` | same as `generateRegion`, but centered on an arbitrary lon/lat instead of a specific surface cell — the traversal entry point (`_panRegion`, rogue.js); `cellIndex` comes back `null` since it isn't tied to one cell, so habitat/ruin site matching is skipped for it |
| `regionCellIndexFor` | `(surface, x, y)` | which surface cell (by index) a clicked point is nearest to |
| `buildFieldSampler` | `(surface, centerLon, centerLat, windowKm, haloKm)` *(planet/field.js)* | `{heightAt(lon,lat), climateAt(lon,lat,elev), biomeAt(elev,moisture,temp)}` — the continuous field a region (or its hydrology) samples from. In-house types evaluate the same analytic noise `buildSurfaceCells` used, at whatever resolution asked; habitable interpolates `surface.cells` with a 700km compact-support kernel. Verified exactly seam-consistent between overlapping windows (0 disagreement, both surface families) |
| `computeMacroHydrology` / `macroHydrologyFor` | `(surface)` *(planet/hydrology-macro.js)* | `{flowTo, flux, lakeId, neighbors}` — planet-scale drainage on a k-nearest-neighbor graph over `surface.cells`; `macroHydrologyFor` memoizes it on the surface object (`surface._hydrology`) so it's computed once and shared by every region cut from that planet |
| `computeLocalHydrology` | `(surface, sampler, centerLon, centerLat, windowKm, haloKm, kmPerTile)` *(planet/hydrology-local.js)* | fine D8 drainage on a window+halo heightmap (after priority-flood depression filling), cropped to the window — real ponds/streams/tributaries at tile resolution. Depression-filled basins (≤400 tiles) read as standing water; anything larger is a routing artifact of the window and drains instead. A nearby macro-flux river adds a smooth, continuous rainfall boost near its course (not a point injection — that broke exactness near drainage divides) so a region's local hydrology stays connected to the planet's continental rivers. Verified nearly seam-consistent: heights to 6.4e-14, water-class 99.91% agreement across overlapping windows. |

**Regions no longer route through AFMG at all (`IMPLEMENTATION_PLAN.md` §11).** They used to —
generated per click via a custom heightmap fed into AFMG's region-mode generator — but that had
five compounding problems, all measured rather than assumed: the region wasn't actually centered on
the clicked cell (a coordinate-box bug), adjacent regions didn't tile (geometry mismatch: ~72% of
boundaries left a gap, ~22% overlapped), a third of region-pairs couldn't agree on being neighbors
even in principle, AFMG mutated heights post-generation with no knowledge of neighboring regions
(lake carving, river downcutting), and AFMG's `h<20`-is-ocean convention flooded dry non-habitable
worlds with "ocean" and generated islands on airless rock. See §11.0 for the full writeup. All five
are fixed by construction in the replacement, not patched:

- **`planet/field.js`** — terrain as a *pure function of position*, not a per-click generation.
  Two overlapping windows sampling the same physical point get the exact same answer, which is what
  makes tiling/traversal trivial instead of something to engineer at the edges. In-house types
  evaluate the identical analytic noise function `buildSurfaceCells` uses (just at finer spacing);
  habitable interpolates the AFMG-generated `surface.cells` with a compact-support kernel (a cell
  contributes nothing beyond 700km) — verified exact (0 disagreement) between two overlapping
  windows for both. A region-local 3D-sphere-sampled detail layer sits on top for the actual terrain
  shape. The base wavelength is several times the window size (not a fraction of it), so every region
  gets a coherent large-scale tilt that flow can follow for hundreds of km, with finer octaves
  supplying texture down to ~8km. Amplitude is scaled by *local relief* — flat neighborhoods stay
  flat, rugged ones stay rugged — measured on a snapped coarse position bucket rather than each
  window's own center, so it's a pure function of location (an earlier per-window version measurably
  broke exactness with 0.42 units of seam disagreement purely from two windows estimating slightly
  different relief for the same neighborhood).
- **`planet/hydrology-macro.js` + `planet/hydrology-local.js`** — two-layer drainage (§11.2).
  Local D8 flow accumulation runs on field.js's fine heightmap after priority-flood depression
  filling (the key step that makes drainage networks possible at all — on rough terrain, raw D8 dies
  in a local pit within a few tiles, so flow never accumulates into channels without it). This
  reproduces true planet-scale drainage exactly for any watershed under ~4000km² (measured: 99–100%
  exact match for anything under 200km², 92% up to 4000km²) — nearly everything a 500km region ever
  needs. Ponds/streams/tributaries are genuinely locally generated, not inherited from a coarse
  planet-wide pass. Only real continental rivers need help from the macro layer (computed once per
  planet, shared by every region): a nearby major river adds a smooth, continuous rainfall boost near
  its course (a point injection was tried first and measurably broke exactness near local drainage
  divides — a smooth field doesn't have that failure mode), so a trunk river sits in the same
  physical place on both sides of a region boundary while its tributaries are still generated
  locally. Verified exactly seam-consistent (heights 6.4e-14, water-class 99.91% agreement) across
  overlapping windows.
- **Walking to the next region** (`generateRegionAt`, the GUI panel's compass buttons) re-centers
  the same continuous field rather than generating something new and hoping it lines up — verified
  exact agreement at the overlap band between a region and the one it steps to.

A real performance bug surfaced along the way: the home-made `makeNoise3D` (value noise, not the
earlier vendored simplex library) measured ~36× slower per call across a real geographic span vs.
near-identical points — actually a bug in the hash function, not the noise algorithm. Every corner
sample did a string concat + `new PRNG(seed + ':' + key)` against a Map, ~8 corners × N octaves
per sample, so 160k calls across a 350×350 region took ~23.8s. Fixed by replacing the PRNG hash
with a cheap integer bit-mixer (same algorithm, numeric keys) — down to 166ms. That enabled
sampling the detail layer at full 2km resolution instead of on a coarse interpolated lattice,
which also fixed the "90-degree water grid" artifact (the lattice capped detail at ~22km when
tiles are 2km, aliasing away the finest feature octaves entirely). Terrain relief improved from
3 units (flat) to 22–35 units (real), and water coverage normalized from 17–44% to ~5% (1.2% pond,
2.7% streams, 1.2% rivers), with no accuracy loss.

Non-habitable types (rocky/icy/hostile/barren/airless-moon) still re-derive biome/moisture through
their own calibrated profile (`profiles.js`) rather than AFMG's Earth-biome classifier — unrelated
to the AFMG-retirement above, just still true. **Habitable regions still bias their biome toward the
parent surface cell's actual climate**, though this now happens implicitly: field.js's
compact-support kernel weights nearby cells (including the exact clicked cell, at zero distance)
far more heavily than distant ones, so a region generated from a forest tile predominantly comes out
forest without a separate bias step. `WATER_BIOMES` (`profiles.js`) — ice sheets, lava fields, acid
lowlands — are the one exception to elevation-binned shading: those keep their fixed palette color
regardless of elevation, the same way a habitable world's oceans aren't elevation-shaded either.

**Known limitations:** `region.features` is always `[]` now (AFMG's peak/coastline detection had no
replacement built — water is on `cells[].water` directly instead, which is how it's actually
rendered). No window-size clamping on very small bodies yet, so a 500km window on a similarly-sized
body overlaps itself heavily. A region reached by walking (not a direct cell click) doesn't survive
a save/reload (`cellIndex: null` — guarded against crashing, not against losing the pan position).
**N/S traversal seam:** rectangular grids can't tile a sphere perfectly. A 500km-tall window spans
4.5° of latitude, so its top row sits on a circle ~2–3% shorter than its bottom row — a 1.5% shortfall
at mid-latitudes, 3.5% at lat 60°. This unavoidably shears the projection: features shift horizontally
near the window edges on N/S pans (max 17 tiles at lat 60°), while E/W pans have no distortion. The
terrain itself is still exactly position-pure and seamless — this is purely a display artifact of
fitting square tiles to a sphere. **Future:** cube-sphere grids (6 gnomonic faces, each with its own
square tile lattice) would eliminate this by design, at the cost of an edge-handling layer across
face boundaries — not currently planned, but the right long-term solution if it becomes visually
distracting in play.

> **Superseded:** regions used to size themselves per-cell (an equal-area square measured from local
> point density, `sphere-geo.js`'s k-nearest-neighbor technique) so sizing stayed honest across a
> jittered, unevenly-spaced point cloud. `IMPLEMENTATION_PLAN.md` §11 replaced that with a **fixed**
> 500km window for every region regardless of body size — once terrain is a continuous field rather
> than a per-cell reconstruction, there's no per-cell density left to size against, and nothing left
> for a variable size to serve (see §11.1). `sphere-geo.js`'s distance/bearing math is still used
> (by field.js's kernel gather and the hydrology layers); the density-based sizing itself is gone.

#### Dynamic surface cell count

Habitable worlds and in-house rocky/icy/hostile/barren/airless-moon planets now compute their
surface cell count dynamically from their actual radius, targeting ~450km-per-region-side
(guaranteeing <500km under real-world spacing, leaving margin). Small bodies (1000km radius)
get ~300–400 cells; large ones (15000km) can reach ~14k cells. This trades surface-generation
CPU time for honest region sizing across the full body-size range, since every region reads
its own neighborhood, not a one-size-fits-all template — on a tiny moon, 14k would be absurd,
but so would claiming a 100km-side region covers a 2000km-radius body.

Gas giants use a separate, much coarser target (`GAS_GIANT_TARGET_SIDE_KM`, 12000km vs. 450km) —
there's no region to drill into and no fine detail to show, just enough cells for the hemisphere
view's latitude bands to read cleanly. A Jupiter-radius giant gets ~650 cells; a Neptune-radius one
~70 — an order of magnitude fewer than a real planet at any comparable size.

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
| `planetHasHabitats` | `(seed, ctx, surfaceType)` | `boolean` — whether a planet would get any habitat, without generating its full surface first (same RNG-deterministic result `generatePlanetHabitation` would produce, just skipping the surface-dependent site-position lookup); powers the sector/system "jump to next content" navigation and the system view's solid/hollow planet glyph |
| `generatePlanetRuins` | `(seed, ctx, surface)` | `{seed, ruins: [{cultureId, bioform, extinctionCause, pos}]}` — a possible ruin from `ctx.formerClaims` (0.3 chance), resolved to one exact surface cell ONCE at the planet level (moved here from region.js, which used to re-roll independently every time a region was entered) — so the hemisphere view can show it before any region is visited, and the region you actually click always agrees |
| `generateSystemHabitation` | `(seed, ctx)` | stellar megastructures (collectors, ringworld segments) attached to a system's star |
| `generateSectorHabitation` | `(seed, ctx, bounds)` | sector-level habitats (deep space stations, capital ships, derelicts, pirate havens) |
| `generateNativeCulture` | `(seed, ctx, surface)` | a pre-spacefaring (TL 0–3) native culture on a planet, or null if none arose; entirely outside the main sim. Now also resolves a real `pos` (surface cell x/y) when `surface.cells` is populated, same site-picking heuristic real habitats use, so it can show a hemisphere marker too |
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
