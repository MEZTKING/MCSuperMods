# Measured vanilla numbers

*All figures are counts of the **vanilla** world itself, not of any reimplementation: Minecraft 26.3, official server, seeds 9
and 2, full-status chunks only, every palette state counted. Use them as the baseline a mod should land on; a mod that changes
any of these systems should re-measure its own world the same way (`tools/ore_counts.py`, `tools/region.py`) and compare.*

## Chunk sets used

| Set | What |
|---|---|
| seed 9 reference | `build/vanilla-server/world` equivalent: 7,056 full chunks; ore sample = the 256 chunks with `cx, cz ∈ [−8, 7]` |
| seed 2 reference | 144 full chunks (the region covers 1,024 × 1,024 blocks) |
| biome sets | full chunks whose **surface** biome at the chunk centre is the wanted one: taiga 459, plains 1,317, forest 806, meadow 14, ocean 563, deep ocean 201, cold ocean 1,935, deep cold ocean 293 |

## Ores (seed 9, 256 chunks; ores a chunk)

| Type | Ores a chunk |
|---|---|
| coal | 98.4 |
| copper | 86.2 |
| iron | 82.0 |
| diamond (all forms) | 24.8 |
| lapis | 10.4 |
| gold | 3.6 |
| redstone | 2.4 |
| emerald | 0.0 (mountains only; none in this sample) |
| **total** | **375.3** |

Deepslate variants are counted with their stone counterparts (`count_ores`' mapping); emerald is rare enough that a 256-chunk
flatland sample contains none.

## Plants (a chunk, by biome; two-block plants counted once by the lower half)

| Biome | short grass | small flowers | tall flowers | tall grass | ferns | large ferns | leaf litter |
|---|---|---|---|---|---|---|---|
| plains | 46.14 | 1.44 | 0.013 | 3.00 | – | – | 2.26 |
| forest | 6.12 | 0.29 | 0.20 | 0.02 | 0.076 | 0.021 | **106.8** |
| taiga | 1.28 (y ≥ 32) | 0.05 | – | – | 4.54 | 2.07 | – |
| meadow | 30.6 | 1.36 | – | – | – | – | – |

Two traps live in this table:

- **leaf litter** is 106.8 a chunk in a forest, not 8: the block has 16 states and a name-only counter sees only the default one.
- **large ferns** are 2.07 *plants* (4.15 blocks): the lower half alone is the plant, and halving it (a "plants = blocks / 2"
  guess) gives exactly half the truth.

## Terrain and surfaces

| Measured | Value |
|---|---|
| surface height between a server-made world and a matching generator | within 1 block per column (means −0.16..+0.13, median 0) |
| bedrock layers, y −64..−60 | 1 / 0.8 / 0.6 / 0.4 / 0.2 |
| biome cells of a lush-cave biome, y 1..40, per taiga chunk | 6.69 cells (428 blocks), present in 47 of 400 chunks |
| floor spots in those cells (air over `#moss_replaceable`) | 4.11 a chunk |

## Villages (the numbers a jigsaw mod needs)

| Thing | Value |
|---|---|
| structure set | `random_spread`, spacing 34, separation 8, salt 10387312, the five types weight 1 each |
| structure json | start pool 6 levels, `max_distance_from_center` 80, `use_expansion_hack: true`, `terrain_adaptation: beard_thin`, `WORLD_SURFACE_WG`, `start_height` absolute 0 |
| town-centre templates | plains 4 (weights 50 each) + 4 zombie (weight 1); desert 3 (98/98/49) + 3 zombie; savanna 4 (100/50/150/150) + 4 zombie; snowy 3 (100/50/150) + 3 zombie; taiga 2 (49/49) + 2 zombie |
| start template sizes | e.g. `taiga_meeting_point_1` 22×3×18, `desert_meeting_point_1` 17×6×9, `plains_meeting_point_2` 8×5×15, `snowy_meeting_point_3` 7×7×7 |
| pools | 62 pools, 649 elements (decor, trees, houses, streets, terminators, villagers, animals, zombie variants) |
| chests | 62 of 483 templates carry chests; 16 `chests/village/*` loot tables; none in town centres, streets, terminators or decor |
| natural villages | seed 9's 2,048-block region holds **1** (plains, chunk −12/50, 151 pieces); seed 2's 1,024-block region holds **0** |

The last row is the practical warning: villages are sparse. A mod that "seems to generate none" may simply be looking at a
small sample; a few thousand chunks are needed before a rate is meaningful.

## How these were produced

```
# ores, per chunk and per type
python tools/ore_counts.py <world>/dimensions/minecraft/overworld/region --csv ores.csv

# plants, any block, any state: iterate chunks and count (see tools/region.py's blocks())
# villages: read the chunk data's structures.starts (no tool here; any NBT reader works)
```

The sample sizes above were chosen so that the standard error of a per-chunk mean is under 5 % for the plant figures and under
1 % for the ore totals; a comparison that quotes a tighter difference than that needs a bigger set, not a smaller claim.
