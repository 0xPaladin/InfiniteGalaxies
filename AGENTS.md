# Agent Notes

> The Three.js / World-Engine planet pipeline (`index.html`, `main.js`, `render/`, `we-planet.js`,
> `planetMap/`, `galaxy.js`, `sector_old.js`, and the `UI/` layer) was removed in Phase 2 of
> `IMPLEMENTATION_PLAN.md`. It's recoverable from the `pre-3d-removal` git tag if ever needed for
> reference. Everything below describes the current (Rogue ASCII) codebase only.

## Entry point

`index.html` (formerly `rogue.html`) loads `src/rogue.js` as a module. There is no bundler — bare
CDN imports (lil-gui) via ESM `import` in `src/rogue.js`; `rot.min.js` and `localforage.min.js` are
loaded as plain `<script>` globals.

## Generation vs. display — the one rule that governs everything under `src/engine/`

See `IMPLEMENTATION_PLAN.md` §0 for the full rationale. Short version:

- A **generator** (`generate*` functions under `src/engine/galaxy/`, `src/engine/planet/`) takes a
  seed string (+ opts) and returns a plain, `structuredClone`-safe data object. No DOM, no `ROT`
  calls, no back-references to a parent object (that creates cycles — see `kind`/`parentSeed` below).
- A **renderer** (`Rogue*` functions under `src/engine/rogue/`) reads that object, draws to a
  `ROT.Display`, and returns hit-test data (`{ index: TileIndex }`) — it never mutates the object
  it was given.
- `src/rogue.js` is the only file allowed to call both a generator and a renderer.

## Seed chain (`src/engine/seed.js`)

Every generator derives child seeds via `childSeed(parent, ...parts)` or `coordSeed(parent, kind,
...coords)` — one delimiter, no ad-hoc string concatenation. Chain:
`galaxy → sector(gx,gy) → system(i) → planet(i) → region(rx,ry)` (buildings are out of scope until
population — see `IMPLEMENTATION_PLAN.md` §6). No `Math.random()`/`Date.now()`/`crypto.randomUUID()`
inside `src/engine/` — entropy enters only at the app layer (`src/rogue.js`, when the user asks for
a *new* galaxy).

## Engine (`src/engine/`)

| Path | Purpose |
| ---- | ------- |
| `seed.js` | `childSeed`/`coordSeed` — the seed-chain contract |
| `random.js` | `PRNG` (alea-backed) — the RNG source of truth |
| `random_name.js` | `MakeName(names, rng)` — always takes an explicit `rng`, no default entropy |
| `mixins.js` | Sets `window._` (`_.fromN`, `_.clamp`, `_.hslToHex`, `_.capitalize`, ...) |
| `constants/astrophysics.js` | Star/planet physics data, `HI()` habitability classification (1 earthlike → 5 inimical) |
| `constants/data.js` | Static data (colors, animals, elements) |
| `constants/defaults.js` | `SPECTRAL_COLORS` and other shared display defaults |
| `galaxy/galaxy_gen.js` | `generateGalaxy(seed, opts)` — sector *coordinates* only, no content until clicked; `populationOf()` is the Phase 5 seam |
| `galaxy/sector.js` | `generateSector(seed, opts)` — a sector's systems |
| `galaxy/system.js` | `generateSystem(seed, opts)` — star + planets, assigns orbital `.pos` layout at generation time |
| `galaxy/stars.js` | `generateStar(rng, opts)` |
| `galaxy/planet.js` | `generatePlanet`/`generateMoon` — sets `kind: 'planet'|'moon'` and `parentSeed` (not a live object ref — see below) |
| `peoples/`, `region/region.js` | Chance-global-based fantasy faction/region content, kept but **not currently imported anywhere** — dormant until Phase 5 (population) revives them |
| `rogue/view.js` | `project()`/`TileIndex` — shared world→grid projection and hit-testing for all renderers |
| `rogue/galaxy.js`, `rogue/sector.js`, `rogue/system.js` | `Rogue*` renderers — pure, read-only |

### Why `parentSeed`, not `parent`

`generatePlanet`/`generateMoon` used to store a live object reference back to their parent
(`planet.parent === system`), which made the object graph circular and broke `JSON.stringify`/
`structuredClone` — a direct violation of the "generator output must be clonable" rule. They now
store `parentSeed` (a string) instead, and an explicit `kind` field (`'star'|'planet'|'moon'`)
that renderers and click handlers use instead of inferring type from `parent` presence.

## Known pre-existing gaps (not introduced by Phase 1/2 work)

- `peoples/*` and `region/region.js` reference the global `Chance`/`chance` object, which is no
  longer loaded on any page (it was only ever loaded by the now-deleted `main.js`). They are inert
  until Phase 5 rewires or replaces them.
- AFMGData integration (habitable planets, region generation) is speced in
  `docs/afmg-integration.md` but not yet vendored/wired — see `IMPLEMENTATION_PLAN.md` §4.
