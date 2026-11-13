# Sample worldgen project

The library starter "Custom biome with a jigsaw structure" (`worldgen_pack`) saved as an MCSuperMods project with the namespace `msm_sample_worldgen`. It is the Phase 3 exit-criterion content: a custom biome reached through a World Type of its own, and a jigsaw structure (a small hamlet) that generates in that biome and in every vanilla forest.

`packages/exporters/test/sample-worldgen.golden.test.ts` checks it on every run:

- the folder equals the starter saved as a project (it fails when the starter changes and this folder is not regenerated);
- every element validates with zero problems and the structures and worldgen validators report nothing;
- both packs export with zero problems, and the data zip's SHA-256 is pinned per target, built in two time zones;
- the three structure `.nbt` files in the zip read back with the same block counts;
- a chain walk over the zip resolves every link (world preset → dimensions → dimension types and biomes → placed features → configured features; structure set → structure → biome tag → biomes; structure → start pool → pools and fallbacks → structure templates → jigsaw pools, with every jigsaw `target` named in its pool), and it fails on a copy with a pool removed;
- a copy of the biome that lists two of its placed features in the opposite order in one step reports exactly one `worldgen.feature-order` error; a copy with a placed feature moved to another step reports only the `worldgen.feature-step-differs` warning.

## Contents

| Element | Kind | Exports to |
|---|---|---|
| `msm_sample_worldgen:amber_woods` | biome | `data/msm_sample_worldgen/worldgen/biome/amber_woods.json` |
| `msm_sample_worldgen:amber_tree` | configured feature (tree) | `data/msm_sample_worldgen/worldgen/feature/amber_tree.json` |
| `msm_sample_worldgen:amber_tree_placed` | placed feature | `data/msm_sample_worldgen/worldgen/placed_feature/amber_tree_placed.json` |
| `msm_sample_worldgen:rich_copper_ore` | configured feature (ore) | `data/msm_sample_worldgen/worldgen/feature/rich_copper_ore.json` |
| `msm_sample_worldgen:rich_copper_ore_placed` | placed feature | `data/msm_sample_worldgen/worldgen/placed_feature/rich_copper_ore_placed.json` |
| `msm_sample_worldgen:amber_world` | world preset | `data/msm_sample_worldgen/worldgen/world_preset/amber_world.json` |
| `minecraft:normal` | world preset tag | `data/minecraft/tags/worldgen/world_preset/normal.json` |
| `minecraft:is_overworld` | biome tag | `data/minecraft/tags/worldgen/biome/is_overworld.json` |
| `msm_sample_worldgen:hamlet/centre_hut` | structure template | `data/msm_sample_worldgen/structure/hamlet/centre_hut.nbt` |
| `msm_sample_worldgen:hamlet/street` | structure template | `data/msm_sample_worldgen/structure/hamlet/street.nbt` |
| `msm_sample_worldgen:hamlet/lamp` | structure template | `data/msm_sample_worldgen/structure/hamlet/lamp.nbt` |
| `msm_sample_worldgen:hamlet/centre` | template pool (start) | `data/msm_sample_worldgen/worldgen/template_pool/hamlet/centre.json` |
| `msm_sample_worldgen:hamlet/streets` | template pool (fallback `terminators`) | `data/msm_sample_worldgen/worldgen/template_pool/hamlet/streets.json` |
| `msm_sample_worldgen:hamlet/decorations` | template pool | `data/msm_sample_worldgen/worldgen/template_pool/hamlet/decorations.json` |
| `msm_sample_worldgen:hamlet/terminators` | template pool | `data/msm_sample_worldgen/worldgen/template_pool/hamlet/terminators.json` |
| `msm_sample_worldgen:hamlet/mossy` | processor list | `data/msm_sample_worldgen/worldgen/processor_list/hamlet/mossy.json` |
| `msm_sample_worldgen:hamlet` | jigsaw structure | `data/msm_sample_worldgen/worldgen/structure/hamlet.json` |
| `msm_sample_worldgen:hamlets` | structure set (random spread, 24 chunks, separation 8) | `data/msm_sample_worldgen/worldgen/structure_set/hamlets.json` |
| `msm_sample_worldgen:has_structure/hamlet` | biome tag (`amber_woods`, `#minecraft:is_forest`) | `data/msm_sample_worldgen/tags/worldgen/biome/has_structure/hamlet.json` |
| `msm_sample_worldgen:en_us` | language file | `assets/msm_sample_worldgen/lang/en_us.json` (resource pack) |
| `msm_sample_worldgen:pack` | pack metadata | `pack.mcmeta` (both packs) |

- **Amber Woods** has orange grass and leaves, trees with birch trunks and acacia leaves, and extra copper ore. Its vanilla features keep vanilla's order per step, so no "Feature order cycle".
- The World Type **Amber Woods** (`amber_world`) is the vanilla overworld terrain with an explicit biome list: Amber Woods at a mild, humid climate point plus ocean, plains, forest, desert, snowy plains, jungle and windswept hills. The nether and the end are vanilla.
- The **hamlet** starts with a plank hut (door facing north, a lantern inside); streets of dirt path follow the terrain from the door, lamp posts with glowstone tops stand beside streets and end them. About a third of the hut's cobblestone floor turns mossy.

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3)

Export first: open this folder in MCSuperMods (copy it outside the repository first) and choose **File → Export Both…**. This writes `msm-sample-worldgen-mc-26.3-resources.zip` and `msm-sample-worldgen-mc-26.3-data.zip`. Use cheats in both checks.

### (a) The structure in an existing world

1. Install the data pack into a test world whose overworld has forests: **File → Install Data Pack…**, pick the world. Close the world if it is open, then open it again (structure sets load when a world opens; `/reload` is not enough).
2. Fly to land nobody has visited yet (new chunks), then run the commands below.

| Command or action | Expected |
|---|---|
| `/datapack list` | The enabled packs include `[file/msm-sample-worldgen-mc-26.3-data.zip (world)]` |
| `/locate structure msm_sample_worldgen:hamlet` | `The nearest msm_sample_worldgen:hamlet is at [x, ~, z] (n blocks away)`, in a forest |
| Click the coordinates (or `/tp @s <x> ~ <z>`) and look around | A 5×5 plank hut with a slab roof and a hanging lantern, a dirt path leading from its door, lamp posts (cobblestone foot, stripped spruce post, glowstone top) beside and at the end of the paths. No jigsaw blocks are left visible |
| `/place structure msm_sample_worldgen:hamlet` | Places a hamlet where you stand |
| `/place template msm_sample_worldgen:hamlet/lamp` | Places one lamp post (the jigsaw block stays visible here; that is normal for `/place template`) |

### (b) The biome in a new world

1. **Singleplayer → Create New World → More → Data Packs → Open Pack Folder**, copy the exported **data** zip into that folder, close the folder, move the pack to the selected (right) side, then **Done**. Enable the resource pack too (Options → Resource Packs) if you want the names in English rather than language keys.
2. Still on the Create New World screen, press **World Type** until it shows **Amber Woods** (`generator.msm_sample_worldgen.amber_world` without the resource pack). Allow cheats and create the world.

| Command or action | Expected |
|---|---|
| `/locate biome msm_sample_worldgen:amber_woods` | `The nearest Amber Woods is at [x, ~, z] (n blocks away)` |
| Teleport there and press F3 | The biome line reads `msm_sample_worldgen:amber_woods`; orange grass and leaves, trees with birch trunks |
| `/locate structure msm_sample_worldgen:hamlet` | Finds a hamlet (in Amber Woods or a vanilla forest) |
| `/execute in minecraft:the_nether run tp @s 0 100 0` | The vanilla nether, as usual |

3. Open `.minecraft/logs/latest.log` (`%APPDATA%\.minecraft\logs\latest.log`) and check that there is no `Failed to load`, `Couldn't parse`, `Feature order cycle` or other error line mentioning `msm_sample_worldgen`. Report any such line.

Things only the game can confirm, and worth reporting if they look wrong: the street and lamp pieces attaching at the hut's door and the street's side (jigsaw orientation), the World Type button's name, and whether the hamlet sits sensibly on slopes (`beard_thin`, `terrain_matching` streets).

## Changing the sample

Do not edit these files by hand. Change the starter in `packages/plugins/library/src/starters/` (`custom-biome.ts`, `jigsaw-structure.ts`, `worldgen-pack.ts`), then regenerate this folder, the `examples/` mirror and the pinned hash, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

This README is not generated and is kept as it is.
