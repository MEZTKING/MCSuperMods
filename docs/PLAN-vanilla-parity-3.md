# Plan: Vanilla parity 3

Working plan for the user's golden rule of 2026-11-14, "anything that can be made in vanilla Minecraft Java must be possible through MSM; a gap is a bug", applied to what the coverage audit (`docs/COVERAGE-AUDIT.md`, sections 1 and 3) and [ADR 0101](adr/0101-vanilla-parity-2-flows-studios-try-it-and-tests.md)'s limits still list after vanilla parity 2: limits Q5, Q7, Q8, Q10, Q21, Q25 and Q27, batch 2 in the Java eject (Q28), and the other open vanilla gaps of the audit that are not client-only rendering work. Written 2026-11-22 by the orchestrator at f6a8adc (main; branch `ccr-d077e76e-4gnbx2` equal to it). Every gap below was checked against the code at that commit (fact table H1–H16).

Decisions live in [ADR 0103](adr/0103-growing-plants-and-project-flower-pots.md) (growing and climbing plants, project flower pots), [ADR 0104](adr/0104-weathering-lightning-and-storage-2.md) (weathering on more types, lightning, waterlogged, double and per-player storage), [ADR 0105](adr/0105-block-sounds-set-types-and-vanilla-block-pairs.md) (own block sounds and set types, strip, flatten, till, oxidise and burn pairs), [ADR 0106](adr/0106-data-kinds-sweep-2-and-data-only-flows.md) (the remaining data and resource pack kinds, the banner, trim, glider and pot pattern flows), [ADR 0107](adr/0107-traders-2-villager-homes-and-villager-types.md) (reputation, demand, discounts, workstation restocking, project beds as homes, villager types), [ADR 0108](adr/0108-fluids-2-mixing-cauldrons-and-bottles.md) (fluid mixing, cauldrons, bottles), [ADR 0109](adr/0109-mobs-2-buckets-shoulders-flight-and-habits.md) (fish buckets, both shoulders, hovering and phasing flight, five vanilla habits), [ADR 0110](adr/0110-boats-for-project-woods.md) (boats and chest boats), [ADR 0111](adr/0111-commands-rules-game-rules-and-stats-2.md) (command arguments in Rules, more argument types, the R10 triggers, dialogs, game rules, stats, tab order, Script API 1.7) and [ADR 0112](adr/0112-vanilla-parity-3-flows-studios-eject-try-it-and-tests.md) (flows, Studios, the eject of batch 2 and of this plan, Try it, tests, limits), all Proposed. This file holds the fact table, the spike questions, the limits, the rules for every brief, the two batches in fifteen waves (briefs B503–B546) and an empty "Notes from implementation". It is deleted at the close of batch 2 (B544): history goes to `DEVLOG.md`, facts and limits into ADR 0112's findings.

The user said "keep going" and to take recommended options without asking: work starts without waiting for the vetoable defaults, which each ADR's Status lists for the user to see at the next handover. In batch 1 nothing after Wave 0 starts before B503 has reported; in batch 2 nothing after Wave 7 starts before B524 and B525 have reported.

## In plain words

- **Batch 1, "Plants, pots, sounds and storage".** Kelp-like, cave-vine-like and weeping-vine-like plants that grow in long strands, sugar-cane-like and cactus-like stalks, bamboo-like stalks with leaves, glow-lichen-like growth on any face, dripleaf-like plants that tip when stood on. Flower pots of your own that take vanilla plants and yours. Copper-like ageing for rods (a lightning rod), buttons, plates, fences, gates, walls and storage (a copper chest), and lightning that scrapes your copper as it does vanilla's. Chests that hold water, chests that join into a double chest, and ender-chest-like storage that is different for every player. Your own block sounds and door, trapdoor, button and plate sounds. Stripping, path-making, tilling, ageing and burning rules for vanilla blocks and for yours (a log you strip, dirt-like blocks a shovel makes into a path). The last data pack and resource pack files MSM could not make (decorated pot patterns, wolf sound variants, block transformers, test instances, post effects, waypoint styles, shaders) and four flows: banner pattern, armour trim, glider and pot pattern.
- **Batch 2, "Villagers, mobs, fluids, commands and the eject".** Traders that remember how you treated them (prices go up when you hit them and down as you trade, vanilla's demand rule), traders that restock at their work site, villagers that sleep in your beds, villager looks of your own for your biomes. Fish you catch in a bucket, pets on either shoulder, mobs that hover like a ghast or fly through walls like a vex, mobs that collect items like an allay, dig like a sniffer, play dead like an axolotl, barter like a piglin, and mounts that dash like a camel. Your liquids mix into a block when they meet water or lava, fill cauldrons and bottles. Boats and chest boats of your woods. Commands whose arguments Rules can read, more argument types, Rules for crafting, picking up, eating, sleeping and advancements, a Rules step that opens a dialog, your own game rules and statistics, creative tabs in the order you choose. Everything from vanilla parity 2 batch 2 and from this plan in ejected Java projects.
- **What it is not.** No custom screens, block entity renderers, more than three machine slots, fog colours on 26.3, held-weapon poses or model-changing variants (the next client batch). No pipes or tanks, no buoyancy other than water's or lava's, no waterlogging by a project fluid, no gravity per dimension as a setting: vanilla has none of these. No warden, frog tongue or piglin brain behaviours.
- **Build first:** batch 1 (blocks are the lowest risk and the most visible), batch 2 after its two spikes.

## Gaps: confirmed open, and dropped

Checked at f6a8adc. "Open" means the code still lacks it (fact named); "dropped" means it is closed already, or vanilla does not have it (the golden rule does not ask for it), or it is client-only rendering work for the later client batch.

| Gap | Source | State | Evidence | Where |
|---|---|---|---|---|
| Kelp, cave vines, weeping and twisting vines, bamboo, sugar cane, cactus, dripleaf, glow lichen | Q10, audit 1.3 Blocks | Open | H1 | ADR 0103, batch 1 |
| Flower pots of other materials | Q5 | Open | H4 | ADR 0103, batch 1 |
| Weathering on rods, buttons, plates, fences, gates, walls, storage | Q7, audit 1.3 | Open | H2 | ADR 0104, batch 1 |
| Lightning scraping project copper | Q6, audit 1.3 "Vanilla content modification" | Open | H2 (vanilla maps only) | ADR 0104, batch 1 |
| Waterlogged containers and machines | Q8 | Open | H3 | ADR 0104, batch 1 |
| Double chests, per-player storage | ADR 0074 D10, audit "Block entities" | Open | H5 | ADR 0104, batch 1 |
| Own door, trapdoor, button and plate sounds; own block sounds | audit B2 ("own sounds remain") | Open | H6, H7 | ADR 0105, batch 1 |
| Strip, flatten, till, oxidise, burn pairs for vanilla blocks; flatten and till for project blocks | audit 1.3 "Vanilla content modification" | Open | H8 | ADR 0105, batch 1 |
| `decorated_pot_pattern`, `wolf_sound_variant`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype`, `context_int_provider`, `context_float_provider` kinds | audit 1.1 last row; ADR 0064 D4 | Open | H9 | ADR 0106, batch 1 |
| `post_effect`, `waypoint_style`, shaders | audit 1.2 | Open | H9, H10 | ADR 0106, batch 1 |
| Banner pattern, armour trim, glider flows (and pot pattern) | audit section 3 "data only flows" | Open | H11 | ADR 0106, batch 1 |
| Trader gossip, reputation, demand, discounts, workstation restocking | Q21 | Open | H12 | ADR 0107, batch 2 |
| Villagers sleeping in project beds | ADR 0098 findings, audit 1.3 | Open | H12 | ADR 0107, batch 2 |
| Custom villager types | audit 1.3 "Villager professions" | Open | H12 | ADR 0107, batch 2 |
| Fluid mixing, cauldrons, bottles; boats on project fluids; packs changing fluid pictures | Q25 | Open (boats and pictures to the spike: X28, X29) | H13 | ADR 0108, batch 2 |
| Fish buckets, more than one shoulder pet, special flight, brain-style habits | audit 1.3 Entities, ADR 0070 D9, ADR 0071 D10 | Open | H14 | ADR 0109, batch 2 |
| Boats of project woods | audit 1.3 Blocks, B2 | Open (renderer gated by X24) | H1 | ADR 0110, batch 2 |
| Rules reading command arguments; more argument types | ADR 0096 findings, audit 1.3 | Open | H15 | ADR 0111, batch 2 |
| Rules triggers for crafting, picking up, eating, sleeping, advancements (R10) | ADR 0082 R10, audit B15 | Open | H15 | ADR 0111, batch 2 |
| Opening a dialog from a rule or item | audit 1.1 "Chat types, dialogs" | Open | H15 | ADR 0111, batch 2 |
| Game rules of our own, custom statistics | audit 1.3 | Open | H15 | ADR 0111, batch 2 |
| Ordering a creative tab's items by hand | audit 1.3 Creative tabs | Open | H15 | ADR 0111, batch 2 |
| Vanilla parity 2 batch 2 in the eject | Q28 | Open | H16 | ADR 0112, batch 2 |
| Gravity and sky textures per dimension | Q27 | **Dropped** | Vanilla has neither in data (ADR 0100 D6). The vanilla parts are covered: the skybox choice is in the Dimension Type Studio (ADR 0100 D1), and vanilla's own way to change gravity in a dimension (a function running `/attribute @a[...] minecraft:gravity base set ...` on a tick or a dimension change) works through MSM's functions and the Rules trigger "A player changes dimension" today. A per-dimension setting would go past vanilla. | Guide note only |
| Fluids: pipes and tanks, buoyancy other than water's or lava's, waterlogging by a project fluid | Q25 | **Dropped** | Not in vanilla (vanilla has no pipes; its only buoyancies are water's and lava's, which `behaves_like` gives; only water waterlogs). | — |
| Fog colours on 26.3 | Q25, ADR 0099 D5 | **Dropped here** | Client rendering (`FogRenderer`); the next client batch | Client batch |
| Trial spawner kind | audit 1.1 | **Closed** | `trial_spawner` is a generic kind (`packages/plugins/datapack/src/kinds/generic.ts`) | — |
| `slot_source` kind | ADR 0064 | **Dropped** | Schema but no data folder or registry on either target (ADR 0064 Context) | — |
| `gpu_warnlist`, `regional_compliancies` | mcdoc resources | **Dropped** | Game-internal files, not pack content | — |
| Hopper access to mount storage and bags | Q13, Q23 | **Dropped** | Vanilla hoppers reach neither a donkey's chest nor a bundle | — |
| Containers on slabs, doors, fences | ADR 0074 C16 | **Dropped** | Vanilla has none | — |
| Candle cakes on project cakes | Q4 | **Dropped** | Vanilla pairs only its own cake; stays a guide note | — |
| Cancelling vanilla commands; argument types beyond vanilla's | audit 1.3 | **Dropped** | Vanilla can do neither; this plan exposes more of vanilla's own types instead | — |
| New trunk and foliage placer shapes | ADR 0068 D9 | **Dropped** | Vanilla's set is fixed and every vanilla placer is already usable in data | — |
| Spawners holding project mobs | audit 1.3 Block entities | **To check** | Vanilla's spawner should already take any entity type; X14 confirms, else B510 fixes it | Batch 1 spike |
| Custom screens, block entity renderers, more machine slots (C3, C4, C9), portal overlay (P2), particle trails and per-spawn options, held weapons and bow pose, model-changing variants, client commands, scripts in the eject (B142) | ADR 0088 D11, audit B15 | **Dropped here** | Client-only rendering or client code | Client batch |
| Warden-like sonic boom, frog tongue, piglin brain, sculk vibrations of our own | audit 1.3 Entities, "Game events" | **Left out** (limit N15) | Brain and game event code with no small vanilla seam; recorded so nobody expects them | Later |

## Fact table (H1 to H16)

Read in this repository at f6a8adc on 2026-11-22. No game jar was opened in this session; every claim about the game is a spike question below.

| # | Fact | Source |
|---|---|---|
| H1 | 38 block types; none for kelp, vines that grow in strands, cave vines, bamboo, sugar cane, cactus, dripleaf or glow lichen, and no boat entity | `engine-mod/src/main/java/dev/mcsupermods/runtime/loader/BlockType.java` |
| H2 | `WEATHERING_TYPES` = block, pillar, horizontal, directional, slab, stairs, door, trapdoor, pane, chain, lantern; `Weathering.blockFor` skips blocks with a block entity; vanilla's static copper maps are not used, so lightning skips project copper | `loader/BlockType.java` line 100, `registry/weathering/Weathering.java` |
| H3 | `WATERLOGGABLE_TYPES` = block, pillar, horizontal, directional; containers and machines are left out (`BlockEntityHooks.wantsBlockEntity`) | `registry/Waterlogging.java` |
| H4 | `MsmPottedPlantBlock extends FlowerPotBlock`: vanilla's empty pot only ("limit Q5") | `registry/types/MsmPottedPlantBlock.java` |
| H5 | Containers: chest rows, hopper, dispenser, holder; no double chest, no per-player store | ADR 0074 D10, `registry/container/` |
| H6 | `BlockSetTypes` (both versions) maps ten names to vanilla constants and never constructs one; 26.4's constructor takes a `block_sound_set` key | `src/mc/26.3/.../registry/BlockSetTypes.java`, `src/mc/26.4/...` |
| H7 | `sound_type` is an enum of vanilla `SoundType` names ("verify the list at implementation"); `block_sound_set` is a 26.4 data folder (`dev.worldDataFolders`, 54 on 26.4) | `packages/schemas/mcdoc/msm/definition.mcdoc` line 19, `packages/targets/CLAUDE.md` |
| H8 | `msm:strippable` and `msm:flammable` exist for project blocks only; no flatten or till; nothing for vanilla blocks | `definition.mcdoc` block components |
| H9 | Generic data kinds cover 28 registries; the 26.3 world data folders `decorated_pot_pattern`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype`, `wolf_sound_variant` have no kind; the vendored mcdoc has `minecraft:resource` schemas for them and for `post_effect`, `shader`, `waypoint_style`, `context_int_provider`, `context_float_provider`; `wolf_sound_variant` is a `concrete` node over `SoundVariant` for 26.1 to 26.4 | `packages/datapack/src/kinds/generic.ts`, `mc-26.3/src/target.ts` `dev.worldDataFolders`, `vendor/vanilla-mcdoc/symbols.json` |
| H10 | Project assets copied: `textures`, `sounds`, `font`, `texts` only | `packages/exporters/src/assets.ts` `EXPORTED_ASSET_FOLDERS` |
| H11 | 49 starters; none for banner patterns, trim patterns, gliders or pot patterns | `packages/plugins/library/src/starters/` |
| H12 | `MobTrader`: levels and restock twice a day, no gossip, demand or discounts; professions register a job site POI through `PoiTypes`, no home POI for project beds; no villager type registration anywhere | `registry/mob/MobTrader.java`, `MsmProfessions.java`, `src/mc/*/registry/PoiTypes.java` |
| H13 | `registry/fluid/`: definition, fluids, liquid block; no cauldron, bottle or mixing code; 26.3 lava-like fluids mix by vanilla's rule, 26.4 only vanilla lava (ADR 0099 findings) | `registry/fluid/`, ADR 0099 |
| H14 | Movement modes walk, fly, swim, amphibious; ten goal types (wander, look at player, look around, melee, flee, follow, ranged, tempt, panic, leap); no `msm:bucketable`; `MobShoulder` keeps one pet on the left shoulder | `definition.mcdoc` `MovementMode`, `GoalType`; `registry/mob/MobShoulder.java` |
| H15 | Rules: 56 triggers (none for crafting, picking up, eating, sleeping or advancements), no value for a command argument, no dialog step; twelve command argument types against vanilla's 62 (ADR 0101 F36); no game rule or stat kind; creative tabs order `as_listed` or `by_name` only | `packages/plugins/rules/src/catalogue/`, `definition.mcdoc` (`CommandArgumentType`, creative tab `order`) |
| H16 | The eject leaves out `villager_profession` and `fluid` definitions and the `msm:trader`, `msm:storage`, `msm:shoulder_riding` components with `export.not-in-eject` | `packages/exporters/src/java-project/index.ts` `NOT_IN_EJECT_KINDS`, `NOT_IN_EJECT_COMPONENTS` |

State at f6a8adc: plugin API 1.18.0, Script API 1.6, 104 kinds, runtime 705 GameTests per variant, `app.asar` 29.2 of 32 MB, renderer 16.3 of 18 MB, `BlockComponents` uses its nested group for the newest components (ADR 0074 C18).

## Spike questions (X1 to X34)

Answered by observation on both versions (26.3 and 26.4-snapshot-7), with signatures read by `javap` and no Mojang method body read.

Batch 1, B503:

- **X1** Which vanilla plant classes a project block can extend with only `Properties` (and which abstract members name vanilla content and need overriding): the growing-plant head and body pairs of kelp, weeping vines, twisting vines and cave vines; bamboo's stalk and shoot; sugar cane; cactus (and its 26.x flower); big and small dripleaf and the stem; glow lichen (the multiface family and its spreader).
- **X2** Whether survival checks of sugar-cane-like and cactus-like blocks read tags or fixed blocks, so a project `soil` list works; whether sugar cane's "water next to it" reads a fluid tag.
- **X3** Random growth, bone meal and harvesting of each (cave-vine berries and their light, bamboo shoots, kelp's age limit).
- **X4** Whether a project empty pot can keep its own plant-to-pot map without touching vanilla's (the vanilla constructor adds to a shared map: observe what a pot built with no plant changes).
- **X5** Whether a lightning strike scrapes a project weathering block (expected not: vanilla's map), and the route for our own: a Fabric event on the bolt, or a head injection under the Mixin policy.
- **X6** Weathering subclasses of the rod, button, pressure plate, fence, fence gate and wall classes tick randomly and age.
- **X7** A container block with `waterlogged` (chests do it in vanilla) keeps its block entity, menu and hopper faces.
- **X8** A double chest without a block entity renderer: a left and right block state with block models, one six-row menu over both halves, hoppers and comparators on each half, breaking one half.
- **X9** Per-player storage like an ender chest: a store per player and block id in a Fabric data attachment (the one `ScriptDataAttachment` uses), kept across death and dimension change.
- **X10** Own block sounds: a `SoundType` built with project sound events on 26.3; on 26.4 a `block_sound_set` data entry per project sound set, and whether a block registered at start can name a data entry that loads later.
- **X11** Own set types: building a `BlockSetType` on 26.3 and 26.4 (the 26.4 one takes a `block_sound_set` key) and whether it must be registered.
- **X12** Strip, flatten, till, oxidise and burn pairs for vanilla blocks: Fabric's content registries on 26.3 (present, F34) and the 26.4 route without them (the `UseBlockCallback` route `BlockExtras` uses for stripping, the `Flammability` reflection route).
- **X13** A weathering container keeps its contents when it ages (`Weathering.replace`).
- **X14** A vanilla spawner set to a project mob spawns it; a project spawn egg used on a spawner sets it.

Batch 2, B524 (villagers, mobs, boats):

- **X15** Reputation: a per-trader, per-player store of our own reflected in `MerchantOffer`'s special price, and the client showing the changed price.
- **X16** Demand: vanilla's demand rule on project offers (update at restock, price rise after heavy trading).
- **X17** Restocking at a work site: a trader with a `work_site` block walks to it and restocks there.
- **X18** Project beds as homes: whether vanilla's home POI matches every bed in `#minecraft:beds` (then joining the tag is enough) or needs a POI registration through the `PoiTypes` seam; villagers claiming and sleeping in the bed.
- **X19** Villager types: registering one at start on both versions, its biome map, its texture drawn by vanilla's villager and zombie villager renderers from the resource pack path with no client code.
- **X20** Fish buckets: our water bodies implementing vanilla's bucketable contract, the bucket item, saved data back on release.
- **X21** Both shoulders: a second perch on the right; a vanilla parrot on the other side.
- **X22** Hovering (ghast-like, a fixed height over the ground) and phasing (vex-like, through blocks while charging) on our bodies; bat-like roosting upside down and whether the runtime's renderer can draw the pose (else it moves to the client batch).
- **X23** Habits: collecting items for the owner (allay-like), digging up loot (sniffer-like), playing dead (axolotl-like), the ridden dash (camel-like, through vanilla's ridden jump bar), bartering (piglin-like: an item for a loot table roll); which need client code.
- **X24** Boats: our boat and chest boat entity types on both versions, the item placing them, and vanilla's boat renderer drawing a project texture through a model layer registered in the `EntityRendererRegistration` seam. If it needs more than that, boats move to the client batch (reserve B545).

Batch 2, B525 (fluids, commands, game rules, stats, events):

- **X25** Mixing: a project fluid meeting water, lava or another project fluid makes a chosen block, through our own liquid block's checks, on both versions (26.3 and 26.4 differ today, ADR 0099 findings).
- **X26** Cauldrons: a cauldron block filled with a project fluid (three levels or full), filled and emptied by the bucket; whether vanilla's empty-cauldron interaction map accepts our bucket without a Mixin.
- **X27** Bottles: a glass bottle used on a project source gives the project bottle item; drinking it.
- **X28** Vanilla boats float on a fluid in `#minecraft:water`.
- **X29** A resource pack replacing a project fluid's still and flowing pictures.
- **X30** Which further vanilla argument types work through Brigadier with the build context on both versions and reach the client's command tree: dimension, time, colour, rotation, angle, UUID, objective, score holder, item predicate, block predicate, a resource of a registry (effect, enchantment, biome, structure).
- **X31** Own game rules: the 26.x `game_rule` registry (in `registries.json`) or Fabric's game rule API on both versions; `/gamerule` lists it; saved per world.
- **X32** Custom statistics: a `custom_stat` entry at start, the scoreboard criterion `minecraft.custom:<ns>.<path>`, the statistics screen with its lang key.
- **X33** Hooks for crafting, picking up, eating, sleeping and advancements on both versions: Fabric events where they exist, else head or return injections under the Mixin policy (DESIGN section 10).
- **X34** Opening a data pack dialog for a player from the server on both versions.

## Limits (N1 to N26)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| N1 | **New types, pots, boats, villager types, game rules and stats are fixed at start.** | Registry freeze (audit L1). | Restart in Play. | Play's restart reasons. |
| N2 | **More companion ids are reserved.** | Growing plants register `<path>_plant` (the body), pots `<pot path>_<plant path>`, boats `<path>_boat` and `<path>_chest_boat`, cauldrons `<fluid path>_cauldron`, bottles `<fluid path>_bottle`. | An element with such an id is refused. | Validator error. |
| N3 | **A project pot holds only the plants its `plants` list names.** | Each pairing is a registered block. | Other plants do not go in. | The list offers every vanilla and project plant. |
| N4 | **Bamboo-like stalks keep vanilla's leaf stages and thickness rules.** | Vanilla's class. | No other shapes. | None. |
| N5 | **Copper golems do not wax or scrape project blocks.** | Vanilla's golem keeps vanilla's maps. | Axes, honeycomb and lightning do. | Guide note. |
| N6 | **Double storage only for three-row chests.** | Vanilla's rule (two chests make six rows). | Other layouts stay single. | Validator. |
| N7 | **Per-player storage is per block id.** | As vanilla's ender chest (one store for all ender chests). | Two blocks of the same id share a player's store. | Guide note. |
| N8 | **Own sounds on 26.4 live in data.** | 26.4's sound sets are a data registry (H7). | Answered by X10: reloadable or fixed. | Recorded at B503. |
| N9 | **Vanilla block pairs need the Fabric mod jar.** | They are code-side maps (ADR 0060's rule). | Info on vanilla pack exports. | `export.needs-jar`. |
| N10 | **Reputation is ours, not vanilla's gossip.** | Vanilla's gossip spreads between villagers by their brain. | A trader's prices follow the player's own deeds with it; it does not tell others. | Guide note. |
| N11 | **Villager types are a look and a biome list.** | As vanilla's. | No trades per type. | None. |
| N12 | **Fish buckets for `swim` mobs only.** | Vanilla's rule. | Other mobs cannot be bucketed. | Validator. |
| N13 | **Two shoulder pets at most, `animal` base.** | Two shoulders. | A third waits. | None. |
| N14 | **Roosting depends on X22.** | A pose the renderer may not draw. | Possibly a later client batch. | Recorded at B524. |
| N15 | **No warden, frog tongue, piglin brain or sculk behaviours.** | Brain and game event code (H14). | Not offered. | Recorded. |
| N16 | **Mixing makes one block per meeting.** | ADR 0108 D1. | Source and flowing can name different blocks, as vanilla's obsidian and cobblestone. | None. |
| N17 | **A project cauldron fills in three levels or whole, in the fluid's own colour.** | ADR 0108 D2. | No potion-like mixtures. | None. |
| N18 | **Fog colours on 26.3 wait for the client batch.** | Client rendering. | Water's fog on 26.3. | Client batch. |
| N19 | **Boats need the Fabric mod jar and X24.** | An entity type and a renderer registration. | Not in vanilla packs; possibly the client batch. | Reserve B545. |
| N20 | **Rules read command arguments of the listed types only.** | ADR 0111 D1. | Other types are passed to functions only. | None. |
| N21 | **Game rules are true or false, or a whole number.** | Vanilla's two kinds. | No text rules. | None. |
| N22 | **Statistics count; formats are vanilla's.** | Vanilla's three formats. | No custom display. | None. |
| N23 | **The new events come from Mixins where Fabric has none, and are not ejected.** | Scripts and Mixins are not ejected (audit L10). | `export.not-in-eject` for rules and scripts on them. | B142. |
| N24 | **Try it shows the looks; mixing, cauldrons and the new events as log lines.** | Our own simulation (ADR 0085). | Pictures and log lines. | Play. |
| N25 | **Runtime features are not in vanilla packs.** | They need the Fabric mod jar (ADR 0066). | Info on vanilla pack exports. | None. |
| N26 | **Looks and feel are in-game checks beyond screenshots.** | Audit L16. | A look bug can reach the user first. | Fixture READMEs. |

## Rules for every brief

- Read root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the latest `docs/DEVLOG.md` entry, the ADRs the brief names and this plan's "Notes from implementation". Version facts live only in `packages/targets` (`TargetFacts`); the runtime keeps version differences behind seams in `engine-mod/src/mc/<mc>/` (`BlockSetTypes`, `BlockSounds`, `Flammability`, `PoiTypes`, `fluid/`, `client/EntityRendererRegistration`, `mixin/MixinVersions`, and the new seams the scaffold briefs add).
- **Clean room.** Signatures may be read with `javap` (no `-c` on Mojang classes). No method body of a Mojang class is read, decompiled or transcribed; behaviour is written from the ADRs and learned by observation in GameTests and client GameTests. Calling vanilla's own methods is fine. Numbers may match the game's where the ADR says so (measured by observation). Fabric API code (Apache 2.0) may be read. No Mojang texture, model, sound or GUI sprite is bundled; models name vanilla templates as parents, which the user's own client jar supplies. New pictures come from the art generator (`@msm/plugin-library` `art/`, ADR 0092), never Mojang pixels.
- **No new dependency** in the app or the runtime (Fabric API modules already in the Fabric API jar count as present). A brief that wants one stops and reports.
- **Git.** Each executor works in its own git worktree in the scratchpad (`<scratchpad>/wt-B<nnn>`, from the commit the orchestrator names), builds and tests there, commits on its own branch, does not push and does not merge. Commits are made with `GIT_AUTHOR_NAME=Rakib GIT_AUTHOR_EMAIL=rakib1insta@gmail.com GIT_COMMITTER_NAME=Rakib GIT_COMMITTER_EMAIL=rakib1insta@gmail.com` in the environment. **Never run `git config`.** Commit messages carry no `Co-Authored-By`, `Claude-Session` or other credit or trailer lines (the user's rule; it overrides any other attribution guidance).
- **Disk.** Run `df -h` before building; stop below 10 GB free. Delete build outputs (`app/out`, `app/dist`, `engine-mod/build`, `engine-mod/parity/build`, `node_modules/.cache`) before reporting.
- **Gradle and memory.** At most two engine-mod executors run at the same time; each runs one Gradle build at a time. Never run `./gradlew --stop`. Use `-Dorg.gradle.internal.repository.max.retries=8` when Maven Central answers 429. Client GameTests need `SDL_VIDEO_FORCE_EGL=1 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew runClientGameTest [-Pmc=26.4]`, one at a time per container; add `ALSOFT_DRIVERS=null` when a client test listens for sounds (B503: without it OpenAL finds no device). Any JDK 25 works (`JAVA_HOME=<jdk25>`; HANDOFF "Working without Claude Code").
- **Stubs first.** B505 (batch 1) and B526 (batch 2) make every shared registration point (scanner kinds, `LoadReport` lines, init calls in `MsmRuntime.java` and `client/MsmRuntimeClient.java`, the `BlockType` enum entries, the dispatch in `registry/types/BlockTypes.java`, the hooks in `registry/MsmRegistrar.java`, new seam classes with "not yet" bodies on both versions, the GameTest and client GameTest classes and their `engine-mod/src/gametest/resources/fabric.mod.json` entries, Mixin config entries, the parity classes, the per-type lowering and validator files and their index lines, the Studio registry lines, the fixture folders and the empty e2e specs), so no later brief edits `pnpm-lock.yaml`, `tools/check-deps/layers.json`, either `fabric.mod.json`, `MsmRuntime.java`, `MsmRuntimeClient.java`, `loader/DefinitionScanner.java`, `loader/BlockType.java`'s enum list, `registry/types/BlockTypes.java`'s switch, `packages/plugins/blocks-items/src/lowering/types/index.ts`, `app/src/renderer/src/studios/studio-registry.ts` or `msm_runtime.mixins.json`.
- **One owner per shared file per wave.** Parallel briefs in one wave never touch the same file; a brief that needs another's file stops and reports. The "Owner files" lines are complete: anything else is read-only for that brief.
- **Format.** Only B506 (batch 1) and B527 (batch 2) edit `packages/schemas/mcdoc/msm/definition.mcdoc`, `element.mcdoc`, the Java parsers in `engine-mod/src/main/java/dev/mcsupermods/runtime/loader/` and the conformance corpus; `rules.mcdoc` belongs to B534. Run `node tools/build-msm-mcdoc/index.ts --check`.
- **Script API.** Only B533 edits `packages/plugins/scripting/api/script-api-v1.json`, `msm-runtime.d.ts`, the typings golden and `scripting/ScriptApi.java` (Script API 1.7). Members are labelled at the close with the release that ships them.
- **Plugin API.** Only B507 (1.19.0) and B527 (1.20.0) edit `packages/plugin-api/src/target.ts` and the target facts.
- **Notes.** Each executor ends its report with "Notes for the plan" (names, signatures, labels, test ids, measured sizes, answers to X1–X34, and what a later brief must change); the main session appends them to "Notes from implementation". Executors do not edit this file. Each executor appends one DEVLOG entry in its commit.
- **Exit criteria** always include `pnpm lint`, `pnpm typecheck` and the touched packages' tests; app briefs also `pnpm build` and `node tools/check-size/index.ts` (report `app.asar`, the renderer and new chunks; stop and report above 31 MB asar or 17.5 MB renderer: the gzip reserve of ADR 0079 D4 is the next step and needs the orchestrator); engine-mod briefs `./gradlew build`, `-Pmc=26.4` and `-PwithoutGeckolib`, and the client GameTests on both versions when client code changed; mcdoc changes `node tools/build-msm-mcdoc/index.ts --check`; `node tools/check-deps/index.ts`; library and example changes `UPDATE_GOLDENS=1` once, then a clean run.
- **Try it.** Every runtime and plugin brief ends its report with one "Try it" line: what the sim must learn (for B519 or B540) or the limit line for the guide.
- **Plain words.** Labels are British English, no emojis, no ids in Very easy; they go into the notes for the guide briefs (B522, B543).
- **Models.** Executors run on Opus (`claude-opus-5-5`) at medium effort; B503, B524, B525, B528 and B529 at high effort; Sonnet (`claude-sonnet-5-5`) for B505, B526 and the guide halves of B522 and B543. A stuck brief is rerun on Opus at high effort.

## Overlaps with other work

- No other plan is open. The 1.5.2 draft and the art batch's release are untouched by this plan; CHANGELOG lines go under `[Unreleased]`.
- The small follow-ups of HANDOFF "Next" item 3 may run beside this plan if they touch none of a running wave's owner files; `packages/plugins/scripting/src/validators-commands.ts` (the `nothingToRun` match) and `MsmRegistrar.checkEvents` (fluid events) are taken into B535 and B529 here.
- **ADR numbers:** this plan uses 0103–0112. **Brief ids:** B503–B546.
- **Versions:** plugin API 1.19.0 (batch 1) and 1.20.0 (batch 2); Script API 1.7 (batch 2).

## Waves

### Batch 1: Plants, pots, sounds and storage

| Wave | Briefs (parallel) | Engine-mod briefs | Depends on |
|---|---|---|---|
| 0 | B503 spike; B504 data kinds sweep 2; then B505 scaffold and stubs | B503, then B505 | none; B505 after B503 reports |
| 1 | B506 format; B507 plugin API 1.19.0 and facts; B508 data-only flows | B506 | B505 (B506, B507); B504 (B508) |
| 2 | B509 runtime: growing plants; B510 runtime: pots, weathering on more types, lightning; B511 lowering: growing plants; B512 lowering: pots and weathering | B509, B510 | B506, B507 |
| 3 | B513 runtime: storage 2; B514 runtime: sounds, set types, vanilla pairs; B515 plugin: storage, sounds, pairs; B516 app: Block Studio 2 | B513, B514 | wave 2 (B513 after B510); B511, B512 (B516) |
| 4 | B517 exporters and eject, batch 1; B518 flows, templates, examples, batch 1; B519 Try it, batch 1 | none | waves 2–3 |
| 5 | B520 fixture, parity, CI, client GameTests, batch 1; B521 e2e, batch 1 | B520 | waves 2–4 |
| 6 | B522 AI helper, guide, changelog, batch 1; then B523 close of batch 1 | none | all of batch 1 |
| reserve | B546 vanilla pairs on 26.4 by Mixin (only if X12 finds no other route) | B546 | B503 |

### Batch 2: Villagers, mobs, fluids, commands and the eject

| Wave | Briefs (parallel) | Engine-mod briefs | Depends on |
|---|---|---|---|
| 7 | B524 spike: villagers, mobs, boats; B525 spike: fluids, commands, game rules, stats, events | B524, B525 | B523 (or the orchestrator's go to overlap with waves 5–6) |
| 8 | B526 scaffold and stubs, batch 2; B527 format, plugin API 1.20.0 and facts | B526, B527 | B524, B525 |
| 9 | B528 runtime: villagers 2; B529 runtime: fluids 2; B530 entities plugin, batch 2; B531 blocks-items plugin: fluids 2 and boats | B528, B529 | B526, B527 |
| 10 | B532 runtime: mobs 2; B533 runtime: commands, game rules, stats, events, Script API 1.7; B534 Rules, batch 2; B535 scripting and tab kinds | B532, B533 | B526, B527; B530 (B532) |
| 11 | B536 runtime: boats; B537 eject of batch 2 and of this plan; B538 app: Studios, batch 2 | B536 | B524 go on X24 (B536); waves 9–10 |
| 12 | B539 flows, templates, examples, batch 2; B540 Try it, batch 2 | none | waves 9–11 |
| 13 | B541 fixture, parity, CI, client GameTests, batch 2; B542 e2e, batch 2 | B541 | waves 9–12 |
| 14 | B543 AI helper, guide, changelog, batch 2; then B544 close of batch 2 | none | all |
| reserve | B545 boats to the client batch (only on X24 no-go) | none | B524 |

The order follows value and risk: everyday plants and storage first (beginner-visible, low risk, no new seam beyond sounds), the data sweep beside them (no runtime), then the batch that needs spikes: traders and mobs (brain-adjacent code), fluids (the largest seam), commands and events (Mixins), boats (a renderer), and the eject last so it covers everything built before it.

## Briefs

### B503 Spike: plants, pots, weathering, storage, sounds and pairs in the real game (wave 0; Opus, high effort; one session)

- **Owner files:** new throwaway `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/spike3/` (one class per question), temporary entries in `engine-mod/src/gametest/resources/fabric.mod.json` (removed before the report), throwaway seam files `engine-mod/src/mc/<mc>/gametest/java/dev/mcsupermods/runtime/gametest/spike3/` where the versions differ. Nothing in `src/main`.
- **Scope:** answer X1–X14 by observation on both versions, in GameTests (dedicated GameTest server) and client GameTests (screenshots of each plant, a project pot with a vanilla and a project plant, a waterlogged chest, a double chest, named per version): grow each plant with forced random ticks and bone meal and count; strike a weathering block with a summoned bolt; open, fill, hopper and break a double chest; store items in a per-player block as two mock players; play a block's own break, step and place sounds (`ParityEars`-style capture); open a door of an own set type; strip, flatten, till and age a vanilla block with the 26.3 content registries and with the 26.4 route; age a weathering container with items inside; set a spawner to a project mob.
- **Exit criteria:** a report with X1–X14 answered per version with evidence (log lines, counts, screenshot names); per plant family the vanilla class to extend and the members to override (ADR 0103 D1's list confirmed or changed); go or no-go for D3 (lightning, ADR 0104), D4–D5 (double and per-player storage), ADR 0105 D1 (sounds on 26.4: reloadable or fixed) and D3 (the 26.4 route for pairs, or reserve B546); the spike code deleted (the report keeps the snippets that worked); `./gradlew build` green on both versions after deletion.

### B504 Data kinds sweep 2 and resource pack kinds (wave 0; Opus)

- **Owner files:** `packages/plugins/datapack/src/kinds/generic.ts` (the registries of ADR 0106 D1) and its tests; `packages/plugins/resourcepack/src/kinds/` new `post-effect.ts`, `waypoint-style.ts`, `shader.ts` and `kinds/index.ts`; `packages/exporters/src/assets.ts` (`shaders` in `EXPORTED_ASSET_FOLDERS` with the shader program JSON schema) and its test; `packages/schemas/src/` the adapter's `concrete` node (for `wolf_sound_variant`) if the adapter turns out not to read it, with a test; `packages/targets/mc-26.3/src/target.ts` and `mc-26.4/src/target.ts` `folders.data` and `folders.resource` entries for the new folders (verified against the vendored registries and the Spyglass URI binder, as the targets' CLAUDE.md asks); the targets' `CHANGES.md`; templates in `packages/plugins/datapack/src/templates/` and `resourcepack/src/templates/` (one per new kind).
- **Scope:** ADR 0106 D1–D3: generic kinds `minecraft:decorated_pot_pattern`, `wolf_sound_variant`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype` (per target: each target lists it only where its registry has it), `context_int_provider`, `context_float_provider`; resource pack kinds `minecraft:post_effect`, `minecraft:waypoint_style`, `minecraft:shader` (program JSON) and raw `.vsh`, `.fsh`, `.glsl` assets under `shaders/`; the 26.4 `block_sound_set` kind is B507's (facts) and B515's (lowering). The schema form covers each with zero unsupported nodes, as the targets' coverage test requires. Vanilla pack safety (ADR 0066) applies: a file naming a mod-only id is left out as usual.
- **Exit criteria:** each new kind has a schema-backed form, a template, a validation test on both targets and a vanilla data pack load in the library test (`packages/exporters/test/library.test.ts`) through the examples B508 adds later; `pnpm --filter "@msm/target-*" test`, `@msm/plugin-datapack`, `@msm/plugin-resourcepack`, `@msm/exporters`, `@msm/schemas` green; the kinds count recorded.

### B505 Scaffold and stubs, batch 1 (wave 0; Sonnet; merged after B503 reports)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/MsmRuntime.java`, `client/MsmRuntimeClient.java`, `loader/DefinitionScanner.java`, `loader/LoadReport.java`, `loader/BlockType.java` (enum entries `growing_plant`, `column_plant`, `multiface`, `dripleaf`, `flower_pot`; the `WEATHERING_TYPES` and `WATERLOGGABLE_TYPES` lists stay B510's and B513's), `registry/types/BlockTypes.java` (switch lines calling new `registry/types/GrowingPlantTypes.java` and `PotTypes.java`, stubs that throw "not yet"), `registry/MsmRegistrar.java` (hooks: `StorageExtras.blockFor(...)`, `OwnSounds.soundTypeFor(...)`, `VanillaPairs.register(report)`, `Lightning.init()`, each a stub returning nothing), new seam stubs `engine-mod/src/mc/26.3/java/dev/mcsupermods/runtime/registry/VanillaPairs.java` and its 26.4 twin, `registry/container/StorageExtras.java` (stub), `registry/weathering/Lightning.java` (stub); GameTest stubs `MsmGrowingPlantGameTest`, `MsmFlowerPotGameTest`, `MsmWeathering2GameTest`, `MsmStorage2GameTest`, `MsmOwnSoundsGameTest`, `MsmVanillaPairsGameTest` and the client stub `MsmPlants3ClientGameTest`, each with one passing placeholder, registered in `engine-mod/src/gametest/resources/fabric.mod.json`; `engine-mod/parity/src/main/java/dev/mcsupermods/parity/SamplePlantsAndStorageParityTest.java` (empty, registered); `packages/plugins/blocks-items/src/lowering/types/index.ts` (dispatch lines) with empty modules `growing-plant.ts`, `column-plant.ts`, `multiface.ts`, `dripleaf.ts`, `flower-pot.ts`; empty `validators-plants-3.ts`, `validators-storage-2.ts`, `validators-sounds.ts` and their lines in the plugin's validator list (`packages/plugins/blocks-items/src/index.ts`); `fixtures/sample-plants-and-storage/README.md` (title only); `app/e2e/plants-path.spec.ts` and `storage-2-path.spec.ts` (skipped placeholders).
- **Scope:** wiring only; no behaviour. Takes B503's renames if the spike changed a type's shape.
- **Exit criteria:** lint, typecheck, tests green; `./gradlew build` on both versions and `-PwithoutGeckolib` green with the new log lines at 0; `./gradlew -p parity build` green.

### B506 Format, batch 1 (wave 1; Opus)

- **Owner files:** `packages/schemas/mcdoc/msm/definition.mcdoc`, `element.mcdoc`; `engine-mod/src/main/java/dev/mcsupermods/runtime/loader/types/PlantFields.java`, `FurnitureFields.java`, new `loader/types/GrowingPlantFields.java`, `loader/BlockDefinition.java`, `loader/MsmSoundType.java`, `loader/MsmCodecs.java`; the conformance corpus (`engine-mod/src/test/resources/conformance/` and its TS twin in `packages/schemas/test/`); `packages/schemas/test/` corpus tests.
- **Scope:** the frozen shapes of ADR 0103 D1–D2 (the four plant types' fields and the `flower_pot` type's `plants`), ADR 0104 D1–D5 (weathering on the new types, `msm:waterloggable` on containers and machines, `double` and `per_player` on the chest layout, `weathering` on containers), ADR 0105 D1–D4 (`sounds` with project or vanilla sound events beside `sound_type`; `set_type` taking a project set type `{ sounds, can_open_by_hand, ... }`; `msm:flattenable`, `msm:tillable` as block components in the nested group; the `msm:vanilla_block_rules` addition kind for pairs on vanilla blocks). Defaults and ranges as the ADRs say.
- **Exit criteria:** `node tools/build-msm-mcdoc/index.ts --check`; corpus cases decode the same on both sides; `./gradlew build` both versions; schemas tests green.

### B507 Plugin API 1.19.0 and target facts (wave 1; Opus)

- **Owner files:** `packages/plugin-api/src/target.ts`, `version.ts`, `package.json` version, its CHANGELOG lines; `packages/targets/mc-26.3/src/target.ts`, `mc-26.4/src/target.ts`, their tests and `CHANGES.md`; `packages/targets/all/test/`.
- **Scope:** ADR 0105 D5 facts: `BlockFacts.soundTypes` (the vanilla `SoundType` names, replacing the mcdoc's "verify" enum as the source the validator reads), `BlockFacts.soundModel` (`"sound_type"` on 26.3, `"block_sound_set"` on 26.4), `BlockFacts.vanillaPairs` (the vanilla strip, flatten, till and wax pairs, from B503's dumps, so the validator warns when a project pair overrides one); ADR 0103 D5 `BlockFacts.plantSoils` (the tags the vanilla plants survive on, from B503). Every value checked as B503 reports; anything not measured is "(verify at implementation)" in `CHANGES.md` and absent from the facts.
- **Exit criteria:** `pnpm --filter "@msm/target-*" test`, `@msm/plugin-api` tests; `tools/check-deps`; plugin API 1.19.0 declared and its README version table updated.

### B508 Data-only flows: banner pattern, armour trim, glider, pot pattern (wave 1; Opus; after B504)

- **Owner files:** new `packages/plugins/library/src/starters/banner-pattern.ts`, `armour-trim.ts`, `glider.ts`, `pot-pattern.ts` and their lines in `starters/index.ts`; `packages/plugins/library/src/examples/data-kinds.ts` (examples for the B504 kinds); the art recipes they need in `packages/plugins/library/src/art/recipes/` (banner and shield pattern masks, trim layer masks, the glider wings, the sherd face); the `examples/` mirror (`UPDATE_GOLDENS=1`); library tests.
- **Scope:** ADR 0106 D4: four Creator flows that need no runtime (banner pattern with its banner and shield pictures and the item that applies it in the loom; armour trim pattern with its template item, smithing recipe and trim layer pictures; glider with the `glider` component and equipment asset; decorated pot pattern with its sherd item and face picture), each with a Very easy pick where the flow list has one.
- **Exit criteria:** library tests green; the exporters' library test loads each flow's vanilla packs on both targets with zero problems; `checkArtRules` passes on every new picture; the contact sheet updated.

### B509 Runtime: growing and climbing plants (wave 2; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/types/GrowingPlantTypes.java` and new classes `MsmGrowingPlantHeadBlock.java`, `MsmGrowingPlantBodyBlock.java`, `MsmColumnPlantBlock.java` (cane-like and cactus-like), `MsmBambooBlock.java`, `MsmBambooShootBlock.java`, `MsmMultifaceBlock.java`, `MsmBigDripleafBlock.java`, `MsmDripleafStemBlock.java`, `MsmSmallDripleafBlock.java`; `registry/types/Companions.java` (the `_plant` body and the bamboo shoot); `MsmGrowingPlantGameTest`.
- **Scope:** ADR 0103 D1, D3, D4 on both versions: each family over the vanilla class B503 named, with the driver's events (ADR 0067 D3), growth, bone meal, survival on the definition's `soil` (tags where X2 allows), cave-vine-like berries with light and harvest, kelp-like water plants (waterlogged by nature), cactus-like touch damage (`damage` default 1, as vanilla), dripleaf tilting under a standing entity and its stem, glow-lichen-like spreading by bone meal.
- **Exit criteria:** GameTests per family (place, grow with forced ticks, bone meal, break support, harvest, damage, tilt), on both versions; `./gradlew build`, `-Pmc=26.4`, `-PwithoutGeckolib`; the client GameTest screenshots of each family named per version.

### B510 Runtime: project pots, weathering on more types, lightning (wave 2; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/types/PotTypes.java`, new `MsmFlowerPotBlock.java`, `MsmPottedPlantBlock.java`; `registry/weathering/` (new `MsmWeatheringRodBlock.java`, `MsmWeatheringButtonBlock.java`, `MsmWeatheringPressurePlateBlock.java`, `MsmWeatheringFenceBlock.java`, `MsmWeatheringFenceGateBlock.java`, `MsmWeatheringWallBlock.java`, `Weathering.java`, `Lightning.java`, `Waxing.java`); `loader/BlockType.java` (`WEATHERING_TYPES` list only); `MsmFlowerPotGameTest`, `MsmWeathering2GameTest`.
- **Scope:** ADR 0103 D2 (a project empty pot with its own plant map; one potted companion per listed plant; vanilla's pot untouched, as X4 found) and ADR 0104 D1 (the six new weathering types), D2 (lightning scrapes project weathering blocks by the route of X5: a Fabric event, else a head injection, whose Mixin entry B505 left in the config) and the spawner fix if X14 found one missing.
- **Exit criteria:** GameTests: a vanilla and a project plant into a project pot and out, the pot's loot, each new weathering type ageing with forced ticks, waxing and scraping, a bolt scraping one stage off a project block and its neighbours as vanilla's rule does (measured against vanilla copper beside it), on both versions; builds as in B509.

### B511 Lowering: growing and climbing plants (wave 2; Opus)

- **Owner files:** `packages/plugins/blocks-items/src/lowering/types/growing-plant.ts`, `column-plant.ts`, `multiface.ts`, `dripleaf.ts`; `packages/plugins/blocks-items/src/validators-plants-3.ts`; `lowering/types/companions.ts` (the new companions); `lowering/types/tags.ts` (only the lines for the new types); their tests and goldens.
- **Scope:** ADR 0103 D1, D3: blockstates in vanilla's shape, generated models over vanilla templates (`TargetFacts.blocks.modelTemplates`), tags (`#minecraft:climbable` for climbing strands, `#minecraft:bamboo_plantable_on` style soils per B507's `plantSoils`), loot (`"loot": "self"` presets as vanilla's: shears for lichen and vines, berries for cave vines), lang; validators (companion id clashes, `soil` naming a block or tag, a water plant without water nearby in a feature).
- **Exit criteria:** blocks-items tests and goldens per type on both targets; the lowered files validate.

### B512 Lowering: pots and weathering on more types (wave 2; Opus)

- **Owner files:** `packages/plugins/blocks-items/src/lowering/types/flower-pot.ts`, `potted-plant.ts`, `packages/plugins/blocks-items/src/expand-potted-plant.ts`, `lowering/weathering.ts`, `validators-weathering.ts`, and the weathering lines of `lowering/types/button.ts`, `pressure-plate.ts`, `fence.ts`, `fence-gate.ts`, `wall.ts`, `rod.ts`; their tests and goldens.
- **Scope:** ADR 0103 D2 (the pot's model, the potted companions `<pot>_<plant>` over `flower_pot_cross` with the pot's texture, loot of the pot and the plant, the expander adding a companion per listed plant) and ADR 0104 D1 (the stage chain on the six new types, the generated waxed variants, the validator's type list).
- **Exit criteria:** blocks-items tests and goldens; vanilla pack exports leave the runtime-only parts out (ADR 0066 tests).

### B513 Runtime: storage 2 (wave 3; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/container/` (`MsmContainerBlock.java`, `MsmStorageBlockEntity.java`, `ContainerMenus.java`, `ContainerOpeners.java`, `StorageExtras.java`, new `PlayerStores.java`), `registry/machine/` (waterlogging only), `registry/Waterlogging.java`, `loader/BlockType.java` (`WATERLOGGABLE_TYPES` only), `registry/weathering/Weathering.java` (containers ageing with their contents; B510's file in wave 2, so no overlap), `MsmStorage2GameTest`.
- **Scope:** ADR 0104 D3–D6: waterlogged containers and machines, double chests (left and right states, six-row menu, hopper and comparator per half), per-player storage (one store per player and block id in a Fabric data attachment), weathering containers (copper-chest-like) keeping contents.
- **Exit criteria:** GameTests for each (including breaking one half of a full double chest, two players' stores, a store across death and a dimension change, an aged container's contents), both versions; builds as in B509.

### B514 Runtime: own sounds, set types and vanilla block pairs (wave 3; Opus)

- **Owner files:** `engine-mod/src/mc/26.3/java/dev/mcsupermods/runtime/registry/BlockSetTypes.java`, `BlockSounds.java`, `Flammability.java`, `VanillaPairs.java` and their 26.4 twins; `registry/BlockExtras.java`; new `registry/OwnSounds.java`; `MsmOwnSoundsGameTest`, `MsmVanillaPairsGameTest`.
- **Scope:** ADR 0105 D1–D4: block sounds from project or vanilla sound events (26.3 a built `SoundType`, 26.4 a `block_sound_set` entry as X10 found), own set types for doors, trapdoors, buttons and plates (sounds, hand-opening, arrow pressing, plate sensitivity), `msm:flattenable` and `msm:tillable` on project blocks, and the `msm:vanilla_block_rules` pairs (strip, flatten, till, wax and age pairs, flammability) for vanilla blocks on both versions (Fabric's content registries on 26.3; on 26.4 the `UseBlockCallback` route and the `Flammability` reflection route, or reserve B546).
- **Exit criteria:** GameTests (a door's own open sound captured, a block's own step sound, stripping and tilling a vanilla block into another, a vanilla block burning at the given rates), both versions; builds as in B509.

### B515 Plugin: storage, sounds and pairs (wave 3; Opus)

- **Owner files:** `packages/plugins/blocks-items/src/lowering/block.ts` (the container and sound parts), `lowering/waterlog.ts`, new `lowering/sounds.ts` (26.4 `block_sound_set` files and the `sounds.json` entries a set needs), `lowering/additions.ts` (the pairs addition), `validators-containers.ts`, `validators-storage-2.ts`, `validators-sounds.ts`, `packages/plugins/blocks-items/src/kinds/index.ts` (the addition kind's registration); their tests.
- **Scope:** ADR 0104 D3–D6 and ADR 0105 D1–D4 lowering and validators (double only on three-row chests, `per_player` not with `keep_contents`, a sound event that is neither vanilla nor in the project's `sounds.json`, a pair that overrides a vanilla pair from `TargetFacts.blocks.vanillaPairs` warns).
- **Exit criteria:** blocks-items tests; mod-only ids reported to the exporters' vanilla pack safety (`export.mod-only-reference`) tested.

### B516 App: Block Studio 2 (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/studios/blocks-items/BlockTypeSection.tsx`, `PlantSection.tsx`, `plant-model.ts`, `block-type-model.ts`, `block-type-pictures.tsx`, `BlockTypePreview.tsx`, `WeatheringSection.tsx`, `InventorySection.tsx`, `inventory-model.ts`, `WaterloggingSwitch.tsx`, new `SoundsSection.tsx` and `sounds-model.ts`, `AdditionStudios.tsx` and `additions-model.ts` (the pairs addition), `very-easy.ts` lines for these sections; their tests under `app/test/components/`.
- **Scope:** ADR 0112 D1 for batch 1: the five new types in the type picker with their fields and previews, the pot's plant list (a thing picker over vanilla and project plants), weathering on the new types, the chest's **Double chest** and **Different for every player** switches, **Holds water** on containers, a **Sounds** section (break, step, place, hit, fall; vanilla or own) and the set type's own sounds, the **Vanilla block rules** addition Studio; Very easy lists in plain words.
- **Exit criteria:** app tests; `pnpm build`; `node tools/check-size/index.ts` (stop above 31 MB or 17.5 MB); the form coverage baseline does not grow.

### B517 Exporters and eject, batch 1 (wave 4; Sonnet for the vanilla pack lines, then Opus for the generator in the same brief)

- **Owner files:** `packages/exporters/src/vanilla-packs/mod-only.ts` (new runtime-only ids), `packages/exporters/src/java-project/index.ts` (batch 1 kinds passed to the generator), `packages/targets/mc-26.3/src/java-project/block-types.ts`, `weathering.ts`, `containers.ts`, new `sounds-and-pairs.ts`, `templates/` new files for the shared classes; `packages/exporters/test/vanilla-parity.test.ts` and new `vanilla-parity-3.test.ts`; `packages/targets/mc-26.3/test/java-project/`.
- **Scope:** ADR 0112 D3 for batch 1: vanilla packs leave the runtime-only parts out with the usual infos; the 26.3 generator writes the four plant families, pots, the six weathering types, lightning scraping (a Fabric event only; a Mixin route is not ejected and warns), waterlogged, double and per-player storage, own sounds and set types, the pairs; 26.4 has no `javaProject` (unchanged). Each generated shared class is compared line by line with the runtime as earlier batches did.
- **Exit criteria:** exporters and targets tests; `MSM_VANILLA_PARITY_3_JAVA_OUT` writes the ejected `fixtures/sample-plants-and-storage` tree for CI's `./gradlew build` (wired by B520).

### B518 Flows, templates and examples, batch 1 (wave 4; Opus)

- **Owner files:** `packages/plugins/library/src/starters/` new `cave-plants.ts`, `desert-plants.ts`, `flower-pot.ts`, and the batch 1 answers in `copper-set.ts`, `storage-crate.ts`, `wood-set.ts` (own door sounds), `crop.ts` (none unless needed); `packages/plugins/library/src/examples/block-types.ts`, `containers.ts`; `packages/plugins/blocks-items/src/templates/` (templates for the new types, pots, storage and the pairs addition); `examples/` mirror; the art recipes for the new plants in `library/src/art/recipes/` (a strand, a stalk, a lichen, a dripleaf, a pot); `app/src/renderer/src/studios/very-easy.ts` is B516's and read-only here.
- **Scope:** ADR 0112 D2 for batch 1: Creator flows "Cave plants" (kelp-like, cave-vine-like, weeping or twisting, glow-lichen-like), "Desert plants" (cane-like, cactus-like, bamboo-like, dripleaf-like), "Flower pot"; the Copper set's rod, button, plate, fence, gate, wall and chest answers; the Storage crate's **Double chest** and **Different for every player** answers; templates and examples; every picture drawn by the art generator.
- **Exit criteria:** library tests; the exporters' library test (both targets, zero problems, vanilla packs load); the `examples/` mirror regenerated once; `checkArtRules` on the new pictures.

### B519 Try it, batch 1 (wave 4; Opus)

- **Owner files:** `packages/sim/src/blocks/` and `packages/sim/src/blocks2/` (new type behaviours), `packages/sim/src/world/` (lines for double containers), `app/src/renderer/src/tryit/` (looks of the new types), `packages/sim/test/` new tests; `fixtures/sim-parity/` scenarios for the new plants and pots.
- **Scope:** ADR 0112 D5 for batch 1: the new plants drawn and growing with Grow, pots taking plants, double chests opening as one six-row mock-up, per-player storage as one store (Try it has one player), sounds as captions, lightning and mixing as log lines (N24).
- **Exit criteria:** sim tests; app tests; e2e `tryit-path` still green; sim-parity scenarios recorded for B520's runtime side.

### B520 Fixture, parity, CI and client GameTests, batch 1 (wave 5; Opus)

- **Owner files:** new `fixtures/sample-plants-and-storage/` (project, `README.md` with the in-game checklist), `packages/exporters/test/sample-plants-and-storage.golden.test.ts`, `engine-mod/parity/src/main/java/dev/mcsupermods/parity/SamplePlantsAndStorageParityTest.java`, `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/client/MsmPlants3ClientGameTest.java` (from B505's stub), `.github/workflows/ci.yml` (export, server check and parity of the new fixture on both versions; the ejected tree on 26.3), the sim-parity runtime scenarios of B519.
- **Scope:** ADR 0112 D4 for batch 1: one fixture with every new type, pot, weathering type, storage option, sound and pair; parity on both content jars and the 26.3 ejected jar; client GameTest screenshots of the plants, pots and double chest.
- **Exit criteria:** golden test; parity green locally on both versions; CI green on the branch (all four jobs) before the merge.

### B521 e2e, batch 1 (wave 5; Opus)

- **Owner files:** `app/e2e/plants-path.spec.ts`, `storage-2-path.spec.ts` (from B505's placeholders); `app/CLAUDE.md` e2e list line.
- **Scope:** through the UI: a Cave plants flow and a pot with a vanilla plant exported and its files checked; a Storage crate as a double, per-player, waterlogged copper chest; the Sounds section writing own sounds; the Vanilla block rules Studio.
- **Exit criteria:** both specs green three times under `xvfb-run -a` after `pnpm build`; the full e2e run green once.

### B522 AI helper, guide and changelog, batch 1 (wave 6; Sonnet for the guide, Opus for the AI part)

- **Owner files:** `packages/ai/src/` (system prompt lines and scenario for the new types, pots and storage; `packages/ai/test/`), `docs/guide/block-types-and-plants.md`, `containers-and-machines.md`, `adding-to-vanilla.md`, `blocks-and-items.md`, `templates-and-examples.md`, `creator.md`, new `docs/guide/sounds.md` (and its sidebar line in `docs/site/.vitepress/config.ts`), `docs/guide/README.md`, `CHANGELOG.md` `[Unreleased]`, the status lines of root `CLAUDE.md` (at most 70 lines), `docs/CLAUDE.md`, `packages/plugins/CLAUDE.md`, `engine-mod/CLAUDE.md`.
- **Scope:** labels from the code; limits N1–N9 and N24–N26 in plain words; the data kinds and four flows of B504 and B508.
- **Exit criteria:** `vitepress build` passes; AI tests; no emojis; line limits kept.

### B523 Close of batch 1 (wave 6; main session)

- Review ADRs 0103–0106 against the merged code; record findings with dated sections; move X1–X14's answers into them; tick the ROADMAP's batch 1 waves; coverage audit rows; HANDOFF and DEVLOG; ADRs 0103–0106 accepted with findings, ADR 0112 for batch 1. Clean-worktree totals (GameTests, JUnit, parity, sim, app, e2e, `app.asar`, renderer).

### B524 Spike: villagers, mobs and boats (wave 7; Opus, high effort; one session)

- **Owner files:** throwaway `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/spike4/` and its `fabric.mod.json` entries (removed before the report), seam twins under `src/mc/<mc>/gametest/` as needed. Nothing in `src/main`.
- **Scope:** X15–X24 by observation on both versions: a project trader's price after hits and after many trades, its demand after restock, restocking at a work site; a villager claiming and sleeping in a project bed; a project villager type in its biome, a screenshot of its texture on a villager and a zombie villager; bucketing and releasing a project fish; two pets on the shoulders beside a parrot; hovering and phasing bodies; a roosting pose screenshot; the five habits; a project boat and chest boat placed, ridden and drawn (screenshots).
- **Exit criteria:** a report with X15–X24 per version with evidence; go or no-go for ADR 0107 D1–D5, ADR 0109 D1–D5 (roosting and the dash in particular) and ADR 0110 (boats, or reserve B545); the spike code deleted; `./gradlew build` green on both versions.

### B525 Spike: fluids, commands, game rules, statistics and events (wave 7; Opus, high effort; one session)

- **Owner files:** throwaway `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/spike5/`, a throwaway Mixin config in `engine-mod/src/gametest/resources/`, its `fabric.mod.json` entries (removed before the report).
- **Scope:** X25–X34 by observation on both versions: a project fluid meeting water, lava and another project fluid; a project cauldron filled and emptied by bucket and by hand; a bottle filled and drunk; a vanilla boat on a water-like project fluid; a resource pack retexturing a project fluid (client GameTest screenshot); each candidate argument type in a project command, its client tree after `/reload`; a game rule registered, set with `/gamerule` and saved; a custom stat counted and shown; each event hook fired (crafted from the crafting table and from shift-click, picked up, eaten, slept and woken, an advancement); a dialog opened for a player.
- **Exit criteria:** a report with X25–X34 per version with evidence; the Mixins needed (target, injection point, justification) or the Fabric events used; the argument type list for ADR 0111 D2; go or no-go per item of ADR 0108; the spike code deleted; `./gradlew build` green on both versions.

### B526 Scaffold and stubs, batch 2 (wave 8; Sonnet; after B524 and B525 report)

- **Owner files:** `MsmRuntime.java`, `client/MsmRuntimeClient.java`, `loader/DefinitionScanner.java` (kinds `villager_type`, `game_rule`, `stat`), `loader/LoadReport.java`, `registry/MsmRegistrar.java` and `registry/MsmEntityRegistrar.java` (hooks: `VillagerTypes.register(report)`, `MobBuckets.itemFor(...)`, `MsmCauldrons.register(report)`, `MsmBoats.register(report)`, `MsmGameRules.register(report)`, `MsmStats.register(report)`, stubs), new stub classes `registry/mob/VillagerTypes.java`, `registry/mob/MobBuckets.java`, `registry/mob/MobHabits.java`, `registry/fluid/MsmCauldrons.java`, `registry/fluid/FluidMixing.java`, `registry/boat/MsmBoats.java`, `client/boat/BoatRenderers.java`, `registry/MsmGameRules.java`, `registry/MsmStats.java`, `scripting/MoreEvents.java`, the new Mixin entries (named by B525) in `src/main/resources/msm_runtime.mixins.json` and version-only ones in `mixin/MixinVersions` (both versions) with empty bodies; GameTest stubs `MsmTrader2GameTest`, `MsmVillagerTypeGameTest`, `MsmMob2GameTest`, `MsmFluid2GameTest`, `MsmBoatGameTest`, `MsmCommand2GameTest`, `MsmGameRuleStatGameTest`, `MsmScriptApi17GameTest` and the client stub `MsmMobs2ClientGameTest`; `engine-mod/parity/.../SampleMobsAndCommandsParityTest.java`; plugin stubs: `packages/plugins/entities/src/kinds/villager-type.ts`, `packages/plugins/scripting/src/kinds/` lines for `msm:game_rule` and `msm:stat`, empty lowering modules `packages/plugins/entities/src/lowering/villager-type.ts`, `bucket.ts`, `packages/plugins/blocks-items/src/lowering/boat.ts`, `cauldron.ts`, `packages/plugins/scripting/src/lowering/game-rule.ts`, `stat.ts`, empty validators `validators-mobs-2.ts` (entities), `validators-boats.ts` (blocks-items), `validators-game-rules.ts` (scripting); Studio registry lines for `VillagerTypeStudio`, `GameRuleStudio`, `StatStudio` (empty components); `fixtures/sample-mobs-and-commands/README.md`; `app/e2e/villagers-2-path.spec.ts`, `mobs-2-path.spec.ts`, `commands-2-path.spec.ts` (skipped placeholders).
- **Exit criteria:** as B505.

### B527 Format, plugin API 1.20.0 and facts, batch 2 (wave 8; Opus)

- **Owner files:** `packages/schemas/mcdoc/msm/definition.mcdoc`, `element.mcdoc`; `engine-mod/src/main/java/dev/mcsupermods/runtime/loader/` (`TraderParser.java`, `ProfessionParser.java`, `FluidParser.java`, `CommandParser.java`, `CreativeTabParser.java`, `EntityDefinition.java`, new `VillagerTypeParser.java`, `GameRuleParser.java`, `StatParser.java`); the conformance corpus; `packages/plugin-api/src/target.ts`, `version.ts`, `package.json`; `packages/targets/mc-*/src/target.ts`, tests and `CHANGES.md`.
- **Scope:** the frozen shapes of ADR 0107 D1–D5, ADR 0108 D1–D3, ADR 0109 D1–D5, ADR 0110 D1, ADR 0111 D1–D7; plugin API 1.20.0 facts: `EntityFacts.villagerTypes` (vanilla's seven), `BlockFacts.cauldrons` (vanilla cauldron ids), `CommandFacts.argumentTypes` extended with B525's list, `DevFacts`-adjacent `gameRuleKinds` (`boolean`, `integer`) and `statFormats` (`default`, `distance`, `time`), each verified as B525 reports.
- **Exit criteria:** as B506 and B507.

### B528 Runtime: villagers 2 (wave 9; Opus, high effort)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/mob/MobTrader.java`, `MsmProfessions.java`, `VillagerTypes.java`, new `TraderReputation.java`, `goals/` new `RestockAtWorkSiteGoal.java`; `engine-mod/src/mc/<mc>/java/dev/mcsupermods/runtime/registry/PoiTypes.java` (both); `registry/types/MsmBedBlock.java` (the home POI or the tag, per X18); `MsmTrader2GameTest`, `MsmVillagerTypeGameTest`.
- **Scope:** ADR 0107 D1–D5 as B524 found.
- **Exit criteria:** GameTests (prices after a hit and after trades, demand, restocking at the work site, a villager sleeping in a project bed, a villager of a project type spawning in its biome and converting to a zombie villager and back), both versions; builds as in B509.

### B529 Runtime: fluids 2 (wave 9; Opus, high effort)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/fluid/` (`FluidDefinition.java`, `MsmFluids.java`, `MsmLiquidBlock.java`, `MsmCauldrons.java`, `FluidMixing.java`, new `MsmCauldronBlock.java`, `MsmBottleItem.java`), `engine-mod/src/mc/<mc>/java/dev/mcsupermods/runtime/registry/fluid/` (both), `registry/MsmRegistrar.java` only to make `checkEvents` public (the HANDOFF follow-up), `MsmFluid2GameTest`.
- **Scope:** ADR 0108 D1–D3 as B525 found; boats on water-like fluids only if X28 needs a change.
- **Exit criteria:** GameTests (each mixing pair, source and flowing, cauldron levels by bucket and bottle, a bottle drunk with its event), both versions; builds as in B509.

### B530 Entities plugin, batch 2 (wave 9; Opus)

- **Owner files:** `packages/plugins/entities/src/lowering/trader.ts`, `profession.ts`, `shoulder.ts`, `entity.ts` (movement and goal lines), `villager-type.ts`, `bucket.ts`; `packages/plugins/entities/src/kinds/villager-type.ts`, `kinds/index.ts`; `validators-villagers.ts`, `validators-mobs.ts`, `validators-mobs-2.ts`; their tests.
- **Scope:** ADR 0107 and ADR 0109 lowering (the villager type's texture paths and biome tag, the bucket item and its model, the habits' loot table references, the second shoulder) and validators (bucketable only on `swim`, `dash` only with `msm:rideable`, `barter` naming a loot table, a work site naming a block).
- **Exit criteria:** entities tests and goldens on both targets.

### B531 Blocks-items plugin: fluids 2 and boats (wave 9; Opus)

- **Owner files:** `packages/plugins/blocks-items/src/lowering/fluid.ts`, `cauldron.ts`, `boat.ts`, `validators-fluids.ts`, `validators-boats.ts`, `kinds/fluid.ts`; their tests.
- **Scope:** ADR 0108 lowering (the cauldron block's states and models, the bottle item, mixing results checked against blocks), ADR 0110 lowering (the boat and chest boat items, entity textures at vanilla's boat texture layout from the wood set, recipes as vanilla's, `#minecraft:boats` and `#minecraft:chest_boats` tags), validators.
- **Exit criteria:** blocks-items tests and goldens.

### B532 Runtime: mobs 2 (wave 10; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/mob/MobMovement.java`, `MobGoals.java`, `MobShoulder.java`, `MobBuckets.java`, `MobHabits.java`, `MobRiding.java` (the dash), `goals/` new goal classes (`CollectItemsGoal`, `DigForItemsGoal`, `PlayDeadGoal`, `BarterGoal`, `HoverGoal`, `PhaseChargeGoal`, `RoostGoal` if X22 allows); `registry/MsmMob.java`, `MsmAnimal.java`, `MsmMonster.java` and the GeckoLib bodies only for the bucketable contract and the new synced flags; `MsmMob2GameTest`, client `MsmMobs2ClientGameTest`.
- **Scope:** ADR 0109 D1–D5 as B524 found.
- **Exit criteria:** GameTests per habit and movement mode, buckets saving data, two shoulders, both versions; client GameTest screenshots of hovering and roosting (if kept); builds as in B509.

### B533 Runtime: commands, game rules, statistics, events and Script API 1.7 (wave 10; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/commands/` (`CommandArguments.java`, `CommandBuilder.java`, `MsmCommands.java`), `registry/MsmGameRules.java`, `registry/MsmStats.java`, `registry/MsmCreativeTabs.java` (hand order), `scripting/MoreEvents.java`, `ScriptEvents.java`, `ScriptApi.java`, `ScriptPlayer.java`, `ScriptWorld.java`, `CommandEvents.java`, `events/EventRunner.java` (the `open_dialog` action), `mixin/` new Mixins named by B525 (with justification comments); `packages/plugins/scripting/api/script-api-v1.json`, `msm-runtime.d.ts` and the typings golden; `MsmCommand2GameTest`, `MsmGameRuleStatGameTest`, `MsmScriptApi17GameTest`.
- **Scope:** ADR 0111 D1–D7: the new argument types, arguments named in the command's event context (`args.<name>`), game rules and statistics registered at start, the hand order of creative tabs, the events `item.crafted`, `item.picked_up`, `player.ate`, `player.slept`, `player.woke`, `player.advancement`, the action `open_dialog`, Script API 1.7 (`World.gameRule`, `World.setGameRule`, `Player.stat`, `Player.addStat`, `Player.openDialog`, the new events).
- **Exit criteria:** GameTests per event (each from a real path: crafting through the crafting menu, picking up from the ground, eating to the end, sleeping through a night, an advancement granted by its trigger), game rules saved across a server restart, a stat in the scoreboard; both versions; builds as in B509; the Mixin policy comment and GameTest for each Mixin.

### B534 Rules, batch 2 (wave 10; Opus)

- **Owner files:** `packages/plugins/rules/src/catalogue/triggers.ts`, `steps.ts`, `conditions.ts`, `values.ts`, `types.ts`; `packages/plugins/rules/src/compile/`; `packages/schemas/mcdoc/msm/rules.mcdoc`; `packages/plugins/rules/src/sentence.ts`; their tests and goldens.
- **Scope:** ADR 0111 D1, D3, D4: the value "the command's argument" (by name, typed), triggers "A player crafts", "A player picks up", "A player eats", "A player goes to sleep", "A player wakes up", "A player gets an advancement", the step "Open a dialog", the conditions "The game rule is" and "The statistic is at least", the steps "Set a game rule" and "Add to a statistic".
- **Exit criteria:** rules tests and compiler goldens; the AI's `kind_schema` truncation follow-up checked against the new counts (`app/src/renderer/src/ai/schema-summary.ts` is read-only here: report the numbers for B543).

### B535 Scripting and tab kinds (wave 10; Opus)

- **Owner files:** `packages/plugins/scripting/src/kinds/index.ts`, `lowering/command.ts`, `lowering/game-rule.ts`, `lowering/stat.ts`, `validators-commands.ts` (including the loose `nothingToRun` script-name match), `validators-game-rules.ts`; `packages/plugins/blocks-items/src/kinds/creative-tab.ts`, `lowering/creative-tab.ts`, `validators-creative-tabs.ts`; their tests.
- **Scope:** ADR 0111 D2, D5, D6, D7 plugin side: the extended argument type list from `TargetFacts.commands.argumentTypes`, kinds `msm:game_rule` and `msm:stat` (lang keys, the stat's scoreboard criterion in completions), the tab's `items` hand order.
- **Exit criteria:** scripting and blocks-items tests.

### B536 Runtime: boats (wave 11; Opus; only on B524's go for X24)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/boat/` (`MsmBoats.java`, new `MsmBoat.java`, `MsmChestBoat.java`, `MsmBoatItem.java`), `client/boat/BoatRenderers.java`, `engine-mod/src/mc/<mc>/java/dev/mcsupermods/runtime/client/EntityRendererRegistration.java` (both), `MsmBoatGameTest`, client boat screenshots in `MsmMobs2ClientGameTest` (B532's file is merged by now; this brief adds one method).
- **Scope:** ADR 0110 D1–D3.
- **Exit criteria:** GameTests (placing, riding, a chest boat's menu, breaking drops the item), client screenshots on both versions; builds as in B509.

### B537 Eject of batch 2 and of this plan (wave 11; Opus)

- **Owner files:** `packages/exporters/src/java-project/index.ts` (`NOT_IN_EJECT_KINDS` and `NOT_IN_EJECT_COMPONENTS` emptied of what is now generated), `packages/plugin-api/src/` only if `JavaProjectInput` needs new lists (a minor in the 1.20.0 line, coordinated with B527's merged version), `packages/targets/mc-26.3/src/java-project/` (`entities.ts`, `commands.ts`, `creative-tabs.ts`, new `professions.ts`, `traders.ts`, `fluids.ts`, `villager-types.ts`, `boats.ts`, `game-rules.ts`, and `templates/` new shared classes), `packages/exporters/test/` (new `vanilla-parity-3-batch-2.test.ts`), `packages/targets/mc-26.3/test/java-project/`.
- **Scope:** ADR 0112 D3: the eject writes professions and job site POIs, traders with levels, restock, reputation and demand, mount storage, shoulder pets, fluids with buckets, mixing, cauldrons and bottles, villager types, bucketable mobs, the habits, boats, game rules, statistics, the new command argument types and tab order; Mixin-based events and scripts stay out with `export.not-in-eject` (N23). Each shared class compared line by line with the runtime.
- **Exit criteria:** exporters and targets tests; the ejected `fixtures/sample-villagers-and-fluids` and `fixtures/sample-mobs-and-commands` trees written for CI (`MSM_SAMPLE_VILLAGERS_JAVA_OUT`, `MSM_SAMPLE_MOBS_COMMANDS_JAVA_OUT`, wired by B541).

### B538 App: Studios, batch 2 (wave 11; Opus)

- **Owner files:** `app/src/renderer/src/studios/entities/TraderSection.tsx`, `TradeEditor.tsx`, `ProfessionStudio.tsx`, `ShoulderSection.tsx`, `MovementSection.tsx`, new `BucketSection.tsx`, `HabitsSection.tsx`, `VillagerTypeStudio.tsx`; `studios/blocks-items/FluidStudio.tsx`, `fluid-model.ts`, `CreativeTabStudio.tsx`, `creative-tab-model.ts`, `ItemStudio.tsx` (the boat section); `studios/scripting/CommandStudio.tsx`, new `GameRuleStudio.tsx`, `StatStudio.tsx`; `studios/very-easy.ts` lines; tests under `app/test/components/`.
- **Scope:** ADR 0112 D1 for batch 2, with the Very easy lists the vanilla parity 2 follow-ups asked for (the Profession and Fluid Studios).
- **Exit criteria:** as B516.

### B539 Flows, templates and examples, batch 2 (wave 12; Opus)

- **Owner files:** `packages/plugins/library/src/starters/` (`wandering-merchant.ts`, `village-job.ts`, `water-mob.ts`, `pet.ts`, `flying-mob.ts`, `mount.ts`, `fluid.ts`, `wood-set.ts` (boats), `custom-command.ts`, `creative-tab.ts`, new `villager-look.ts`, `game-rule.ts`), `library/src/examples/entities.ts`, `popular.ts`, `vanilla-parity.ts`; templates in `packages/plugins/entities/src/templates/`, `scripting/src/templates/`, `blocks-items/src/templates/`; the `examples/` mirror; art recipes for villager type looks and boats.
- **Scope:** ADR 0112 D2 for batch 2: the flows' new answers ("Remembers how you treat it", "Restocks at its work site", "Can be caught in a bucket", "Sits on either shoulder", "Hovers" and "Flies through walls", the five habits, "Mixes with water into", "Fills cauldrons and bottles", "Has boats", "Its own game rule"), a new "Villager look" flow and "Game rule" flow, templates and examples.
- **Exit criteria:** as B518.

### B540 Try it, batch 2 (wave 12; Opus)

- **Owner files:** `packages/sim/src/traders/`, `entities/`, `fluids/`, `commands/`, `events/`; `app/src/renderer/src/tryit/` (looks of buckets, boats, cauldrons, hovering mobs); `fixtures/sim-parity/` scenarios; `packages/sim/test/`.
- **Scope:** ADR 0112 D5 for batch 2: reputation in the merchant mock-up's prices, buckets picking up a fish, two shoulder perches, hovering, boats placed and ridden as a mock-up, cauldrons filled, mixing and the new events as log lines.
- **Exit criteria:** sim and app tests; e2e `tryit-path` green.

### B541 Fixture, parity, CI and client GameTests, batch 2 (wave 13; Opus)

- **Owner files:** new `fixtures/sample-mobs-and-commands/`, `packages/exporters/test/sample-mobs-and-commands.golden.test.ts`, `engine-mod/parity/.../SampleMobsAndCommandsParityTest.java`, the ejected run of `fixtures/sample-villagers-and-fluids` (its parity test unchanged, now also on the ejected jar), `.github/workflows/ci.yml`, `MsmMobs2ClientGameTest` (screenshots), sim-parity runtime scenarios of B540.
- **Scope:** ADR 0112 D4 for batch 2.
- **Exit criteria:** as B520, with the batch 2 parity tests also on the ejected 26.3 jars.

### B542 e2e, batch 2 (wave 13; Opus)

- **Owner files:** `app/e2e/villagers-2-path.spec.ts`, `mobs-2-path.spec.ts`, `commands-2-path.spec.ts`; `app/e2e/eject-path.spec.ts` (an eject of a project with a trader and a fluid: no `export.not-in-eject` for them); `app/CLAUDE.md` e2e list line.
- **Scope:** through the UI: a trader with reputation and a villager look; a bucketable fish and a hovering mob; a command whose argument a rule reads and a game rule a rule sets; the eject.
- **Exit criteria:** as B521.

### B543 AI helper, guide and changelog, batch 2 (wave 14; Sonnet for the guide, Opus for the AI part)

- **Owner files:** `packages/ai/src/`, `packages/ai/test/`, `app/src/renderer/src/ai/schema-summary.ts` (`MAX_LIST`, `MAX_CASES` for the new Rules counts), `docs/guide/villagers-and-traders.md`, `fluids.md`, `mob-behaviours.md`, `commands-and-tabs.md`, `rules.md`, `eject.md`, `scripting.md`, `creator.md`, `templates-and-examples.md`, new `docs/guide/boats.md` (only if B536 ran) and its sidebar line, `CHANGELOG.md` `[Unreleased]`, status lines as in B522.
- **Scope:** labels from the code; limits N10–N26 in plain words; the Q27 guide note (gravity in a dimension through a function and `/attribute`).
- **Exit criteria:** as B522.

### B544 Close of batch 2 (wave 14; main session)

- Review ADRs 0107–0112 against the merged code; findings; X15–X34's answers into the ADRs; ADR 0112 in full with the fact table H1–H16 and limits N1–N26 (with their outcome); DESIGN sections touched (10 runtime, 12 eject, 13 Script API, the section holding the Rules catalogue), ROADMAP, coverage audit rows, HANDOFF, DEVLOG; this plan deleted.

### B545 Reserve: boats to the client batch (only on X24's no-go)

- **Owner files:** `packages/plugins/blocks-items/src/validators-boats.ts` (`export.not-in-batch` style info pointing at the guide), ADR 0110 Status, ROADMAP client batch line. No runtime.

### B546 Reserve: vanilla block pairs on 26.4 by Mixin (only if X12 finds no other route)

- **Owner files:** `engine-mod/src/mc/26.4/java/dev/mcsupermods/runtime/registry/VanillaPairs.java`, a version-only Mixin through `mixin/MixinVersions` (26.4) and `MsmMixinPlugin`, `MsmVanillaPairsGameTest` (26.4 path). Under DESIGN section 10's Mixin policy.

## Very easy wording

- Types: "Grows in long strands" (growing plants), "Grows tall like sugar cane" (column plants), "Spreads over any side" (multiface), "Tips when you stand on it" (dripleaf), "A flower pot".
- Storage: "Double chest", "Different for every player", "Holds water", "Ages like copper".
- Sounds: "How it sounds", "When it breaks", "When you walk on it", "When you place it".
- Pairs: "When you use an axe on it", "When you use a shovel on it", "When you use a hoe on it", "Burns".
- Traders: "Remembers how you treat it", "Prices go up when many people buy", "Restocks at its work site".
- Mobs: "Can be caught in a bucket", "Sits on either shoulder", "Hovers", "Flies through walls", "Collects items for you", "Digs up things", "Plays dead", "Dashes when ridden", "Trades for gold" (barter, with the item it takes named).
- Fluids: "When it meets water, it becomes", "Fills cauldrons", "Fills bottles".
- Commands and Rules: "What the player typed for <argument>", "A player crafts", "A player picks up", "A player eats", "A player goes to sleep", "A player wakes up", "A player gets an advancement", "Open a dialog", "A game rule of my mod", "A statistic of my mod".

## Notes from implementation

### B504 (merged 2026-11-22)

- Kinds 104 to 115. Generic registries appended in this order: `decorated_pot_pattern`, `wolf_sound_variant`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype`, `context_int_provider`, `context_float_provider` (all on both targets; 26.3 has 12 sulfur cube archetypes, 26.4 has 13 with `cold`). Data pack templates 66 to 74 (ids as the registry names); resource pack templates 17 to 20 (`post_effect_creeper`, `shader_program`, `waypoint_style`). Resource kind folders `post_effect`, `waypoint_style`, `shader` (output folder `shaders`) are constants in the kinds, not `ResourceFolderKey` entries (not additive in 1.x).
- B504 added seven `DataFolderKey` members to `packages/plugin-api/src/target.ts` ("Since 1.19.0"), with the fixtures that need them. **B507:** bump `API_VERSION` and the package to 1.19.0, add the CHANGELOG line for the seven keys, and decide whether the two context providers belong in `dev.worldDataFolders` (verify at implementation).
- **B508:** empty `KINDS_AWAITING_EXAMPLES` in `packages/exporters/test/library.test.ts` (11 kinds) and add the 11 kinds to `KIND_IDS` in `packages/plugins/library/test/content.test.ts`; add `GROUP_LABELS` in `app/src/renderer/src/components/ElementSidebar.tsx` only if B516 does not own it in that wave (suggested: Pot patterns, Wolf sounds, Block transformers, Test environments, Test instances, Sulfur cube kinds, Whole-number providers, Decimal-number providers, Screen effects, Waypoint styles, Shader programs). Fix the stale "no templates" header comment of `datapack/src/kinds/generic.ts`.
- **B517:** decide whether the new data kinds belong in `FATAL_DATA_FOLDERS` (`packages/exporters/src/vanilla-packs/mod-only.ts`) by a vanilla server probe (`block_transformer` names blocks, `sulfur_cube_archetype` items, `test_*` and the context providers predicates).
- Shapes: `block_transformer` is a top-level list of 1 to 200 transforms; 26.x block state providers are `minecraft:rule_based` and `minecraft:simple`, states `{ id, properties }`; `sulfur_cube_archetype.sound_settings.hit_sound` and `push_sound` are required on 26.3, optional on 26.4. Biome's `noThenProperty` needs a `biome-ignore` on rule-based providers' `then:`.
- Shaders: `.vsh`, `.fsh`, `.glsl` are `language: 'glsl'`, unchecked (`export.language-unchecked` info on exports without a checker; the app's `validateText` returns nothing for glsl). Guide line (B522): "Shader files (.vsh, .fsh, .glsl) are copied as they are; MSM does not check them, so a mistake shows only in game. The post effect template's shader names point at files you add yourself." Check that the app's asset import allows a `shaders/` folder (B516 or B522).
- Root `CLAUDE.md` kinds count is updated at the close (B523).

### B503 (merged 2026-11-22)

- All of X1–X14 answered on both versions; evidence and working snippets in `docs/reference/spikes/b503/` (`server-*.json`, `client-*.json`, `spike-src/`). Decisions are the "Amendment after the spike" sections of ADRs 0103, 0104 and 0105, which win over this plan's text. In short: bamboo and dripleaf get the runtime's own rules over measured numbers (not vanilla's classes alone); a given `soil` is the element's own `canSurvive` check, vanilla's tags otherwise; project pots are their own class with their own map; lightning, weathering on six more types, waterlogged containers, double chests (a `ChestBlock` family) and per-player storage (a Fabric attachment) are all go with no Mixin; ageing containers copy the block entity data; own sounds on 26.4 are a `block_sound_set` entry fixed per world load; vanilla pairs use one `UseBlockCallback` on both versions, and only `age` on 26.4 needs reserve **B546** (the Mixin also makes the vanilla state random-tick).
- **B507 facts:** tags on both versions `minecraft:supports_sugar_cane`, `supports_sugar_cane_adjacently`, `supports_cactus`, `supports_bamboo`, `supports_big_dripleaf`, `supports_small_dripleaf`, `cannot_support_kelp`, `cave_vines`, `support_override_cactus_flower`; `soundModel` `sound_type` (26.3) and `block_sound_set` (26.4); `vanillaPairs`: strip, flatten and till from `data/minecraft/block_transformer/{axe,shovel,hoe}.json`, waxing and copper ages from code maps.
- **Version traps:** `KelpBlock.canPlaceLiquid` takes `Fluid` on 26.3 and `FluidState` on 26.4 (never override outside a seam); the `BlockSetType` constructor differs (26.3 name and `SoundType`, 26.4 `ResourceKey<BlockSoundSet>`); `SoundType` does not exist on 26.4.
- **B509:** growing heads are at most 26 long (`AGE` 0..25 is static); cave vines override `useWithoutItem` and `getCloneItemStack`; cane and cactus need `randomTicks()`; bamboo stalk and shoot and dripleaf leaf and stem overrides as ADR 0103's amendment lists. **B510:** lightning from `ServerEntityEvents.ENTITY_LOAD`; the potted-plant warning reworded. **B513:** double chests override `newBlockEntity`; the copy route for ageing containers keeps custom name and lock too (verify at implementation). **B514:** warn in the log for a missing `block_sound_set` entry (the game is silent).
- **B519 (Try it):** heads 26 long from age 0, kelp +1 per bone meal; cane and cactus 3 high, 16 random ticks per block; dripleaf tilt 2/10/10 ticks; lightning sends the struck block to its first stage and a few neighbours one stage back; double chests are two halves with one 54-slot menu.
- **Guide (B522):** own sounds on 26.4 change only after the world is opened again; a project pot holds only its listed plants; a spawner takes a project mob from its spawn egg (X14).
- Engine-mod overlay root for the GameTest source set is `src/mc/<mc>/gametest/dev/...`.

### B505 (merged 2026-11-22)

- 711 GameTests per variant (six placeholders). No new `LoadReport` lines (no new definition kind in batch 1). Placeholder Studio entries for the five types in `app/src/renderer/src/studios/blocks-items/block-type-model.ts` and `block-type-pictures.tsx` (not offered in the picker yet; **B516** replaces them and adds the picker groups).
- **B506** also owns `loader/BlockType.java`'s five entries: replace their `List.of()` field lists and the `MapCodec.unit` case in `BlockType.fieldsCodec()` with the real codecs (e.g. `GrowingPlantFields.codec(id)`).
- **B509** fills `registry/types/GrowingPlantTypes.create(Identifier, BlockDefinition, BlockBehaviour.Properties, Consumer<String> warn)` (branches on `definition.type()` for `GROWING_PLANT`, `COLUMN_PLANT`, `MULTIFACE`, `DRIPLEAF`); it may add `BlockTypes.properties` cases (`randomTicks`, `noCollision`), so B509 owns `registry/types/BlockTypes.java` in wave 2 (B510 does not touch it).
- **B510** fills `registry/types/PotTypes.create(...)` and `registry/weathering/Lightning.init()` (called after `BlockExtras.register()`), extends `BlockType.WEATHERING_TYPES` and `Weathering.blockFor`.
- **B513** fills `registry/container/StorageExtras.blockFor(Identifier, BlockDefinition, BlockBehaviour.Properties)` returning `Optional<Block>` (already in the registrar's chain before `Waterlogging`), and owns `BlockType.WATERLOGGABLE_TYPES`.
- **B514** fills `registry/VanillaPairs.register(LoadReport)` and `registry/OwnSounds.soundTypeFor(Identifier, BlockDefinition, BlockBehaviour.Properties)` (returns properties; package-private) in both `src/mc/26.3` and `src/mc/26.4`; reads the addition files from `report.definitions()`.
- **B511/B512** fill `growingPlantType`, `columnPlantType`, `multifaceType`, `dripleafType`, `flowerPotType` in `packages/plugins/blocks-items/src/lowering/types/`; B512 `plants3Validators`/`PLANT3_PROBLEM_CODES` (`validators-plants-3.ts`); B515 `storage2Validators`/`STORAGE2_PROBLEM_CODES` and `soundValidators`/`SOUND_PROBLEM_CODES`.
- **B520** fills `MsmPlants3ClientGameTest`, `SamplePlantsAndStorageParityTest` (test names `samplePlantsAndStorage...`, filter `sample_plants_and_storage_*`) and the six `Msm*GameTest` placeholders; **B521** unskips `app/e2e/plants-path.spec.ts` and `storage-2-path.spec.ts`. A full `./gradlew build` is about 2.5 minutes per variant.

### B508 (merged 2026-11-22)

- Starters 60 to 64, Creator flows 48 to 52 (`banner-pattern`, `armour-trim`, `glider`, `pot-pattern`), examples 164 to 174, art recipes 80 to 89 (`art/recipes/patterns.ts`: `pattern_sheet`, `pottery_sherd`, `glider`, `banner_pattern`, `shield_pattern`, `trim_layer_1`, `trim_layer_2`, `glider_wings`, `pot_pattern`); AI tool-catalogue hash now `43bd3614…`. Each flow's item is a vanilla item with components (a vanilla pack cannot add items). Home tile "Make a painting" is now "Make a painting or pattern"; "Make an item" offers Glider, "Make armour" Armour trim. Bundles may carry `.png.mcmeta` text assets. `schema-context.ts` `projectRegistryIds` now includes project item definitions under `item_definition`.
- A vanilla 26.3 server loads all 352 library data packs, including `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype` and both context providers (**B517:** these folders are not fatal on 26.3; 26.4 not run).
- **Open, wolf sound variant:** a vanilla 26.3 server needs `step_sound`, which the vendored 26.3 and 26.4 mcdoc reject as unknown; B504's default and template fail in game, and the kind has no example (still in `KINDS_AWAITING_EXAMPLES`). The main session runs a small fix after B507 merges (local schema correction in the targets, then the default, template and example).
- **B507** (or a follow-up): `dataPackComponents` lacks `provides_pottery_pattern`.
- **In-game checks (B520 or the user):** the trim recolours with the flow's own palette key (stored lightest first; verify at implementation); the loom accepts the paper pattern item; the brick sherd shows its face on a pot; the glider glides and shows its wings.
- **B519 (Try it):** banners from the loom with the mask, trimmed armour with the palette swap, the glider's wings and gliding, the pot face on decorated pots. **B522:** guide limit "The pattern items, sherd, template and glider are vanilla items with components, so any plain item of the same type also works where a recipe names it."; `docs/guide/very-easy.md` says "Make a painting" (now "Make a painting or pattern"); an AI-drawn trim layer gets no palette sidecar and will not recolour.
- **Clean-room note:** the worker read the PNG header sizes (no pixels) of seven vanilla textures and a few vanilla JSON files (atlases, `equipment/elytra.json`, `post_effect/invert.json`, an item tag) from the client jar to confirm layouts; nothing was copied or bundled. ADR 0092 D12 forbids measuring vanilla textures: later briefs take sizes from the vendored data or the ADRs instead.

### B507 (merged 2026-11-22)

- Plugin API 1.19.0: `BlockFacts.soundTypes?: readonly string[]`, `soundModel?: 'sound_type' | 'block_sound_set'` (absent counts as `sound_type`), `vanillaPairs?: VanillaPairFacts { strip; flatten; till; wax; age }` (each `Readonly<Record<string, string>>`, namespaced block id to block id, no state properties), `plantSoils?: PlantSoilFacts { cane; caneWater; cactus; cactusFlower; bamboo; bigDripleaf; smallDripleaf; notKelp; caveVines }` (tag ids without `#`). Values: 26.3 131 sound names, 26.4 137 (`block_sound_set` ids); pairs strip 25, flatten 6, till 5, wax 60, age 45 on both; plant soils identical on both. New `packages/targets/all/test/block-facts.test.ts` checks them against the cached client jar (skipped without it). The two context providers are reloadable registries, not world data folders.
- **B506/B515:** the format's 40-name `sound_type` enum uses `amethyst`, which is `amethyst_block` on 26.4 (the runtime's 26.4 `BlockSounds` already maps it); the validator needs a per-target alias or should check `soundTypes` only for names outside the enum. `twisting_vines` and `empty` are 26.3 only; the ice sets and `chiseled_soulshale` 26.4 only.
- **B515:** warn on a project pair whose from-id is a key of any `vanillaPairs` map; an `age` pair on a block that already ages replaces vanilla's next stage; packs can change strip, flatten and till through `block_transformer` (the facts are vanilla's defaults).
- **B509/B511 soils:** `column_plant` cane uses `cane` (plus `caneWater`), cactus `cactus`, bamboo `bamboo`; `dripleaf` big `bigDripleaf`, small `smallDripleaf`; a kelp-like `growing_plant` refuses `notKelp`; a cave-vine-like plant may join `caveVines` for climbing and bee growth.
- **AI helper (B522):** `tool-executor.ts` passes the whole `blocks` facts to `target_facts`, about 11 KB more per call with these; leave out `vanillaPairs` as was done for the key code tables.
- **Main session fix after B505:** the five scaffolded types had joined `BUILDING_BLOCK_TYPES` (two `block-type-model` tests failed). They are now `PLANTS_3_BLOCK_TYPES` in `block-type-model.ts`, offered in no group; `block-types-b452.test.tsx` checks they stay out. **B516** puts them in a group, removes `PLANTS_3_BLOCK_TYPES` and restores "every type in exactly one group".
- Stale counts fixed at close (B523): `packages/targets/CLAUDE.md` world data folders 52 (26.3) and 53 (26.4); root and `packages/plugin-api/CLAUDE.md` plugin API 1.19.0.

### B506 (merged 2026-11-22)

- mcdoc exported types 509 to 540; corpus +104 files (prefixes `block-type-3-`, `block-tools-`, `container-2-`, `machine-2-`, `weathering-2-`, `vanilla-block-rules-`); 1216 JUnit. Frozen shapes as ADR 0105's amendment and the DEVLOG entry list them: `growing_plant` (`direction`, `max_age` 0..25, `growth_chance`, `bonemeal_growth {min,max}`, `needs_water`, `berries {item, light 14}`, `climbable`, `soil` 1..16 ids or `#tags`), `column_plant` (`style`, `max_height` 1..32 default 3 or 16, `min_height` default `max_height` or min(12, max) for bamboo, `soil`, `needs_water_nearby`, `touch_damage`), `multiface` (`light` 7, `spreads`, `waterloggable`), `dripleaf` (`size`, `grows_into` required for small, `tilt_ticks` [2,10,10] big only), `flower_pot` (`plants` 1..64), `potted_plant.pot` (default `minecraft:flower_pot`); `block_sounds`; `set_type` name or object; `msm:flattenable {into}`, `msm:tillable {into, drops?}`; chest `double` and `per_player`; definition kind `vanilla_block_rules` (`VanillaBlockRulesParser`, `MSM_SCHEMA_REFS.vanillaBlockRules`). `msm:block` AI kind_schema allowance 22,000 characters (about 20,300 used).
- **B514** owns the scanner line: add `VanillaBlockRulesParser.KIND` to `DefinitionScanner.KINDS` (and check `dev/EventOverlay.KINDS_WITHOUT_EVENTS`); until then those files are ignored at run time.
- **B509:** read `GrowingPlantFields.GrowingPlant`, `ColumnPlant`, `Multiface`, `Dripleaf`; `soil` entries are `BlockType.IdOrTag`; cane and cactus heights other than 3 need the runtime's own random tick (vanilla's cap is fixed); `BonemealGrowth.CODEC` is public.
- **B510:** read `FlowerPot.plants()` and `PottedPlant.pot()`; extend `WEATHERING_TYPES`, then remove `weathering-2-` from `ConformanceCorpusTest.PENDING`.
- **B513:** read `Container.doubleChest()` and `perPlayer()` (rules already in `checkContainer`); lift `checkAgeing`'s Q8 drop for containers and machines (water) and containers (weathering, wax), then remove `container-2-` and `machine-2-` from `PENDING`.
- **B514:** read `BlockDefinition.blockSounds()`, `OwnSetType` (`canOpenByHand()`, `canOpenByWindCharge()`, `arrowsPress()`, `plateSensitivity()`, `sounds()`), `BlockComponents.flattenable()`/`tillable()`, `VanillaBlockRulesParser.parseAll`; the 26.4 `block_sound_set` lowering (B515) matches `block_sounds`.
- **B515 validators:** dripleaf `grows_into` and `tilt_ticks` by size; `min_height` not above `max_height`; the `double`/`per_player` rules; weathering on the new types; `pot` naming a `flower_pot`.
- **B517:** `packages/targets/mc-26.3/src/java-project/block-types.ts` reads `set_type` with `requiredString`, so an own set type object fails the eject. **B519:** the same in `packages/sim/src/blocks/catalogue.ts`.
- **B522:** the AI system prompt describes `set_type` as a name only.
- **B523:** `packages/schemas/CLAUDE.md` status line (540 types, the corpus prefixes).
- **Labels:** Grows up/Grows down, Starts at age, Chance to grow, Lives in water, Berries, Can be climbed, Grows on, Cane/Cactus/Bamboo, Tallest/Shortest stop, Needs water beside it, Hurts when touched, Spreads with bone meal, Big/Small leaf, Grows into, Plants it takes, Pot, Own sounds, Own door sounds, Shovel flattens into, Hoe tills into, Double chest, Each player's own chest.

### Wolf sound variant (main session, 2026-11-22)

- `minecraft:wolf_sound_variant` is out again (ADR 0106 amendment): kinds 114, generic data kinds 35, data pack templates 73; `KINDS_AWAITING_EXAMPLES` is empty. The `DataFolderKey` stays (plugin API 1.9.0). Wherever B504's notes above say 115 or "11 kinds", read 114 and 10.

### B511 (merged 2026-11-22)

- Lowering for `growing_plant`, `column_plant`, `multiface`, `dripleaf`; validator `msm.blocks-items.plants-3` with `PLANT3_PROBLEM_CODES` (`dripleaf-grows-into-missing`, `-grows-into-big`, `-tilt-small`, `-grows-into-not-big`, `column-min-above-max`, warning `water-plant-feature-dry`); B515 does not redo these. Companion clashes are covered by the existing `generated-block-clash`. The main session added the validator id to `plugin.test.ts`.
- **B509 block states:** `berries` on tip and strand only when `berries` is set; `age` and `leaves` on bamboo; `facing`/`tilt` on the big leaf; `facing` on the stem; `facing`/`half` on the small leaf. Project bamboo and its shoot join `#minecraft:supports_bamboo`.
- `companions.ts`: `CompanionLowering.applies?(data)`, data-dependent `blockTags`, `companionsOf(type, data?)`; `blockGeneratedBlockIds` depends on the data (`_shoot` only for bamboo, `_stem` only for big dripleaf).
- **B516 model slots:** `growing_plant` `head`, `body`, `head_berries`, `body_berries`; `column_plant` `default`, `stalk2`–`stalk4`, `thick`–`thick4`, `leaves_small`, `leaves_large`, `shoot`; `multiface` `face`; `dripleaf` `leaf`, `partial_tilt`, `full_tilt`, `stem`, `bottom`; every type `item`. Generated model ids as the DEVLOG entry lists.
- **Facts follow-up (B515 or the close):** add 18 vanilla model templates to `BlockFacts.modelTemplates` on both targets (cactus, eight bamboo stalks, two bamboo leaves, glow_lichen, big_dripleaf with partial and full tilt and stem, small_dripleaf top and bottom), then remove `TEMPLATES_NOT_IN_FACTS` from `plants-3.golden.test.ts`.
- **B519:** strands from a tip with a `_plant` body and the lit berries model; bamboo's four stalks by `age` and leaves by `leaves`, the shoot; the six multiface faces; big dripleaf tilt models with the stem, small by `half`; items are flat pictures.
- **B522 guide:** "A small dripleaf needs a big dripleaf of this project to grow into." "A plant that lives in water placed by a world feature needs a water check in that feature." "Vine-like strands drop only to shears or Silk Touch, or sometimes by luck; glow-lichen-like plants and small dripleaf only to shears."

### B512 (merged 2026-11-22)

- Lowering for `flower_pot` (empty pot on `minecraft:block/flower_pot`; one potted companion `<pot>_<plant path>` per listed plant on `flower_pot_cross`, first plant of a path wins; block tag `flower_pots`; potted loot drops pot and plant), `potted_plant.pot` (`pottedPlantPotOf`, `pottedLootTable`), the expander's `plant_item` map on pots, and weathering on 17 types (`rod`, `button`, `pressure_plate`, `fence`, `fence_gate`, `wall` added). The main session wired the potted companions into `companionsOf` (`lowering/types/companions.ts`), so they reach the output and `blockGeneratedBlockIds`.
- **B515 validators:** a plant both listed in a pot and potted by a `potted_plant` naming that pot; two listed plants with the same path or one listed twice; `pot` naming a block that is not a `flower_pot`; a listed plant with no item or a tall plant.
- **Facts follow-up:** `minecraft:block/flower_pot` is not in `BlockFacts.modelTemplates` (exists on both jars).
- **Follow-up candidate:** a `potted_plant` in a project pot keeps the template's own pot picture (the lowering sees one element; an editor field such as `pot_textures` written by the expander would need `BLOCK_EDITOR_FIELDS` and an open textures struct).
- **B517:** add a project pot and the six weathering types to `vanilla-parity-3.test.ts`; the pot's loot tables name a mod-only block and are left out; `flower_pots` entries become optional.
- **B519:** a project pot takes only its listed plants (and `potted_plant`s naming it); breaking a potted companion drops the pot and the plant; the six types age, wax and scrape as copper does. **B522:** "A plant in a project pot is drawn from the plant's own block picture, so plants vanilla pots with a model of their own (cactus, bamboo, azalea and similar) look flat in a project pot." Labels: Plants it takes, Pot, Earth in the pot, Pot picture; "Ages like copper" on the six new types.

### B510 (merged 2026-11-22)

- 720 GameTests per variant; JUnit 1222. `MsmFlowerPotBlock` (plain `Block`, never `FlowerPotBlock`) is both the empty pot and a plant in it; `PotTypes.potted` from `PlantTypes`' `POTTED_PLANT` case for a project `pot`; seven uses match vanilla's pot in survival and creative (putting a plant in counts as potting, taking it out does not). Weathering on the six types at copper's rate (0.0436 per forced tick), `Weathering.afterChange` reschedules a pressed button's or plate's release. Lightning: `Lightning.strike(ServerLevel, BlockPos, RandomSource)` from `ENTITY_LOAD`; the struck block to its first stage, then 3 to 5 walks of 1 to 8 steps; about 9 to 12 neighbours per bolt on a 7 by 7 floor, as vanilla copper. Visual-only bolts scrape too.
- **Open (follow-up B510b running):** the runtime fills a pot's map only from `potted_plant` definitions with `pot`, while the lowering writes only the pot with `plants`; B510b makes the runtime register one potted companion per `plants` entry.
- **B522 guide limits:** taking a plant out does not count towards "flowers potted"; lightning ignores waxed blocks; a walk passes only through project blocks; project rods do not attract lightning (only vanilla's lightning rod does).
- Flaky-test watch: `aBoltScrapesProjectBlocksAsItScrapesVanillaCopper` compares two random means over 12 bolts; raise the strike count if it flakes.

### B509 and B510b (merged 2026-11-22)

- 732 GameTests per variant after B509, B510 and B510b together (checked on 26.3 and 26.4 at the merge). B509: `MsmGrowingPlantHeadBlock`/`BodyBlock` over `GrowingPlantHeadBlock`/`BodyBlock` (water plants over `KelpBlock`/`KelpPlantBlock` in nested `Water` classes), `MsmColumnPlantBlock.Cane`/`.Cactus`, `MsmBambooBlock`/`MsmBambooShootBlock` (our own rules), `MsmMultifaceBlock`, `MsmBigDripleafBlock`/`MsmDripleafStemBlock`/`MsmSmallDripleafBlock` (small placed by a double-high item); `Companions.companionId(Identifier, BlockDefinition)` and `kind(BlockDefinition)`. B510b: `PotTypes.afterBlockRegistered` (called first in `Companions.registerAfter`) registers one potted companion per `plants` entry (after the pot, or after a later plant); `PotTypes.companionId(Identifier pot, Identifier plant)`, `isListedCompanion(Block)`; log line "pot <id>: registered N potted plant(s) of M listed; K wait for their plant".
- Not done in B509: client GameTest screenshots of each family (B520 owns `MsmPlants3ClientGameTest`).
- **B515 validators:** warn on `needs_water` with `direction: down` and on `bonemeal_growth` with `berries` (the runtime warns too); a `grows_into` that is not a project big dripleaf (B511's `dripleaf-grows-into-not-big` covers it); unknown listed pot plants (silently not taken at run time).
- **Behaviour notes:** a block with `msm:on_interact` takes every right-click, bone meal included; bamboo's stop height is fixed per column, bone meal can pass it up to `max_height`; berry light replaces `msm:light_emitter` while ripe; a multiface's `light` gives way to `msm:light_emitter`; with `waterloggable: false` the waterlogged property still exists but water is refused.
- **B519:** tips grow one block at `growth_chance` up to age 25; bone meal adds `bonemeal_growth` blocks (kelp-like 1) or ripens berries; cane and cactus age 16 random ticks per block to a per-column stop between `min_height` and `max_height`; bamboo grows one time in three at light 9 or more, leaves large, large, small, none from the top, thick from the fourth block, bone meal adds one or two; big dripleaf bone meal adds one, a leaf on a leaf turns the lower into stem, tilting takes `tilt_ticks` then 100 ticks of full tilt; small dripleaf bone meal becomes `grows_into` (2 to 4 high); lichen spreads by bone meal only with `spreads`.
