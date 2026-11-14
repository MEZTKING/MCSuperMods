# Coverage audit: what the game has, what MSM can make, and where it behaves wrongly

Written 2026-11-13 by the orchestrator for the user's goal: "everything that is in the game should be reproducible again and worked on top of, and more; if there are any limits such as the velocity problem, find those". Read-only audit; no code was changed. Target: Minecraft 26.3 (`packages/targets/mc-26.3/vendor`: mcmeta `registries.json`, 190 registries; vanilla-mcdoc `symbols.json`, 82 `minecraft:resource` entries).

How to read the evidence columns:

- **Code**: read in this repository on 2026-11-13 (file named).
- **Doc**: stated by an ADR, DESIGN, ROADMAP or DEVLOG.
- **Game**: a claim about vanilla or Fabric behaviour from the author's knowledge, not checked against the 26.3 jar in this session (no game jar in the container): treat as "(verify at implementation)".
- **In game**: nothing in section 2 has been confirmed in a running client. The only in-game confirmations on record are the user's of 2026-11-05 (ruby golem with texture, ruby blocks, scripted welcome message, one advancement; `docs/HANDOFF.md`). Every phase's in-game check is still open in `docs/ROADMAP.md`.

Custom status effects and throwables/projectiles were designed in ADRs 0055 and 0056 and shipped in 1.4.0. They appear below as **covered by plan** and are not designed here.

## 1. Coverage table

Legend for "How": **data** = files only (vanilla pack or content jar); **runtime** = needs `msm_runtime` code (a component, registration or Fabric hook); **script** = reachable from script API v1; **eject** = only by editing the Java project export; **client** = needs client-side code, which the runtime has almost none of (section 2, L3).

### 1.1 Data pack registries (26.3)

| Game content | MSM today | How / what is missing |
|---|---|---|
| Recipes (all 22 serialisers) | Yes: `minecraft:recipe`, Recipe Studio, Creator flows | data. Custom recipe *types* and serialisers: no (runtime + block entity, B8) |
| Loot tables | Yes: `minecraft:loot_table` (schema form, templates); `loot: "self"` on blocks | data. No bespoke Studio (ROADMAP follow-up). Adding drops to a *vanilla* table without replacing it: no (B3) |
| Advancements, predicates, item modifiers | Yes: three kinds | data |
| Functions, function tags | Yes: `minecraft:function` with offline Spyglass checks | data |
| Tags | Partly: 12 registries (block, item, entity_type, fluid, game_event, function, damage_type, enchantment, painting_variant, worldgen biome/structure/world_preset) | data. No tag kind for banner_pattern, dialog, instrument, point_of_interest_type, potion, timeline, villager_trade, worldgen/feature, flat presets (B11) |
| Enchantments | Yes: generic kind + Creator "Enchantment" flow | data. `enchantment_provider`: no kind. Effects beyond vanilla's 31 effect components: `run_function` only |
| Damage types | Yes: generic kind | data. Scripts cannot deal damage with one (`Entity.damage` is always generic, L12) |
| Jukebox songs | Yes: generic kind, Music disc flows with `.ogg` import (ADR 0049) | data. **Suspect S2**: custom sound event by string id |
| Paintings | Yes: generic kind, Painting flow, variant tag | data |
| Banner patterns, trim patterns, trim materials | Kinds exist; trim material ships in Gear set; no flow for patterns (ADR 0044 D8) | data + hand-drawn textures (the data-only flows in section 3) |
| Chat types, dialogs | Yes: generic kinds, no flow | data. Opening a dialog from an item or script: command only |
| Dimension, dimension type | Yes: `minecraft:dimension`, `dimension_type`; Dimension flow with key item (ADR 0051) | data. Custom portal block: no (runtime, B13). Travel is `spreadplayers` in a function |
| Worldgen: biome, feature, placed feature, carver, density function, noise, noise settings, flat preset, multi-noise list, block state provider, material rule/condition, world preset | Yes: fourteen kinds, four Studios, validators | data. Adding a feature, ore or structure to *vanilla* biomes without overriding biome files: no (B3). The Custom ore starter makes the block, drops and recipes but **no world generation** (`library/src/starters/custom-ore.ts`: no placed feature) |
| Structures: template, structure, structure set, template pool, processor list | Yes: five kinds, `.nbt`/`.schem` import | data. Blocks are edited in game, not in the app |
| Villager trades, trade sets (data driven in 26.3: `villager_trade` 391, `trade_set` 68) | **No kind** | data (B9). Professions and POI types are code registries: runtime |
| Mob variants: wolf, cat, pig, cow, chicken, frog, zombie nautilus, and the cat/chicken/cow/pig/wolf sound variants | **No kind** | data (B11); a "new wolf/cat skin" flow would be cheap |
| Instruments (goat horn) | **No kind** (the `instrument` item component passes through `msm:components` only for vanilla ids) | data (B11) |
| Trial spawner configs, timelines, world clocks, sulfur cube archetypes, test environments/instances | **No kind** | data (B11); niche except trial spawners |
| `block_transformer`, `context_int_provider`, `context_float_provider`, `slot_source`, 26.4 `block_sound_set` | **No kind** | data, whether each is a standalone data pack folder: (verify at implementation) |

### 1.2 Resource pack assets

| Asset type | MSM today | Missing |
|---|---|---|
| Models, block states, item definitions (`items/`), lang, `sounds.json` + `.ogg`, textures + `.png.mcmeta`, equipment, `pack.mcmeta` | Yes: seven kinds plus project assets, texture editor, Picture to texture | Block states lower as one `""` variant for `msm:block` (`blocks-items/src/lowering/block.ts:158`); `.bbmodel` block/item import (ROADMAP Phase 5 follow-up) |
| GeckoLib geometry and animations | Yes: `msm:geo_model`, `msm:animation`, Blockbench import | Preview lacks Molang and catmullrom (ROADMAP) |
| Atlases, fonts (folders exist in the target, no kind) | **No** | data kinds (B11); fonts unlock custom glyph GUIs and icons |
| Particle definitions (`particles/*.json`) | **No** | data kind, but useless without a registered particle type (B14) |
| Shaders, post effects, waypoint styles, GUI sprites with `gui` scaling metadata, splashes/credits texts | **No** | data kinds; low demand |

### 1.3 Code-only registries and systems

| Game content | MSM today | How it would be done |
|---|---|---|
| Blocks | Partly: `msm:block` full cube with hardness, tool tags, light, sound type, loot, redstone emit/react, `on_interact`, `on_step` | runtime. Missing: shapes, rotation and other state properties, transparency, block families, ticking, plants, containers (L5, B2) |
| Items | Good: `msm:item` with food, tool (7 types, custom tiers), armour (6 slots, custom materials), durability, consumable, bow/crossbow, shield, death protection, `on_use`, vanilla component passthrough | runtime. Missing triggers: hit entity, use on block, held/worn tick, crafted (L6, B4) |
| Entities | Partly: `msm:entity`, a ground `PathfinderMob` with six goals, attributes, spawn egg, natural spawns, GeckoLib model | runtime. Missing: mob sounds, ranged attack, flying/swimming, taming, breeding, riding, babies, variants, bosses, non-mob entities (L7, B7) |
| Projectiles and throwables | **Covered by plan** | runtime + client renderer |
| Mob effects (status effects) | **Covered by plan** (vanilla effects usable today via `apply_effect`, consumables, totems) | runtime |
| Potions (the `potion` registry, brewing recipes, splash/lingering, tipped arrows) | No (drinks via `msm:consumable` only) | runtime, small once effects exist (B10) |
| Enchantment effect component types (new effect kinds) | No | eject; `run_function` effects cover most cases |
| Attributes | No custom attributes; vanilla ones through `attribute_modifiers` passthrough and entity components | runtime; low demand |
| Sound events | **Not registered** by the runtime; `sounds.json` only | runtime, small (S1, B1) |
| Particle types | No; actions and scripts spawn vanilla simple particles only (no dust colour, block or item particles) | runtime + client provider (B14) |
| Block entities (chest, furnace, sign, spawner; 49 vanilla types) | No | runtime + persistence + client; the largest gap for "machines" (B8) |
| Menus and screens (25 vanilla menus) | No | runtime can open vanilla menu types server-side without client code; custom screens need client (B8, B15) |
| Fluids | No (fluid tag kind only) | runtime + client rendering, probably a mixin; L |
| Creative tabs | Items join vanilla tabs (`creative_tab`); **no custom tab** (code registry; unknown tab only warns, `MsmRegistrar.java:621`) | runtime, small (B5) |
| Villager professions, POI types | No | runtime |
| Game rules (59), commands, command argument types | No custom rules or commands; functions and `World.runCommand` only | runtime/script: `msm.commands.register` (B5) |
| Key binds, HUD, client rendering, tooltips beyond `lore` | No | client (L3, B15) |
| Custom stats, scoreboard, boss bars, titles | Through commands in functions only | script API additions (B5) |
| Game events, memory modules, sensors, activities (brain AI) | No | eject |
| Decorated pot patterns, map decorations, banner base content | No | runtime/data mix; low demand |
| Dimensions special effects (sky rendering) | Biome/dimension attributes only | client |
| Vanilla content modification (add ore to vanilla biomes, drops to vanilla mobs, trades to vanilla villagers, fuel, composting, strip/oxidise/flatten pairs, flammability) | Natural mob spawns only (`BiomeModifications.addSpawn`, `MsmEntityRegistrar.java:236`) | runtime through Fabric API registries and events, no mixin needed (B3) |
| Scripts (tier 1) | Server only: 9 events, `World` 10 members, `Entity` 20, `Player` 6, `schedule`, `actions.define`, `require` | See L2, L8–L12 for what is absent |
| Java eject (tier 2) | 26.3 only; blocks, items, entities with every component and action; **no scripts** (`export.scripts-not-ejected`) | The universal escape hatch, one-way |

## 2. Behavioural limits

### 2.1 Known limits (documented)

| # | Limit | Evidence | Effect on the user |
|---|---|---|---|
| L1 | **Registry freeze.** Blocks, items and entity types register at mod initialisation; never on `/reload`. | DESIGN §10 "The registry freeze"; ADR 0024 | Every definition change needs a game restart; only assets, data and scripts reload. Removing a definition deletes its blocks and items from existing worlds. The planned `msm:effect` has the same rule. Clients need the same jar (Fabric registry sync refuses otherwise: Game) |
| L2 | **Scripts run on the server only**, 2000 ms budget per call, no Java access, ES5 output. | DESIGN §12; ROADMAP Phase 6 follow-up "Client-side script events" | No keys, HUD, rendering, camera, client particles or per-frame effects from scripts. All feedback is what the server can send: messages, sounds, simple particles, effects, motion |
| L3 | **Client code is one class**: `client/MsmRuntimeClient` registers GeckoLib entity renderers and nothing else. No mixins anywhere (`fabric.mod.json` has none). | Code: `client/`, `resources/` | Anything needing a client hook is unavailable: block render layers, block colour tints, particle providers, item property functions beyond vanilla's data-driven ones, screens, key binds, HUD |
| L4 | **Script data is not persisted**; `msm.schedule` timers and all script state are dropped on `/reload` and on restart. | DESIGN §10 "Script data is not persisted in v1"; ROADMAP B144; `ScriptHost.reload` clears schedules | Quests, cooldowns, levels, counters and "has done X" flags cannot survive a restart except through scoreboard commands or entity tags via `runCommand` |
| L5 | **Blocks are plain full cubes.** The only state property is `powered`; properties are hardness, resistance, light, sound type, tool requirement, loot. | Code: `MsmRegistrar.java:186–197`, `MsmBlock.java`, `definition.mcdoc` `BlockComponents` | No stairs, slabs, doors, fences, panes, crops, logs with axis, directional machines, non-solid plants, glass or leaves. See S5 for what happens when a user gives such a model anyway |
| L6 | **Item triggers: right-click only** (`msm:on_use`, with cooldown). | Code: `MsmItem.java` overrides only `use` | No "on hit", "on use on block", "while held", "while worn", "on crafted". Set bonuses for armour need a script polling every tick, and the script API cannot read armour slots (L11) |
| L7 | **Mobs are ground walkers with six goals** and no sounds; every mob needs GeckoLib. | Code: `MsmEntity extends PathfinderMob`; no `getAmbientSound`/`getHurtSound` override in `registry/`; ADR 0028 | Custom mobs are silent apart from generic hurt sounds (Game). No ranged, flying, swimming, tameable, rideable or breeding mobs |
| L8 | **GeckoLib dependency.** Entities need GeckoLib on client and server; the app downloads it at first export (network needed; `maven.geckolib.com` was blocked in the session proxy, Modrinth works); without it every entity logs one error and registers nothing. | DESIGN §9, §10; HANDOFF "Environment notes"; ROADMAP Phase 5 follow-ups | Offline first export of a mob fails with `export.geckolib-missing`. No vanilla-model fallback |
| L9 | **26.4 gates.** `mc-26.4` is a snapshot target with no GeckoLib facts and no `javaProject`. | Code: `packages/targets/mc-26.4/src/target.ts:396–398`; `library` `supports: hasGeckolib` (six places) | On 26.4: no entities (`export.no-geckolib-target`), no mob starter or examples, no Java eject. Each new runtime feature must also compile behind the `src/mc/<mc>/` seams |
| L10 | **Eject limits.** 26.3 only, one-way, without scripts or `run_script`. | ADR 0033; DESIGN §12; ROADMAP B142 | "Only possible in the eject" is a dead end for a project that uses scripts: the two escape hatches exclude each other |
| L11 | **Script API is narrow.** `Player`: sneaking, creative, main-hand item id, give, hasItem, sendMessage. `ItemRef`: id and count only. `entitiesNear`: living entities only. | Code: `scripting/ScriptPlayer.java`, `ScriptWorld.java`; `script-api-v1.json` | No inventory or armour reads, off hand, XP, hunger, game mode, item components, dropped items, projectiles, raycasts, titles or boss bars. No events for tick-per-player, respawn, leave, block place, chat, craft; `entity.hurt` can cancel but not change the amount |
| L12 | **`Entity.damage` is always generic damage with no attacker.** | Code: `ScriptEntity.java:48` (`damageSources().generic()`) | No kill credit, no player-kill loot or XP, no custom damage type or death message, ignores nothing/everything that `generic` does |
| L13 | **Particles from the server: simple types only.** | Code: `EventRunner.java:131–135`, `ScriptWorld.java:47–53`; load error in `MsmRegistrar.checkEvents` | No coloured dust, block-break, item or vibration particles; `count 0` directional motion is not exposed; players further than the vanilla send distance see nothing (Game) |
| L14 | **Vanilla component passthrough and data pack registries.** Only six components that name data pack registries are decoded late; any other is a load error. | Code: `ComponentPassthrough.DELAYED`; ADR 0050 (warning `blocks-items.passthrough-needs-data-pack`) | For example `enchantments`, `stored_enchantments` or `instrument` pointing at project data cannot be set as item defaults |
| L15 | **`app.asar` is 30.1 MB of a 32 MB budget.** | HANDOFF "Housekeeping"; `tools/check-size/index.ts:33` | Every new vendored table, target or bundled library is at risk; "vendored target data outside the asar" (ROADMAP follow-up, was B166) should land before the next large addition |
| L16 | **Nothing client-side is tested automatically.** No OpenGL in the container; the client render check (B123) is open. | ROADMAP Phase 5 follow-ups; HANDOFF | Rendering, sync and feel regressions reach the user first. This is the root cause of the velocity class of bug |

### 2.2 Suspects found in this audit (none verified in game)

Ordered by likely user impact. "Code" facts were read today; the predicted in-game result rests on Game knowledge unless stated.

| # | Suspect | Evidence | Predicted result | Check |
|---|---|---|---|---|
| S1 | **Custom sounds are accepted by the app but rejected by the runtime.** The app offers project `sounds.json` keys as `sound_event` ids (`app/src/renderer/src/session/schema-context.ts:266`), while the runtime resolves sounds in `BuiltInRegistries.SOUND_EVENT` and registers none: `play_sound` (`EventRunner.java:226`, load error at `MsmRegistrar.java:161`), script `World.playSound` (`ScriptWorld.java:57`, throws), consumable `sound` (`MsmRegistrar.java:296`), armour `equip_sound` (`:565`). | Code | A user's own sound exports with zero problems and then logs "unknown sound" and stays silent; only `/playsound` in a function works. The effects plan's `sound?` field inherits this | GameTest: definition with a project sound; fix by registering a `SoundEvent` per project sound key at init (B1). Closed 2026-11-14: ADR 0057 |
| S2 | **Music disc starters name a custom sound event by string id** (`library/src/starters/music-disc.ts:37`, `music-disc-item.ts:171`: `sound_event: "<ns>:<event>"`). A string is a reference into the sound event registry; an unregistered id fails to decode, and a failed `jukebox_song` entry stops data pack loading. The inline form `{ "sound_id": ... }` exists for this (vanilla-mcdoc `SoundEventRef`). | Code + Game | The Music disc flows may prevent the world from loading (vanilla pack) or log a registry error (jar). The ROADMAP user check for the music disc is still unticked, and no fixture in the CI server check contains a `jukebox_song` | Load `examples/starters/music_disc` in 26.3 first. Fix: lower to the inline form, or B1 makes the string valid in jars only |
| S3 | **The velocity fix itself is untested.** `events/Motion` sets `syncVelocity` and `needsSync`; the only test is `DefinitionParserTest.launchDecodes`. No GameTest or parity test names `launch`, `Motion` or `setVelocity` (grep of `engine-mod/src` outside `main/`). | Code; ADR 0052 Status ("compiled and checked by CI") | Probably correct, but the exact failure the user reported has no regression test, and a GameTest mock player would not prove client motion anyway | GameTest asserting a mob's position changes after `launch`; in-game check of the launcher item; add to `fixtures/sample-mod` and parity |
| S4 | **`launch` from a block does nothing to non-players.** `on_step` builds `EventContext.forBlock(server, pos, player)` with `entity` null (`EventContext.java`, `MsmBlock.stepOn`), and `launch` with target `self` uses `ctx.player()` else `ctx.entity()` (`EventRunner.launch`). | Code | A jump pad or conveyor moves players but not mobs or items, silently. The same holds for `apply_effect` on a stepping mob | Pass the stepping entity as `entity`/`other`; GameTest with a mob. Closed 2026-11-14: ADR 0058 |
| S5 | **Non-cube or see-through block models misrender.** Nothing sets `noOcclusion`, a shape or a render layer (`MsmRegistrar.java:186–189`), but `msm:block` accepts any model id. | Code + Game | A slab, cross or glass-like model still collides as a full cube, hides neighbouring faces (see-through holes into the world) and draws cut-out pixels solid. Whether 26.x still needs a client render-layer registration: (verify at implementation) | Until B2: a validator warning when a block's model is not `cube*`-parented. Closed 2026-11-14: ADR 0059 |
| S6 | **`World.runCommand` and `World.runFunction` run at the world spawn point with no entity.** `source(l)` has no `withPosition` or `withEntity` (`ScriptWorld.java:103–108`), unlike the `run_function` action (`EventRunner.java:115–123`). Output is suppressed. | Code | `~ ~ ~` resolves to the world spawn point (not the origin, corrected 2026-11-13: `createCommandSourceStack()` uses the respawn dimension's spawn point) and `@s` to nobody; `@p` picks the player nearest the spawn point. Users will see commands "do nothing" | Add `Entity.runCommand` (as and at the entity) and a position argument; document. Closed 2026-11-14: ADR 0058 |
| S7 | **Cancelled interactions desynchronise the client.** Script `cancel()` on `block.interact`/`item.use`/`block.break` returns `FAIL` or `false` on the server only (`ScriptBridges.java`); the client has already predicted the action. No resync packet is sent (grep: no block update or inventory resend in `scripting/`). | Code + Game | A door's second half or a stack count that looks consumed until the next update (the clicked block itself is corrected by vanilla); corrected 2026-11-13: vanilla already resends the clicked block and the placement position after every use-on-block packet, and the block after a failed break. What stays stale is the held stack's count or durability, the second block of a two-block placement (door, bed, tall plant), a predicted cooldown of an MSM item after a cancelled `item.use`, and what a cancelled `entity.interact` predicted (bucket, shears, name tag) | In-game check of each cancellable event; resend the block and held slot after a cancel. Closed 2026-11-14: ADR 0058 |
| S8 | **`on_use` cooldown and result are applied on both sides, the event only on the server** (`MsmItem.useWithEvent`). Fine for the swing, but any action whose result the client must see at once (inventory change, motion) arrives a tick later; `give_item` relies on the normal inventory broadcast. | Code | Likely fine; listed because it is the same shape as the velocity bug | Covered by an in-game pass of the sample mod |
| S9 | **`Entity.teleport` is same-dimension only and keeps no momentum rules**; it is the only movement call older projects and AI-built projects used (ADR 0052 Context). | Code: `ScriptEntity.java:66–69` | Scripts written before 1.4.0, and AI helper output from an old prompt, still move things in small teleports; passengers and cross-dimension travel are not handled | AI helper prompt note; add `Entity.teleport(pos, dimension?)` |
| S10 | **`on_step` cooldown map ignores the dimension and grows per entity** (`MsmBlock.lastStep`, key `pos + uuid`, pruned only above 1024 entries; `stepOn` is skipped for sneaking entities in vanilla). | Code + Game | Rare wrong cooldowns across dimensions; pressure-plate-like blocks miss sneaking players and entities that jump | Use `entityInside`-style detection for plates in B2 |
| S11 | **GeckoLib triggered animations depend on GeckoLib's own packets** (`MsmGeoEntity.triggerAnim`); the attack animation is triggered after `doHurtTarget` succeeds. | Code | Animation plays only for clients tracking the entity at that moment, and after the damage, not during the wind-up | In-game check with `fixtures/sample-mob` |
| S12 | **Unknown ids fail late and quietly.** Items, functions, block states and effects named by actions are checked after start and only logged (`MsmRegistrar.checkEvents` `LATE`), with command output suppressed. | Code | A typo in game shows as "nothing happens"; the user must read `latest.log` | Surface the runtime's load report in Test in Minecraft |
| S13 | **Root `CLAUDE.md` status line is stale** ("Phase 3 code complete … engine-mod Gradle build is not wired until Phase 4") against HANDOFF (1.3.0 prepared, ADRs to 0054). | Code | Agents starting from it plan against the wrong state | Refresh at the next main session |

### 2.3 The class of limit, generalised

The velocity bug came from the server changing state the client simulates itself. The same class in vanilla, to design for in every new runtime feature (all Game, verify at implementation):

- **Player motion, position, abilities (flight, speed), experience, food, selected slot**: client-authoritative or client-predicted; each needs its explicit sync flag or packet.
- **Synched entity data**: any per-entity value the renderer needs (variant, size, charging, projectile item) must be `SynchedEntityData` or a spawn packet field; `MsmEntity` defines none, so mob variants and thrown-item visuals will need it (the throwables plan relies on the vanilla `ItemSupplier` stack, which is synched).
- **Block entities**: `setChanged()` plus a client update packet, or the client shows stale contents; nothing exists yet, so the first block entity feature must bring this with a test.
- **Attributes and effects**: attribute modifiers sync by themselves; custom effect *behaviour* runs server-side only, so client-visible parts (FOV, overlays, movement feel) will not appear unless expressed as attribute modifiers.
- **Registries**: anything a client must know at connect time (blocks, items, entity types, effects, sound events, particle types, menus) must be registered at init on both sides; data pack registries sync by themselves.

## 3. Ranked backlog (after effects and throwables)

Size: S = under a week of executor briefs, M = one wave, L = a phase. Ordered by value to a mod-making user; beginners first where equal.

| # | Addition | Size | Main risk |
|---|---|---|---|
| B1 | **Custom sound events in the runtime** (register one per project `sounds.json` key; mob ambient/hurt/death/step sounds on `msm:entity`; fix or confirm the Music disc form, S1/S2) | S | Registration order against other mods' ids; vanilla-pack export needs the inline form instead |
| B2 | **Real block shapes and states**: rotation (facing, axis), shape presets (slab, stairs, wall, fence, door, trapdoor, pane, carpet, cross plant, custom boxes), transparency and no-occlusion, plus Creator "Block family" from one texture | L | State count and model generation; client render layer on both targets; eject parity for every preset |
| B3 | **Add to vanilla content without overriding it**: ores and features into vanilla biomes (makes the Custom ore starter generate), drops into vanilla loot tables, fuel and compost values, trades into villagers Closed 2026-11-14: ADR 0060 | M | Fabric API surface differs between 26.3 and 26.4; needs a reloadable-versus-frozen decision per item (ADR) |
| B4 | **More triggers** for the event model: item `on_hit`, `on_use_on_block`, `while_held`/`while_worn` tick, block `on_break`, `on_place`, `on_random_tick`, `on_entity_inside`, entity `on_tick` and `on_spawn`; pass the acting entity to block events (S4) Closed 2026-11-14: ADR 0061 | M | Tick triggers and performance; client prediction for use-on-block (S7) |
| B5 | **Script API v1.1**: player inventory, armour and off hand, XP, hunger, game mode, item components; titles, action bar, boss bars; `Entity.runCommand` (S6); damage with source and attacker (L12); raycast; cross-dimension teleport; events `player.tick`, `player.respawn`, `block.place`; `msm.commands.register`; a custom creative tab | M | Contract growth across three consumers (JSON, typings, runtime); sandbox surface |
| B6 | **Persistent data** (reserve brief B144): `entity.data`, `player.data`, `msm.storage` saved with the world Closed 2026-11-14: ADR 0062 | M | Save format and migration; world-save GameTest; data on player death and dimension change |
| B7 | **Mob expansion**: ranged attack (uses the planned projectiles), flying and swimming movement, tameable, breedable with babies, rideable, variants via synched data, boss bar, a vanilla-model fallback without GeckoLib | L | Synched data and client renderer work (L3, L16); GeckoLib absent on 26.4 |
| B8 | **Containers and machines**: a block entity with an inventory opened through vanilla menu types (chest rows, hopper, furnace-like with a custom recipe type), comparator output, hopper access | L | Persistence and sync from nothing (section 2.3); custom screens would need client code, so start with vanilla menus only |
| B9 | **Villager trades**: `villager_trade` and `trade_set` kinds, a "Trader" Creator flow; wandering trader additions | S–M | Format is new in 26.x and may move in 26.4; professions and POI types need runtime |
| B10 | **Potions on top of custom effects**: `potion` registry entries, brewing recipes, splash and lingering through vanilla items, tipped arrows | S | Depends on the effects plan; brewing registration API on both targets |
| B11 | **Missing data kinds in one sweep**: mob variants (wolf, cat, pig, cow, chicken, frog and sound variants) with a "Mob skin" flow, instrument (goat horn flow), enchantment provider, trial spawner, timeline, atlases, fonts, the nine missing tag registries | S | asar budget (L15) if templates and examples are added for each |
| B12 | **Crops, saplings and trees**: growth stages, bonemeal, seeds, a tree feature wired to a sapling | M | Depends on B2 (states, cross models) and B3 (generation) |
| B13 | **Custom portal block and dimension type editing** (open item of ADR 0051) | M | Portal linking and teleport sync; dimension type format moves between versions |
| B14 | **Custom particles and richer particle options** (dust colour, block and item particles from actions and scripts; own particle types with sprite sets) | M | Needs client providers (L3) and a client test route (L16) |
| B15 | **Client side for power users**: key binds that fire server events, HUD text and bars driven by synced values, scripts in the eject (B142) | L | First networking channel and first client script surface; security review of the sandbox on the client |

Flows that are data only and can be slotted in at any time (S each): armour trim pattern, banner pattern, glider, mob variant skin, goat horn.
