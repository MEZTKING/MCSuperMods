# B547 spike: void worlds, start structures, first join, one block, teams, areas and maps

Answers Y1 to Y16 of the game modes plan (`docs/PLAN-game-modes.md`), measured on 2026-11-22 on this cloud machine (4 cores, 15 GB) for the targets 26.3 and 26.4-snapshot-7. Nothing here is built, linted or shipped; the spike code was deleted from `engine-mod/` before the commit and is kept in `spike-src/` for reference.

Clean room: `javap` signatures only (`DimensionOriginStructurePlacement`, `StructurePlacement`, `WorldCreationUiState`, `WorldOpenFlows`, `LevelSettings`, `StructureBlockEntity`, `ServerLevel`, `ServerStatsCounter`, `ServerPlayerGameMode`, `ServerTickRateManager`); no Mojang method body was read. Vanilla data (the `the_void` biome, the `flat` world preset, structure sets, one vanilla structure template's key layout, loot table forms) was read from the cached server jars into the scratchpad at run time and deleted; no vanilla file is kept here. Game screenshots were taken (named below) but are not kept, because they show the game's textures.

## What was run

- **Dedicated server** (`spike-src/srv.py`, `run_main.py`, `probe.py`): the vanilla server jars cached in `~/.cache/msm-fabric-server`, driven over stdin, with the spike's data pack `b547` (`make_pack.py`, structure templates written by `nbtw.py`) in the world's `datapacks/` and `level-type=b547:void`. One world per version holds the void overworld and 16 extra dimensions (flat with and without the structure set listed, `the_void`, project biomes with features in three steps, a glass layer, an air layer, floating-island noise). Chunks were read back with the reference pack's `region.py`. Results: `results/server-<version>.json`, decode probes `results/probe-<version>.json`. A second start of the same world and a `/reload` (Y3), a world with `generate-structures=false`, and two worlds started and stopped at once to read the world spawn from `level.dat`.
- **Client GameTest** (`spike-src/B547ClientGameTest.java`, data installed into the gametest mod's resources by `install_client.sh`, temporary `fabric.mod.json` with only this entry point), headless under Mesa EGL, `./gradlew runClientGameTest [-Pmc=26.4]`: A) a world made through the Create World screen's settings (`TestWorldBuilder.adjustSettings`, world type `b547:void_plain`, survival); B) `createFreshLevel` with `b547:void` from the mod's data, then the End, an End portal frame and a Nether portal; C) `createFreshLevel` with a preset only in a folder pack placed in `saves/<world>/datapacks/` first; D) world B copied as a map (without `players/`, `session.lock`, `level.dat_old`, with a `datapacks/b547map` pack and `resources.zip`) and opened with `WorldOpenFlows.openWorld`. Results: `results/client-<version>.json`. Screenshots (not kept): `b547_A_first_join_<mc>`, `b547_B_fresh_<mc>`, `b547_B_end_<mc>`, `b547_B_nether_<mc>`, `b547_D_screen0_<mc>`, `b547_D_map_<mc>`.
- **Offline checker**: every generated function file through `@msm/schemas/mcfunction` on both targets (`spike-src/check_forms.ts`, run as a temporary vitest file in `packages/schemas/test/`; `results/spyglass-forms.json`, `results/spyglass-holders.txt`).

Both versions behaved the same everywhere below unless a line says otherwise (26.4 reports its version as `26.4-alpha.7`; the experimental screen's title differs only in case).

## Answers

### Y1 `dimension_origin`

- **Form:** `"placement": { "type": "minecraft:dimension_origin" }`. It has **no fields**: the class is a singleton (`INSTANCE`, private no-argument constructor, `CODEC` a `MapCodec`); `salt`, `frequency`, `locate_offset` and unknown keys are accepted and ignored on both versions (`probe-*.json`).
- **Once, at chunk 0 0:** one structure start, in chunk 0 0 only (chunks -2..2 by -2..1 read back), in every dimension whose generator uses the set: a flat generator whose `structure_overrides` lists it, a flat generator with `structure_overrides` left out (all sets), and a noise generator. **Not** in a flat generator with `structure_overrides: []`. Placed even with the flat `features: false`.
- **Height:** a one-piece rigid jigsaw with `start_height: { absolute: 64 }` put the piece's bottom at **y 63** (`PosY 63`, `ground_level_delta 1` in the start's NBT): the bottom is `start_height - 1`.
- **Rotation is random** (by seed and chunk): seed 547 gave `CLOCKWISE_180` about (0, 63, 0), so the 5 x 3 x 5 piece covered x and z -4..0, not 0..4.
- **Structures off:** with `generate-structures=false` there is no start and no block. `place structure b547:island 660 64 600` places it by command.
- 26.4 writes the chunk's `status` (26.3 `Status`) and leaves the start's own `id` out; the start is the same.

### Y2 Where players spawn

- World spawn chosen at creation (`level.dat` `spawn`): a void with no block: **(8, -64, 8)** (the bottom of the world, chunk 0 0's centre); a void with the origin island covering (0, 0): **(0, 65, 0)**, on the island's top (with the rotation above, (0, 0) was an island corner).
- A player's first join: void with no island (A): placed at **(8.5, -64, 8.5)**, in the void; the first-join reward ran on gametime 1, before any fall (health 20), and its `tp` saved them. Void with the origin island (B, `createFreshLevel`): placed on the island top at y 65 in every run (x and z between -3.5 and 0.5, spread by the default respawn radius).
- With `setworldspawn -2 66 -2` and `gamerule respawn_radius 0` set by the first-join function, death and respawn put the player at the spawn's x and z but **on the highest block of that column** (y 101, on a glass pad the test had built at y 100), not at the spawn's y.
- So the world spawn does not land on an island by itself unless the island covers (0, 0); the first-join route sets it (`setworldspawn`) and teleports the first player, which ADR 0114 D2 already says.

### Y3 The load route

- `forceload add 96 96 127 127` then `place template b547:island 100 64 100` **in the same tick works**, at server start and later: `forceload add` loads the chunks synchronously (0.4 to 0.9 s for 16 to 36 chunks on the console). Without a loaded chunk `place template` fails with "That position is not loaded" (no chunk is loaded for it).
- The flag `data modify storage b547:games placed set value 1b`, tested by `execute unless data storage b547:games {placed:1b} run ...`, kept it **once per world across a server restart and a `/reload`** (the `#minecraft:load` function ran each time; the placing did not). It is saved in `data/b547/command_storage.dat` and travels with a copied world (D: no second placing).
- The load function runs at server start, before any player.

### Y4 First join, once per player

- `{"criteria": {"tick": {"trigger": "minecraft:tick"}}, "rewards": {"function": "b547:first_join"}}` on both versions: the reward ran on the player's **first tick (gametime 1), after the player was placed** (it saw the spawn position), as the player (`@s`).
- Once: after death and respawn, and after leaving and opening the world again, the reward count stayed 1 and the island was not placed again. A copied map without `players/` gives a new player the reward again (count 2), while the world flag keeps the island from being placed twice.
- The kit (`give @s minecraft:bread 3`) arrived.

### Y5 Void Nether and End

- `minecraft:the_end` as `{"type": "minecraft:the_end", "generator": {"type": "minecraft:flat", "settings": {"biome": "minecraft:the_end", "layers": [], "features": false, "lakes": false, "structure_overrides": []}}}`: when a player arrives the **dragon fight exists and one dragon spawns**; the exit portal's bedrock frame (41 bedrock, 4 torches) is built at the origin; after `/kill` of the dragon the **exit portal opens** (20 `end_portal`), the **egg** appears, and **one gateway** appears (at -57 75 -78). Walking into the exit portal shows the credits and sends the player home. Obsidian pillars come from the End biome's features, which `features: false` leaves out (not counted; check in game).
- **Reaching the End:** an End portal frame of 12 `end_portal_frame` blocks with 11 `eye=true` set by `setblock` and the last eye **used by the player** lights the portal (`end_portal` inside). Twelve frames all set with `eye=true` by `setblock` (as a structure would) do **not** light. So a start structure must leave at least one eye out (or carry the `end_portal` blocks themselves).
- A void Nether (`the_nether` type, flat, no layers): a Nether portal lit with flint and steel in the overworld took the player there; the game built the exit portal and its obsidian platform (6 `nether_portal`, 18 obsidian).

### Y6 Flat generators and the void

- `layers: []` decodes on both versions (no error, no blocks).
- `minecraft:the_void` with `features: true` gets the 33 x 33 stone platform with cobblestone at **(8, -61, 8)** (the world's bottom + 3 in a layer-less world); with `features: false` nothing.
- A project biome with no features: a **clean void** (no block in chunks -2..2).
- A flat world whose layers are empty or only air **runs none of its biome's placed features** (a project biome's feature in decoration steps 0, 9 and 10: nothing); with one solid layer it does.

### Y7 Mobs on a platform in the void

- `minecraft:the_void`'s spawn lists are all empty (jar data); a player on a 33 x 33 grass platform in a `the_void` dimension: **nothing** spawned, day or night.
- The project sky biome with plains-like lists (`attributes."minecraft:gameplay/natural_mob_spawns"`): in 1,200 night ticks 61 to 70 monsters on the platform on 26.3 and 66 on 26.4 (zombies, skeletons, spiders, creepers); with `time_since_rest` 200,000, one phantom in one of three runs (26.3), none on 26.4. **No animals** in 1,200 to 2,400 day ticks: animals come with chunk generation, so a Skyblock needs eggs, trades or loot for them.
- Wandering traders were **not measured** (their first attempt is a game day away and client GameTests tick in step with the client, so `tick sprint` does not speed them up); check in game.

### Y8 `fixed_placement`

- `{"type": "minecraft:fixed_placement", "positions": [[3, 70, 3], [3, 71, 3], [40, 70, -20]]}`: absolute positions, all three placed, including two stacked and one in another chunk (chunk 2 -2), in a flat world with a solid layer and in a noise world.
- **26.4 refuses `"positions": []`** ("List must have contents"; the whole pack fails to load); 26.3 accepts it.
- In a void (no layers, or only air) it places nothing (Y6), so it cannot place a start platform in a void world type; the first-join function or `setblock` must.

### Y9 One block

- Loop per tick at 200 64 200 (`ob/tick`, `ob/next` in `make_pack.py`): `setblock ... air destroy` (standing in for a player's break), `execute if block <pos> minecraft:air run function ...`, `execute store result score #r b547.ob run random value 1..100`, weighted `setblock` by score ranges, `setblock <pos> minecraft:chest{LootTable:"minecraft:chests/simple_dungeon"}` (`LootTableSeed:7L` also accepted), `summon minecraft:chicken <x> <y+1.5> <z>`.
- 1,000 and 2,000 breaks counted exactly (one per tick).
- **Cost:** with drops cleared, 0.43 to 0.73 ms a tick against a baseline of 0.22 to 0.57 (about +0.2 to 0.3 ms); with drops left lying (340 to 360 item entities after 1,000 breaks) 3.2 to 3.3 ms a tick, the items' cost, not the function's.
- Breaking a chest that still has its `LootTable` drops the chest and the rolled loot (14 to 16 item entities); the broken blocks drop their own items.

### Y10 Teams, objectives, sidebar, boss bars

Every form below was accepted with the same feedback on both versions (`results/server-*.json` `forms`):

- `team add b547_red "Red"`, `team add b547_blue {text:"Blue",color:"blue"}`; names may contain `.` (`b547.dotted`); `team modify <t> color red|friendlyFire false|seeFriendlyInvisibles true|nametagVisibility hideForOtherTeams|collisionRule pushOwnTeam|deathMessageVisibility never|prefix {text:"[R] ",color:"red"}|suffix " *"|displayName {text:"Red team"}`; `team join <t> <holder>`, `team leave <holder>`.
- `scoreboard objectives add b547.score dummy {text:"Score",color:"gold"}`; criteria `playerKillCount`, `health`, `minecraft.mined:minecraft.stone`; `setdisplay sidebar|sidebar.team.red|below_name|list`; `modify <o> rendertype hearts|numberformat styled {color:"yellow",bold:true}|numberformat fixed {text:"-"}|numberformat blank|displayname {...}|displayautoupdate true`; `scoreboard players display name|numberformat <holder> <o> ...`; `scoreboard players enable @a <o>`.
- `bossbar add b547:timer {text:"Time left"}`, `bossbar set <id> max 60|value 42|color red|style notched_10|players @a|visible true|name {...}`, `execute store result bossbar <id> value run scoreboard players get ...`, `bossbar remove <id>`; `title @a actionbar {text:"10 s"}`.
- `worldborder set 2000`, **`worldborder set 2100 5` is 5 ticks** (0.25 s) and `worldborder set 2200 5s` is 5 seconds; `worldborder center 0 0` centres on 0.5 0.5; `worldborder warning distance 5`.
- Also: `random value 1..6`, `random roll 1..20`, `random value 1..100 b547:ob` (a named sequence), `loot spawn|give|insert ... loot <table>`, `setworldspawn x y z [yaw pitch]`, `spawnpoint @a x y z`, `gamerule respawn_radius 0|keep_inventory true|spawn_wandering_traders true|max_block_modifications 32768`, `difficulty normal`, `defaultgamemode survival`, `gamemode adventure @a`, `schedule function <f> 20t`, `dialog show @a minecraft:server_links`, `forceload add|remove|query`.
- **Offline checker:** every generated line passes `@msm/schemas/mcfunction` on both targets except that the checker **throws** (not a problem: an exception) on score holders in most positions (`execute if score #a ...`, `scoreboard players get #a`, `operation`, `team join t #a`, `tellraw {score:{name:"#a"}}`), on named random sequences and on `place jigsaw` target names (`results/spyglass-holders.txt`). `scoreboard players set #a ...` and `execute store result score #a ...` pass. The project command `b547_signal` is unknown to the vanilla tree, as expected.

### Y11 Areas

- Predicate form (26.x uses `type`, not `condition`): `{"type": "minecraft:location_check", "predicate": {"position": {"x": {"min": 300, "max": 308}, "y": {"min": 64, "max": 72}, "z": {"min": 300, "max": 308}}}}`.
- It tests the **command's position**: `execute as @e[...] at @s if predicate <p>` matched; without `at @s` nothing matched.
- Bounds are **inclusive on exact coordinates**: x 300.0 and 308.0 in, 299.99 and 308.01 out. The selector alternative `@e[x=300,y=64,z=300,dx=8,dy=8,dz=8]` tests the hitbox against [300, 309): 300.0 out for a zero-size marker, 308.99 in.
- Entered and left by tags (`area/tick_pred` in `make_pack.py`, six commands an area): 20 markers in 20 areas gave 20 entered; moving all 16 blocks gave 40 entered and 20 left, as expected.
- **Cost, 64 areas and 20 markers** (markers stand in for mock players): predicates 2.4 to 2.8 ms a tick (+2.0 to 2.4 over the baseline 0.34 to 0.42); the `dx` selector 1.0 to 1.3 ms a tick (+0.7 to 0.9).

### Y12 Area reset

- `kill @e[type=!minecraft:player,x=400,y=64,z=400,dx=47,dy=47,dz=47]` then `place template b547:arena48 400 64 400` (a 48 x 48 x 48 shell with air written inside): entities gone, the inside block cleared, the shell back; 0.03 to 0.07 s of console round trip.
- A template larger than 48 (64 x 4 x 64) places with `place template`; `place template` is **not** limited by `max_block_modifications` (110,592 positions placed), while `clone` is ("maximum 32768, but specified 110592"); a 32,256-block `clone` took 0.18 s.

### Y13 The function bridge

On both versions a data pack function containing a project command (`b547_signal hello`, an `msm:command` at permission 2 with a `word` argument and an event whose `run_function` action counts) **loads at world load and after `/reload`, and runs**: as the player (`execute as @a run function b547:bridge`: the event ran with `@s` the player) and from the server's own source. The function loads from the mod's data here; world packs load with it in the same reload.

### Y14 A world as a map

- The copied world opened with its `datapacks/b547map` **enabled automatically** ("Found new data pack file/b547map, loading it automatically") and its load function ran.
- Before that the game showed **`BackupConfirmScreen`, "Worlds using Experimental Settings are not supported"** (buttons "Create Backup and Load", "I Know What I'm Doing!", "Cancel"), because the world has data pack dimensions and a world preset. Every map with its own world type or dimensions shows it (Play's test world uses vanilla's flat preset, so it never did).
- `resources.zip` in the world folder: **no prompt and no effect** when opened by `WorldOpenFlows.openWorld` (the pack's language line did not apply; nothing in `downloads/`). Not settled: check by hand from the world list.
- The `.mrpack` route (`overrides/saves/<world>/`) was not checked: no Prism or Modrinth documentation was reachable from this machine. In-game check on the user's machine.
- 26.x world folder layout: `players/data`, `players/advancements`, `players/stats` (not `playerdata/`, `advancements/`, `stats/` at the top), `data/minecraft/*.dat` (game rules, scoreboard, boss bars, storage per namespace in `data/<ns>/command_storage.dat`), `dimensions/<ns>/<path>/` (the overworld too), `generated/`, `datapacks/`, `level.dat`, `icon.png`, `session.lock`.

### Y15 Play my game with a world preset

- **From the content jar's data:** `createFreshLevel(folder, new LevelSettings(name, SURVIVAL, new DifficultySettings(NORMAL, false, false), true, WorldDataConfiguration.DEFAULT), new WorldOptions(seed, true, false), r -> r.lookupOrThrow(Registries.WORLD_PRESET).getOrThrow(key).value().createWorldDimensions(), new TitleScreen())` made a `FlatLevelSource` world with the origin island; no experimental screen on creation.
- **Data-only, from a folder pack placed in `saves/<folder>/datapacks/` before the call**, with `WorldDataConfiguration.DEFAULT`: the pack was found and **enabled automatically** ("Found new data pack file/b547dev, loading it automatically"), its preset was in the registry the dimensions function receives, the world was made with its biome (`b547dev:sky` at the spawn) and its load function ran. Listing it in `DataPackConfig` enabled (`["vanilla", "file/b547dev"]`) gives the same.
- The Create World screen lists project presets from `#minecraft:normal` with the name from lang key **`generator.<namespace>.<path>`** ("B547 Empty sky"). `WorldCreationUiState` also has `setGameRules(GameRules)`, so the screen path can set `respawn_radius` before creation; `createFreshLevel` cannot (game rules are set by the setup function).

### Y16 Adventure mode

- `/give @a minecraft:diamond_pickaxe[minecraft:can_break={blocks:"minecraft:stone"}]`, the list form `[can_break=[{blocks:"minecraft:stone"},{blocks:"#minecraft:logs"}]]` (also by `item replace entity @a weapon.mainhand with ...`) and a loot table `"modifier": [{"type": "minecraft:set_components", "components": {"minecraft:can_break": {"blocks": "minecraft:stone"}}}]` (26.x loot tables use `modifier` and `condition`, each with `type`); `can_place_on` the same, as one predicate or a list.
- The pre-1.21.5 form `{predicates:[...]}` is refused ("Not a map"; the function fails to load).
- In adventure mode the player broke stone and an oak log with that pickaxe; dirt was refused, and refused with an empty hand.

## Other findings

- **MSM's structure templates place as air (bug, outside this brief).** 26.x templates use palette entries `{id, properties}` at the current `DataVersion` (vanilla's own templates in the jar do). A template with `{Name, Properties}` at the current `DataVersion` loads ("Loaded template") but places **air**; at an older `DataVersion` (4189) the game upgrades it. `packages/plugins/structures/src/nbt/structure-template.ts` `structureTemplateToNbt` writes `Name`/`Properties` with `target.dataVersion`, so every exported template is empty in the game today. B551's start island and B552's resets depend on the fix (suggested follow-up).
- **The offline checker throws on score holders** (Y10). B551 to B553's exit criteria need it fixed (suggested follow-up).
- A structure block in SAVE mode does **not** save on a redstone pulse; `StructureBlockEntity.saveStructure()` (what the screen's Save button runs) wrote **`<world>/generated/<namespace>/structure/<path>.nbt`** (ADR 0116 D3).
- Client GameTests tick the integrated server in step with the client, so `tick sprint` runs at about 20 ticks a second there.

## Forms for B550 to B552

Version-independent unless marked. Facts for `TargetFacts` (B550):

- `worlds.structurePlacements`: `concentric_rings`, `dimension_origin` (no fields), `random_spread`. `worlds.voidBiome`: `minecraft:the_void` (empty spawn lists; its own start platform). `worlds.fixedPlacementShape`: positions are a list of `[x, y, z]`; at least one on 26.4, empty allowed on 26.3. `worlds.firstJoinCriterion`: `minecraft:tick`. `worlds.floatingIslandsSettings`: `minecraft:floating_islands` (used here as a noise dimension); `endLikeSettings` not measured (verify at implementation).
- `scoreboard`: display slots `list`, `sidebar`, `below_name`, `sidebar.team.<colour>`; render types `integer`, `hearts`; number formats `styled <style>`, `fixed <text>`, `blank`; team options as Y10; criteria as in the vendored registry (only `dummy`, `playerKillCount`, `health` and `minecraft.mined:` were run).
- `commands.forms`: the lines in Y3, Y9 to Y12 and Y16; `worldborder set <width> <ticks>|<n>s`; `forceload add <x1> <z1> <x2> <z2>`; `place template <id> <x> <y> <z> [rotation] [mirror] [integrity] [seed]`; `place structure <id> <x> <y> <z>`; `loot spawn|give|insert`; `random value <min>..<max> [sequence]`.

B551 (world setup and the start):

```json
{"dimensions": {
  "minecraft:overworld": {"type": "minecraft:overworld", "generator": {"type": "minecraft:flat", "settings": {"biome": "<ns>:sky", "layers": [], "features": false, "lakes": false, "structure_overrides": []}}},
  "minecraft:the_nether": {"type": "minecraft:the_nether", "generator": {"type": "minecraft:flat", "settings": {"biome": "minecraft:nether_wastes", "layers": [], "features": false, "lakes": false, "structure_overrides": []}}},
  "minecraft:the_end": {"type": "minecraft:the_end", "generator": {"type": "minecraft:flat", "settings": {"biome": "minecraft:the_end", "layers": [], "features": false, "lakes": false, "structure_overrides": []}}}}}
```

- Lang `generator.<ns>.<path>`; tag `data/minecraft/tags/worldgen/world_preset/normal.json`.
- Sky biome: `{"has_precipitation": true, "temperature": 0.8, "downfall": 0.4, "effects": {"water_color": 4159204}, "attributes": {"minecraft:gameplay/natural_mob_spawns": {"spawns_by_category": {...}, "spawn_costs": {}}}, "carvers": [], "features": []}`.
- First join: the advancement above; its function: `execute unless data storage <ns>:msm_games {start:1b} run function <ns>:msm_games/start` with `forceload add`, `place template <id> <x> <y> <z>`, `setworldspawn <x> <y> <z>`, `gamerule respawn_radius 0`, `data modify storage <ns>:msm_games start set value 1b`, `tp @s <x> <y> <z>`; then the kit.
- Advanced (`world_generation`): a jigsaw structure `{"type": "minecraft:jigsaw", "biomes": [<sky biome>], "step": "surface_structures", "spawn_overrides": {}, "terrain_adaptation": "none", "start_pool": ..., "size": 1, "start_height": {"absolute": <y + 1>}, "max_distance_from_center": 80, "use_expansion_hack": false}`, a one-element `rigid` pool and a set `{"structures": [{"structure": ..., "weight": 1}], "placement": {"type": "minecraft:dimension_origin"}}` listed in the overworld's `structure_overrides`. The piece is rotated at random about (0, y, 0), so the setup function still sets the spawn and the validator should say so.

B552 (pieces): the one-block lines in Y9 (one tick test per position); teams and objectives in Y10 (made at load: `team add` and `scoreboard objectives add` fail harmlessly when they exist; options set every load); timers: `bossbar` and `execute store result bossbar ... value run scoreboard players get ...`; areas: the predicate in Y11 with `execute as @a at @s if predicate ...` (or the `dx` selector at about a third of the cost, with hitbox semantics); resets as in Y12.

## Go or no-go

| Decision | Verdict |
|---|---|
| ADR 0114 D2, the Advanced worldgen route (`dimension_origin`) | **Go, with conditions:** the set must be in the overworld's `structure_overrides` (or that key left out); the piece's bottom is `start_height - 1`; the piece is rotated at random about the origin; nothing is placed with "Generate structures" off; it needs the structure template fix first. |
| ADR 0114 D6, a start platform by `fixed_placement` | **No-go in void worlds** (biome features do not run without a solid layer); fine in flat worlds with layers and noise worlds; 26.4 needs at least one position. |
| ADR 0115 D5, the function bridge | **Go** on both versions. Reserve B563 not needed. |
| ADR 0116 D1 for data-only projects (dev pack in the world folder before `createFreshLevel`) | **Go** on both versions. Reserve B564 not needed. |
| ADR 0116 D2, maps | **Go for `datapacks/`** (enabled on open); the experimental-settings screen appears for every map with its own world type; **`resources.zip` and the `.mrpack` route not settled** (in-game checks). |
| ADR 0116 D3, builds from the game | **Go:** `<world>/generated/<namespace>/structure/<path>.nbt`. |
| Limit M6 (four one-block positions) | Comfortable: about 0.3 ms a tick for one position with drops cleared. |
