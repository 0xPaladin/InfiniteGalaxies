# Population & Culture Plan (Phase 5)

> Status: **draft for review**. No code written yet. This is the plan for the Conway-based galaxy
> population layer described in `VISION.md` §5 and left as a seam in Phase 1
> (`populationOf()` in `src/engine/galaxy/galaxy_gen.js`).

---

## 0. Ground rules carried forward

Same rules as every phase so far — restated because they constrain the design more than usual here:

- **Generation and display stay separate.** The sim produces a plain, `structuredClone`-safe object.
  Nothing in `src/engine/population/` draws, and nothing in it touches the DOM. Renderers under
  `src/engine/rogue/` read it. `src/rogue.js` is the only file that calls both.
- **No entropy inside `src/engine/`.** No `Math.random()`, no `Date.now()`. Every stochastic decision
  in the sim derives from `childSeed(galaxySeed, 'pop', step, ...)`.
- **The sim is a pure function of (seed, step count).** Running N steps twice gives byte-identical
  output. This is what makes step-back and persistence work, so it is a hard requirement, not a nicety.

---

## 1. What this phase delivers

1. A galaxy-level Game of Life over the 1000 ly sector grid, where every live cell belongs to a
   **culture** with a stable id and a lineage (`parent` chain).
2. Territory tracked per culture, including *former* territory (claimed-but-now-dead cells).
3. Deterministic **step forward / step back** through generations, exposed in the UI.
4. A real `populationOf()` — sectors stop returning a placeholder random number and start returning a
   **development** score derived from the sim.
5. The galaxy view colored by culture, not by fake density.

Explicitly **not** in this phase: buildings, per-planet population counts, faction politics, war.
Those need this layer to exist first.

---

## 2. Data model

### 2.1 The grid

One GoL cell per sector, on the same `(gx, gy)` integer grid `generateGalaxy()` already produces,
with the same circular radius cut. Cells outside the galaxy radius do not exist (they are not "dead",
they are absent — they never count as neighbors).

### 2.2 Culture record

```js
{
  id: 12,              // stable, monotonically allocated
  parent: 7,           // culture this descends from, or null for a founding culture
  bornStep: 3,         // generation it was created
  deadStep: null,      // generation it last had a live cell, or null if still alive
  color: '#a4c8ff',    // derived from seed at birth, for display
  origin: [gx, gy]     // where it started — useful for lineage display later
}
```

Cultures are **append-only**. A culture is never mutated or deleted; extinction and schism both work
by allocating a *new* id that points back at the old one via `parent`. That gives a full dynasty tree
for free, which is what cultural variance (§6) will hang off.

### 2.3 Generation snapshot

One per step. This is the unit the UI scrubs through:

```js
{
  step: 4,
  cells: [                        // only cells that have ever been claimed
    { gx, gy, alive: 1, culture: 12, claims: [12, 7] }   // claims[0] is current owner
  ],
  cultures: { 12: {stats}, ... }  // per-culture derived stats for THIS step
}
```

Per-culture per-step stats (derived, recomputed each step, never hand-maintained):

```js
{ id, aliveCount, territoryCount, com: [x, y], radius }
```

`com` is the center of mass of that culture's **live** cells; `radius` is the mean distance of live
cells from `com`. Both feed the mix-resolution rule and the development score.

### 2.4 Sim output

```js
{
  seed, radius,
  steps: 64,                 // how many generations were run
  history: [snapshot, ...],  // index === step
  cultures: { id: cultureRecord }   // the append-only registry, all steps
}
```

---

## 3. The step rule

Standard B3/S23 Conway on the `alive` flag — unchanged from the classic rule, as you specified:

- live cell with < 2 live neighbors → dies
- live cell with 2 or 3 → survives
- live cell with > 3 → dies
- dead cell with exactly 3 live neighbors → born

Culture assignment layers on top and only matters for the **birth** case.

### 3.1 Mixed-parent birth resolution

When a cell is born and its 3 live neighbors do not all belong to the same culture, score each
candidate culture `c` and take the highest:

```
score(c) = W_SIZE * (c.aliveCount / maxAliveCount)
         + W_PROX * (1 / (1 + dist(cell, c.com)))   // normalized across candidates
```

Ties break on **lowest culture id** so the result is deterministic regardless of neighbor iteration
order. Starting weights `W_SIZE = 0.5`, `W_PROX = 0.5` — both tunable, and I'd expect to tune them
once we can see it running.

Intuition: a big empire absorbs a contested border cell, unless a small culture is sitting right on
top of it. That matches "comparing closeness to center of culture mass and total number of culture
cells" — but the exact blend is a knob, and §8 asks how you want it weighted.

### 3.2 Extinction and successor birth

After the life step, any culture with `aliveCount === 0` that had live cells last step is marked
extinct (`deadStep = step`). Then, for **each of its former cells** (cells whose `claims[0]` is that
culture), roll `P_SUCCESSOR`. On a hit: allocate a new culture with `parent = deadCultureId`, and
bring that cell back alive under the new id.

This is the "ashes of empire" rule — a dead culture's old territory keeps sparking successor states.
Starting `P_SUCCESSOR = 0.05` per former cell.

### 3.3 Schism / id change

Each step, for each *living* culture, roll `P_SCHISM`. On a hit: allocate a new id with
`parent = oldId`, and transfer that culture's territory to the new id. The old id stays in the
registry with `deadStep` set, so history and lineage remain intact.

Starting `P_SCHISM = 0.01` per culture per step.

Open: whether a schism moves **all** claimed cells or **splits** the culture geographically (see §8).
The spec reads as a whole-culture rename, so that's what's planned unless you say otherwise.

### 3.4 Founding refill

The old `Cultures` class re-seeded a few new cultures every step, which is what kept the galaxy from
grinding to a halt. I'd keep that: each step, `1d6+3` new founding cultures (`parent = null`) placed
by short random walk, exactly as the old code did.

**Worth knowing before you approve:** plain B3/S23 from a random soup is extinction-prone. After ~50
steps most of the grid settles into still-lifes and blinkers with maybe 3–5% of cells alive. That may
be *desirable* — stable pockets read as "settled space", the dead-but-claimed cells read as "old
frontier" — but the galaxy will not look busy. The refill rule plus §3.2 successors are the two things
counteracting it. If you want a denser, more churning galaxy, the honest lever is using a different
rule set (e.g. B36/S23 "HighLife", which has replicators) rather than fighting Conway with parameters.
Flagged as a decision in §8.

---

## 4. Step forward / back

The sim runs `steps` generations up front and keeps every snapshot in `history`. Stepping is then just
an index change — no recomputation, instant in both directions.

Cost check: galaxy radius 50 → ~7,850 cells. A snapshot only stores *claimed* cells, which is a
fraction of that. 100 steps of history is a few MB at worst, and it never touches disk (§5).

Running further forward than `steps` appends new snapshots; stepping back never discards them.
Because the sim is seed-deterministic per step, replaying from step 0 must reproduce `history`
exactly — that's the test in §7, and the fallback if history ever needs to be dropped for memory.

---

## 5. Persistence

Unchanged from the existing contract: **only the seed and the navigation path are saved.** The
population sim is content, so it is never persisted — it is recomputed from `galaxySeed` on load. The
save gains exactly one field: the current `step`, so reloading returns you to the same generation.

---

## 6. From culture to sector development

This is the part your message flags as unresolved, so here is a concrete proposal to react to.

### 6.1 Development score

```
proximity  = 1 - clamp(dist(sector, culture.com) / culture.radius, 0, 1)
development = (alive ? 1.0 : 0.4) * proximity
```

Range 0–1. Live cells near their culture's heart score highest; dead-but-claimed cells at the edge
score near zero. Bucketed into five tiers:

| Tier | Range | Reads as |
|---|---|---|
| Core | 0.80–1.00 | Culture heartworld, dense and old |
| Settled | 0.55–0.80 | Established space |
| Frontier | 0.30–0.55 | Actively expanding edge |
| Fringe | 0.10–0.30 | Thin presence |
| Abandoned | < 0.10 | Claimed once, empty now |

### 6.2 What development actually *does*

Proposal — development biases sector generation without dictating it:

- **Habitable-world count** (`nHab`, already a `generateSector` parameter): scales with tier. This is
  the cleanest hook because the parameter already exists and is already wired to the UI.
- **Site density in regions** (`siteCount` in `generateRegion`): Core sectors get more settlements
  and fewer ruins; Abandoned sectors get the inverse — mostly ruins, few settlements. `region.js`
  already picks between `settlement / outpost / ruin / marker`, so this is a weighting change, not
  new machinery.
- **System naming**: culture-derived name pools rather than the current generic one (needs §6.3).

`populationOf(node)` returns the development score, so `RogueGalaxy` keeps working with no change
beyond swapping density glyphs for culture colors.

### 6.3 Cultural variance

The lineage tree from §2.2 is the natural carrier, but "what varies" is genuinely undecided. My
suggestion for a **minimum viable** version, deliberately small:

```js
traits: { expansionist: 0.7, industrial: 0.3, insular: 0.5 }   // 0..1, three axes
```

- A founding culture rolls its traits from its seed.
- A child culture (successor or schism) **inherits parent traits with drift** — `±0.15` per axis.
  That makes dynasties feel related without being identical, and it costs almost nothing.
- Traits feed §6.2: `expansionist` nudges habitable count, `industrial` nudges settlement-vs-ruin
  weighting, `insular` nudges naming/aesthetics.

Naming is the other obvious axis — a culture could own a name-pool seed so its systems share a
linguistic flavor, which `random_name.js` could consume directly. Cheap and high-impact visually.

---

## 7. Files & verification

**New:**

| File | Role |
|---|---|
| `src/engine/population/culture.js` | Culture record, registry, id allocation, lineage, trait drift |
| `src/engine/population/life.js` | Pure GoL step + mix resolution. No I/O, no seeds — takes an RNG |
| `src/engine/population/sim.js` | `generatePopulation(galaxySeed, opts)` → sim output; owns seeding per step |
| `src/engine/rogue/population.js` | Culture-colored galaxy overlay + lineage/legend rendering |

**Modified:**

| File | Change |
|---|---|
| `galaxy_gen.js` | `populationOf()` returns real development; sectors carry `{cultureId, alive, development, tier}` |
| `rogue/galaxy.js` | Color by culture, glyph by tier |
| `rogue.js` | Step forward/back controls; persist current step |
| `sector.js` | Accept development/traits to bias `nHab` |
| `planet/region.js` | Accept development to bias site kind weighting |

**Verification** (extending the existing Node harness pattern):

1. Determinism — same seed + step count → byte-identical `history`.
2. Replay equivalence — replaying step-by-step from 0 reproduces the snapshot array exactly.
3. `structuredClone`-safety of the whole sim output (no live culture object refs on cells — ids only).
4. Lineage integrity — every non-null `parent` resolves to a real culture, and the graph is acyclic.
5. Conservation — a cell's `claims[0]` is always a culture that existed at that step.
6. Step-back purity — stepping forward 20 and back 20 lands on an identical snapshot.

---

## 8. Decisions (resolved 2026-08-23)

1. **Galaxy grid scale.** `radius: 50` (Milky-Way scale, ~7,850 sectors). This is now the default
   for `generateGalaxy()`/`generatePopulation()`, replacing the old `radius: 8` placeholder default.
2. **Rule set.** **B36/S23** ("HighLife" — birth on 3 or 6 neighbors, survive on 2 or 3), not classic
   B3/S23. HighLife has replicator structures, which counteracts the quiet-late-galaxy problem noted
   in §3.4 without hand-tuning extra parameters.
3. **Mix weighting.** Equal weight (`W_SIZE = W_PROX = 0.5`) confirmed for contested-birth scoring.
4. **Schism semantics.** **Geographic split**, not a whole-culture rename. On a schism roll, the
   culture's owned cells (alive + claimed-dead) are bisected by a seeded random line through their
   center of mass; one side keeps the old id, the other becomes a new culture with
   `parent = oldId`. The old culture is *not* marked extinct — it keeps living with reduced
   territory. If the split would leave one side empty (degenerate geometry), the roll is skipped that
   round rather than forcing an empty culture into existence.
5. **Development meaning.** §6.2 as proposed — habitable-world count, region site-kind weighting,
   culture-flavored naming (naming deferred, see #6).
6. **Cultural variance.** Keep the three axes from §6.3 (`expansionist`, `industrial`, `insular`) and
   add a fourth: **`alien`** — how far a culture's psychology sits from human-legible norms, intended
   to later bias politics/statecraft (diplomacy, treaty-legibility, etc. — not built this phase).
   Culture-flavored **naming is explicitly deferred** past this phase; traits are tracked and drifted
   now so the data exists when naming is tackled.
7. **Step count.** 40 generations by default, confirmed.

---

## 9. Build order & what's actually implemented this pass

1. `culture.js` + `life.js` — pure, seed-free mechanics (registry, trait roll/drift, neighbor
   counting, B36/S23 rule, contested-birth scoring). **Built.**
2. `sim.js` — orchestrates `steps` generations (genesis founding → per-step life/extinction/
   successor/schism/refill → snapshot), verified via the Node harness checks in §7. **Built.**
3. `populationOf()` swap in `galaxy_gen.js` — now reads real development from the current population
   snapshot instead of the placeholder random signature. **Built.** (The seam's signature gained an
   optional second `popIndex` argument for O(1) per-sector lookup — see the file for why; callers
   that don't pass one still get a safe fallback.)
4. Culture-colored galaxy rendering (`rogue/galaxy.js`) + step forward/back controls and `popStep`
   persistence (`rogue.js`). **Built.**
5. Feed development into `sector.js` (`nHab` bias) / `region.js` (site-kind weighting via
   `industrial`). **Deferred** — not built this pass. `populationOf()`/the snapshot already carry
   everything needed (`development`, `tier`, `traits`); wiring them into generation params is
   straightforward but was cut for scope. Flagging explicitly rather than silently skipping.
6. Cultural variance beyond the trait vector itself (i.e., naming) — **deferred past this phase**,
   per decision #6.

Steps 1–2 are the real work and the real risk; §10 below reports what the verification run found.

---

## 10. Verification results (radius 50, 40 steps, seed `POPTEST`)

All six §7 checks pass: determinism across reruns, replay-prefix equivalence, `structuredClone`
safety, lineage acyclicity/resolvability, claim conservation, and consistent index lookups.

| Step | Claimed cells | Alive | Alive ratio | Living cultures |
|---|---|---|---|---|
| 0 | 196 | 196 | 100% | 77 |
| 1 | 272 | 165 | 60.7% | 50 |
| 5 | 427 | 184 | 43.1% | 48 |
| 10 | 620 | 230 | 37.1% | 60 |
| 20 | 976 | 308 | 31.6% | 77 |
| 30 | 1489 | 442 | 29.7% | 92 |
| 40 | 2079 | 564 | 27.1% | 110 |

400 cultures born over the run, 66 of them with a `parent` (successors + schism children), so both
lineage mechanics fire at a reasonable rate. Runtime ~1.5s for the full 40 steps — a one-time cost
paid on galaxy entry.

**The decision #2 bet paid off.** HighLife settles at a ~27–31% alive ratio and keeps *growing*
territory rather than collapsing, which is exactly what classic B3/S23 would not have done. Tier
distribution at step 40: 1427 abandoned, 371 fringe, 219 frontier, 31 settled, 31 core — a galaxy
with a lot of ruins and a few bright spots, which reads correctly.

---

# Phase 6 — Habitation: linking the sim to actual places

> Status: **draft for review.** Everything below is unbuilt. This is the plan for pushing the
> culture simulation down the whole chain — sector → system → planet → region — so that development
> produces *actual settlements*, not just a color on the galaxy map.

## 11. What this phase delivers

1. **Bioform** on every culture — what kind of life it is, which determines which worlds it wants.
2. **Technology Level** on every culture — how far it has come since its first interstellar jump,
   which determines what it can build, how many of it there are, and whether it eventually leaves
   the galaxy entirely.
3. A **habitat catalog** covering far more than habitable worlds: barren-world domes, deep space
   stations, gas giant cloud cities, mining outposts, orbital shipyards, research stations,
   megastructures, ruins.
4. **Habitation generation at every level**, so a sector knows its stations, a system knows which
   planets are settled, and a region's sites stop being decorative and become real places with
   populations.
5. A **population count** per habitat — the number buildings will eventually be derived from.
6. **Occupied "empty" space** — ruins, derelicts, pirate havens, and pre-spacefaring native cultures
   on worlds nobody has claimed.

### 11.1 The problem this fixes

Right now the culture sim colors the galaxy and stops. `generateSector` ignores development
entirely, and `region.js` invents its sites from terrain alone — a "settlement" in a region has no
connection to whether anyone actually lives in that part of the galaxy. Worse, the *only* thing
that could plausibly be settled is a habitable world, which makes 90% of the galaxy dead space.

The fix is a **culture context** that flows down the existing generation chain, plus a habitat model
that treats "where can people live" as a function of `bioform × world type × development` rather
than `HI <= 2`.

## 12. Bioform

A new field on the culture record. This is the answer to "which planet types do they favor."

| Bioform | Favors | Baseline `alien` | Notes |
|---|---|---|---|
| `terran` | habitable worlds | 0.10 | Carbon/water life. The human-legible default |
| `cryophile` | icy worlds | 0.45 | Slow metabolism, methane/ammonia chemistry |
| `thermophile` | hostile worlds | 0.50 | Venus-like highs, sulfur chemistry |
| `lithic` | barren, rocky, airless | 0.55 | Silicate/rock-dwelling, vacuum-tolerant, subsurface |
| `gasborne` | gas giants | 0.70 | Aerial, buoyant — the natural cloud-city builders |
| `machine` | anything, prefers airless/vacuum | 0.85 | Synthetic. Indifferent to atmosphere and temperature |

> **Expansion content (not this phase):** `aquatic`/`amphibious`, `hive`, and `energy`/`plasma`
> bioforms are deliberately parked. Each of them wants a world type or habitat rule that doesn't
> exist yet (ocean worlds, hive-scale density mechanics, non-corporeal habitation), so adding them
> now would mean six affinity columns of guesswork. Revisit when the world-type list grows.

### 12.1 Affinity table

Affinity is `0..1` — how much a bioform wants a given surface type. This single table is what makes
barren worlds, gas giants, and airless moons legitimately settleable instead of edge cases:

| Bioform | habitable | rocky | icy | hostile | barren | airless-moon | gas giant |
|---|---|---|---|---|---|---|---|
| `terran` | **1.00** | 0.50 | 0.30 | 0.10 | 0.20 | 0.20 | 0.10 |
| `cryophile` | 0.40 | 0.30 | **1.00** | 0.05 | 0.20 | 0.30 | 0.20 |
| `thermophile` | 0.30 | 0.40 | 0.05 | **1.00** | 0.30 | 0.10 | 0.30 |
| `lithic` | 0.30 | 0.80 | 0.40 | 0.40 | **1.00** | 0.80 | 0.05 |
| `gasborne` | 0.20 | 0.10 | 0.10 | 0.30 | 0.05 | 0.05 | **1.00** |
| `machine` | 0.40 | 0.60 | 0.60 | 0.70 | 0.80 | **0.90** | 0.40 |

Note that no row is all-zeros off its favorite — a terran culture *will* put a mining outpost on a
barren moon, it just won't build a city there. That's the "chances for development on barren worlds"
you asked for: it falls out of affinity being a multiplier on scale, not a gate on presence.

### 12.2 Inheritance and the `alien` binding

- **Founding** cultures roll a bioform, weighted: `terran` 30, `lithic` 25, `cryophile` 15,
  `thermophile` 15, `gasborne` 8, `machine` 7. Terran-ish life stays common; cloud-dwellers and
  machine intelligences stay rare enough to feel like a find.
- **Successor/schism** children **inherit the parent's bioform**, with a 5% chance of drifting to an
  adjacent one. Lineages therefore mean something biologically, not just politically — a dynasty of
  lithic cultures keeps colonizing the same kind of rock.
- **`alien` seeds from bioform, then drifts free.** At *founding*, `alien = bioformBaseline ± 0.15`,
  so a new `terran` culture starts around 0.10 and a new `machine` culture around 0.85. From there it
  drifts ±0.15 per inheritance with **no clamp back toward the baseline** — only to `0..1`. Over
  enough generations a terran lineage genuinely can reach 0.9 and become unrecognizable while staying
  biologically terran. Bioform says what they're made of; `alien` says how far their minds have
  wandered from it, and the two are free to diverge. The other three axes (`expansionist`,
  `industrial`, `insular`) keep rolling and drifting exactly as they do now.

> **Migration note:** this changes existing culture records. Since nothing is persisted but the seed,
> there's no save-compat problem — galaxies just regenerate with bioforms.

## 12A. Technology Level (TL)

TL tracks how far a culture has come since it started crossing between stars. It is the second big
addition this phase, and unlike bioform it **reaches back into the Phase 5 simulation** — see §12A.4,
which changes already-built code.

### 12A.1 The scale

| TL | Meaning |
|---|---|
| 0–1 | Pre-agricultural → bronze age |
| 2 | Industrial |
| 3 | Information age, orbital-capable, **not interstellar** |
| **4.0** | **Basic interstellar spaceflight — where every culture in the sim begins** |
| 4.0–4.9 | Expanding interstellar civilization |
| 5.0–5.9 | Post-scarcity; megastructures, constructed habitats, world-ships |
| 6+ | Transcendence — the culture leaves. Not a playable state (§12A.3) |

TL 4.0 is the floor for anything in the Game of Life sim, because the sim models *interstellar
spread* — a culture that can't cross between stars can't claim a second sector. TL 0–3 cultures do
exist, but they live outside the sim entirely (§13.2).

### 12A.2 Advancement

Each step, a living culture rolls to advance by **+0.1**:

```
P(advance) = 0.35 * (0.5 + traits.industrial)     // ~0.17 to ~0.53
```

An industrious culture climbs roughly twice as fast as an incurious one. Expected pace for an average
culture is about one tenth every two steps, so a founding culture reaches ~TL 5.0 around step 30 of
40 — meaning **megastructures show up late and rare**, which is what makes them feel like an
achievement rather than set dressing. TL is hard-capped at **5.9**.

Inheritance:

- **Schism children inherit the parent's TL exactly.** A political split doesn't cost you your
  engineering.
- **Successor cultures inherit TL minus 0.1–0.5** — a dark age. They're scavengers rising in the
  ruins of something that already fell, and they've lost some of it.

### 12A.3 Transcendence

Once a culture reaches TL 5.0 it can leave. Each step:

```
P(transcend) = 0.02 * (1 + (TL - 5.0) * 2)        // 2% at TL 5.0, ~5.6% at TL 5.9
```

On a hit the culture is marked extinct with `extinctionCause: 'transcended'` (ordinary extinction
becomes `'died-out'`). This is a **second, entirely different way for a culture to end**, and a much
more interesting one: it doesn't die of overcrowding or isolation, it ages out of the simulation.

Transcendence is a real pressure on the late galaxy — the most advanced cultures keep removing
themselves, which frees space for younger ones and prevents any single culture from running away
with the map. It also means the highest-TL ruins in the galaxy belong to civilizations that were
doing *fine*, which is a better story than "everyone starved."

What they leave behind: intact, empty megastructures. Transcended cultures still permit successor
cultures (§3.2) — scavengers move into the abandoned rings — but their ruins are flagged so a
renderer can distinguish "this fell apart" from "they simply left."

### 12A.4 TL in contested claims — this changes Phase 5 code

You asked for TL to give an edge in contested births. That means the §3.1 scoring function gains a
third term, which **modifies already-implemented behavior** (decision #3 set it to a two-way equal
split):

```
score(c) = 0.40 * (c.aliveCount / maxAliveCount)      // territory
         + 0.40 * (1 / (1 + dist(cell, c.com)))       // proximity
         + 0.20 * ((c.TL - 4.0) / 1.9)                // technology, normalized 0..1
```

I kept size and proximity equal to each other, per your original decision #3, and gave TL a
deliberately smaller 0.20 share. Rationale: at full weight, TL would dominate — it only ever
increases, so a high-TL culture would win essentially every contest forever and the map would
ossify. At 0.20 it's a real thumb on the scale (a maxed 5.9 culture gets a +0.20 bonus, roughly the
difference between being adjacent to a cell and being three cells away) without erasing geography.
This is the number I'd most expect to retune after watching it run.

### 12A.5 TL and population — the inversion

As TL rises, headcount *falls*:

```
populationFactor = 0.6 ^ (TL - 4.0)      // 1.00 at TL 4.0, 0.60 at 5.0, ~0.38 at 5.9
```

A TL 5.9 culture has roughly a third the population of a TL 4.0 culture on comparable territory —
post-scarcity, long-lived, uploaded, or simply uninterested in growth. But their *structures* get
dramatically larger and more numerous (§13.1). The intended read: a young culture is a swarming
frontier of millions in tin cans; an old one is a handful of people in a ringworld.

## 13. The habitat catalog

Each habitat type declares where it can exist, what it needs, and how big it gets. `scale` is a
rough population magnitude, multiplied by development, affinity, and the TL population factor
(§12A.5) at placement time. **Min TL** is the new gate — it's what makes an old culture's territory
look categorically different from a young one's, not just bigger.

### 13.0a Baseline habitats (TL 4.0+)

| Habitat | Attaches to | Min TL | Min dev | Scale (pop) | Affinity source |
|---|---|---|---|---|---|
| `outpost` | planet surface | 4.0 | 0.10 | 10–1e3 | surface type |
| `mining outpost` | barren / rocky / airless / icy | 4.0 | 0.15 | 1e2–1e4 | `industrial` trait |
| `gas mine` | gas giant | 4.0 | 0.20 | 1e2–1e4 | `industrial` trait |
| `town` | planet surface | 4.0 | 0.30 | 1e3–1e5 | surface type |
| `orbital station` | any planet (in orbit) | 4.2 | 0.40 | 1e3–1e6 | flat 0.6 — orbit is bioform-neutral |
| `deep space station` | **sector directly** — no planet needed | 4.2 | 0.30 | 1e3–1e5 | flat 0.5 |
| `dome` | barren / airless / hostile / icy surface | 4.3 | 0.30 | 1e3–1e6 | max(affinity, 0.4) — sealed, so hostility matters less |
| `research station` | any surface, **bonus on hostile/extreme** | 4.3 | 0.45 | 10–1e3 | flat 0.5 — science goes where it's interesting |
| `city` | planet surface | 4.5 | 0.55 | 1e5–1e8 | surface type |
| `cloud city` | gas giant | 4.5 | 0.55 | 1e4–1e7 | gas giant affinity |
| `shipyard` | any planet (in orbit) | 4.6 | 0.70 | 1e4–1e5 | `industrial` trait |

### 13.0b Megastructures (TL 5.0+)

Per your note that high-TL cultures favor constructed habitats over planets, these don't just *add*
options — at TL 5+ they become the **preferred** ones (§15.1):

| Habitat | Attaches to | Min TL | Min dev | Scale (pop) | Notes |
|---|---|---|---|---|---|
| `orbital habitat` | any planet (in orbit), or sector | 5.0 | 0.40 | 1e5–1e7 | O'Neill-style constructed world. The default TL5 home |
| `arcology` | planet surface | 5.0 | 0.60 | 1e6–1e8 | Single-structure city; makes surface living viable anywhere |
| `capital ship` | **mobile** — attaches to sector, not a fixed body | 5.2 | 0.50 | 1e4–1e6 | A moving home. See the note below |
| `stellar collector` | system (around the star) | 5.4 | 0.70 | 1e3–1e5 | Dyson-swarm element. Low pop, enormous output |
| `ringworld segment` | system (around the star) | 5.7 | 0.85 | 1e7–1e9 | Rare. Effectively a TL-5.7+ core-world signature |

`capital ship` is the one genuinely new *kind* of thing here: a habitat with no fixed location, tied
to the sector rather than a body. Everything else in this plan attaches to a place. I've kept it
simple for now — it lives in the sector's habitation list like a deep space station — but it's worth
knowing it's the seed of a "fleets move between sectors" mechanic if that ever becomes interesting.

Deep space stations and capital ships are the structurally important cases: they attach to the
*sector*, not to any system, so a sector with development but no good worlds still has something in
it. That's what keeps a `gasborne` culture's territory from looking empty just because it has no gas
giants nearby.

### 13.1 Ruins come from the claim history — free

`snapshot.cells[].claims` is already a full ownership stack (`claims[0]` is current, the rest are
former owners). So a ruin isn't random decoration — it can be attributed to a **specific dead
culture**, with that culture's own bioform *and TL* deciding what kind of ruin it is. A `lithic`
predecessor leaves carved-out rock warrens; a `gasborne` one leaves a derelict floating platform; a
TL 5.7 predecessor leaves a ringworld segment nobody can maintain. This costs essentially nothing to
implement because the data is already there and already deterministic.

Ruin flavor keys off `extinctionCause` (§12A.3):

| Cause | Reads as |
|---|---|
| `died-out` | Collapsed, damaged, picked over |
| `transcended` | **Intact and empty.** Powered, sealed, nobody home |

### 13.2 Uninhabited space

Sectors with no living culture aren't empty. Four things can occupy them:

| Occupant | Where | Notes |
|---|---|---|
| `ruin` | Any cell with a dead former claimant | §13.1 |
| `derelict` | Sector-level, near old territory | Dead ships and stations, no owner |
| `pirate haven` | Sector-level, abandoned/fringe tiers | Crewed but not a culture. Higher chance near living territory — they need someone to prey on |
| **native culture** | Planet surface, TL 0–3 | See below |

**Native (pre-spacefaring) cultures** are the interesting addition. A TL 0–3 culture cannot cross
between stars, so it *cannot be in the Game of Life sim at all* — the sim models interstellar spread
and a bronze-age civilization has none. They are therefore a completely separate mechanism:

- Generated at the **planet** level, not the galaxy level, as a chance on any world whose surface can
  support the bioform in question.
- They have a bioform and traits like any culture, but a TL rolled in **0–3**, and no territory
  beyond their one world.
- They are **more likely in unclaimed or abandoned sectors** — not because life avoids empires, but
  because a starfaring culture that moves in tends to absorb, displace, or uplift them. A native
  culture inside living territory is a notable find, not the default.
- They don't participate in claims, contests, extinction, or transcendence. They just exist, on
  their one world, until someone arrives.

This gives unclaimed space three distinct textures — dead ruins, opportunistic scavengers, and
worlds with someone still on them who has no idea anyone else is out there — instead of one.

## 14. Architecture: the culture context

The plumbing concept that links everything. Derived **once** when entering a sector, then threaded
down as an argument — never as a live object reference (§0: no cycles, must stay clonable).

```js
CultureContext = {
  cultureId,                 // or null for unclaimed space
  bioform,                   // 'terran' | 'lithic' | ...
  tl,                        // 4.0 .. 5.9 — gates habitats, scales population
  traits,                    // {expansionist, industrial, insular, alien}
  development,               // 0..1 from the current snapshot
  tier,                      // 'core' | 'settled' | 'frontier' | 'fringe' | 'abandoned'
  alive,                     // is the holding culture still living
  formerClaims               // [{cultureId, bioform, tl, extinctionCause}] — for ruin flavor
}
```

`formerClaims` is resolved eagerly rather than passing raw ids, so ruin generation doesn't need a
live reference back into the culture registry (§0: no cycles, must stay clonable).

### 14.1 New modules

| File | Role |
|---|---|
| `src/engine/population/bioform.js` | Bioform definitions, affinity table, weighted roll, inheritance drift |
| `src/engine/population/tech.js` | TL scale, advancement roll, transcendence roll, population factor |
| `src/engine/population/habitat.js` | The habitat catalog + eligibility/scale rules. Pure data + predicates |
| `src/engine/population/habitation.js` | `generateSectorHabitation` / `generateSystemHabitation` / `generatePlanetHabitation` |
| `src/engine/population/native.js` | TL 0–3 pre-spacefaring cultures (§13.2) — outside the sim entirely |
| `src/engine/population/context.js` | `cultureContextFor(snapshot, cultures, gx, gy)` — builds the context above |

### 14.2 Modified

| File | Change |
|---|---|
| `culture.js` | Add `bioform` + `tl`; seed `alien` from bioform baseline; inherit bioform/TL on successor (with dark-age TL loss) and schism (full TL) |
| `life.js` | **`scoreCandidate()` gains the TL term** — reweighted 0.40/0.40/0.20 (§12A.4) |
| `sim.js` | Per-step TL advancement + transcendence rolls; `extinctionCause` on the culture record |
| `sector.js` | Accept `ctx`; bias `nHab` by development; attach sector-level habitation (deep space stations, capital ships, derelicts, pirate havens) |
| `planet/region.js` | Replace invented sites with sites **derived from** the planet's habitation record |
| `rogue/sector.js` | **Deep space stations get their own glyph** alongside stars (decision #6) |
| `rogue/system.js`, `rogue/planet.js`, `rogue/region.js` | Draw habitats + ruins |
| `rogue.js` | Build the context at sector entry; thread it down the stack |

### 14.3 Seed chain additions

```
sectorSeed|habitation           → deep space stations, capital ships, derelicts, pirate havens
systemSeed|habitation           → which planets get settled, orbitals, stellar megastructures
planetSeed|habitation           → surface habitats, cloud cities
planetSeed|native               → TL 0-3 native cultures (§13.2)
regionSeed|site|<i>             (already exists — now populated from habitation)
```

## 15. How a habitat actually gets placed

For each candidate site (a planet surface, a gas giant, an orbit, a star, or a sector slot):

```
affinity   = affinityFor(bioform, surfaceType)      // §12.1, or the habitat's override
eligible   = tl          >= habitat.minTL
             && development >= habitat.minDevelopment
             && habitat.attachesTo(surfaceType)
chance     = development * affinity * habitat.baseChance * expansionistFactor * tlPreference
population = habitat.scale.roll(rng) * development * affinity * populationFactor(tl)
```

`expansionistFactor` is `0.5 + traits.expansionist` — a land-hungry culture spreads onto marginal
worlds a cautious one ignores. `populationFactor` is the TL inversion from §12A.5. Every roll is
seeded off the chain in §14.3, so the whole habitation layer is as deterministic and replayable as
everything else.

### 15.1 `tlPreference` — why high-TL cultures leave the ground

Per your note that TL 5+ cultures favor constructed orbitals and capital ships, eligibility alone
isn't enough — a TL 5.5 culture would still build mostly cities, since cities are cheap and pass
every gate. So placement chance is additionally scaled by a preference that *shifts* with TL:

| Habitat class | TL 4.0–4.9 | TL 5.0–5.9 |
|---|---|---|
| Planet-surface (`city`, `town`, `outpost`, `dome`) | ×1.0 | **×0.5** |
| Constructed (`orbital habitat`, `capital ship`, `arcology`) | — (gated) | **×1.5** |
| Industrial (`mining`, `gas mine`, `shipyard`) | ×1.0 | ×0.8 |

The effect: a young culture's territory is a scatter of surface towns and mining camps. An old
culture's territory has fewer, larger constructed habitats and comparatively empty planets — even
habitable ones. That inversion is the most visible payoff of the whole TL system, and it's worth
checking explicitly (§16 test 7).

## 16. Verification

Extending the existing Node harness:

1. Determinism — same seed + step → identical habitation at every level.
2. `structuredClone` safety of all habitation output (ids only, no live culture refs).
3. **Bioform coherence** — a `gasborne` culture's largest settlement should be a cloud city;
   a `lithic` culture's should not be on a habitable world. Assert the *distribution*, not a
   single case.
4. **Barren worlds are actually settled** — across a sample of sectors, assert non-habitable worlds
   carry a meaningful share of total habitats. This is the explicit goal of the phase, so it gets an
   explicit test rather than an eyeball check.
5. Ruin attribution — every ruin resolves to a real, dead culture that genuinely held that cell,
   with a matching `extinctionCause`.
6. Development monotonicity — core sectors should out-populate fringe sectors on average.
7. **TL inversion holds** — sample high-TL vs low-TL cultures and assert that high-TL territory has
   (a) *lower* total population and (b) a *higher* share of constructed habitats. This is the whole
   point of §12A.5 + §15.1, and it's the kind of thing that silently fails to materialize if a
   multiplier is wrong, so it gets a direct assertion.
8. **TL distribution is sane over 40 steps** — no culture exceeds 5.9; founding cultures cluster near
   4.0; transcendence actually fires (non-zero count) but doesn't wipe out the high end entirely.
9. **Transcendence doesn't break lineage** — transcended cultures still permit successors, and the
   `extinctionCause` split accounts for 100% of dead cultures.
10. **Native cultures stay out of the sim** — no TL 0–3 culture ever appears in a snapshot's claim
    stack or contests a cell.

## 17. Decisions (resolved 2026-08-23)

1. **Bioform list.** Six as proposed. `aquatic`/`amphibious`, `hive`, and `energy`/`plasma` are
   tagged as **possible expansion content** (§12, callout) — parked until the world-type list grows
   enough to give them something to want.
2. **`alien` binding.** Seeds from bioform, then **drifts free** — no clamp back toward the baseline,
   so a terran lineage can become completely alien over enough generations (§12.2).
3. **Population realism → Technology Level.** This question surfaced a missing system rather than a
   number. TL is now tracked per culture: starts at 4.0 (basic interstellar), advances by tenths,
   caps at 5.9, drives transcendence, weights contested claims, inversely scales population, and
   gates megastructures. Fully specified in **§12A**, with catalog effects in §13.0b and §15.1.
4. **Uninhabited space.** Ruins, derelicts, pirate havens, unclaimed stations — **plus TL 0–3
   pre-spacefaring native cultures**, which sit entirely outside the Game of Life sim since they
   can't cross between stars (§13.2).
5. **Phase depth.** Option **(a)** — stop at the habitat record. A region shows "city, pop 2.3M" as a
   site; city/station interiors are a later phase.
6. **Sector-level display.** Deep space stations get **their own glyph** in the sector view alongside
   stars (§14.2).

## 18. Suggested build order

1. `bioform.js` + `tech.js` + the `culture.js` changes — small, self-contained, immediately
   inspectable by re-running the sim and eyeballing bioform and TL distributions.
2. `sim.js` + `life.js` changes: TL advancement, transcendence, `extinctionCause`, and the reweighted
   contest score. **Re-run the §7 and §16.8–9 checks here** — this modifies already-working Phase 5
   code, so it's the step most likely to regress something, and the §10 numbers give us a baseline to
   compare against.
3. `context.js` + `habitat.js` — pure data and predicates, no integration yet.
4. `habitation.js` for **one** level (planet) end to end, with the §16 tests. Prove the model before
   spreading it.
5. Extend habitation to sector (deep space stations, capital ships, derelicts, pirate havens) and
   system (orbitals, stellar megastructures).
6. `native.js` — TL 0–3 cultures at the planet level.
7. Rewire `region.js` sites to derive from habitation; render habitats at every level, including the
   sector-view station glyph.
8. Sector `nHab` biasing — deliberately last, because it changes what generates and will make earlier
   comparisons noisy if done first.

Steps 2 and 4 are where the risk is: step 2 because it touches working code, step 4 because it's
where the habitation model either holds together or doesn't. The rest is mechanical once those land.

---

## 19. Implementation results (2026-08-24)

Everything in §14.1/§14.2 is built: `bioform.js`, `tech.js`, `habitat.js`, `context.js`,
`habitation.js`, `native.js`, the `culture.js`/`life.js`/`sim.js` changes, and the wiring into
`sector.js`, `region.js`, `rogue/sector.js`, and `rogue.js`. All §7 and §16 verification checks
pass (determinism, replay equivalence, `structuredClone` safety, lineage integrity, conservation,
native cultures never entering the sim). Two things worth flagging:

**Development monotonicity (§16 test 6) is dramatic, not subtle.** Sampling 40 core/settled sectors
vs. 40 fringe/abandoned ones: core/settled had 59.6% of planets carry at least one habitat (235
total habitats, ~87.5M combined population); fringe/abandoned had 0.4% (one habitat, population 8).
The galaxy reads as mostly quiet with real pockets of development, which is the intended effect —
but it means casual exploration will find empty space far more often than settled space. That's
correct per the design, just worth knowing before judging a session's worth of clicking around as
"nothing's here."

**The TL population claim in §12A.5 holds per-habitat but not in aggregate — worth your attention.**
`populationFactor(tl)` does exactly what it says: the *same* habitat type (e.g. `city`) carries about
37% as much population at TL 5.9 as at TL 4.0 (measured: ratio 0.367 against a theoretical 0.379 —
matches). But a TL 5.9 culture's *total* settled population came out roughly 300x **higher** than a
TL 4.0 culture's in a like-for-like sample, not lower. The reason: reaching TL 5.0 unlocks five
additional megastructure types with much larger scale bands (`arcology` 1e6–1e8, `orbital habitat`
1e5–1e7, `ringworld segment` up to 1e9) that don't exist at all below TL 5.0, and §15.1's
`tlPreference` makes a high-TL culture roll for them more often. More eligible slots with bigger caps
overwhelms the per-habitat shrinkage. The "old civilization = a handful of people in a ringworld"
image from §12A.5's prose doesn't hold as written — a ringworld segment houses up to a billion by its
own scale band. The `constructedShare` shift *does* land as designed (0% → 71.2% of population in
constructed/megastructure habitats going from TL 4.0 to TL 5.9 in the same test), so the qualitative
story ("old cultures live in orbitals and megastructures, not on planets") is intact — it's
specifically the "and there are fewer of them in total" half of the narrative that the numbers don't
support. Options if this matters to you: shrink the megastructure scale bands, add a hard population
cap independent of habitat count, or drop that specific claim and keep the (verified, working)
constructed-vs-surface shift as the TL-5+ signature instead. Flagging rather than picking one
unilaterally, since it's a tuning/narrative call, not a bug.
