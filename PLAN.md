# Implementation Plan: Galaxy → Region → Population

> **Goal**: Enable click-driven drill-down from Galaxy to Region level, integrating AFMGData for habitable
> planets + regions, and preparing for a Conway-based population simulation before Phase 5.

---

## Prerequisites

| Step | Task | Owner | ETA |
|------|------|-------|-----|
| P0 | Verify AFMGData works from `git@github.com:0xPaladin/AFMGData.git` | Dev | Day 0 |
| P1 | Create `planet-type.js` interface that can route to AFMGData or in-house | Dev | Day 0.5 |
| P2 | Draft seed-chaining utility (`deriveSeed(parent, path)`) | Dev | Day 0.5 |

---

## Phase 0 — Phase 1: Rogue MVP (Click-Through Validation)

### 0.1 Update entry point to support both modes

- [ ] Add command-line switch `--rogue` (or detect via `rogue.html` entry)
- [ ] Keep `main.js` logic as `galaxy`/`sector`/`system` drill-down
- [ ] Create `rogue-main.js` that re-uses same engine but swaps planet renderer

### 0.2 Stub out Rogue ASCII display

- [ ] Create `src/rogue/rogue-view.js` — renders a simple rectangular grid with `#` for walls, `.` for floor
- [ ] Create `src/rogue/rogue-input.js` — keyboard movement (HJKUBYNB) or click-based navigation
- [ ] Display placeholder: "Welcome to Planet XYZ (Sector 1,2)" — proves the pipe

### 0.3 Verify click chain works

- [ ] Galaxy click → sector → system → **click planet** → opens **Rogue placeholder**
- [ ] Log seed chain to console to verify determinism
- [ ] Mark Phase 1 complete when user can traverse 4 levels without console errors

---

## Phase 2 — Remove Old Planet Visuals/Generation

### 2.1 Identify all WE planet code to remove

Files under `src/engine/` to **disable** / **delete**:
- `src/engine/system/we-planet.js` — WE planet terrain
- `src/engine/render/planet-shaders.js` — WE shader materials
- `src/engine/render/sun-shaders.js` — WE star shaders
- `src/engine/constants/colormap.js` — biome colormap (WE)
- `src/engine/constants/defaults.js` — WE defaults (will be re-evaluated)
- `src/engine/constants/sphere-mesh.js` — WE fibonacci sphere (will be re-evaluated)

Keep for now, but **tag with `DEPRECATED` comments**:
- Any file still exported from `planet-render.js` that needs to stay as adapters

### 2.2 Create planet-type abstraction

Create `src/engine/system/planet-type.js`:

```js
// exports:
//   getPlanetType(hi, classification) → 'habitable' | 'rocky' | 'icy' | 'hostile' | 'barren' | 'airless'
//   derivePlanetSeed(parentSeed, planetIndex) → number
//   createPlanetInstance(seed, type, opts) → PlanetInstance
```

### 2.3 Implement non-habitable types in-house

| Type | Implementation notes | Dependencies |
|------|---------------------|--------------|
| Rocky | Terrestrial world with solid crust, possible mountains/craters | simplex noise + height map |
| Icy | Frozen world, low temperature bias, ice layers | temperature offset < 0, moisture map inverted |
| Hostile | Toxic atmosphere, extreme temps, sparse life | high tempVariance, toxic overlays |
| Barren | No water, minimal atmosphere, dust storms | waterLevel = 0 |
| Airless Moon | Tidally locked to parent planet, cratered surface, no atmosphere | parent gravity, low seed |

**Deliverable**: A module `src/engine/system/planet-gen.js` containing these generation stubs that can be
replaced later when AFMGData grows.

---

## Phase 3 — Integrate AFMGData for Habitable Planets + Regions

### 3.1 Add AFMGData repository as submodule or inline

Option A: Git submodule `lib/AFMGData/`
```bash
git submodule add git@github.com:0xPaladin/AFMGData.git lib/AFMGData
```

Option B: Copy relevant files into `src/engine/peoples/AFMGData/`

### 3.2 Identify AFMGData API

Files to read:
- `lib/AFMGData/planet.js` — habitable planet generation
- `lib/AFMGData/region.js` — region/topography generation

### 3.3 Create `AFMGAdapter` wrapper

`src/engine/peoples/afmg-adapter.js`:

```js
import { generateHabitablePlanet } from '../../lib/AFMGData/planet.js';
import { generateRegion } from '../../lib/AFMGData/region.js';

export function getHabitablePlanet(seed, opts) {
  return generateHabitablePlanet(seed, opts);
}

export function getRegion(planetSeed, regionCoords) {
  return generateRegion(planetSeed, regionCoords);
}
```

### 3.4 Wire into click handler

Modify `main.js`:

```js
if (isHabitable) {
  const planetData = AFMGAdapter.getHabitablePlanet(seed, opts);
  // pass to Rogue display
} else {
  const planetData = InHousePlanetGen.generate(seed, type, opts);
}
```

---

## Phase 4 — Develop Rogue Display for Planet

### 4.1 Render planet name + type in Rogue header

### 4.2 Surface terrain features

Using whatever AFMGData returns (height map?), render:

```
^^^^^^^^^^^    <-- mountain peaks
.........../    <-- plains
..##.......    <-- slight elevation
...........
....###....
```

Legend:
- `^` = mountain
- `.` = flat
- `#` = hill / shallow elevation
- `~` = water (if habitable and opts.waterLevel > 0.2)

### 4.3 Add region click inside planet view

- When player clicks a cell in the planet grid, generate the region at that location.
- Region grid is smaller (e.g., 32x32 tiles within the 128x128 planet grid).

---

## Phase 5 — Population Simulation (Top-Down Seeding)

> This is the **final prerequisite** before full region/building chain can be validated.
> The Conway simulation runs once per galaxy, seeds population signatures that bias
> habitable-planet generation and are used for region/building expansion later.

### 5.1 Design Conway parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Grid | 16x16 cells per sector | Coarse, fast evolution |
| Initial random fill | 0.4 (40%) | Stable-ish patterns |
| Birth threshold (B3) | 3 neighbors | Standard Game of Life |
| Survival threshold (S23) | 2-3 neighbors | Standard Game of Life |

### 5.2 Create simulation runner

File: `src/engine/population/galaxy-population.js`:

```js
export function runPopulationSim(galaxySeed, width, height) {
  const grid = initGrid(galaxySeed, width, height);
  const generations = evolve(grid, 64); // run 64 ticks
  return generations[-1]; // final stable state
}
```

### 5.3 Propagation chain

For each sector cell `(x, y)`:
```js
const sectorSeed = deriveSeed(galaxySeed, `sector:${x},${y}`);
const popValue = finalGrid[x][y]; // 0 or 1

if (popValue) {
  majorSector.population = {
    density: popValue,
    seed: sectorSeed
  };
}
```

### 5.4 Use population to bias planet generation

In `getHabitablePlanet`:
```js
if (sector.population.density > 0.5) {
  opts.lifeRating = 0.9;
} else {
  opts.lifeRating = 0.2;
}
```

### 5.5 Deliverables

- [ ] `src/engine/population/conway.js` — pure Conway implementation
- [ ] `src/engine/population/seeding.js` — propagates pop to sectors/systems
- [ ] Integration test: running simulation yields same population distribution from same seed
- [ ] Debug view: render population density overlay on galaxy view (temporary)

---

## Timeline Estimate

| Week | Target |
|------|--------|
| Week 0 | Phase 0.1–0.3 complete, Rogue placeholder works |
| Week 1 | Phase 2 complete, WE planet code deprecated / removed |
| Week 2 | Phase 3 complete, AFMG habitable planets integrated |
| Week 3 | Phase 4 complete, Rogue planet view with terrain |
| Week 4 | Phase 5 complete, Conway population simulation functional |

---

## Acceptance Criteria

Before moving on to Phase 6 (buildings + regions):

1. **Deterministic seed chain**: Starting from Galaxy seed `12345`, drilled-down planet has the same
   generated region every reload.
2. **Rogue viewport works**: User can move around planet via keyboard/click within 32x32 tile view.
3. **AFMGData integration verified**: Habitable planet generation runs without errors and produces
   height/feature data the Rogue display can render.
4. **Population distribution visible**: Galaxy view can overlay (or console print) stable Conway
   evolution from sector grid.

---

## Next Steps After Phase 5

- Phase 6: Click to zoom → generate region at deeper grid, add building-level cells.
- Phase 7: Population density becomes building count, populate using Conway seed at region level.
- Phase 8: Polish, performance, optional richer tileset behind same data model.