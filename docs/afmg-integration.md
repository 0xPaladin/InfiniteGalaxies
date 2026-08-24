# AFMGData integration spike (IMPLEMENTATION_PLAN.md §4.0)

Findings from cloning `git@github.com:0xPaladin/AFMGData.git` (branch `main`, which already
contains the merge of `claude/region-planet-generation-merge-km8cmf` — that branch is not a
separate thing to integrate, it's already `main`).

## What it is

A vanilla-JS (ESM, no bundler) procedural terrain generator — heightmap → features → lakes →
climate → rivers → biomes → ice — in two modes:

| Mode | Geometry | Coordinates | Use in our plan |
|---|---|---|---|
| `region` (default) | flat km grid, `width`×`height` | `[x,y]` pixels, planar Delaunay | Phase 4 `generateRegion` |
| `planet` | full 3D globe, `planetRadius` km | `[lon,lat]` degrees, spherical Voronoi | Phase 2 habitable `generateSurface` |

Entry point: `generateMap(options) -> Promise<{grid, pack, mode, getPackPolygon}>`.

## Output shape (the part that matters for our interface)

Both modes produce a **Voronoi cell graph**, not a rectangular array:

- `pack.cells` — parallel typed arrays (`h` height 0-100, `t` terrain/coast distance, `biome`,
  `r`/`fl` river id/flux, `f` feature id, `p` point coords, `area`) indexed by cell id.
  Cell *positions* are irregular (jittered Voronoi sites), not a grid.
- `pack.biomes` — 13 fixed biome defs, each `{name, color, habitability (0-100), cost}`.
  `habitability` is a ready-made ingredient for our `HI` classification, not a replacement for it.
- `pack.features` — oceans/seas/gulfs/continents/islands/isles/lakes.
- `pack.rivers`, `pack.ice` — as named.
- `getPackPolygon(cellId)` — returns that cell's polygon, for rendering.

**Consequence for our `PlanetSurface`/region contract:** the plan's original sketch
(`grid: {w, h, cells}` as a dense 2D array) doesn't fit — AFMGData's cells are an irregular
point cloud with polygons, not row/col addressable. In-house generators (Phase 2.4.3) *could*
still use a dense grid internally, but forcing AFMGData's output into one would mean rasterizing
in the generator, which is a display concern smuggled into generation (violates §0).

**Correction to make in Phase 2/4:** `PlanetSurface`/region `grid` becomes a **cell list**:
`cells: [{x, y, elev, temp, moisture, biome, ...}]`, positions in whatever the source's native
space is (lon/lat for planet mode, km xy for region mode, whatever an in-house generator picks).
Renderers bucket cells into terminal columns/rows themselves via the same `project()`/`TileIndex`
machinery already built for sector/system in Phase 1 (`src/engine/rogue/view.js`) — this is
projection, a renderer job, not generation. This keeps both sources (AFMG and in-house) under one
real interface instead of a lossy adapter.

## Seeding — the one real integration hazard

`generateMap({seed, ...})` looks properly seeded (`README` even lists `alea` as "seeded RNG"),
but the actual mechanism is:

```js
// utils/graphUtils.js:116, generators/heightmap-generator.js:532
Math.random = Alea(seed);   // reassigns the GLOBAL Math.random
```

Every generator underneath (`utils/probability.js`'s `rand`/`P`/`ra`/`rw`, point placement in
`planet_graph.js`/`graphUtils.js`, blob growth in the heightmap generators) calls plain
`Math.random()`, relying on this global reseed happening earlier in the pipeline. This **is**
deterministic for a fixed seed run start-to-finish, but it globally mutates `Math.random` for
the lifetime of the call and beyond (nothing restores it afterward).

This directly conflicts with our own rule (IMPLEMENTATION_PLAN.md §2: no `Math.random()` inside
`src/engine/`, entropy only enters at the app layer) — not because our code calls `Math.random`,
but because **calling AFMGData at all reseeds the shared global RNG out from under every other
piece of code in the same page** (ROT.js, lil-gui, anything using the platform RNG for anything
non-deterministic) for as long as the process lives. Concretely: generating a habitable planet
mid-session would make subsequent "sparkle"/jitter-style effects elsewhere in the app
(if any ever use bare `Math.random()`) become deterministic replays of AFMGData's seed sequence.

**Mitigation for Phase 2:** wrap every AFMGData call:
```js
const savedRandom = Math.random;
try {
  return await generateMap(opts);
} finally {
  Math.random = savedRandom;
}
```
This doesn't make AFMGData internally use *our* `PRNG`/alea instance — it still does its own
`Math.random = Alea(seed)` internally — but it stops that mutation from leaking past the call.
Good enough: correctness of AFMGData's own output only depends on its internal seeding being
consistent for a given `seed` string, which it is.

## Async

`generateMap` is `async` (real work, not just a Promise wrapper — it's a multi-stage pipeline).
Every other generator in this codebase is synchronous. **Consequence:** `generateSurface()` for
the habitable path must be `async`, and anything calling it (`src/rogue.js`, eventually a planet
renderer) needs to `await` it. Non-habitable in-house generators (Phase 2.4.3) can stay sync —
don't force them async just for interface uniformity; let `generateSurface()`'s caller `await`
unconditionally (`await Promise.resolve(x)` is a no-op for a sync return) rather than making six
generators async for one source's sake.

## Vendoring

Not npm-published; it's a git repo of plain ESM files with CDN import-map deps (`d3`, `alea`,
`simplex-noise`, `delaunator`, `polylabel`, `lineclip` — all resolved via `esm.sh`/`jsdelivr` in
its own `index.html`, not bundled). Recommendation stands from the original plan: **vendor into
`lib/afmg/`**, copied wholesale (its own module-relative imports keep working), with its CDN
import-map dependencies added to our page's import map alongside the existing lil-gui one. No
build step required — consistent with the rest of this project.

## Bottom line for Phase 2/4

- Use `mode: 'planet'` for habitable `generateSurface`, `mode: 'region'` for `generateRegion`.
- `PlanetSurface`/region output is a **cell list**, not a dense grid — corrected in the plan.
- Wrap every call to restore `Math.random` afterward.
- `generateSurface()` is `async` for the habitable path only.
- `habitability` per biome (0-100) is available as an input signal but our own `HI()` function
  (`constants/astrophysics.js`) remains the actual classification — don't replace it.
