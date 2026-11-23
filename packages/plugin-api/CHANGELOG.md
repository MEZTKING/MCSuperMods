# Changelog

All changes to the `@msm/plugin-api` surface. The package follows semver; every breaking change is a major bump with a migration note.

## 1.22.0 — 2026-11-23

The game kits' Creator group and target facts (ADR 0113 D8, measured by the B547 spike). `API_VERSION` is `1.22.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `CreatorGroup` gains `'games'` (game kits such as a Skyblock, a one-block world or an arena). A host or plugin that switches over every group without a default case adds it.
- `TargetFacts.worlds?: WorldFacts { structurePlacements; voidBiome; floatingIslandsSettings; endLikeSettings?; fixedPlacementShape; firstJoinCriterion }` with `FixedPlacementShapeFacts { type; minPositions }`: the structure placement types (`minecraft:dimension_origin` among them), the void biome, the floating-island noise settings, how `minecraft:fixed_placement` lists its positions (at least one on the snapshot target, none needed on the release target) and the first-join advancement trigger (`minecraft:tick`). `endLikeSettings` is absent on both built-in targets until it is measured.
- `TargetFacts.scoreboard?: ScoreboardFacts { criteria; statTypes; displaySlots; renderTypes; numberFormats; teamColours; nameTagVisibility; collisionRules; deathMessageVisibility }`: what the team and objective kinds check against, the display slots including the 16 team-coloured sidebars.
- `CommandFacts.forms?: Readonly<Record<CommandFormName, string>>` with `CommandFormName` (49 names): the exact `team`, `scoreboard`, `bossbar`, `title` action bar, `worldborder`, `place`, `forceload`, `loot` and `random` lines the game kits write, as templates of literal words, `<required>` and `[optional]` placeholders.

### Migration from 1.21.0

None. A plugin that reads the new facts should declare `^1.22.0` and treat an absent value as "no facts to check against" (or, for `forms`, "cannot lower the game kits on this target"). A test that compares `CreatorGroup` with an exact union adds `'games'`.

## 1.21.0 — 2026-11-22

The live world generation preview's target fact (ADR 0119 D16). `API_VERSION` is `1.21.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `WorldgenFacts.terrainPreview?: TerrainPreviewFacts { dataFolders; approximate }`: the `data/minecraft/` folders of the client jar whose JSON files the host caches locally for the preview (23 folders on both built-in targets: the worldgen registries the terrain, features, carvers and structures read, `dimension_type` and the five `tags/worldgen/` folders; no `dimension` folder, since vanilla's dimensions are inline in its world presets), and the parts the preview labels as approximate on the target.
- `TerrainPreviewApproximatePart` (`'biome_layout' | 'end'`): the End on both built-in targets, and the biome layout on the snapshot target, whose game code places biomes in a way its data files do not describe.

### Migration from 1.20.0

None. A plugin that reads `terrainPreview` should declare `^1.21.0` and treat an absent value as "no live map of vanilla files". The folders name where vanilla's files are in the user's own jar; a plugin never receives the files.

## 1.20.0 — 2026-11-22

Villager type, cauldron, command argument, game rule and statistic facts, and the vanilla block rules input of the Java project generator (ADR 0107 D6, ADR 0108 D6, ADR 0111 D2, D8, ADR 0112 D3). `API_VERSION` is `1.20.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `EntityFacts.villagerTypes?: readonly string[]`: vanilla's villager type ids, bare and sorted (seven on both built-in targets).
- `BlockFacts.cauldrons?: readonly string[]`: vanilla's cauldron block ids, namespaced and sorted (the empty cauldron and its three filled forms), so a fluid's cauldron companion cannot take one.
- `CommandFacts.argumentTypes` gains 32 entries after the twelve of 1.17.0, in this order: `dimension`, `time`, `team_colour`, `hex_colour`, `rotation`, `angle`, `uuid`, `objective`, `score_holder`, `score_holders`, `item_predicate`, `block_predicate`, `effect`, `enchantment`, `biome`, `biome_or_tag`, `structure`, `structure_or_tag`, `entity_type`, `particle`, `game_mode`, `text_component`, `int_range`, `identifier`, `team`, `slot`, `nbt`, `message`, `dialog`, `loot_table`, `advancement`, `recipe`. A plugin that maps every argument type name to its own code must handle them or refuse them by name.
- `CommandArgumentFacts.keyOnly?: boolean`: true for the key types (`structure`, `structure_or_tag`, `advancement`, `recipe`), whose registries the game never sends to players, so the id is checked only when the command runs.
- `TargetFacts.gameRules?: GameRuleFacts { kinds; categories; vanillaNames }` with `GameRuleKindName` (`'boolean' | 'integer'`): the kinds and categories a project game rule may take and vanilla's own rule ids.
- `TargetFacts.stats?: StatFacts { formats; criterionPrefix; vanillaCustomStats }` with `StatFormatName` (`'default' | 'distance' | 'time'`): a statistic's formatters, its scoreboard criterion prefix (`minecraft.custom:`) and vanilla's own custom statistics.
- `JavaProjectInput.vanillaBlockRules?: DefinitionInput[]`: the project's `msm/<namespace>/vanilla_block_rules/*.json` definitions, in a stable order, for generators that register the pairs on vanilla blocks. Absent means the same as an empty array.
- `JavaProjectInput.villagerProfessions?`, `fluids?`, `villagerTypes?`, `gameRules?` and `stats?: DefinitionInput[]` (added 2026-11-22 within 1.20.0, B537): the project's `villager_profession`, `fluid`, `villager_type`, `game_rule` and `stat` definitions, in a stable order, for generators that eject them (ADR 0112 D3). Absent means the same as an empty array.

### Migration from 1.19.0

None for plugins that only read target facts. A plugin that reads the new facts should declare `^1.20.0` and treat an absent value as "no facts to check against". A plugin that switches over `CommandFacts.argumentTypes` names without a default case adds the 32 new names. A test that compares `JavaProjectInput` with an exact type adds `vanillaBlockRules?`, `villagerProfessions?`, `fluids?`, `villagerTypes?`, `gameRules?` and `stats?`.

## 1.19.0 — 2026-11-22

Block sound, vanilla pair and plant soil facts, and the data folder keys of the data kinds sweep 2 (ADR 0105 D5, ADR 0103 D5, ADR 0106 D1). `API_VERSION` is `1.19.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `DataFolderKey` gains seven members (ADR 0106 D1; added with the kinds in B504): `decorated_pot_pattern`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype`, `context_int_provider` and `context_float_provider` (`wolf_sound_variant` was already a key). Each built-in target maps them to the folder of the same name. A plugin that builds a `Record<DataFolderKey, string>` of its own (a test fixture, say) must add them.
- `BlockFacts` gains four optional fields: `soundTypes?: readonly string[]` (every vanilla block sound name of the target, bare and sorted; the names differ between targets), `soundModel?: 'sound_type' | 'block_sound_set'` (whether a block holds a fixed sound object or names an entry of the `block_sound_set` world registry, so a block's own sounds are built by the runtime or written as a data file by lowering), `vanillaPairs?: VanillaPairFacts` and `plantSoils?: PlantSoilFacts`.
- `BlockFacts.soundSetEvents?: Readonly<Record<string, SoundSetFacts>>` (added 2026-11-22 within 1.19.0) with `SoundSetFacts { break?; step?; place?; hit?; fall?; volume: number; pitch: number }`: each vanilla sound set's own namespaced sound event ids (an event the set leaves out is silent in vanilla too), volume and pitch, keyed by the bare names of `soundTypes`. Where the game reads only a block's own `block_sound_set` entry, lowering fills the events, volume and pitch a block's own sounds leave out from its `sound_type`'s set.
- `VanillaPairFacts { strip; flatten; till; wax; age }`, each a `Readonly<Record<string, string>>` from the namespaced id of the vanilla block used on to the block it turns into: what an axe strips, a shovel flattens, a hoe tills, honeycomb waxes and what ages into the next copper stage (an axe's wax-off and scrape are the reverse of `wax` and `age`). The validators warn when a project pair on a vanilla block replaces one.
- `PlantSoilFacts { cane; caneWater; cactus; cactusFlower; bamboo; bigDripleaf; smallDripleaf; notKelp; caveVines }`, each a namespaced block tag id without `#`: the tags vanilla's growing and climbing plants survive on (the default `soil` of a `column_plant` or `dripleaf`), the tag of blocks that count as water beside a cane, the cactus flower's support override, the blocks kelp may not stand on, and the tag naming vanilla's cave vine blocks.

### Migration from 1.18.0

None for plugins that only read target facts. A plugin that reads the new block facts should declare `^1.19.0` and treat an absent value as "no facts to check against". A plugin or test that writes a complete `Record<DataFolderKey, string>` adds the seven new keys.

## 1.18.0 — 2026-11-15

Dimension type, trader, profession and fluid facts, and the command and creative tab inputs of the Java project generator (ADR 0100 D5, ADR 0098 D5, ADR 0099 D4, ADR 0096 D6). `API_VERSION` is `1.18.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `WorldgenFacts.dimensionHeight?: DimensionHeightFacts` with `DimensionHeightFacts { minY: number; maxY: number; step: number }`: the lowest `min_y` of a dimension type, its highest block y (`min_y + height - 1` may not pass it) and the step `min_y` and `height` are multiples of. The worldgen validators `worldgen.dimension-height-multiple` and `worldgen.dimension-height-range` read it.
- `WorldgenFacts.environmentAttributes?: readonly string[]`: every namespaced id of the game's `environment_attribute` registry, sorted, from the vendored registries. The Dimension Type Studio shows only these, and `worldgen.dimension-attribute-unknown` reports any other key of a dimension type's `attributes`.
- `EntityFacts` gains three optional fields (ADR 0098 D1, D2, D5): `tradeSounds?: TradeSoundFacts` with `TradeSoundFacts { yes: string; no: string; trading: string }` (vanilla's merchant sounds; `yes` is an `msm:trader`'s default `trade_sound`); `vanillaJobSites?: Readonly<Record<string, readonly string[]>>` (every vanilla block that already has a point of interest type, by point of interest type id, for the `entities.job-site-taken` refusal of a profession's `job_site`); `vanillaTradeSets?: Readonly<Record<string, VanillaTradeSetFacts>>` with `VanillaTradeSetFacts { trades: number; villagerOnlyTrades: number; villagerOnly: boolean }` (every vanilla trade set; `villagerOnly` marks sets with trades that carry a `merchant_predicate` on the villager's variant, which give a project trader no offer).
- `BlockFacts` gains two optional fields (ADR 0099 D4): `fluidModel?: 'two_fluids' | 'one_fluid'` (whether the game registers a liquid as a source and a flowing fluid or as one fluid; informational, for lowering's `flowing_` tag ids and the Fluid Studio's wording) and `fluidTags?: FluidTagFacts` with `FluidTagFacts { water: readonly string[]; lava: readonly string[] }` (the vanilla fluid tags a project fluid joins by `behaves_like`).
- `JavaProjectInput` gains two optional fields (ADR 0096 D6, added 2026-11-21 within 1.18.0): `commands?: DefinitionInput[]` (the `msm/<namespace>/command/*.json` definitions) and `creativeTabs?: DefinitionInput[]` (the `msm/<namespace>/creative_tab/*.json` definitions), each in a stable order and absent when the project has none. The `java-project` exporter has passed both since the vanilla parity batch (B457) as undeclared extra fields; they are now part of the contract, so a third-party generator can read them without a cast.

### Migration from 1.17.0

None. A plugin that reads `dimensionHeight`, `environmentAttributes`, the new entity facts or the fluid facts should declare `^1.18.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore them. A Java project generator that reads `commands` or `creativeTabs` treats an absent value as an empty array.

## 1.17.0 — 2026-11-15

Vanilla's feature order, block type facts and command facts (ADR 0097 D1, ADR 0094 D12, ADR 0096 D6). `API_VERSION` is `1.17.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `WorldgenFacts.vanillaFeatureOrder?: Readonly<Record<string, readonly string[]>>`: per decoration step name (a `featureSteps` entry), the namespaced ids of the vanilla placed features that step runs, in the order the game's feature sorter puts them. Ids only, vendored per target by `tools/sync-feature-order`. The worldgen validators warn when a project biome lists two of them against this order (`worldgen.vanilla-feature-order`), and the blocks-items validators when a biome addition adds one (`blocks-items.addition-vanilla-feature`).

- `BlockFacts` gains five optional fields: `bedRules?: Readonly<Record<string, string>>` (a bed's MSM rule name, `bed` or `straw_bed`, to the namespaced environment attribute id that rules it), `dyeColours?: readonly string[]` (the sixteen dye colour names in the game's order), `stemTags?: { soil: string; fruitSoil: string }` (the default block tags a stem grows on and its fruit grows onto), `modelTemplates?: readonly string[]` (the namespaced vanilla block model ids the block type lowerings name as parents) and `defaultTorchParticle?: string` (the particle type a torch shows when it names none).
- `CreatorGroup` gains `vehicles` (ADR 0091 D4): the Creator lists the vehicle flows under their own heading.
- `TargetFacts.commands?: CommandFacts` with `CommandFacts { vanillaNames: readonly string[]; argumentTypes: Readonly<Record<string, CommandArgumentFacts>> }` and `CommandArgumentFacts { parser: string; properties?: Readonly<Record<string, string>> }`: every vanilla root command literal (for the clash check of project commands), and the game's parser and fixed properties behind each of MSM's twelve command argument types (`integer`, `number`, `word`, `text`, `boolean`, `player`, `players`, `entity`, `position`, `block_position`, `item`, `block`).

### Migration from 1.16.0

None. A plugin that reads `vanillaFeatureOrder`, the new block facts or `commands` should declare `^1.17.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore them.

## 1.16.0 — 2026-11-15

Control and vehicle facts (ADR 0088 D9, ADR 0090 D13). `API_VERSION` is `1.16.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `TargetFacts.controls?: ControlFacts` with `ControlFacts { keyNames: readonly string[]; unboundKey: string; vanillaKeys: Readonly<Record<string, string>>; vanillaCombinations: readonly string[]; keyboardNamesByCode: readonly string[]; mouseNamesByCode: readonly string[]; runtimeKeys: RuntimeKeyFacts }` and `RuntimeKeyFacts { fire; second; horn; descend }`: the valid key names, the name of "no key", each vanilla control's default key, the vanilla controls pressed with a modifier (the debug combinations, which clash with no plain key), the key name of each keyboard code (USB HID usage ids) and mouse button code, and the default keys of the runtime's own vehicle controls.
- `TargetFacts.vehicles?: VehicleFacts` with `VehicleFacts { modes: readonly string[]; maxSpeed: number }`: the movement modes a vehicle may use and the highest `max_speed`, in blocks a tick.

### Migration from 1.15.0

None. A plugin that reads `controls` or `vehicles` should declare `^1.16.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore them.

## 1.15.0 — 2026-11-14

Project expanders and test-in-game facts (ADR 0082 D9, ADR 0084 D10). `API_VERSION` is `1.15.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `PluginContributions.projectExpanders?: ProjectExpander[]` with `ProjectExpander { id; kinds: readonly string[]; expand(input: ExpansionInput): MaybePromise<ExpansionResult> }`, `ExpansionInput { elements: readonly Element[]; target: TargetFacts }`, `ExpansionResult { patches: ElementPatch[]; problems: Problem[] }` and `ElementPatch { elementId; path: readonly (string | number)[]; value: Json; origin: ElementPatchOrigin }` (`ElementPatchOrigin { elementId; pointer }`): changes a plugin makes to copies of elements before lowering, validation, export and eject, never to the saved project.
- `TargetFacts.dev?: DevFacts` with `DevFacts { gameRules: DevGameRuleFacts; worldDataFolders: readonly string[] }` and `DevGameRuleFacts { advanceTime; advanceWeather; spawnMobs; keepInventory }`: the game rule ids a test world sets (without a namespace, as `/gamerule` takes them) and the data folders whose registries load with the world rather than on `/reload`.

### Migration from 1.14.0

None. A plugin that contributes expanders or reads `dev` should declare `^1.15.0`; a host older than 1.15.0 ignores `projectExpanders`, and an absent `dev` means "no facts to test with".

## 1.14.0 — 2026-11-14

Custom particle types (ADR 0080 D9). `API_VERSION` is `1.14.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `TargetFacts.particles?: ParticleFacts` with `ParticleFacts { withOptions: readonly string[]; descriptionFolder: string; textureFolder: string }`: the namespaced vanilla particle types that take options (such as `minecraft:dust` or `minecraft:block`), the folder under `assets/<namespace>/` that holds particle description files, and the folder under the textures folder that holds particle pictures.
- `JavaProjectInput.particles?: DefinitionInput[]`: the project's particle definitions (`msm/<namespace>/particle/*.json`) for Java generators (ADR 0080 D11).

### Migration from 1.13.0

None. A plugin that reads the field should declare `^1.14.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore it.

## 1.13.0 — 2026-11-14

Custom portal blocks (ADR 0077 D7). `API_VERSION` is `1.13.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `BlockFacts.portal?: { ambientSound: string; travelSound: string; triggerSound: string; particle: string }`: the namespaced sound event ids a portal block plays while idle, when an entity travels and when an entity steps in, and the namespaced (option-less) particle type id it shows by default.

### Migration from 1.12.0

None. A plugin that reads the field should declare `^1.13.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore it.

## 1.12.0 — 2026-11-14

Containers and machines (ADR 0074 D7, ADR 0075 D7). `API_VERSION` is `1.12.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `BlockFacts.containerSounds?: { open: string; close: string }`: the namespaced sound event ids a container block plays by default when it opens and closes.
- `BlockFacts.machineRecipeTypes?: readonly string[]`: the namespaced vanilla recipe type ids a machine block may take in its `recipe_types`.

### Migration from 1.11.0

None. A plugin that reads either field should declare `^1.12.0` and treat an absent value as "no facts to check against"; plugins written earlier ignore them.

## 1.11.0 — 2026-11-14

Mob bodies, ranged attacks and mounts (ADR 0070 D7, ADR 0071 D4). `API_VERSION` is `1.11.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `EntityFacts { projectileItems: readonly string[]; saddleTag: string }`: the namespaced vanilla item ids a ranged mob may fire as its projectile, and the namespaced entity type tag the vanilla saddle equips.
- `TargetFacts.entities?: EntityFacts` (and so `Target.entities?`). Optional; a target without it skips the checks that need it.

### Migration from 1.10.0

None. A plugin that reads `entities` should declare `^1.11.0` and treat an absent value as "no names to check against"; plugins written earlier ignore it.

## 1.10.0 — 2026-11-14

Block types and families (ADR 0067 D2, D9). `API_VERSION` is `1.10.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `BlockFacts { setTypes: readonly string[]; woodTypes: readonly string[] }`: the block set type names a door, trapdoor, button or pressure plate takes (`set_type`) and the wood type names a fence gate takes (`wood_type`), in lower case. The names are MSM's; how each maps to a game constant is the runtime's concern.
- `TargetFacts.blocks?: BlockFacts`. Optional; a target without it skips the checks that need it.

### Migration from 1.9.0

None. A plugin that reads `blocks` should declare `^1.10.0` and treat an absent value as "no names to check against"; plugins written earlier ignore it.

## 1.9.0 — 2026-11-14

Potions and the data kinds sweep (ADRs 0063 D7 and 0064 D5). `API_VERSION` is `1.9.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `DataFolderKey` gains seventeen keys: `'wolf_variant'`, `'cat_variant'`, `'pig_variant'`, `'cow_variant'`, `'chicken_variant'`, `'frog_variant'`, `'zombie_nautilus_variant'`, `'wolf_sound_variant'`, `'cat_sound_variant'`, `'pig_sound_variant'`, `'cow_sound_variant'`, `'chicken_sound_variant'`, `'instrument'`, `'enchantment_provider'`, `'trial_spawner'`, `'timeline'` and `'world_clock'`, so `Target.folders.data` has seventeen more required entries. `ResourceFolderKey` is unchanged.
- `JavaProjectInput.potions?: DefinitionInput[]`: the project's `msm/<namespace>/potion/*.json` definitions, in a stable order, for generators that register potions. Optional; absent means none.

### Migration from 1.8.0

A target (or a test fixture building a `Target`) must add the seventeen keys to `folders.data`, because `Record<DataFolderKey, string>` is exhaustive; each maps to the folder of the same name. A generator that reads `potions` should declare `^1.9.0` and treat an absent value as empty; generators written earlier ignore it.

## 1.8.0 — 2026-11-13

Additions to vanilla content (ADR 0060). `API_VERSION` is `1.8.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `DataFolderKey` gains `'villager_trade'` and `'trade_set'`, so `Target.folders.data` has two more required entries.
- `JavaProjectInput.biomeAdditions?` and `lootAdditions?: DefinitionInput[]`: the project's `msm/<namespace>/biome_addition/*.json` and `loot_addition/*.json` definitions, in a stable order, for generators that emit the `BiomeModifications` calls and the loot table listener. Optional; absent means none.
- `ItemFacts.compostProviders?: Record<string, string>`: the compost chance as the editor shows it (`30%`) mapped to the vanilla `context_int_provider` id for the `minecraft:compostable` component. Optional.

### Migration from 1.7.0

A target (or a test fixture building a `Target`) must add `villager_trade` and `trade_set` to `folders.data`, because `Record<DataFolderKey, string>` is exhaustive; the vanilla names are `villager_trade` and `trade_set`. A generator that reads the new input fields should declare `^1.8.0` and treat absent values as empty; generators written earlier ignore them.

## 1.7.0 — 2026-11-13

Project sound events (ADR 0057). `API_VERSION` is `1.7.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `JavaProjectInput.soundEvents?: string[]`: the namespaced sound event keys of the project's `assets/<namespace>/sounds.json` files, sorted, without the `minecraft` namespace, for generators that register sound events. Optional; absent means none.

### Migration from 1.6.0

None. A generator that reads `soundEvents` should declare `^1.7.0` and treat an absent value as empty; generators written earlier ignore the field.

## 1.6.0 — 2026-11-13

Status effects and throwables (ADRs 0055 and 0056). `API_VERSION` is `1.6.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `JavaProjectInput.effects?: DefinitionInput[]`: the project's status effect definitions (`msm/<namespace>/effect/*.json`), in a stable order, for generators that emit mob effect classes. Optional; absent means none.
- `CreatorGroup` gains `'magic'`: the Creator lists the Status effect flow under "Magic".

### Migration from 1.5.0

None. A generator that reads `effects` should declare `^1.6.0` and treat an absent value as empty; generators written earlier ignore the field. A host older than 1.6.0 does not know the `magic` group: a plugin whose flow uses it should declare `^1.6.0`.

## 1.5.0 — 2026-11-07

Worlds in the Creator (ADR 0051). `API_VERSION` is `1.5.0`. Additive.

- `CreatorGroup` gains `'worlds'`: the Creator lists dimension flows under "Worlds".

### Migration from 1.4.0

None. A host older than 1.5.0 does not know the `worlds` group: a plugin whose flow uses it should declare `^1.5.0`.

## 1.4.0 — 2026-11-07

Sound files in starters (ADR 0049). `API_VERSION` is `1.4.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ItemFacts.vanillaTools?` with `VanillaToolStats` (`attackDamage`, `attackSpeed`, `durability`, `miningSpeed?`, `enchantability`): each vanilla tool's tooltip numbers by tier and type, for the Creator's Stats.
- `ItemFacts.dataPackComponents?: readonly string[]`: the data components whose value names a data pack registry entry (ADR 0050), for the `msm:components` validator.
- `AudioStarterParameter` (`type: 'audio'`, `default: null`, `maxBytes?` (absent means 8 388 608 bytes)): a sound the user picks, passed to `build` as an Ogg Vorbis `data:` URL string (`data:audio/ogg;base64,...`) or `null`. The host checks the Ogg signature, the Vorbis identification header and the size before passing it. A member of the `StarterParameter` union; the built-in Music disc flow reads it.

### Migration from 1.3.0

None. A host older than 1.4.0 does not know `audio` parameters: plugins that declare one should declare `^1.4.0`.

## 1.3.0 — 2026-11-06

Modpacks (ADR 0046). `API_VERSION` is `1.3.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ItemFacts.rangedPull?: RangedPullFacts` (`usingItem`, `bow` `{ useDuration, scale, thresholds }`, `crossbow` `{ pull, thresholds, chargeType, arrow, rocket }`): how vanilla's bow and crossbow item definitions show the pull, so custom ones animate the same way scaled by their draw speed.
- `FabricFacts.apiModrinth?: ModrinthFileFacts` (`versionId`, `fileName`, `url`, `sha1`, `sha512`, `size`): the target's Fabric API jar on Modrinth, which a modpack export lists as a download (ADR 0046 D7).

### Migration from 1.2.0

None.

## 1.2.0 — 2026-11-06

Gear, weapons and consumables (ADR 0044). `API_VERSION` is `1.2.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ImageStarterParameter` (`type: 'image'`, `default: null`, `maxBytes?` (absent means 1 048 576 bytes), `maxSize?` (largest width and height in pixels)): a picture the user picks, passed to `build` as a PNG `data:` URL string or `null` in `BundleContext.values` (already a `Json`, so the `values` type is unchanged). The host checks the PNG signature, size and dimensions before passing it (ADR 0044 D7). It is a member of the `StarterParameter` union: the host's wizard renders it as a file picker (PNG only) with a thumbnail, and the built-in Painting flow reads it.

### Migration from 1.1.0

None. Hosts that switch over `StarterParameter['type']` must handle `'image'`; a starter declaring an image parameter must build a placeholder for `null`.

## 1.1.0 — 2026-11-06

Armour facts and the Creator (ADRs 0042, 0043). `API_VERSION` is `1.1.0`. Additive: every change is an optional field or a new type, so plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `TargetFacts.items?: ItemFacts` with `armorMaterials: readonly string[]`: the vanilla armour material names of the target (ADR 0042 D4). A target without it skips the checks that need it.
- `ProjectStarter.creator?: StarterCreatorInfo` (`group: CreatorGroup`, `blurb: string`; `CreatorGroup` is `'gear' | 'blocks' | 'food' | 'mobs' | 'scripts'`): lists the starter in the host's Creator as a guided flow (ADR 0043 D1).
- `SetStarterParameter` (`type: 'set'`, `choices`, `default: string[]`, `min?`): a parameter whose value is a subset of a fixed list, passed to `build` as a `string[]` in `BundleContext.values` (already a `Json`, so the `values` type is unchanged). It is a member of the `StarterParameter` union; the host's wizard renders it as a list of checkboxes.
- `ElementMeta.creator?: ElementCreatorMeta` (`flowId`, `setId`, `values`, `generatedId`): written by the host on elements the Creator made, kept through load and save by `@msm/core` (ADR 0043 D4).

### Migration from 1.0.0

None. Hosts that switch over `CreatorGroup` or over `StarterParameter['type']` must handle every member (`'set'` is new).

## 1.0.0 — 2026-11-06

The first stable API (ADR 0036). `API_VERSION` is `1.0.0`. Built-in plugins and `tools/new-plugin` declare `^1.0.0`. The package gains a publishable build (`tsup`: `dist/index.js` ES module, `dist/index.cjs`, `dist/index.d.ts`) and a tarball attached to every release.

### Compatibility policy

From 1.0.0 the package follows semver as plugin authors expect:

- 1.x releases only add optional fields and new contribution points. A plugin written for 1.0 keeps loading in every 1.x host.
- A change that removes or narrows anything (a member, a union, a parameter type, a return type a host relies on) is 2.0.0, with a migration note here.
- A deprecated member stays for at least one minor release and is marked `@deprecated` with its replacement.
- The host keeps the semver check: `registerPlugin` refuses a plugin whose `apiVersion` range excludes `API_VERSION` (`Plugin <id> requires plugin API <range>, but this build provides <version>`); for external plugins the manifest's `apiVersion` is checked before any plugin code runs (ADR 0035).

### Changes

- `MaybePromise<T>` (`T | Promise<T>`). `ElementKind.lower`, `ElementTemplate.data`, `ProjectStarter.build`, `ExampleProject.build` and `ProjectValidator.validate` return a `MaybePromise`, so a sandboxed plugin whose functions resolve through a worker can return a Promise. Built-ins keep returning values; hosts await every result. `@msm/core` adds `lowerProjectAsync`; the synchronous `lowerProject` reports a Promise result as `lowering.async-not-supported`.
- `TargetFacts`: the data fields of a target (`id`, `mcVersion`, `channel`, `java`, `packFormats`, `mcdocRef`, `mcmetaRef`, `folders`, `dataVersion`, `worldgen`, `fabric?`, `geckolib?`). `Target extends TargetFacts` adds the hooks `javaProject?` and `migrateFrom?`. Plugin-facing functions receive a `TargetFacts`: `ElementKind.lower(element, target)`, `ValidationInput.target`, `TemplateContext.target`, `BundleContext.target`. `ExporterInput.target` stays a full `Target`.
- `TargetFacts.channel: TargetChannel` (`'release' | 'snapshot'`, required): snapshot targets are shown with a badge and are never the default for new projects.
- `TemplateContext.target` and `BundleContext.target` (required): templates, starters and examples read target facts (for example `target.worldgen` or `target.geckolib`) instead of hard-coding a version.
- `supports?(target: TargetFacts): boolean` on `ElementTemplate`, `ProjectStarter` and `ExampleProject`: the host hides an entry that returns `false` for the project's target; an entry without it must work on every target.
- `ProjectStarter.parameters?: StarterParameter[]` and `BundleContext.values: Readonly<Record<string, Json>>` (required; every declared parameter present, defaults filled in by the host; empty for starters without parameters and for examples). `StarterParameter` is a union of `StringStarterParameter` (`pattern?`, `maxLength?`), `NumberStarterParameter` (`min?`, `max?`, `step?`), `BooleanStarterParameter`, `ColourStarterParameter` (`#rrggbb`) and `ChoiceStarterParameter` (`choices`), each with `id`, `label`, `description?`, `default` and `group?` (the wizard step, ADR 0040). `build` must be pure in `values` as it is in `namespace`.
- `ElementKind.defaultDataFor?: (target: TargetFacts) => MaybePromise<Json>` (optional, ADR 0036 D8): per-target starting data for kinds whose valid data differs between targets. When present the host uses it instead of `defaultData` for new elements, for `TemplateContext.kindDefault` and for starters.
- `WorldgenFacts.noiseSettingsDefaultBlock?: boolean` (optional, ADR 0036 D8): whether noise settings have the required `default_block` field; absent means `true`. The first target fact a `defaultDataFor` reads, so per-target data comes from facts and never from a version literal.
- `MigrationChange.data?: Json` (the element's new data; absent means informational) and `MigrationChange.kind?: 'update' | 'remove'`. `Target.migrateFrom` stays pure: it returns the report and never mutates the project; the host applies the changes as one undo step.
- Packaging: `exports` keeps pointing at `src/` inside the workspace (TypeScript project references and Vitest resolve the source); `publishConfig` points the packed package at `dist/` (`exports` with `import` and `require` conditions, `main`, `module`, `types`), with `files`, `repository`, `homepage` and `publishConfig.access: public`. `pnpm --filter @msm/plugin-api build` writes `dist/`; `pnpm --filter @msm/plugin-api pack:tarball` writes `dist/msm-plugin-api-<version>.tgz`.

### Migration from 0.8.0

- Declare `^1.0.0`. Plugins declaring `^0.8.0` no longer load, because `1.0.0` is outside a `^0.8.0` range.
- Code that calls `lower`, `data`, `build` or `validate` must await the result (or, where only built-ins can reach the call, handle a Promise explicitly). Implementations need no change: returning a value is still valid.
- A target must set `channel`.
- A function typed against `Target` that only reads data can take a `TargetFacts`; a `Target` is assignable to `TargetFacts`, so callers need no change.
- Hosts that build a `TemplateContext` or a `BundleContext` (the app, library tests, the `examples/` mirror) must pass `target`, and bundles must pass `values` (`{}` for starters without parameters and for examples).

## 0.8.0 — 2026-11-05

Gradle fact, Java project generator and the `typescript` output language (ADR 0034). `API_VERSION` is `0.8.0`. Built-in plugins and `tools/new-plugin` declare `^0.8.0`.

- `FabricFacts.gradle: string` (required): the Gradle version the ejected Java project's wrapper uses.
- `Target.javaProject?: JavaProjectGenerator` with `JavaProjectInput` (`modId`, `javaPackage`, `modClassName`, `blocks`, `items`, `entities`, `geckolib`), `DefinitionInput` (`id`, `path`, `definition`) and `GeneratedFile` (`path`, `contents`): the version-specific Java generator the `java-project` exporter calls. `generate` is pure and deterministic and may throw an `Error` naming the definition, which the exporter reports as `export.java-generation-failed`.
- `OutputFile.language` documents the value `typescript` (script sources the host checks and the content jar exporter transpiles) alongside `mcfunction`. No type change.

### Migration from 0.7.0

- Plugins only need the range change: declare `^0.8.0`. Plugins declaring `^0.7.0` no longer load, because `0.8.0` is outside a `^0.7.0` range (0.x minors are breaking under semver).
- A target that sets `fabric` must add `gradle`. `javaProject` is optional.

## 0.7.0 — 2026-11-05

GeckoLib target facts (ADR 0030). `API_VERSION` is `0.7.0`. Built-in plugins and `tools/new-plugin` declare `^0.7.0`.

- `GeckolibFacts` (`version`, `modId`, `dependency`, `fileName`, `url`, `sha512`, optional `modrinthVersionId`) and `Target.geckolib?: GeckolibFacts`, replacing the placeholder `geckolib?: string`. The content jar exporter writes `modId` and `dependency` into `fabric.mod.json` `depends` and nests the jar as `META-INF/jars/<fileName>` when a project has entities; the host downloads it from `url` and checks `sha512`. Still optional on the type: a target may lack a GeckoLib build.

### Migration from 0.6.0

- Plugins only need the range change: declare `^0.7.0`. Plugins declaring `^0.6.0` no longer load, because `0.7.0` is outside a `^0.6.0` range (0.x minors are breaking under semver).
- Code that reads `Target.geckolib` gets a `GeckolibFacts` object instead of a version string; read `target.geckolib?.version` for the old value.
- A target that sets `geckolib` must supply the whole object.

## 0.6.0 — 2026-11-05

Mergeable outputs, exporter options and Fabric target facts (ADR 0027). `API_VERSION` is `0.6.0`. Built-in plugins declare `^0.6.0`.

- `OutputFile.merge?: OutputMergeMode` (`'tag' | 'object'`): outputs at the same layer and path merge instead of conflicting when every one of them declares the same mode and the same `schema`. `tag` merges tag files (union of `values` in first-seen order; a string and an `{ id }` entry with the same id count once; `replace: true` when any input says so). `object` merges flat JSON objects such as language files; the same key with different values is a `lowering.merge-conflict` error naming both elements. A file without `merge` meeting any other file at its path, mixed modes and differing schemas stay conflicts. The host merges (`@msm/core` `mergeOutputFiles`), so exporters receive merged files. The `minecraft:lang` and `minecraft:tag/<registry>` kinds of the built-in plugins declare `merge`.
- `ExporterOption` (`{ id, label, description?, type: 'boolean', default: boolean }`) and `Exporter.options?: ExporterOption[]`: options the export dialog renders. Only booleans in 0.6.0.
- `ExporterInput.options: Record<string, Json>`: the value of every declared option, with defaults filled in by the host; empty when the exporter declares none.
- `FabricFacts` and `Target.fabric?: FabricFacts`: `loader`, `api`, `loom` and the new `minecraftDependency` (the `minecraft` range written into `fabric.mod.json`). Still optional on the type.

### Migration from 0.5.0

- Plugins only need the range change: declare `^0.6.0`. Plugins declaring `^0.5.0` no longer load, because `0.6.0` is outside a `^0.5.0` range (0.x minors are breaking under semver).
- Code that builds an `ExporterInput` itself (tests, hosts) must pass `options` (`{}` when the exporter declares none).
- A target that sets `fabric` must add `minecraftDependency`.

## 0.5.0 — 2026-11-04

Structures and worldgen surface (ADR 0022). `API_VERSION` is `0.5.0`. Built-in plugins declare `^0.5.0`.

- `ElementKind.registry?: string`: the registry the ids of a kind's elements belong to (without `minecraft:`), for example `structure` for structure templates. Defaults to the kind id without `minecraft:`; set it only when the two differ.
- `ProjectValidator`, `ValidationInput` and `ValidationRegistry`: cross-element checks a plugin runs over the whole project (`id`, `kinds`, pure `validate(input)` returning `Problem[]`). The input holds every element, the target and a registry lookup (`has`, `ids`) over vanilla and project ids; no Node or DOM types.
- `PluginContributions.validators?: ProjectValidator[]`: host-run; their problems join the project's problems, so errors block export.
- `DataFolderKey` gains `structure` (structure template `.nbt` files), `dimension` and `worldgen` (the parent of the world generation registry folders, to which worldgen kinds append `/<registry>`, as tag kinds do with `tags`).
- `Target.dataVersion: number`: the game's data version, written as `DataVersion` into structure and schematic files.
- `Target.worldgen: WorldgenFacts` with `featureSteps`: the biome feature decoration step names in game order.
- Later within 0.5.0 (additive, no version change): optional `WorldgenFacts.biomeAttributes` (`BiomeAttributeFacts`: `colours`, `skyColour`, `naturalMobSpawns`), the biome environment attribute ids the host's Biome Studio and climate map read. Targets without it get no attribute-based colours or spawn lists.

### Migration from 0.4.0

- `Target.dataVersion` and `Target.worldgen` are required, and `Target.folders.data` must supply the three new keys. Every target must add them; MSM's own targets do. There are no third-party targets yet.
- `ElementKind.registry` and `PluginContributions.validators` are optional; existing plugins need no change for them.
- Plugins declaring `^0.4.0` no longer load, because `0.5.0` is outside a `^0.4.0` range (0.x minors are breaking under semver); declare `^0.5.0`.

## 0.4.0 — 2026-11-04

Templates and samples library surface (ADR 0020). `API_VERSION` is `0.4.0`. Built-in plugins declare `^0.4.0`.

- `ElementTemplate` and `TemplateContext` (`src/library.ts`): an entry of the host's "New element" picker (`id`, `kind`, `title`, `description`, `category`, optional `prefix`, `defaultName`, `fixedName`, `defaultNamespace`) whose pure `data(context)` builds the starting data from the new element's id, namespace and path, the project namespace, every project namespace and the kind's `defaultData`.
- `ProjectStarter`, `ExampleProject`, `ContentBundle` (`ContentBundleElement`, `ContentBundleAsset`) and `BundleContext`: starters for the host's "New project" dialog and entries of its Examples gallery. Each builds a self-contained bundle of elements (with optional `notes` and `tags`, which become `meta.notes` and `meta.tags`) and generated assets (`Uint8Array` bytes under `assets/<namespace>/`) for a namespace. `requiresKinds` lets the host hide entries whose kinds are not registered.
- `PluginContributions.elementTemplates`, `projectStarters` and `examples`: optional, host-interpreted. A template's `kind` must be one of the contributing plugin's own kinds; starters and examples may use any registered kind.

### Migration from 0.3.0

- No interface changed incompatibly; the new fields are optional.
- Plugins declaring `^0.3.0` no longer load, because `0.4.0` is outside a `^0.3.0` range (0.x minors are breaking under semver); declare `^0.4.0`.

## 0.3.0 — 2026-11-04

Phase 2 (Data Pack Studio) surface. `API_VERSION` is `0.3.0`. Built-in plugins declare `^0.3.0`.

- `OutputFile.language?: string`: a text language id the export validation gate may check, such as `mcfunction`; omitted for JSON and binary files. Text files carry their contents as UTF-8 bytes.
- `Problem.range?: { start: number; end: number }`: UTF-16 code unit offsets (start inclusive, end exclusive) within the string at `path`, or within `file` for problems in text output files.
- `DataFolderKey` and `Target.folders.data`: vanilla folder names under `data/<namespace>/` for `recipe`, `loot_table`, `advancement`, `predicate`, `item_modifier`, `function`, `tags` (the parent of the per-registry tag folders, to which tag kinds append `/<registry>`), `enchantment`, `damage_type`, `dimension_type`, `chat_type`, `jukebox_song`, `banner_pattern`, `painting_variant`, `trim_material`, `trim_pattern` and `dialog`. Every value is a single path segment.

### Migration from 0.2.0

- `Target.folders.data` is required. Every target must supply all seventeen `DataFolderKey` entries alongside `folders.resource`.
- Plugins declaring `^0.2.0` no longer load, because `0.3.0` is outside a `^0.2.0` range; declare `^0.3.0`.
- `OutputFile.language` and `Problem.range` are optional; existing plugins and hosts need no change for them.

## 0.2.0 — 2026-11-04

Phase 1 (Resource Pack Studio) surface. `API_VERSION` is `0.2.0`. Built-in plugins declare `^0.2.0`.

- `OutputFile.schema?: string`: the mcdoc type path (for example `::java::assets::model::Model`) or `resource:<category>` dispatcher reference the export validation gate checks the file against; omitted for binary files.
- `ElementKind.defaultData?: D`: data for newly created elements.
- `ElementKind.hiddenPaths?: string[]`: RFC 6901 pointers into `data` that the schema-driven form hides because lowering owns them.
- `ElementKind.previewKind?: string`: a host-interpreted preview hint (`model`, `block_definition`, `item_definition`).
- `Problem.file?: string`: a project-relative or export-relative file path, for load and export problems.
- `ExporterInput.meta: { msmVersion: string; plugins: string[] }`: facts for export metadata such as `msm.export.json`.
- `ResourceFolderKey` and `Target.folders.resource`: vanilla folder names under `assets/<namespace>/` (`sounds_file` is a file name). Data pack folders arrive in Phase 2.
- `isProjectRelativePath(path)` and `assertProjectRelativePath(path)`: shared project-relative POSIX path validation (empty paths, a leading `/`, backslashes and empty, `.` or `..` segments are rejected).

### Migration from 0.1.0

- `Target.folders` is required. Every target must supply `folders.resource` with all eight `ResourceFolderKey` entries.
- `ExporterInput.meta` is required. Hosts that call exporters must pass it; exporters may ignore it.
- `assertProjectRelativePath` now also lives in `@msm/plugin-api`. `@msm/core` keeps its copy for now and will re-export this one; new code should import it from `@msm/plugin-api`.
- Plugins declaring `^0.1.0` no longer load, because `0.2.0` is outside a `^0.1.0` range; declare `^0.2.0`.

## 0.1.0 — 2026-11-04

Initial surface. `API_VERSION` is `0.1.0`.

- JSON: `Json`, `JsonObject`, `ResourceLocation`.
- IR types (behaviour lives in `@msm/core`, ADR 0008): `ElementMeta`, `Element`, `Asset`, `Namespace`, `Project`.
- Output: `OutputLayer`, `OutputFile`, `OutputSink`.
- Problems: `ProblemSeverity`, `Problem`, `ProblemReporter`.
- Targets: `PackFormat`, `MigrationChange`, `MigrationReport`, `Target` (`fabric` and `geckolib` optional until Phases 4 and 5).
- Contributions: `ElementKind`, `EditorContribution`, `ExporterInput`, `Exporter`, `ImportedFile`, `ImportResult`, `Importer`, `Command`, `PluginContributions`.
- Plugins: `Plugin`, `PluginDefinitionError`, `definePlugin` (validates the id and a non-empty `apiVersion`, then shallow-freezes the plugin; semver ranges are evaluated by `@msm/core`).
- `API_VERSION`.
