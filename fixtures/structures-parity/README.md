# structures-parity

Parity fixture for batch 4 of the live views, assembled structures (ADR 0122 D9; plan briefs B635, B639 and B641). It holds the MSM project `structures_parity` (`msm.project.json`, `content/`, plugins `msm.datapack`, `msm.structures` and `msm.worldgen`), its lowered data pack per target (`lowered/mc-26.3/data/`, `lowered/mc-26.4/data/`) and `expectations.json`: what the real server made of those files on each target, measured by the parity GameTest `StructuresParityTest` in `engine-mod/parity/`. `@msm/terrain`'s parity test (B641) plays the same files through MSM's assembler and processors. No vanilla file is ever committed here.

## What is here

- `make_fixture.py`: writes the project, then runs `lower.ts` (`python3 fixtures/structures-parity/make_fixture.py` from the repository root). Every file is MSM's own, written from the data format (the targets' vendored mcdoc) and the spike B634's findings, never copied from vanilla. One project (target 26.3) serves both targets; it passes `node tools/check-project/index.ts` on both with no problem (run on a copy holding only `msm.project.json` and `content/`).
- `lower.ts`: lowers `content/` with MSM's own element kinds for every built-in target into `lowered/<target>/data/`, as the data pack export writes the files: templates as gzip `.nbt` with the target's `DataVersion` (5023, 5127: the only difference between the two folders), JSON with sorted keys.
- `content/` (306 elements, namespace `structures_parity`; ids are unique across kinds, so every kind but the templates has a folder of its own):
  - 60 structure templates (`structures_parity:<name>`): the jigsaw shapes of `@msm/terrain`'s in-memory test fixtures (`packages/terrain/test/structures/fixtures.ts`, namespace `fx` there, same names) and the processor sample `sample`. Cells not listed are structure void; jigsaw blocks carry `orientation` in the palette and `name`, `target`, `pool`, `final_state`, `joint`, `selection_priority` and `placement_priority`.
  - 83 template pools (`pool/<name>`), 28 processor lists (`processors/<name>`), 66 jigsaw structures (`structure/<name>`), 66 structure sets (`set/<name>`, one structure each, `random_spread` spacing 2, separation 1), a feature and a placed feature (`feature/marker`, `placed/marker`: one gold block, for the feature element) and the empty biome tag `none`.
- `expectations.json`: per target, the sections `assembly` and `processors` (below; about 460 KB a target).

Every structure names the empty biome tag `#structures_parity:none`, so no set ever starts a structure in a world by itself: the test asks the game for starts by name. The sets are there for anyone who loads the pack into a world of their own with a biome tag that matches.

## The structures

Start height `{absolute: 0}` (the start piece's bottom at y -1, J16), projection `rigid`, `terrain_adaptation: none`.

| Structure | Start pool | `size` | `max_distance_from_center` | Shows |
|---|---|---|---|---|
| `match` | `start_match` | 1 | 128 | J1, J3, J5, J6: which of five arms can join a hub |
| `back` | `start_back` | 1 | 128 | J8, J9: an arm reaching back into its parent is refused, the fallback placed |
| `weights` | `start_w` | 1 | 128 | J6, J7: weights 3, 1 and an empty element 1 |
| `chain_s1`, `chain_s3`, `chain_s20` | `start_chain` | 1, 3, 20 | 128 | J11: depth, the fallback cap at `size + 1` |
| `chain_d16`, `chain_d32` | `start_chain` | 20 | 16, 32 | J12 |
| `chain2_d15`, `chain2_d16` | `start_chain2` | 20 | 15, 16 | J12, two-block segments |
| `chain4_d16`, `chain4_d17` | `start_chain4` | 20 | 16, 17 | J12, a 4-wide start: the centre truncates (8 or 9 pieces by sign) |
| `fb_s5` | `start_fb` | 5 | 32 | J8: the start pool's piece is too long; the fallback chain continues |
| `vchain_d16`, `vchain4_d15`, `vchain4_d16`, `vchain6_d16`, `vchain6_d17` | `start_v`, `start_v4`, `start_v6` | 20 | 15 to 17 | J13 |
| `vchain_v16`, `vchain_h16` | `start_v` | 20 | `{horizontal: 116, vertical: 16}`, `{horizontal: 16}` | J13, the object form |
| `shell`, `shell_big`, `shell_tall` | `start_shell*` | 1 | 128 | J10: a child wholly inside, as wide as, partly outside its parent |
| `whub`, `whub_spl`, `whub_spr` | `start_whub*` | 1 | 128 | J9, J14: two overlapping wide children; selection priority |
| `phub_eq`, `phub_pe`, `phub_pw`, `phub_ce` | `start_phub_*` | 2 | 128 | J15: placement priority is the parent jigsaw's |
| `joint` | `start_joint` | 1 | 128 | J4: aligned and rollable vertical joins |
| `misc` | `start_misc` | 1 | 128 | J18: a list element and a feature element |
| `town` | `town` | 6 | 40 | every rule at once: streets, crossings, houses, furniture inside houses, empty elements |
| `grid_s7`, `grid_s20` | `start_grid` | 7, 20 | 116 | the lattices of 113 and 841 pieces |
| `cube_s6` | `start_cube` | 6 | `{horizontal: 24, vertical: 24}` | the 3D lattice of 341 pieces |
| `proc_<list>` (30) | `proc_<list>` | 1 | 128 | the processor sample with each of the 28 lists, as a legacy element (`proc_legacy`) and with `rule_block` written inline (`proc_inline`); start height `{absolute: 200}` (floor at y 199) |

## How it is measured

`engine-mod/parity`'s `StructuresParityTest` (`msm_parity_tests:structures_parity_test_*`). This version's `lowered/mc-<mc>/data/` is mod data of a jar of its own, `msm_structures_parity_fixture` (the parity build's `structuresFixtureJar` task), which only the `structuresParity` task loads. The version seam `StructureStarts` calls `Structure.generate` as a chunk's structure step does (the level's own generator, random state and template manager; every biome accepted), for a world seed and a chunk the test chooses. Natural generation is fixed by the world seed and the chunk, so the assemblies are the same on every run; 26.3 and 26.4 gave identical `assembly` sections (J20).

- **`assembles_structures`** (section `assembly`): for each structure, world seeds 634 and 635 and chunks x and z 0 to `grid - 1` (`grid` 15: 450 starts; the three lattices 3: 18 starts). For each start, each piece's element, rotation and box and its jigsaw blocks as the element reports them (`getShuffledJigsawBlocks`). The game keeps no depth on a pool element piece, so the test rebuilds the tree: pieces are listed in placement order, and a piece's parent is the first earlier piece with a jigsaw that one of the piece's jigsaws stands in front of (preferring a legal pair); depth is the parent's plus one.
- **`places_processors`** (section `processors`): for each processor list, the structure `proc_<list>` is generated 32 times (placement `k`: world seed `1000 + k` at chunk `(x + 2k, z)` next to the GameTest, so every list meets the same 32 starts and rotations), its box and a one-block margin filled with the list's background (glass; water for `rule_loc`, bedrock for `protected`, lava for `lava`), the start placed by its own `placeInChunk` (as `/place structure` does) and every template cell read back at once (before any block or fluid tick), its state turned back by the piece's rotation into the template's frame, then cleared. The game's processors draw from a random of the block's world position, and GameTests sit at a different place on each run, so random lists differ from run to run; deterministic ones never do.

## The file

```text
{
  "about": "...", "format": 1, "seeds": [634, 635],
  "targets": {
    "mc-26.3": { "assembly": { "<structure>": Assembly, ... }, "processors": Processors },
    "mc-26.4": { ... }
  }
}
```

`Assembly`, per structure (`<structure>` without the `structure/` folder):

| Field | Meaning |
|---|---|
| `grid`, `assemblies`, `noStart` | chunks per axis; starts made; chunks where the game made none |
| `size`, `maxDistance` | the structure file's `size` and `max_distance_from_center`, as written |
| `pieces` | pieces per start: `histogram` (`"<count>": starts`), `n`, `mean`, `sd` (sample), `min`, `max` |
| `templates` | pieces per template over all starts: a template id, `list:<id>+<id>` for a list element, `feature` for a feature element |
| `depths` | pieces per depth (`"0"` is the start piece) |
| `startRotations` | starts per rotation of the start piece (`none`, `clockwise_90`, `clockwise_180`, `counterclockwise_90`) |
| `startJoins` | per jigsaw of the start piece (its position in the start template, `"x,y,z"`), the template of the child it took, counted over starts |
| `branches` | the same, for every descendant of that jigsaw's child (so `phub_*` shows which arm carries the big piece) |
| `turns` | per child template, its rotation relative to its parent's in degrees (`"0"`, `"90"`, `"180"`, `"270"`) |
| `exact` | counted over all starts: `unjoined` (no parent found), `illegalJoins` (J1 to J4 broken: name and target, facing fronts, tops by the parent's joint; a feature element's nameless jigsaw joins a target of `minecraft:bottom`), `partialOverlaps` (J9), `nestedInParent` and `nestedOther` (boxes wholly inside another, between a parent and its child or not, J10), `pastDepth` (deeper than `size + 1`), `targetPoolAtLastDepth` (a piece at `size + 1` from its parent jigsaw's pool and not its fallback, J11), `pastHorizontal` and `pastVertical` (J12, J13: boxes beyond the start box's centre, integer division, or the start height plus or minus the limit), and the largest `maxDepth`, `maxHorizontal` (from that centre), `maxUp` and `maxDown` (from the start height) |

`Processors`: `placements` (32), `floorY` (199, the sample's floor as placed), `sample` (`structures_parity:sample`, 8 by 4 by 8), and `lists`, per list:

| Field | Meaning |
|---|---|
| `random` | whether the list draws a random (`rot50`, `rot50_tag`, `rule_rand`, `rule_rstate`, `rule_pos`, `capped`, `capped_u`, `age0`, `age50`, `age100`) |
| `background` | the block the box was filled with first |
| `changed` | cells per placement that differ from list `none` at the same placement (as `pieces` above) |
| `byInput` | per input, the outputs counted over all cells and placements. The input of a cell is what list `none` placed there (the template as the game places it, states in full), or `(void)` where `none` left the background (structure void); an output of `(background)` means the world's block stayed |
| `cells` | deterministic lists only: per template cell `"x,y,z"`, its output (the same in every placement) |
| `blockEntities` | `loot` and `static` only: per chest cell, the block entity's saved keys and its `LootTable` or `CustomName` (as SNBT) |

## Tolerance

B634's 4S8. Exact: `grid`, `assemblies`, `noStart`, `size`, `maxDistance` and the whole of `exact`; a `pieces` or `changed` whose spread is 0 on both sides; `random`, `background`, `cells`, `blockEntities`, and `changed` and `byInput` of every deterministic list. Statistical, by a two-proportion test at |z| at most 4 (shares of 0 or 1 on both sides must be equal): each `templates` and `depths` key as a share of all pieces, `startRotations`, `startJoins` and `branches` as a share of the starts, `turns` of that template's pieces, each `histogram` bucket of the starts or placements, and each output of a random list's `byInput` of that input's cells; the means of `pieces` and `changed` within 4 standard errors (pooled from both sides' `sd` and `n`). MSM's own assembler (B641) cannot repeat the game's random draws, so it compares its own starts the same way: the exact fields as they are, the rest as shares and means.

## Running it

```sh
cd engine-mod
./gradlew -p parity structuresParity [-Pmc=26.4]                           # check (about a minute warm)
./gradlew -p parity structuresParity [-Pmc=26.4] -PupdateStructuresParity  # rewrite this version's sections
```

The task builds the fixture jar and runs `tools/run-fabric-server` on a production GameTest server with it as the mod and the parity jar's `structures_parity_test_*` tests (it needs `node` and JDK 25). After changing `make_fixture.py`, run it, then the task with `-PupdateStructuresParity` on both versions. CI's `engine-mod` job runs the check on every version.

## Rules

- No vanilla file is ever committed here. Blocks, the tag `#minecraft:stone_bricks`, `#minecraft:features_cannot_replace` and the loot table id `minecraft:chests/simple_dungeon` are named, not copied.
- One structure per structure set (a set's structure choice and start rotation come from one random draw), and the place commands only for single checks.
- Carried facts for later briefs: 26.4 renames the registry `rule_test` to `rule_test_type` and reads `corner_constraint` (named only, ADR 0122 4L4); they belong to `packages/targets`. The fixture writes no `corner_constraint`.
- Not measured here (B634's "only in the game"): terrain matching and terrain adaptation (a flat floor makes both flat, 4L5), `gravity` and `lava_submerged_block` over water, the `clear` and `passthrough` modifiers, pool aliases, `dimension_padding`, `liquid_settings`.
