# Plan: custom status effects and throwables

Working plan for the user's request of 2026-11-13 ("add custom status effects and throwables"); deleted when the work closes (history goes to `DEVLOG.md`). It takes up two items of ROADMAP "Post-1.0 Ideas" > "More gear and content types" (deferred by [ADR 0044](adr/0044-gear-weapons-and-consumables.md) D8). Run as in `HANDOFF.md` "How to run a phase". Executors: Opus at medium effort; Sonnet where a brief says so.

## 1. Verified facts

Sources: **V** = `packages/targets/mc-26.3/vendor` (mcmeta `registries.json`, vanilla-mcdoc `symbols.json`); **J** = `javap` over the 26.3 client jar from Mojang's `piston-data` (SHA-1 `e877b6a0…7b87`, read on 2026-11-13, not stored in the repo) and, where "both" is written, the same over `26.4-snapshot-7`; **F** = Fabric API 0.165.2+26.3 (`fabric-entity-events-v1` 6.0.4); **C** = this repository's code.

| # | Fact | Source |
|---|---|---|
| F1 | Mob effects are not data driven: the vanilla-mcdoc `minecraft:resource` dispatcher has no `mob_effect` entry (nor `potion`); `registries.json` lists 40 built-in `mob_effect` ids. | V |
| F2 | `MobEffect`: `protected MobEffect(MobEffectCategory, int)` and `(…, ParticleOptions)`; `applyEffectTick(ServerLevel, LivingEntity, int): boolean`; `shouldApplyEffectTickThisTick(int, int)`; `onEffectStarted(LivingEntity, int)`; `onEffectAdded`; `onMobHurt`; `addAttributeModifier(Holder<Attribute>, Identifier, double, AttributeModifier.Operation)`; `withSoundOnAdded(SoundEvent)`. `MobEffectCategory`: `BENEFICIAL`, `HARMFUL`, `NEUTRAL`. No "removed" or "expired" hook on the class. Identical on 26.4. | J both |
| F3 | Fabric API has `ServerMobEffectEvents` (`AFTER_ADD`, `BEFORE_REMOVE`, `AFTER_REMOVE`, …; `afterRemove(MobEffectInstance, LivingEntity, EffectEventContext)`). Whether `AFTER_REMOVE` fires on natural expiry, and that the 26.4 Fabric API has it: (verify at implementation). | F |
| F4 | Effect icons: atlas `assets/minecraft/atlases/gui.json` has a directory source `mob_effect` with prefix `mob_effect/`; vanilla icons are `textures/mob_effect/<name>.png`, 18 by 18. The name key is `effect.<ns>.<path>` (`effect.minecraft.speed`). That another namespace's `textures/mob_effect/` is picked up without an atlas file: expected from the directory source, (verify in game). | J (assets) |
| F5 | Data components that already cover effects: `consumable` with `on_consume_effects` of type `apply_effects`, `clear_all_effects`, `remove_effects`, `play_sound`, `teleport_randomly`; `death_protection`; `potion_contents`; `suspicious_stew_effects`. All take a `mob_effect` id, so a registered custom effect works in them. | V |
| F6 | No data component makes an item throw a projectile: none of the 122 `data_component_type` ids does it (`use_cooldown`, `use_effects`, `use_remainder`, `weapon`, `kinetic_weapon`, `piercing_weapon`, `charged_projectiles`, `intangible_projectile` exist; none spawns an entity on use). Throwing is item class code. | V |
| F7 | `SnowballItem extends Item implements ProjectileItem`; `use` calls `Projectile.spawnProjectileFromRotation(factory, ServerLevel, ItemStack, LivingEntity, 0.0f, 1.5f, 1.0f)` and plays `entity.snowball.throw`; `PROJECTILE_SHOOT_POWER` 1.5. `TridentItem`: `THROW_THRESHOLD_TIME` 10, `PROJECTILE_SHOOT_POWER` 2.5, `BASE_DAMAGE` 8, overrides `getUseAnimation`, `getUseDuration`, `releaseUsing`. `ItemUseAnimation` has `TRIDENT` and `SPEAR`. `ProjectileItem.asProjectile(Level, Position, ItemStack, Direction)`; `DispenserBlock.registerProjectileBehavior(ItemLike)`. | J |
| F8 | `ThrowableItemProjectile extends ThrowableProjectile implements ItemSupplier` (constructors `(EntityType, Level)`, `(EntityType, LivingEntity, Level, ItemStack)`, `(EntityType, double ×3, Level, ItemStack)`; abstract `getDefaultItem()`; the stack is synched data). `ThrowableProjectile.getDefaultGravity()` 0.03, `getAirDrag()` 0.99 (both protected). `Projectile.onHit`, `onHitEntity(EntityHitResult)`, `onHitBlock(BlockHitResult)`, `getOwner()`. `DamageSources.thrown(Entity, Entity)`, `magic()`. `LivingEntity.hurtServer(ServerLevel, DamageSource, float)`, `heal(float)`, `hasEffect`, `getEffect`, `removeEffect`. `EntityType.Builder.of(factory, MobCategory).sized().clientTrackingRange().updateInterval().build(ResourceKey)`. All identical on 26.4 (`Projectile` differs only in methods we do not call). | J both |
| F9 | `ThrownItemRenderer<T extends Entity & ItemSupplier>(EntityRendererProvider.Context)` is vanilla and draws the entity's item as a camera-facing sprite. The trident's own renderer (`ThrownTridentRenderer`) draws the vanilla trident model only. | J both |
| F10 | The runtime ignores unknown kind folders under `msm/` with a warning (`DefinitionScanner.KINDS` is `block`, `item`, `entity`); items register after blocks; `MsmRegistrar.effectInstance` and `EventRunner.applyEffect` and `ScriptEntity.addEffect` look the effect up in `BuiltInRegistries.MOB_EFFECT`, so they accept a custom effect once it is registered before items. | C |
| F11 | The renderer seam `client/EntityRendererRegistration` exists for both versions; `MsmRuntimeClient` registers renderers only when GeckoLib is loaded today. | C |
| F12 | The `java-project` exporter sorts `msm/<ns>/<kind>/` files with `block`, `item`, else entity (`packages/exporters/src/java-project/index.ts`, lines 343–345): an `effect` file would be treated as an entity. `JavaProjectInput` has `blocks`, `items`, `entities` only. `run_script` actions are removed before generation. | C |
| F13 | The AI helper's catalogue (22 tools) is generic (`list_kinds`, `kind_schema`, `create_elements`, `add_starter`); the system prompt names no throwable or status effect gap. Plugin API is 1.5.0; the highest ADR is 0054; the highest brief is B193. | C |

What must be runtime code therefore: registering `MobEffect` objects with tick, start and end behaviour (F1–F3); an item class that throws, one projectile entity type and its client renderer registration (F6–F9). Everything else (who gets an effect, potions-like drinks, recipes, names, icons) is existing data.

## 2. Decisions (ADR drafts)

### ADR 0055 (draft): Custom status effects (`msm:effect`)

- **D1 Kind.** `msm:effect` in `@msm/plugin-blocks-items` (no new plugin, no lockfile change): folder `effect`, `registry: 'mob_effect'`, so every `#[id="mob_effect"]` field (consumables, totems, `apply_effect`, vanilla passthrough components, commands) resolves project effects. Element ids are the registry ids.
- **D2 Definition** `msm/<ns>/effect/<path>.json` (`::msm::definition::Effect`, schema ref `msm:effect_definition`):
  ```
  struct Effect {
    format: 1,
    category: ("beneficial" | "harmful" | "neutral"),
    color: int @ 0..16777215,                  // potion particle and bar colour
    particle?: #[id="particle_type"] string,   // a simple particle type instead of the tinted swirl
    sound?: #[id="sound_event"] string,        // played when the effect is added
    attribute_modifiers?: [struct { attribute: #[id="attribute"] string, amount: float,
      operation: ("add_value" | "add_multiplied_base" | "add_multiplied_total") }],  // amount × level, as vanilla
    components?: struct {
      "msm:on_start"?: struct { event: string },
      "msm:on_tick"?:  struct { event: string, interval_ticks?: int @ 1.. /* 20 */, faster_per_level?: boolean },
      "msm:on_end"?:   struct { event: string },
    },
    events?: struct { [string]: Event },
  }
  ```
  Element data (`::msm::element::Effect`) adds `display_name` (lowered to `effect.<ns>.<path>` in `en_us`, `merge: 'object'`). The icon is a project asset at the fixed path `assets/<ns>/textures/mob_effect/<path>.png` (18 by 18; F4); it is not a field. Instant effects (`applyInstantaneousEffect`) are out of scope.
- **D3 Runtime.** `DefinitionScanner.KINDS` gains `effect`; `MsmRegistrar.registerAll` registers effects first (F10). `MsmMobEffect extends MobEffect` (F2): constructor with category, colour and optional particle; `addAttributeModifier` per entry with the id `<ns>:effect.<path>.<index>`; `shouldApplyEffectTickThisTick` is `duration % interval == 0` with `interval = max(1, interval_ticks / (amplifier + 1))` when `faster_per_level`; `applyEffectTick` fires `msm:on_tick` and returns `true`; `onEffectStarted` fires `msm:on_start` on the server; `msm:on_end` fires from `ServerMobEffectEvents.AFTER_REMOVE` (F3; if expiry is not covered, the GameTest finding goes into the ADR Status and `on_end` is documented as "removed early" only). Event context: origin and base at the holder; `player` is the holder when it is a player, `entity` and `other` are the holder, so `self` and `other` both mean the holder. `play_animation` is dropped at load with a warning, as for blocks and items. No Mixin.
- **D4 Two actions**, usable in every definition: `damage { amount: float @ 0.., target?: EffectTarget }` (`hurtServer` with `damageSources().magic()`) and `heal { amount: float @ 0.., target?: EffectTarget }`. With them "poison-like", "regeneration-like" and "burst on hit" need no script. The Events editor lists them.
- **D5 Script API v1, additive** (`script-api-v1.json` first): `Entity.hasEffect(id): boolean`, `Entity.effectLevel(id): number` (0 when absent, else amplifier + 1), `Entity.removeEffect(id): boolean`, and `ActionEvent.other: Entity | undefined` (the event's other entity). The "script tick hook" is `msm:on_tick` with a `run_script` action; no new global script events.
- **D6 Icons, colours, particles.** Colour drives the vanilla tinted particles and the HUD bar; the Creator writes a tinted 18 by 18 placeholder icon; "New texture…" gains the kind "Effect icon". The app (not the plugin, which cannot see assets) warns in the Effect Studio when the icon file is missing.
- **D7 Ways to get the effect** are existing content: `msm:consumable` drinks and food, `msm:death_protection`, `apply_effect`, throwables (ADR 0056), `/effect`. The vanilla `Potion` registry and brewing are not touched (also code registries, F1).
- **D8 Versions.** Shared runtime code only (F2, F8 identical on 26.4): no `src/mc/<mc>` seam expected; no `supports` gate, the kind and its flows work on 26.4. The Java eject stays 26.3 only, as today. A runtime older than the release that ships this logs "unknown kind 'effect'" and items naming the effect fail to resolve it; mcdoc doc comments name the minimum runtime version, as `launch` does.

### ADR 0056 (draft): Throwables (`msm:throwable`)

- **D1 A component on `msm:item`**, not a new kind (as `msm:ranged_weapon`):
  ```
  struct Throwable {
    speed?: float @ 0.1..5,          // 1.5, the snowball's; a trident is 2.5
    inaccuracy?: float @ 0..10,      // 1
    gravity?: float @ 0..1,          // 0.03 blocks per tick squared
    damage?: float @ 0..,            // 0; dealt as `thrown` damage by the thrower
    charge_ticks?: int @ 0..200,     // 0 throws on use; above 0 the player holds and releases (trident: 10)
    after_throw?: ("consume" | "keep" | "drop" | "return"),  // consume
    cooldown_ticks?: int @ 0..,
    sound?: #[id="sound_event"] string,   // minecraft:entity.snowball.throw
    dispensable?: boolean,                // true
    on_hit_entity?: struct { event: string },
    on_hit_block?: struct { event: string },
  }
  ```
  `consume` uses one item (snowball); `keep` uses none; `drop` leaves the thrown item where it lands (a throwing knife); `return` puts it back in the thrower's inventory when it lands, or drops it at their feet (a simple boomerang: no return flight in this version). `keep`, `drop` and `return` take one durability per throw when the item has `msm:durability`.
- **D2 Conflicts.** `msm:throwable` joins the exclusive set with `msm:ranged_weapon`, `msm:shield` and `msm:armor`, and is also an error with `msm:consumable`, `msm:food` or tool type `mace` (all own right-click or the item class): `blocks-items.component-conflict` in the app, "none is applied" in the runtime. It combines with `msm:tool` (other types), `msm:durability` and `msm:on_use` (the event fires, then the throw).
- **D3 Runtime.** `MsmThrowableItem extends MsmItem implements ProjectileItem` (F7): `use` throws at once or starts using; `releaseUsing` throws after `charge_ticks`; `getUseAnimation` is `SPEAR` (or `TRIDENT`, chosen in game; verify at implementation); dispenser behaviour through `DispenserBlock.registerProjectileBehavior`. **One** entity type for all throwables, `msm_runtime:thrown_item`: `MsmThrownItem extends ThrowableItemProjectile` (F8) reads its behaviour from its item's definition; sized 0.25 by 0.25, tracking range 4, update interval 10 (the snowball's; verify at implementation); `getDefaultGravity` from the definition; `onHitEntity` deals `damage` then fires `on_hit_entity`; `onHitBlock` fires `on_hit_block`; `onHit` applies `after_throw` and discards. Hit event context: origin at the hit point, base the hit block (or the victim's block), `player` the thrower when a player, `other` the living entity hit, so `apply_effect`, `damage` and `launch` with `target: "other"` act on the victim and `self` on the thrower.
- **D4 Rendering.** Vanilla `ThrownItemRenderer` (F9) registered for the one type in `MsmRuntimeClient` through the existing seam, whether or not GeckoLib is loaded (F11): the thrown item looks like its item model, facing the camera. No GeckoLib dependency. Not in this version, recorded as follow-ups: a trident-like 3D model in flight, loyalty-style return flight, custom arrows for bows, GeckoLib projectile entities.
- **D5 Lowering** adds no files: the definition passes through; the item model and name are as for any item.
- **D6 Versions.** As ADR 0055 D8.

### Shared parts (recorded in the ADR that fits; no third ADR)

- **Plugin API 1.6.0 (additive, in ADR 0055):** `JavaProjectInput.effects?: DefinitionInput[]` ("Since 1.6.0"); the exporter routes `effect` files there and never into `entities` (F12).
- **Java eject (26.3 generator):** `ModEffects.java` and `effect/<Name>Effect.java` (mirrors `MsmMobEffect`); throwables as `item/<Name>Item` over a template, one `entity/ThrownItemEntity.java` registered as `<mod id>:thrown_item`, and a client entrypoint that now exists when the project has entities **or** throwables (GeckoLib imports only with entities); `Actions.damage`, `Actions.heal` written only when used.
- **Creator flows** (library starters with `creator` metadata):
  - **Status effect** (new group `magic`): name, colour, good, bad or neutral; "what it does": nothing extra, heals, hurts, particles, runs a function; amount and "every N seconds", "stronger levels act faster"; up to two stat changes from a fixed list checked against each target's `attribute` registry (movement speed, attack damage, max health, armour, jump strength, scale, …); "how players get it": a drink (`msm:consumable`, glass bottle back, optional recipe), a throwable flask (ADR 0056, effect on the mob hit), or nothing (commands and other elements). Writes the effect, the tinted icon, optional item, model, texture, recipe, name, `msm:mod`.
  - **Throwable** (group `gear`): name, colour, style (ball, knife that can be picked up again, boomerang, bomb), damage, speed, gravity (floaty, normal, heavy), hold to throw, "when it hits": nothing, a vanilla effect from `EFFECT_CHOICES`, push away, place a block, burst (particles, sound and `damage`); stack size, optional recipe. Placeholder patterns `ball`, `knife`, `boomerang`, `flask`, `effect_icon`.
- **Templates and examples:** templates "Status effect", "Damage over time effect", "Stat boost effect" (kind `msm:effect`) and "Throwable item"; examples "Frost bomb" (a throwable that gives a custom slowing effect) and "Scripted effect" (`msm:on_tick` with `run_script`); starters are the two flows. Counts are taken from the plugins at close, never from this plan.
- **AI helper:** no new tool (the catalogue order and schemas stay byte-identical; F13). One system prompt paragraph: effects are `msm:effect`, throwables are `msm:throwable`, prefer the two starters, a per-tick script goes through `msm:on_tick` and `run_script`, 3D thrown models and custom arrows are still gaps for `note_missing_feature`. A scripted scenario test builds a "poison dart" mod and passes `run_checks`.
- **Validators (`blocks-items.*`):** `component-conflict` extended (D2 above); the event reference check extended to effect components and `on_hit_*`; `effect-interval-without-tick` is not needed (the schema nests the interval). No asset checks in the plugin.
- **`supports` gates:** none new (D8/D6). Examples that also contain a GeckoLib entity keep `hasGeckolib`.

## 3. Waves and briefs

Rules for every brief: do not commit; owned paths only; version facts stay in `packages/targets` (`tools/check-deps` forbids version literals elsewhere); Mojang names; British English; append a DEVLOG entry; report real counts. No brief adds a dependency, so **no wave needs a lockfile change**; if `pnpm install` would change `pnpm-lock.yaml`, stop and report (the first brief listed in the wave is the lockfile owner). Gradle needs JDK 25: install Temurin 25 as `HANDOFF.md` says or rely on CI's `engine-mod` job, and say which in the report. Wave 0 is the main session: write ADRs 0055 and 0056 as Proposed from section 2, add the DESIGN §10–§12 and §9 notes and a ROADMAP add-on entry.

### Wave 1: contracts (three in parallel)

**B200 Format (Opus).** Owns `packages/schemas/mcdoc/msm/{definition,element,action}.mcdoc`, `symbols.json` (generated), `packages/schemas/mcdoc/msm/conformance/{definition,element}/**` (new files and `expected-errors.json`), `packages/schemas/src/msm/symbols.ts`, `packages/schemas/test/**`, `tools/build-msm-mcdoc/**` only if the corpus prefix table lives there, `packages/schemas/CLAUDE.md`.
Scope: `Effect` definition and element types, `Throwable` in `ItemComponents`, actions `damage` and `heal`, schema refs `msm:effect` and `msm:effect_definition` in `MSM_SCHEMA_REFS`/`MSM_TYPE_PATHS`; corpus prefix `effect-`.
Acceptance: `node tools/build-msm-mcdoc/index.ts --check` green; at least 8 valid and 10 invalid `effect-*` cases (bad category, colour out of range, interval 0, unknown operation, format 2, …), 6 valid and 8 invalid `item-throwable-*` cases, 2 valid and 2 invalid cases per new action; `pnpm --filter @msm/schemas test` green.
Out of scope: Java Codecs, the plugin, the app.

**B201 Script API contract (Sonnet).** Owns `packages/plugins/scripting/api/script-api-v1.json`, `api/msm-runtime.d.ts` (regenerated with `UPDATE_GOLDENS=1`), `packages/plugins/scripting/test/**`, the Script API table in `docs/guide/scripting.md`.
Scope: the four additions of ADR 0055 D5 with doc strings. Acceptance: scripting plugin tests green; the typings golden changes only by the additions. Out of scope: `ScriptApi` Java (B203; `ScriptApiContractTest` is red until then, so Wave 1 is not pushed to `main` alone).

**B202 Plugin API 1.6.0 and target notes (Sonnet).** Owns `packages/plugin-api/**`, `packages/targets/mc-26.3/CHANGES.md`, `packages/targets/mc-26.4/CHANGES.md`.
Scope: `JavaProjectInput.effects?`; version 1.6.0 with the "Since 1.6.0" notes and the API's changelog and tests; CHANGES rows for F1–F9 with their sources (26.4 rows for the "both" facts).
Acceptance: plugin-api tests green including the additive-compatibility test; `npx tsc -b` green. Out of scope: exporters, generator.

### Wave 2: implementations (four in parallel, after Wave 1 is checkpointed)

**B203 Runtime (Opus; the largest brief, two checkpoints: effects, then throwables).** Owns `engine-mod/src/**` (main, test, gametest, both `src/mc/<mc>` overlays if a seam turns out to be needed), `engine-mod/CLAUDE.md`.
Scope: ADR 0055 D3–D5 and ADR 0056 D2–D4: `loader/EffectDefinition`, `components/EffectComponents`, `registry/MsmMobEffect`, effect registration first, `LoadReport.effects`, late checks for attribute, particle and sound ids; `ItemComponents.Throwable`, `registry/MsmThrowableItem`, `registry/MsmThrownItem`, the entity type and dispenser behaviour, the renderer in `client/MsmRuntimeClient`; `Action.Damage`, `Action.Heal`; `ScriptEntity` and `ScriptEvents.ACTION` additions; test definitions under `src/gametest/resources/msm/msm_test/{effect,item}/`.
Acceptance:
- JUnit: `ConformanceCorpusTest` covers the `effect-` prefix and the new item and action cases; `DefinitionParserTest` gains effect decoding, defaults, a dropped event, `play_animation` dropped, throwable conflicts ("none is applied"); `ScriptApiContractTest` green.
- Required GameTests (new classes `MsmEffectGameTest`, `MsmThrowableGameTest`; at least): effect registered with category and colour; attribute modifier scales with level and is removed with the effect; `on_start` once; `on_tick` at `interval_ticks` and faster with `faster_per_level`; `on_end` on removal and the expiry finding; `damage` and `heal` actions; a consumable and `apply_effect` give a custom effect; script `hasEffect`, `effectLevel`, `removeEffect`, `ActionEvent.other` from an `on_tick` `run_script`; throw on use spawns `msm_runtime:thrown_item` with the item, speed and owner; gravity override changes the fall; entity hit deals `damage` and fires `on_hit_entity` with the victim as `other`; block hit fires `on_hit_block`; each `after_throw` mode (stack count, dropped item, returned item, durability); `charge_ticks` release before and after the threshold; cooldown; dispenser shoots one; `msm:on_use` plus throwable.
- `./gradlew build` green for 26.3 and 26.4, also with `-PwithoutGeckolib` (throwables must work without GeckoLib).
- Findings (expiry and `AFTER_REMOVE`, the use animation, any seam, tracking numbers) written for the ADR Status sections; Wave 3 does not start before they are in.
Out of scope: `engine-mod/parity/**`, Gradle and version files, the app.

**B204 Plugin `blocks-items` (Opus).** Owns `packages/plugins/blocks-items/**`, the blocks-items rows of `packages/plugins/CLAUDE.md`.
Scope: `effectKind` (`defaultData`, `hiddenPaths`, `registry: 'mob_effect'`), `lowering/effect.ts` (definition without `display_name`, lang key), `definitionPath('effect', …)`, validators as section 2, templates (three effect, one throwable item), `DELAYED_PASSTHROUGH_COMPONENTS` untouched.
Acceptance: plugin tests with goldens under `test/fixtures/<target id>/expected/effect/` for both targets; a validator test per new conflict pair and per event reference; every template passes `validateJson` against the kind schema on both targets.
Out of scope: the library, the app, exporters.

**B205 App Studios (Opus).** Owns `app/src/renderer/src/studios/blocks-items/**`, the "New texture…" kind list and its test, the sidebar's friendly kind names, `app/test/**` files it adds or that cover those paths (not `e2e/`).
Scope: `EffectStudio.tsx` registered through `studios.tsx` (never `ElementForm.tsx`): category, colour, icon thumbnail with the missing-icon warning and a "paint icon" shortcut, stat changes list, tick, start and end sections reusing `EventsEditor`; `ItemStudio` "Throwable" section; `EventsEditor` gains "Hurt" (`damage`) and "Heal" (`heal`) and offers project effects in the `apply_effect` picker; the live preview shows the icon with the name coloured by category.
Acceptance: component tests for the Studio, the throwable section and the two actions; a test that `projectRegistryIds` yields `mob_effect` ids from `msm:effect` elements (JSON forms and the mcfunction checker then know them; fix in `session/schema-context.ts` if they do not, and say so); form-coverage baseline does not grow; `pnpm build` and `node tools/check-size/index.ts` within budget.
Out of scope: Creator dialog files, e2e, guide.

**B206 Exporters (Sonnet).** Owns `packages/exporters/src/**`, `packages/exporters/test/**` except `library.test.ts` and the three `sample-*.golden.test.ts`.
Scope: `java-project` routes `msm/<ns>/effect/` to `JavaProjectInput.effects` and reports an unknown kind folder instead of treating it as an entity (F12); confirm the content jar and manifest carry `effect` files with no kind list to extend (fix if there is one).
Acceptance: exporter unit tests for the routing, an unknown folder, and a jar containing an effect definition. Out of scope: the generator, samples.

### Wave 3: mirrors and content (three in parallel, after B203's findings)

**B207 Java eject, 26.3 generator (Opus).** Owns `packages/targets/mc-26.3/src/java-project/**`, `packages/targets/mc-26.3/test/**` for it, the generator lines of `packages/targets/CLAUDE.md`.
Scope: section 2 "Java eject", mirroring B203's classes exactly (the runtime is the reference implementation); new `effects.ts`, templates `mob-effect-base-java.ts` and `thrown-item-entity-java.ts`; `client.ts` and `index.ts` for the client entrypoint rule; `actions-java.ts`.
Acceptance: generator tests with goldens made from B203's GameTest definitions (effect kitchen sink, each `after_throw`, throwable without entities gives a client class with no GeckoLib import, effects only gives none); `JAVA_KEYWORDS` and name clashes covered; the real compile is B210's CI run.
Out of scope: 26.4 (no generator there), exporters.

**B208 Library (Opus).** Owns `packages/plugins/library/**`, `examples/**` (mirror, `UPDATE_GOLDENS=1`), `packages/exporters/test/library.test.ts`.
Scope: starters `status-effect.ts` and `throwable.ts` with `creator` metadata (group `magic` and `gear`), `content/effects.ts` shared pieces, `assets/png.ts` patterns (`effect_icon` 18 by 18, `ball`, `knife`, `boomerang`, `flask`), the two examples.
Acceptance: parameter tests for every choice; every attribute and effect id checked against both targets' vendored registries; exporter alternatives for at least: effect with a drink, effect with a flask, heal effect with no item, each throwable style; pattern goldens; all bundles pass the project validators on both targets.
Out of scope: Creator dialog rendering, guide.

**B209 AI helper (Sonnet).** Owns `packages/ai/src/system-prompt.ts`, `packages/ai/test/**`, the app's scripted-scenario test file for the new scenario.
Scope and acceptance: the prompt paragraph; tests assert the catalogue still has 22 tools in the same order and unchanged schemas; the scripted "poison dart" build (plan, `add_starter` or `create_elements`, `run_checks` clean, one-step Apply). Out of scope: new tools.

### Wave 4: samples, parity, Creator and docs (two in parallel)

**B210 Samples and parity (Opus).** Owns `fixtures/sample-mod/**`, `fixtures/sample-script/**`, `packages/exporters/test/sample-*.golden.test.ts`, `engine-mod/parity/**`, `.github/workflows/ci.yml` only if a step must change.
Scope: the sample mod gains an effect (`ruby_rush`: beneficial, speed modifier, heal on tick), a drink that gives it, a throwable (`ruby_dart`: damage, `drop`, gives `ruby_rush`'s harmful sibling or a vanilla effect on hit) and a boomerang-style `return` item; the sample script gains an `on_tick` handler; README in-game checklist.
Acceptance, the refusal rule of `HANDOFF.md`: **every runtime component added by B203 has a parity GameTest** in `SampleModParityTest`, black-box (vanilla and Fabric API only): effect present in the registry with category and colour; modifier value at levels I and II; tick heal observed; start and end observed through their actions; drink gives the effect; throw spawns a projectile that carries the item; hit damages and gives the effect; `drop` and `return` outcomes; `damage` and `heal` actions. All pass on the content jar and on the ejected jar on 26.3 (CI `engine-mod`), content jar on 26.4; a negative run proves they can fail; sample goldens (jar and Java tree SHA-256) updated; headless server checks green; the sample script server check shows the handler loaded.
Out of scope: runtime source.

**B211 Creator, e2e and guide (Opus).** Owns `app/src/renderer/src/components/creator/**`, `app/e2e/creator-path.spec.ts`, `app/e2e/blocks-items-path.spec.ts`, `app/e2e/eject-path.spec.ts`, `docs/guide/**` (except the table B201 edited, which it now owns too), `site/.vitepress/config.ts`, `CHANGELOG.md` `[Unreleased]`.
Scope: group "Magic" and cards for the two flows; previews (effect: icon, name in category colour, a per-level table of stat changes and tick results; throwable: item sprite, a small arc sketch from speed and gravity, damage and after-throw line); guide page `effects-and-throwables.md` with sidebar entry, and updates to `creator.md`, `blocks-and-items.md`, `scripting.md`, `eject.md`, `ai-helper.md`.
Acceptance: e2e `creator-path` builds a Status effect with a drink and a Throwable, edits one answer, exports the Fabric jar and finds `msm/<ns>/effect/<id>.json`, the icon PNG and the item definition with `msm:throwable`; `blocks-items-path` creates an effect in the Studio, adds a tick action and a throwable section to an item, Undo works; `eject-path` ejects a project with both and finds `ModEffects.java` and `ThrownItemEntity.java`; all e2e green under `xvfb-run -a`; check-size within budget.
Out of scope: release.

### Close (main session)

Clean-worktree verification of each commit and of the tip (HANDOFF step 5), CI `ci` and `engine-mod` green on the exact commit, then: ADRs 0055 and 0056 accepted with findings; DESIGN updated; ROADMAP add-on ticked, the two items struck from "Post-1.0 Ideas" with the remaining follow-ups (3D thrown models, return flight, custom arrows, instant effects, brewing) left there, Milestone Log row with counts from the plugins and the clean run; scoped `CLAUDE.md` status lines; CHANGELOG; version bump of `app/package.json` and `mod_version` together; this file deleted; `HANDOFF.md` rewritten.

## 4. What needs the user

Decisions, each with the default the plan uses unless the user says otherwise:

1. **Thrown look:** the thrown item is drawn as its item picture facing the camera (like a snowball), for every style. A trident-like 3D model in flight and a real return flight are left for later. Default: accept.
2. **Boomerang:** "return" puts the item back in the inventory when it lands, with no flight back. Default: accept for this version.
3. **Potions:** custom effects come from drinks, food, totems, throwables, events and commands; no brewing stand recipes and no entries in the vanilla potion list. Default: accept.
4. **Names:** kind `msm:effect`, component `msm:throwable`, entity type `msm_runtime:thrown_item`, Creator flows "Status effect" (new group "Magic") and "Throwable" (group "Gear"). Default: as written.
5. **Release:** ship in the next version together with the unreleased work since 1.3.0 (Dimension flow, launch, Wishlist, picture options), as 1.4.0, after the user's Windows test of the 1.3.0 draft. Default: 1.4.0.

In-game checks only the user can do (the container has no OpenGL): the effect icon in the inventory and the HUD corner and its name and colour in tooltips; the tinted particles around the player; the thrown item visible in flight, from first and third person; the hold-to-throw arm animation (and which of the two animations looks right); a dispenser shooting a throwable; picking a dropped knife up again; the Creator's Status effect and Throwable results in a real world. The checklist goes into `fixtures/sample-mod/README.md` (B210).
