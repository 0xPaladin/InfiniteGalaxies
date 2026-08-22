# Infinite Galaxies — Project Vision Plan

> Scope note: This document is a **vision cast only**. No code is produced here. It defines the
> target experience, the architecture pillars, and the phased roadmap the codebase will follow.

## 1. The Vision

Infinite Galaxies is a fully **seeded, procedural world-building engine** that lets a player or world-builder
drill from the **galactic scale down to the level of individual buildings** — without ever leaving one
continuous, deterministic universe.

You start in the void of a galaxy. You click a sector. That sector reveals a star system. You click a
planet. That planet opens into a region with terrain, biomes, and population. Every layer is generated
from a single seed chain, so the same galaxy always yields the same worlds, systems, and cities.

The experience is **bottom-up seeded and top-down explored**: a coarse simulation seeds populations at the
top, and exploration generates detail only where you look.

---

## 2. Core Pillars

| # | Pillar | Meaning |
|---|--------|---------|
| P1 | **Zoomable granularity** | Galaxy → Sector → System → Planet → Region → Buildings. Each level is a real, explorable space. |
| P2 | **Seeded & procedural** | One master seed derives every child seed deterministically. No hand-authored content. |
| P3 | **Rough-first MVP** | Ship a Rogue-style ASCII display first to validate flow quickly, then layer visuals. |
| P4 | **Reuse, don't rebuild** | Keep the proven `galaxy` engine and `starry-host` canvas visuals from `main`. |
| P5 | **External data integration** | Planet & region generation come from `AFMGData`, not from scratch. |
| P6 | **Population-first** | A Conway-style Game-of-Life simulation seeds populations at sector/system/planet before detail gen. |

---

## 3. Target Experience (End State)

1. Launch into a **galaxy view** rendered with the existing simple canvas "starry host" visuals.
2. **Click a sector** → it generates and reveals a **star system** using the current engine code.
3. **Click a planet** → it generates a **region** (terrain + population) and opens a **Rogue ASCII display**.
4. **Click to zoom** → the region reveals **buildings / structures** as the deepest layer.
5. At every level, the content was already *seeded* by the top-level population simulation, so the
   world feels alive and consistent even before you visit it.

---

## 4. Architecture Decisions

### 4.1 Keep what works
- **Galaxy engine** from `main` stays as the backbone (Galaxy → MajorSector → System classes).
- **Starry-host simple canvas** visuals for the galaxy/sector/system backdrop remain.
- Click → generate-child flow already exists; we extend it one level deeper (planet → region → buildings).

### 4.2 Rogue ASCII layer (new)
- A lightweight **Rogue/ASCII renderer** is the first display for planet and region exploration.
  - Rationale: fastest path to a playable MVP; no shader/mesh work required to validate the flow.
- Later, richer visuals can be added behind the same data model without changing the seed chain.

### 4.3 Remove current planet visuals/generation
- The existing World-Engine-based planet meshes, shaders, and procedural terrain generation are
  **removed** from the active pipeline.
- **Region generation is pulled from `git@github.com:0xPaladin/AFMGData.git`.**
- **Habitable planet generation is also sourced from `AFMGData`** (that is all it currently provides).
- **All non-habitable world types must be implemented in this project** (see 4.4). `AFMGData` does
  not yet cover them.

### 4.4 Planet type coverage
Sourced from `AFMGData` ( habitable only ):
- **Habitable** worlds (earth-like / life-bearing) — provided by `AFMGData`.

Implemented in-house ( `AFMGData` does NOT cover these yet ):
- **Rocky** worlds
- **Icy** worlds
- **Hostile** worlds
- **Barren** worlds
- **Airless moons** (treated as a moon variant of airless bodies)

> Note: A shared planet-type interface should wrap both sources so the Rogue renderer and seed chain
> treat habitable and non-habitable planets identically.

### 4.5 Seed chain
```
galaxySeed
  └─ sectorSeed  (derives from galaxySeed + sector coords)
       └─ systemSeed (derives from sectorSeed + system index)
            └─ planetSeed (derives from systemSeed + planet index)
                 └─ regionSeed (derives from planetSeed + region coords)
                      └─ buildingSeed (derives from regionSeed + cell coords)
```
All seeds are deterministic functions of their parent + coordinates. No randomness outside the chain.

---

## 5. Population Simulation (Top-Down Seeding)

Before any detail is generated, a **simple Conway Game-of-Life** simulation runs at the galaxy level:

- Seeds initial population "cells" across the galaxy grid.
- Evolves populations outward, distributing them to **sectors → systems → planets**.
- Each sector/system/planet receives a **population signature** from this sim, which then biases
  (but does not dictate) the procedural generation below it:
  - More populated planets get more regions/buildings seeded.
  - Sparse sectors stay quiet.

This makes the universe feel inhabited and coherent from the very first click, even though geometry
is only built on demand.

---

## 6. Phased Roadmap

### Phase 0 — Foundations (already partially present)
- [x] Galaxy engine (Galaxy / MajorSector / System) on `main`.
- [x] Starry-host canvas visuals for galaxy/sector/system.
- [x] Click → generate-child interaction flow.

### Phase 1 — Rogue MVP (rough, fast)
- [ ] Add **Rogue ASCII display** as the planet/region explorer.
- [ ] Wire galaxy click → sector → system using **current code** (no changes to generation).
- [ ] Confirm the full click chain works end-to-end with placeholder ASCII output.

### Phase 2 — Remove old planet layer
- [ ] **Remove** current World-Engine planet visuals & generation (meshes, shaders, terrain).
- [ ] Pull **habitable planet + region generation** from `AFMGData`.
- [ ] **Implement in-house** the non-habitable types: rocky / icy / hostile / barren worlds and
      airless moons (wrap them behind the same planet-type interface as AFMGData habitable worlds).

### Phase 3 — Planet Rogue display
- [ ] Develop the **Rogue display for planets** (ASCII terrain + population overlay).
- [ ] Map AFMGData planet output into the Rogue renderer.

### Phase 4 — Region & buildings
- [ ] Click-to-zoom from planet → **region** generation (AFMGData region gen).
- [ ] Render region in Rogue ASCII.
- [ ] Deepest layer: **buildings / structures** generated from region + population seed.

### Phase 5 — Population-first integration
- [ ] Implement **Conway Game-of-Life** at the top of the seed chain.
- [ ] Propagate population signatures to sector / system / planet.
- [ ] Have generation consume the population signature for consistency.

### Phase 6 — Polish & consistency
- [ ] Verify full seed-chain determinism (same galaxy → same every layer).
- [ ] Performance pass: generate only visited children.
- [ ] Optional: richer visuals behind the Rogue data model (future, not in scope here).

---

## 7. Open Questions / Risks

- **AFMGData API surface**: Need to confirm the exact import/function signatures for planet and
  region generation before Phase 2 integration.
- **Conway scale**: Galaxy grid resolution vs. sector count — must be tuned so population feels
  meaningful without exploding compute.
- **Building layer definition**: "Individual buildings" needs a concrete data model (what a building
  is, how it's placed on a region grid) — to be specified in Phase 4.
- **Rogue renderer scope**: Decide whether Rogue ASCII is temporary (MVP) or a permanent "classic"
  mode alongside future visuals.

---

## 8. Success Criteria

1. From a single galaxy seed, a user can click down to **buildings** through sector → system → planet → region.
2. The **same seed always reproduces the same universe** at every level.
3. Population distribution from the top-down sim is visible and consistent at the planet/region level.
4. The MVP ships with **Rogue ASCII** visuals first, proving the flow before any heavy rendering.
5. Old World-Engine planet generation is fully removed; planet/region gen comes from `AFMGData`.
