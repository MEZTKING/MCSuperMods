# One mode audit

ADR 0130 folds Very easy, Easy and Advanced into one mode: plain by default, the rest under **More options** at the bottom of each Studio section. This page lists where that is done and what is left. Update it when a Studio is split or a surface is swept.

## How a Studio is split

- A Studio entry's `common` list (`StudioEntry.common`, `app/src/renderer/src/studios/plain.ts` and the area `studios.tsx` files) names the sections of its main area. A section on it shows its title, its one-line why (`studios/section-why.ts`) and its common settings, with a **More options** at its bottom for the id fields (sent there by `InMore`) and anything the section passes as `more`. A section not on it shows its title, its why and a More options holding all of it.
- A Studio without a list shows every section in the main area (never hidden), each with its why and its More options for ids.
- Every Studio ends with **Every setting** (the kind's whole schema form, before ADR 0130 the Studio's "Advanced (all fields)"), and every open thing with **Name** (id and Change id in More options) and **Where it goes** (Used by, the lowered files and Edit as raw text in More options).
- The default view of every split Studio is swept with `forbiddenIn` over a real example by `app/test/components/studios/plain-no-ids.test.tsx`; the blocks and items Studios split by B705 also by `app/test/components/studios/blocks-items/plain-split.test.tsx`, which checks that no field was lost with every More options open.

## Split (a list of common sections)

| Studio | Kind | Main area |
|---|---|---|
| Block | `msm:block` | Rules, Type, Preview, Appearance, Textures, Mining, Light and sound, Drops, the plant, pot, portal, inventory, cake, weathering and sound sections |
| Item | `msm:item` | Rules, Item, Food, Tool and durability, Throwable, Inventory, Boat, Adventure mode |
| Effect | `msm:effect` | Rules, Effect, Icon, Preview, Potion |
| Potion | `msm:potion` | Preview, Potion, Effects, Brewing |
| Fluid | `msm:fluid` | Preview, Liquid, Flow, Pictures, Mixing, Cauldron and bottle |
| Mob | `msm:entity` | Rules, Identity, Kind of mob, Appearance, Stats, Movement, Attack, Taming, Breeding, Riding, Storage, Shoulder, Trader, Bucket, Habits, Boss bar, Spawning, Spawn egg |
| Vehicle | `msm:vehicle` | Rules, Preview, Basics |
| Village job | `msm:villager_profession` | Job, Pictures, Trades |
| Villager look | `msm:villager_type` | Biomes, Pictures |
| Key bind | `msm:key_bind` | Name and group, Default key, When it works, Rules |
| On screen | `msm:hud` | Preview, What it looks like, What it shows, Where on screen, Colours and pictures |
| Command | `msm:command` | Rules, How it is typed, Name, What the player types after it, Who can use it, What it does, Message back |
| Game rule | `msm:game_rule` | Game rule |
| Statistic | `msm:stat` | Statistic |
| Particle | `msm:particle` | Pictures, Life and size, Movement, Colour and light, Preview (B705; the strip splitter, the lifetime range, the size at the end, the exact gravity, drag, spin, stopping on blocks, the end tint, opacity, see-through and far away in More options) |
| Creative tab | `msm:creative_tab` | Preview, Tab, Your own order, What is in it (B705; the order choice in the Tab section's More options) |
| World addition | `msm:biome_addition` | On the map (new: the live map through the worldgen map line), Biomes, Features, Spawns (B705; each feature's step and Make my own copy, each spawn's category and group sizes in More options) |
| Extra drops | `msm:loot_addition` | Loot tables, Drops, With and without (B705; the table suggestions and Only when a player kills it in More options) |
| Vanilla block rules | `msm:vanilla_block_rules` | Axe, shovel, hoe, Burns, Try it here (B705; honeycomb and Ages like copper all in More options). Its live view still names sounds, a drop and Try it's blocks and tools by id (`liveviews/data/block-rules/BlockRules.tsx`) |
| How my world starts | `msm:world_setup` | every section |
| One block | `msm:one_block` | every section |
| Team, Score, Timer, Area | `msm:team`, `msm:objective`, `msm:timer`, `msm:area` | every section |

## Not split yet (every field in the main area)

These show all their sections in the main area. Their id fields are plain (names, pickers) with the ids in each section's More options, and Every setting and Edit as raw text are there, so nothing is out of reach; what is missing is the choice of common settings and a sweep of their default view.

| Studio | Kind | Note |
|---|---|---|
| Rule book | `msm:rules` | Its What this becomes and Copy as my own script are in its own More options; a rule's key in the card's |
| Script | `msm:script` | The script editor is the Studio, unchanged (ADR 0130 D4) |
| Structure | `minecraft:structure_template` | Keeps its own "Every setting" switch |
| Template pool | `minecraft:worldgen/template_pool` | Keeps its own "Every setting" switch |
| Biome | `minecraft:worldgen/biome` | |
| Placed feature | `minecraft:worldgen/placed_feature` | |
| Tree | `minecraft:worldgen/configured_feature` (trees) | |
| Dimension type | `minecraft:dimension_type` | |
| Recipe | `minecraft:recipe` | Keeps its own "Every setting" switch |
| Tag | `minecraft:tag/*` | |
| Names and translations | `minecraft:lang` | |
| Pack settings | `minecraft:pack_mcmeta` | |
| Function | `minecraft:function` | The function editor is the Studio, unchanged (ADR 0130 D4) |
| Every kind without a Studio | the other vanilla data and resource pack kinds, plugin kinds | The schema form shows field names as the schema writes them |

## Surfaces not swept yet

The Studios' default views are swept; these other surfaces keep words that can name ids or files. They are expert surfaces reached from menus, Settings or a More options, or lists that will move to plain words next.

- **Add** (the New element dialog): kind ids and the id field are in its default view.
- The sidebar's asset list (picture and sound paths under each namespace).
- The **Problems** tab (problem messages with ids and paths; **Things to fix** is the plain list).
- The search engine (`@msm/search`) still has its three modes inside; the app always asks it in the plainest one (`SEARCH_MODE`), and the prefixes `@`, `#`, `>` and `?` work for everyone.

## Dialogs swept (B716)

Each opens with one line saying what it does; its default view passes `expectPlain` (`app/test/components/dialogs-plain.test.tsx`), and ids, versions, paths and raw names are in the dialog's own **More options** (`dialog-<name>`, remembered per dialog).

| Dialog | Title | Under More options |
|---|---|---|
| Fabric mod (.jar) | Save the mod as a file | Fabric Loader and Fabric API, the exporter's options (Separate runtime and GeckoLib) |
| Java project | Export Java project (the output's name; the e2e pins it) | the eject note, the scripts left out by id, the rule books |
| Export as a map | Export as a map | nothing (no ids in it) |
| A plugin's export | Export <name> | nothing (the plugin's own options are its settings) |
| Modpacks | Modpacks | Version, Summary, the folder, each mod's folder and version id, each Modrinth file name |
| Test in Minecraft | Test in Minecraft | the game's versions, what the mod needs, Choose launcher program… |
| Move to another Minecraft version | Move to another Minecraft version | the version ids and the ids of the report's things (shown in its lists while open) |
| Bring in pictures or sounds | Bring in pictures or sounds | Namespace, Other textures folder, Shaders |
| Import structure, Import Blockbench model | (the caller's) | Namespace, Supported files with their file names, the Blockbench file note, the saves' ids |
| Change id (Rename…) | Change id | expert body: the id itself; its first line says what changing an id means |
| Find usages | Where this is used | expert body: the ids of the things that use it |
