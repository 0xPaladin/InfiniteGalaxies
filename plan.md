# Plan: ASCII Roguelike Viewer (rogue.html)

## Decisions
- Separate page `rogue.html` (keep index.html 3D)
- Drop Preact/htm entirely on rogue page; plain DOM + lil-gui + rot.js
- `generateSector` (galaxy/sector.js) is the NEW STANDARD — pure object/API format
- Engine/display separation: `galaxy/sector.js` = engine generation, `rogue/sector.js` = ASCII display
- chanceJS removal = ROGUE PAGE ONLY: refactor `MakeName` to use PRNG (alea), default rng param to `new PRNG(Date.now())`. Keep chance in main.js/3D page.
- 3D page rewire = ROGUE PAGE ONLY: use `generateSector` for rogue.html; leave 3D page on MajorSector
- Fix generateSector bugs: `nhab`→`nHab`, use `getSpherePosition`, `rng()`→`rng.rand()`
- Keep `sector_old.js` for reference (do NOT delete, do NOT import)
- Defer planet>region>area>site drill-down (stub only)

## Key facts
- `generateSector(seed, {bounds})` in `galaxy/sector.js` returns `{systems, seed, H, W, D}`; each system `{seed, star:{primary:{spectral}, multiplicity, companions}, planets, HI, name, pos:{x,y,z}}`
- `RogueSector(sector, opts)` in `engine/rogue/sector.js` maps systems to glyphs via `SPECTRAL_COLORS`; `GLYPHS` keyed by spectral letter (upper=multiple, lower=single)
- rot.min.js: ROT.Display, ROT.Map, ROT.Engine, ROT.Scheduler, ROT.RNG, ROT.Color, ROT.FOV, ROT.Path, ROT.Noise, ROT.Text, ROT.Util (UMD global `ROT`)
- `PRNG` (random.js): `rand/range/p/d/dice/pick/weighted`; `MakeName(names, rng)` in random_name.js
- `window._` mixins (mixins.js): `_.fromN`, `_.clamp`, `_.html`, `_.hslToHex`, `_.capitalize`
- `SPECTRAL_COLORS` in `constants/defaults.js`
- galaxy-render exports NOT needed on rogue page (no Three.js)

## Steps
### Phase A — Fix generateSector bugs + MakeName off chance (blocking, do first)
1. Fix `generateSector` in `src/engine/galaxy/sector.js`: `nhab`→`nHab`, replace `getCirclePosition`/`getRectPosition` with `getSpherePosition`, `rng()`→`rng.rand()`. Export `generateSector`.
2. Refactor `MakeName` in `src/engine/random_name.js` to use `PRNG` (alea): `RNG.random()`→`rng.rand()`, `RNG.pickone`→`rng.pick`, `RNG.weighted`→`rng.weighted`, `RNG.randBetween`→`rng.range`. Default rng param to `new PRNG(Date.now())`.
3. Keep `sector_old.js` for reference. Keep `main.js`/3D page on `MajorSector` + chance.

### Phase B — Rogue page scaffold
4. Rewrite `rogue.html`: load `lib/rot.min.js`, `lib/d3.v7.min.js`, `lib/lil-gui.0.20.js`, `lib/localforage.min.js`, `src/main.css`, `src/engine/render/threeHost.css`; module entry `src/rogue.js`. NO `chance.slim.js`.
5. Rewrite `src/rogue.js`: drop Preact/htm. Plain `App` object. Import `generateSector` (engine), `RogueSector` (display), `PRNG`, `MakeName`, `SPECTRAL_COLORS`. Set `window.App`. Create `DB` (localforage "RogueGalaxies"). Create lil-gui.

### Phase C — Sector ASCII view
6. On load: generate a random sector via `generateSector(seed, {bounds:{r:50}})` (pure engine data, no Three.js). Store systems.
7. Render sector with `ROT.Display` (~100×50). Map each system to a glyph by spectral class (reuse `RogueSector`/`GLYPHS`). Draw empty space `.` elsewhere.
8. Click handling: `ROT.Display` `eventToPosition` → find system at tile → show basic data (name, spectral, multiplicity, #planets, habitable count) in a side info panel (plain DOM).
9. Toast: on system click show a small toast "View system X?" Yes/No. Yes → enter system view.

### Phase D — System ASCII view
10. System view: render star + planets as ASCII (star glyph center, planets by orbit) from the rogue system object.
11. lil-gui: bind editable props (name, starClass, seed, #planets) to the system object; on change regenerate/redraw. "Back to Sector" nav.
12. Stub `planet > region > area > site` drill-down: clicking a planet shows a placeholder panel.

### Phase E — Persistence (light)
13. Save sector seed to localforage; "New Sector" button regenerates.

## Relevant files
- `src/engine/galaxy/sector.js` — fix + export `generateSector` (NEW STANDARD)
- `src/engine/galaxy/sector_old.js` — keep for reference (do NOT delete, do NOT import)
- `src/engine/rogue/sector.js` — display `RogueSector` (keep as-is)
- `src/engine/random_name.js` — refactor `MakeName` off chance → PRNG/alea
- `src/rogue.js` — rewrite (drop Preact, no chance)
- `rogue.html` — rewrite (load rot.js, lil-gui; NO chance)
- `src/engine/random.js` — `PRNG` (alea) source of truth
- `src/engine/constants/defaults.js` — `SPECTRAL_COLORS`
- `src/engine/mixins.js` — `_` mixins

## Verification
1. Open `rogue.html` → random sector renders as ASCII grid with colored star glyphs.
2. Click a star → info panel + toast with Yes/No.
3. Yes → system view renders star + planets; lil-gui edits redraw.
4. Click a planet → placeholder region panel (no crash).
5. Open `index.html` → still works (unchanged, MajorSector + chance intact).
6. Console: no errors; `window.App` defined; `ROT` global present.

## Out of scope
- Three.js rendering on rogue page
- Full galaxy save/load UI
- planet/region/area/site generation (stubbed)
- Deleting `sector_old.js` (kept for reference)
- Full chanceJS removal from 3D page
