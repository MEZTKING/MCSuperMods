# Vanilla world generation: what a mod has to match

*Compiled 2026-11-14 from measurements against Minecraft 26.3 worlds generated with the official server and compared block by
block. Everything below is a fact about vanilla's own behaviour (rules, numbers, data files); no vanilla code or assets are
included, and none is needed to use these notes.*

If your mod changes terrain, features, ores, trees, plants, structures or surfaces, the game will look wrong in ways that are
hard to debug unless the rules below hold. Each section says the rule, how it was verified, and the vanilla file that defines it.

---

## 1. Seeds and draws

**1.1 The decoration seed.** For a chunk `(cx, cz)`:

```
populationSeed = (cx * 16 * A + cz * 16 * B) ^ worldSeed      // A, B = two nextLong() | 1 draws from the seed's generator
decorationSeed = populationSeed
```

**1.2 A feature's seed.** `featureSeed = decorationSeed + index + 10000 * step` (`WorldgenRandom.setFeatureSeed`), where
`index` is the feature's position in the step's ordered list (see §2) and `step` is the decoration step (0–10). Structures use
the same formula with their own index in the step's structure list.

**1.3 The random source.** `WorldgenRandom` is a **legacy-style view** over `XoroshiroRandomSource`: `next(31)` for a bounded int
(with the power-of-two fast path), two 32-bit halves for a long, 26 and 27 bits for a double, 24 for a float, and
`nextBoolean()` = `next(1) != 0`. Do **not** take the raw Xoroshiro long's low bit — that is `XoroshiroRandomSource`'s own
method, and features never see it through `WorldgenRandom`.

**1.4 Angle maths.** `Mth.sin`/`Mth.cos` are a 65,536-entry table indexed by
`(long) (x * 10430.378350470453) & 65535` (cosine adds 16384 before the truncation). `Math.sin` is close enough for looks and
wrong for parity: ore blob radii and carver starts use the table.

**1.5 Positional seeds.** `RandomSource.forkPositional()` derives per-position sources by hashing the position; the zoomed biome
lookup's seed is `BiomeManager.obfuscateSeed(levelSeed)` — a **SHA-256 of the seed's 8 little-endian bytes**, first 8 bytes read
little-endian. Using any other "seed hash" (for example `new Random(seed).nextLong()`) puts every biome boundary a few blocks
off, which reads as terrain or material bugs far from the biome itself.

## 2. Ordering: which features run, and in what order

**2.1 `FeatureSorter`.** The step list is built without tags: features are numbered by first appearance across the world preset's
biomes, then a depth-first walk over each biome's consecutive-feature edges, reversed; each step keeps its own subsequence. The
index a feature gets is what §1.2 uses, so reordering a biome's feature list changes every later feature's random numbers.

**2.2 Which biomes' features run in a chunk.** `ChunkGenerator.applyBiomeDecoration` collects the biomes of **every section of
the 3 × 3 chunks around the chunk** from their raw biome palettes (`ChunkPos.rangeClosed(sectionPos.chunk(), 1)`), intersects
them with the biome source's possible biomes, and each of those biomes places its own step features in this chunk. A forest
biome cell that is only just outside the chunk still brings the forest's tree list into it.

**2.3 The per-try biome filter is different.** The `BiomeFilter` placement modifier asks the **zoomed** biome at the try
(`BiomeManager.getBiome`), not the raw cell. Both lookups are needed, and they disagree near boundaries by design.

**2.4 Cross-chunk writes.** Features write through `WorldGenRegion`, whose write radius at the FEATURES step is 1 and which
requires a neighbouring chunk only at the **TERRAIN** stage. A write into a still-terrain neighbour lands in that chunk's
proto-chunk, and the neighbour's own later features can overwrite it: **last write wins**, and the order is the chunk map's
FEATURES dispatch order (tickets/forceload), not `(cx, cz)`. `ensureCanWrite` refuses positions outside the region.

## 3. Heightmaps

| Heightmap | What it counts | Notes |
|---|---|---|
| `WORLD_SURFACE_WG` | the highest non-air block | terrain only: features never update it |
| `MOTION_BLOCKING` | blocks that stop motion, which includes **leaves** (`#blocks_motion` = `#blocks_motion_no_leaves` + `#leaves`) | updated by features |
| `MOTION_BLOCKING_NO_LEAVES` | the same without leaves | the tree/sapling checks use it |
| `OCEAN_FLOOR` | the highest block that is not a fluid | used with `WORLD_SURFACE` for water depth |

**Which features use which** is per placed feature (the `heightmap` placement modifier in the JSON), and it matters: grass and
bush patches, dead bushes, lily pads, berries and leaf litter use the terrain heightmap (so plants stand on land, not on trees);
flowers, ferns, mushrooms, sugar cane, cactus, pumpkins and melons use `MOTION_BLOCKING` (so they can stand on crowns).

**The surface-water-depth filter** (`SurfaceWaterDepthFilter`) compares `WORLD_SURFACE - OCEAN_FLOOR <= max_water_depth`, so a
try is rejected when *anything* non-air sits over the ground, not only liquid. Two consequences that look like bugs in a mod:
a leaf-litter block stops a later tree from growing there, and a short-grass patch does the same. In the other direction, **a
crown must not raise `OCEAN_FLOOR`** for the tree check: vanilla never stands a tree on its own canopy (0 of 4,025 reference
trunks checked across taiga and forest), even though leaves are in the motion-blocking tag — because the filter rejects those
columns before the tree is picked.

## 4. Surfaces and materials

The surface rule chain for the overworld (`worldgen/material_rule/overworld.json`) is a sequence:

1. `bedrock_floor` — the bottom of the world;
2. `copper_ore_vein`, `iron_ore_vein`;
3. `above_preliminary_surface` → `overworld/surface` (biome-specific surface rules, then `under_floor`);
4. `overworld/underground`: inside, a `sequence` of *biome condition → `sulfur_cave_bands`* and then the
   `vertical_gradient(deepslate, true <= 0, false >= 8, random minecraft:deepslate)`.

Facts that matter:

- **The band rule runs before the deepslate boundary**, so band materials win over deepslate wherever the biome condition holds.
- The **bedrock fade** is 1 / 0.8 / 0.6 / 0.4 / 0.2 at the bottom five layers, nothing above.
- The surface stage's random is the world seed's **root positional** source (`new Random(seed).forkPositional()`), not a
  per-chunk seed; the gradients are hashed from the names `minecraft:bedrock_floor`, `minecraft:deepslate` and
  `minecraft:clay_bands`.
- `sulfur_cave_bands` is a 3D noise threshold on `minecraft:sulfur_cave_gradient` sampled **at the block**: cinnabar in
  `[-0.4, -0.1]` and `[0.4, max]`, sulfur in `[0, 0.4]`, nothing otherwise. Its biome condition is evaluated through the
  **zoomed** biome lookup (§1.5), one of the eight quart corners around `(x-2, y-2, z-2)` chosen by a fiddle draw.
- The base stone tag that ores and patches target includes deepslate: replacing deepslate with ore, dirt or gravel is correct.

## 5. Ores

**5.1 The step-6 order** (what `setFeatureSeed`'s index is): lapis 22, lapis_buried 23, copper_large 24, copper 25, magma 26,
clay 27, gold_extra 28, the three disks 29–32, emerald 33; infested ore is at step 7.

**5.2 Blob geometry** (`OreFeature`): the angle and the y-offsets are drawn **even for blobs that are then discarded**; the radii
come from the sine table; the target test runs before the air-skip roll; the air-skip roll is drawn only where the block passes
the ore's target tag; writes are limited to a radius of 1 (`ensureCanWrite`).

**5.3 Vein noise** (`OreVeinifier`): veininess and ridges interpolate over y `-64..56` with an out-of-window constant of
`{0, 1, 1}`; per-kind vein heights (copper 0..49, iron -60..-9) cut them afterwards.

**5.4 Counts to check against.** On a 256-chunk sample of seed 9 the overworld has 375.3 ores a chunk; per type see
`MEASURED-TABLES.md`.

## 6. Trees and plants

- **Every placed tree feature's picks carry `block_predicate_filter(would_survive(<sapling>))`** (`TreePlacements` registers
  them through `PlacementUtils.filteredByBlockSurvival`), so trees need `#supports_vegetation` under them — which includes
  podzol and mycelium, and does **not** include stone, sand or gravel. Only the dark forest's huge-mushroom picks are inline and
  unfiltered. A tree standing on stone is a sign the filter is missing.
- **`#replaceable_by_trees`** (57 blocks) is what a trunk may grow through; a leaf a player placed persistently is never
  replaced.
- **`below_trunk_provider`** is a `rule_based` provider: anything not in `#cannot_replace_below_tree_trunk` becomes dirt, so the
  block under a reference trunk is always dirt and tells you nothing about what was there before.
- **Leaf litter** (`oak_bees_0002_leaf_litter` and friends) is a `place_on_ground` decorator over the tree's **lowest trunk
  layer** inflated by `(radius, height, radius)`: 96 tries / radius 4 / height 2 / 1–3 blocks, and 150 / 2 / 2 / 1–4; a spot
  needs air or a vine above it, a solid-render block under it, and the column's `MOTION_BLOCKING_NO_LEAVES` at or below the
  spot. The block has 16 states (4 counts × 4 facings) — count all of them.
- **Mushrooms** need raw light under 13 unless the ground is mycelium, podzol or a nylium; in worldgen that is a column walk.
- **Plant counts** (per chunk, per biome, all states) are in `MEASURED-TABLES.md`; the same quantity read on two different
  chunk sets can differ by tens of percent, so always state the set.

## 7. Structures

- A structure set's placement is `random_spread` with `spacing`, `separation` and `salt` (village: 34 / 8 / 10387312; the five
  village types share the set with weight 1).
- The **biome gate for a jigsaw structure is sampled at the centre of the rotated start piece**, not at the chunk's centre, and
  the start chunk sits at the chunk's minimum corner; only the y comes from the heightmap projection.
- `RandomSpreadStructurePlacement` seeds its per-chunk check from the world seed and the placement's salt; changing `spacing`,
  `separation` or `salt` moves every structure.
- `/place structure minecraft:village_plains` **writes blocks but does not record `structures.starts`** — you cannot use it to
  produce the piece lists the game keeps. For piece-level checks, generate normally and read the chunk data.
- A step-6 feature and a structure of the same step share the decoration seed's index space; a mod that adds a structure kind
  shifts the indices of everything after it in that step.

## 8. Data formats that bite

- A block state is stored in the data as any of `"minecraft:stone"`, `{"Name": "minecraft:stone", "Properties": {...}}` (older)
  or `{"id": "minecraft:stone", "properties": {...}}` (26.x writes this). A reader that accepts only the first two undercounts
  every non-default state; a writer should emit one form consistently.
- `random_boolean_selector` takes `feature_true` and `feature_false` — read which one is which: the lush-cave clay selector's
  *true* branch is the **dry** patch.
- `random_selector` walks its entries in order with one float each; `weighted_random_selector` draws one int over the total.
  Swapping the two changes which entries can appear, not just their frequency.
- An unknown property in a state must drop alone; the rest of the state still applies.

## 9. Reproducing a reference world (the only way to check a worldgen mod)

```
# 1. a real server of the same version, same seed, structures on
java -jar minecraft_server.jar --nogui            # server.properties: level-seed=9, level-type=minecraft\:normal
# 2. in the console: forceload a square, let it generate, then save
forceload add -128 -128 127 127
save-all flush
stop
# 3. count with the tools here
python tools/ore_counts.py world/dimensions/minecraft/overworld/region
python tools/region.py  # as a module: blocks/chunk iteration
```

Three habits that save the most time, each learned the hard way:

1. **Count every palette state** (`tools/region.py`'s `state()` handles all three forms). A name-only counter reported a
   leaf-litter density 13× too low and a large-fern density half of reality.
2. **Use full-status chunks only.** A region entry below `minecraft:full` has terrain and no features; including it drags any
   feature average down.
3. **Generate the 3 × 3 around a target in a fixed order** when counting features: cross-chunk writes are handed over as chunks
   finish, so a parallel probe sees different trees than the game does (measured: +16 % vs +2.7 % on the same chunks).
