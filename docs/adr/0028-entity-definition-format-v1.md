# ADR 0028: Entity definition format v1, the entities plugin and the runtime's `MsmEntity`

## Context

Phase 5 ([ROADMAP](../ROADMAP.md)) adds custom mobs: entity definitions with health, movement, a subset of vanilla AI goals, attacks, animations, natural spawning and spawn eggs ([Behaviour Model](../DESIGN.md#11-behaviour-model-components-and-events), [Engine Mod](../DESIGN.md#10-engine-mod-runtime)). [ADR 0025](0025-msm-definition-format-v1.md) fixed the definition format for blocks and items (format 1, components plus events, strict Codecs aligned with MSM mcdoc, a shared conformance corpus) and [ADR 0024](0024-runtime-registration-spike.md) proved init-time registration on 26.3. Entities extend the same format so the app, the schemas and the runtime can again be built in parallel.

Facts that shape the format (verified 2026-11-05, see `docs/PHASE5-PLAN.md`):

- An entity type is built with `EntityType.Builder.of(factory, MobCategory).sized(w, h).build(ResourceKey)` and registered in `BuiltInRegistries.ENTITY_TYPE`; vanilla's `SpawnPlacements.register` is private, so default attributes and spawn placement go through Fabric API's `FabricEntityType.Builder.createMob(...)`.
- Vanilla AI goals are classes with fixed constructor parameters (speed, distance, target class); the target class is a Java class, not an entity type, so type-selected targets need a predicate.
- Spawn eggs are `SpawnEggItem(Item.Properties.spawnEgg(type))`; since 1.21.x their visuals are per-egg item textures, not tints.
- Natural spawns come from Fabric API's `BiomeModifications.addSpawn` with biome selectors (tags or keys); 26.3 stores a biome's spawns in the `minecraft:gameplay/natural_mob_spawns` attribute.
- GeckoLib 5.5.7 exists for Fabric 26.3 and renders Bedrock-format geometry with Bedrock-format animations ([ADR 0029](0029-model-animation-pipeline.md)); it needs a client-side renderer registration.
- Display names are language keys `entity.<ns>.<path>` and `item.<ns>.<path>_spawn_egg`; drops are the vanilla loot table `<ns>:entities/<path>` by default.

## Decision

**D1. Two documents per element, as for blocks.** The app edits `msm:entity` element data; lowering writes the runtime definition to `msm/<ns>/entity/<path>.json` (layer `msm`, `"format": 1`). Everything reloadable lowers to ordinary pack files: language keys, the spawn egg's item definition and model, the loot table the user writes. The runtime's load rules of ADR 0025 (format check, unknown keys with a warning, strict types, dropped events, chain depth 16) apply unchanged.

**D2. Entity definition v1** (`::msm::definition::Entity`):

```jsonc
{
  "format": 1,
  "category": "creature",                     // monster | creature | ambient | water_creature | water_ambient | underground_water_creature | axolotls | misc
  "size": { "width": 0.9, "height": 1.6 },    // hitbox in blocks, 0.1..8
  "eye_height": 1.4,                          // optional; default 0.85 * height (vanilla's default)
  "loot_table": "mymod:entities/ruby_golem",  // optional; absent means the vanilla default id <ns>:entities/<path>
  "spawn_egg": { "creative_tab": "minecraft:spawn_eggs" },   // optional; absent = an egg in minecraft:spawn_eggs; false = no egg
  "spawn": {                                  // optional; absent = no natural spawning
    "biomes": ["#minecraft:is_forest", "minecraft:plains"],  // biome tags (#) and ids, union
    "weight": 6, "min_group": 1, "max_group": 2,
    "placement": "on_ground",                 // on_ground | in_water | in_lava | no_restrictions (default on_ground)
    "heightmap": "motion_blocking_no_leaves", // motion_blocking_no_leaves | motion_blocking | world_surface | ocean_floor
    "rule": "mob"                             // mob | monster | surface_monster | any_light_monster | always (default mob)
  },
  "components": {
    "msm:health": { "max": 30 },              // default 20
    "msm:movement": { "speed": 0.28, "follow_range": 24, "knockback_resistance": 0.2, "swims": true, "fire_immune": false },
    "msm:attack": { "damage": 4.0, "knockback": 0.5, "on_attack": "mymod:thump" },
    "msm:ai_goals": { "goals": [
      { "type": "wander", "speed": 1.0, "avoid_water": true },
      { "type": "look_at_player", "distance": 8.0 },
      { "type": "look_around" },
      { "type": "melee_attack", "speed": 1.2, "targets": ["minecraft:player"], "must_see": true, "retaliate": true },
      { "type": "flee", "from": ["minecraft:creeper"], "distance": 6.0, "speed": 1.0, "sprint_speed": 1.2 },
      { "type": "follow", "entities": ["minecraft:player"], "speed": 1.0, "stop_distance": 2.0, "range": 16.0 }
    ] },
    "msm:animated_model": {                   // required: every entity renders through GeckoLib (ADR 0029)
      "model": "mymod:entity/ruby_golem",     // geo model id -> assets/mymod/geckolib/models/entity/ruby_golem.geo.json
      "animations": "mymod:entity/ruby_golem_animations",  // optional -> assets/mymod/geckolib/animations/entity/ruby_golem_animations.animation.json
      "texture": "mymod:entity/ruby_golem",   // texture id -> assets/mymod/textures/entity/ruby_golem.png
      "scale": 1.0, "idle": "idle", "walk": "walk", "attack": "attack", "transition_ticks": 2
    },
    "msm:on_hurt": { "event": "mymod:ouch" },
    "msm:on_death": { "event": "mymod:shatter" },
    "msm:on_interact": { "event": "mymod:pat" }
  },
  "events": { "mymod:thump": { "actions": [ { "type": "play_sound", "sound": "minecraft:entity.iron_golem.attack" } ] } }
}
```

Defaults and rules:

- `msm:health` absent means 20; `msm:movement` absent means speed 0.25, follow range 16, no knockback resistance, swims; `msm:attack` absent means attack damage 0 and no melee attacks happen even with a `melee_attack` goal (the goal is a no-op and the validators warn).
- Goals get vanilla priorities in list order (`priority` overrides); a `FloatGoal` is added first when `swims` is true. `melee_attack` adds `MeleeAttackGoal` plus a nearest-attackable-target goal whose selector matches the listed entity types (`minecraft:player` matches players; an empty list with `retaliate` only fights back) and `HurtByTargetGoal` when `retaliate`. `flee` is `AvoidEntityGoal` with a type predicate; `follow` is the runtime's own `FollowTypesGoal`, because vanilla's `FollowMobGoal` cannot select types; `look_at_player`, `look_around` and `wander` (`WaterAvoidingRandomStrollGoal`, or `RandomStrollGoal` when `avoid_water` is false) are vanilla.
- Entity type lists use ids (`#[id="entity_type"]`); unknown ids are warnings after start-up (other mods' entities).
- `spawn.biomes` entries starting with `#` are biome tags, others biome ids; the runtime builds one Fabric biome selector as their union and registers the spawn in `category` (verify at implementation that `BiomeModifications.addSpawn` reaches the 26.3 `natural_mob_spawns` attribute; the fallback is a lowered biome attribute override, see the plan's risks).
- `msm:animated_model` is required. `model`, `animations` and `texture` are resource ids; the runtime maps them to the GeckoLib and texture paths above, so the same id names the `msm:geo_model` and `msm:animation` elements in the app. `idle` plays on a loop, `walk` while the mob moves, `attack` once on each melee hit; names not present in the animation file play nothing (GeckoLib logs it).
- Trigger components fire on the logical server: `msm:on_hurt` after damage is applied (`hurtServer`), `msm:on_death` on death (`die`), `msm:on_interact` on a player's right click (`mobInteract`), `msm:attack.on_attack` after a successful melee hit (`doHurtTarget`). The event context's base block is the entity's block position, effects happen at the entity, and the player is the attacker, interactor or none.

**D3. Element data** (`::msm::element::Entity`) is the definition plus `display_name` (lowered to `entity.<ns>.<path>`), `spawn_egg.texture` (an item texture id such as `mymod:item/ruby_golem_spawn_egg`, lowered to `assets/<ns>/items/<path>_spawn_egg.json` and `assets/<ns>/models/item/<path>_spawn_egg.json` with `minecraft:item/generated` and `layer0`, following the vanilla per-egg texture layout) and `spawn_egg.display_name` (lowered to `item.<ns>.<path>_spawn_egg`). In the app `msm:animated_model.model` references an `msm:geo_model` element and `animations` an `msm:animation` element ([ADR 0029](0029-model-animation-pipeline.md)); the `entities.*` validators report missing references, undeclared events, event cycles, unknown animation names, missing textures and bad group ranges. Element ids are the registry ids; the spawn egg item `<ns>:<path>_spawn_egg` is derived, not a separate element, and the app counts it as an item.

**D4. Action `play_animation`.** `{ "type": "play_animation", "animation": "<name>", "controller"?: "<name>" }` triggers a GeckoLib animation on the event's entity (controller `msm_triggered` by default). In a block or item definition, or on an entity without GeckoLib loaded, the action is dropped at load with a warning naming the definition; the rest of the event runs. Content jars with entities depend on `msm_runtime >=0.5.0` through the exporter's version rule (ADR 0026 D2), so older runtimes never see it.

**D5. The runtime.** `DefinitionScanner` accepts kind `entity`. `MsmEntity extends PathfinderMob` is the driver class: attributes from the components, goals from `msm:ai_goals`, event dispatch from the overrides named in D2; definitions are looked up by `EntityType`. Registration uses `FabricEntityType.Builder.createMob(MsmEntity::new or MsmGeoEntity::new, category, mob -> mob.defaultAttributes(...).spawnPlacement(placement, heightmap, rule))`, then `.sized(...)`, `.eyeHeight(...)`, `.fireImmune()` and `.build(key)`. GeckoLib is bridged in a separate class group (`MsmGeoEntity implements GeoEntity`, `MsmGeoModel`, `GeckolibEntities`, `client/MsmRuntimeClient`) that the registrar touches only after `FabricLoader.isModLoaded("geckolib")`, so the runtime jar neither contains nor hard-depends on GeckoLib (`fabric.mod.json` `suggests` it) and still loads without it; a definition with `msm:animated_model` then logs one error and registers nothing. The runtime gains a `client` entrypoint that registers `GeoEntityRenderer` for every geo entity; `environment` stays `*`. The Phase 4 log line stays byte for byte (CI's regex) and a second line `[msm_runtime] registered K entity type(s)` follows it; spawn eggs count as items in the first line.

**D6. The plugin.** `@msm/plugin-entities` (`msm.entities`, scaffolded with `tools/new-plugin`) contributes `msm:entity` (kind folder `entity`, registry `entity_type`, `previewKind: 'entity'`), its lowering, the `entities.*` validators and three templates (Creature, Monster, Ambient critter). The vanilla pack exporters skip layer `msm` as before.

**D7. Tests.** JUnit over the shared corpus (`conformance/definition/{valid,invalid}/entity-*.json`, also validated by `validateJson`); GameTests for registration, attributes, the egg, each goal, each trigger, `play_animation` handling and the biome spawn; the CI headless server loads `fixtures/sample-mob/` with GeckoLib nested; the e2e `entities-path` spec drives import, the Entity Studio, export gating and the jar.

## Consequences

- One spec serves the mcdoc, the Codecs, the plugin's lowering and the Entity Studio in parallel, as in Phase 4.
- Hand-written `msm/<ns>/entity/*.json` files work without the app; GeckoLib resources must sit at the paths D2 names.
- Mobs without a model are not supported in v0.5; a vanilla-model fallback is a follow-up if users ask.
- The goal subset is deliberately small; new goal types are format-1 additions (older runtimes drop unknown goal types with a warning, like unknown action types drop events).

## Status

Proposed (2026-11-05). Findings of the spike (B110) are appended here before Wave 1; accepted at Phase 5 close.

Spike findings (B110, 2026-11-05; `engine-mod` with a Gson spike parser, GameTests `MsmEntitySpikeGameTest`, 26 of 26 required GameTests and 46 JUnit tests pass, with and without GeckoLib on the run classpath):

- Registration as D5 describes works on 26.3: `FabricEntityType.Builder.createMob(factory, category, mob -> mob.defaultAttributes(...).spawnPlacement(SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, Mob::checkMobSpawnRules)).sized(w, h).build(key)` and `Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type)` at init. Attribute holders are `Attributes.MAX_HEALTH`, `MOVEMENT_SPEED`, `ATTACK_DAMAGE`, `ATTACK_KNOCKBACK`, `FOLLOW_RANGE`, `KNOCKBACK_RESISTANCE` (all checked in the 26.3 jar).
- `registerGoals` runs inside the `Mob` constructor, before subclass fields exist; the definition is looked up from a static `EntityType -> definition` map filled before `Registry.register`. `getType()` is already set at that point.
- Spawn egg: `new SpawnEggItem(new Item.Properties().setId(key).spawnEgg(type))`; `SpawnEggItem.getType(stack)` and `byId(type)` find it. `CreativeModeTabs.SPAWN_EGGS` is private in 26.3; the tab key is built from `minecraft:spawn_eggs`.
- **`BiomeModifications.addSpawn` reaches the 26.3 `minecraft:gameplay/natural_mob_spawns` attribute**: Fabric biome API 20.1.1 reads and rewrites `EnvironmentAttributes.NATURAL_MOB_SPAWNS` (`SpawnSettingsContextImpl`). Read back with `biome.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS, EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue()).getMobsInCategory(category)`; plains, forest and birch forest (`minecraft:plains` plus `#minecraft:is_forest`) list the mob with weight 6 and count `[1-2]`, desert does not. No lowered biome attribute override is needed.
- `melee_attack` with a type list works through `NearestAttackableTargetGoal<LivingEntity>(mob, LivingEntity.class, mustSee, (target, level) -> types.contains(...))`: the mob found and hit a pig listed by id. `GameTestHelper.makeMockPlayer` creates a player that is **not in the level**, so no target goal can find it; `makeMockServerPlayerInLevel` is in the level but always creative. GameTests drive player attacks with `setTarget(mockPlayer)` (the player lost 5 health on difficulty NORMAL); B113 should do the same and test type selection with a vanilla mob.
- `helper.walkTo(mob, pos, 1.0f)` moves a goal-less mob across an 8x8 stone floor within 200 ticks (the empty test structure has no floor; tests place one).
- Without GeckoLib the spike registers the plain `MsmEntity` and logs one error per geo definition (`msm:animated_model needs the mod 'geckolib', which is not loaded; the entity has no renderer`), as the B110 brief asked; D5's "registers nothing" remains the B113 behaviour.
- Spawn eggs are counted as items in the Phase 4 line and `[msm_runtime] registered K entity type(s)` follows it; the Phase 4 line is unchanged.
- Nothing in D2 is awkward for the game API beyond the mock-player limit above.
