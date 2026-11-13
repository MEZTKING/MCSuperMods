# ADR 0055: Custom status effects (`msm:effect`)

## Context

[ADR 0044](0044-gear-weapons-and-consumables.md) D8 deferred custom status effects: `MobEffect` is a code registry, and a useful effect needs tick behaviour. The user asked on 2026-11-13 for custom status effects and throwables. Facts read from the 26.3 client jar, the vendored registries and Fabric API 0.165.2+26.3 (full table in `docs/PLAN-effects-throwables.md` section 1):

- Mob effects are not data driven: the vanilla-mcdoc `minecraft:resource` dispatcher has no `mob_effect` entry, and `registries.json` lists 40 built-in ids.
- `MobEffect` has a protected constructor `(MobEffectCategory, int)` (and a particle variant), `applyEffectTick`, `shouldApplyEffectTickThisTick`, `onEffectStarted`, `addAttributeModifier` and `withSoundOnAdded`. There is no "removed" or "expired" hook on the class; the signatures are identical on 26.4-snapshot-7.
- Fabric API has `ServerMobEffectEvents` (`AFTER_ADD`, `BEFORE_REMOVE`, `AFTER_REMOVE`). Whether `AFTER_REMOVE` fires on natural expiry, and that the 26.4 Fabric API has it, is (verify at implementation).
- Effect icons are `textures/mob_effect/<name>.png`, 18 by 18, picked up through the `gui` atlas directory source `mob_effect`; the name key is `effect.<ns>.<path>`. That another namespace's icons are found without an atlas file is expected from the directory source, (verify in game).
- Every field that takes a `mob_effect` id already works for a registered custom effect: `consumable` effects, `death_protection`, `potion_contents`, `suspicious_stew_effects`, `apply_effect`, `/effect`. The runtime looks effects up in `BuiltInRegistries.MOB_EFFECT`.
- The runtime ignores unknown kind folders under `msm/` with a warning, and items register after blocks. The `java-project` exporter treats any folder other than `block` and `item` as an entity, so an `effect` folder would be misrouted.

## Decision

- **D1 Kind.** `msm:effect` in `@msm/plugin-blocks-items` (no new plugin, no lockfile change): folder `effect`, `registry: 'mob_effect'`, so every `#[id="mob_effect"]` field resolves project effects. Element ids are the registry ids.
- **D2 Definition.** `msm/<ns>/effect/<path>.json` (`::msm::definition::Effect`, schema ref `msm:effect_definition`):

  ```
  struct Effect {
    format: 1,
    category: ("beneficial" | "harmful" | "neutral"),
    color: int @ 0..16777215,                  // potion particle and bar colour
    particle?: #[id="particle_type"] string,   // a simple particle type instead of the tinted swirl
    sound?: #[id="sound_event"] string,        // played when the effect is added
    attribute_modifiers?: [struct { attribute: #[id="attribute"] string, amount: float,
      operation: ("add_value" | "add_multiplied_base" | "add_multiplied_total") }],  // amount x level, as vanilla
    components?: struct {
      "msm:on_start"?: struct { event: string },
      "msm:on_tick"?:  struct { event: string, interval_ticks?: int @ 1.. /* 20 */, faster_per_level?: boolean },
      "msm:on_end"?:   struct { event: string },
    },
    events?: struct { [string]: Event },
  }
  ```

  Element data (`::msm::element::Effect`) adds `display_name`, lowered to `effect.<ns>.<path>` in `en_us` (`merge: 'object'`). The icon is a project asset at the fixed path `assets/<ns>/textures/mob_effect/<path>.png` (18 by 18); it is not a field. Instant effects (`applyInstantaneousEffect`) are out of scope.
- **D3 Runtime.** `DefinitionScanner.KINDS` gains `effect`; `MsmRegistrar.registerAll` registers effects first. `MsmMobEffect extends MobEffect`: constructor with category, colour and optional particle; one `addAttributeModifier` per entry with the id `<ns>:effect.<path>.<index>`; `shouldApplyEffectTickThisTick` is `duration % interval == 0` with `interval = max(1, interval_ticks / (amplifier + 1))` when `faster_per_level`; `applyEffectTick` fires `msm:on_tick` and returns `true`; `onEffectStarted` fires `msm:on_start` on the server; `msm:on_end` fires from `ServerMobEffectEvents.AFTER_REMOVE`. If natural expiry is not covered, the GameTest finding goes into this ADR's Status and `on_end` is documented as "removed early" only. Event context: origin and base at the holder; `player` is the holder when it is a player; `entity` and `other` are the holder, so `self` and `other` both mean the holder. `play_animation` is dropped at load with a warning, as for blocks and items. No Mixin.
- **D4 Two actions**, usable in every definition: `damage { amount: float @ 0.., target?: EffectTarget }` (`hurtServer` with `damageSources().magic()`) and `heal { amount: float @ 0.., target?: EffectTarget }`. With them poison-like, regeneration-like and burst-on-hit effects need no script. The Events editor lists them as "Hurt" and "Heal".
- **D5 Script API v1, additive** (`script-api-v1.json` first, then `ScriptEntity`; the contract test ties them): `Entity.hasEffect(id): boolean`, `Entity.effectLevel(id): number` (0 when absent, else amplifier + 1), `Entity.removeEffect(id): boolean`, and `ActionEvent.other: Entity | undefined`. The script tick hook is `msm:on_tick` with a `run_script` action; there are no new global script events.
- **D6 Icons, colours, particles.** Colour drives the vanilla tinted particles and the HUD bar. The Creator writes a tinted 18 by 18 placeholder icon, and "New texture..." gains the kind "Effect icon". The app (not the plugin, which cannot see assets) warns in the Effect Studio when the icon file is missing.
- **D7 Ways to get the effect** are existing content: `msm:consumable` drinks and food, `msm:death_protection`, `apply_effect`, throwables ([ADR 0056](0056-throwables.md)), `/effect`. The vanilla `Potion` registry and brewing are not touched (also code registries). Default, vetoable: no brewing stand recipes and no entries in the vanilla potion list.
- **D8 Versions.** Shared runtime code only (the `MobEffect` signatures are identical on 26.4): no `src/mc/<mc>` seam is expected and there is no `supports` gate; the kind and its flows work on 26.4. The Java eject stays 26.3 only, as today. A runtime older than the release that ships this logs "unknown kind 'effect'" and items naming the effect fail to resolve it; mcdoc doc comments name the minimum runtime version, as `launch` does.
- **D9 Plugin API 1.6.0 (additive).** `JavaProjectInput.effects?: DefinitionInput[]` ("Since 1.6.0"). The `java-project` exporter routes `msm/<ns>/effect/` files there, never into `entities`, and reports an unknown kind folder instead of treating it as an entity. The content jar and manifest carry `effect` files with no kind list to extend (confirmed at implementation).
- **D10 Java eject (26.3 generator).** `ModEffects.java` and `effect/<Name>Effect.java` mirror `MsmMobEffect`, with the runtime as the reference implementation. A client entrypoint exists when the project has entities **or** throwables (ADR 0056 D4), with GeckoLib imports only for entities. `Actions.damage` and `Actions.heal` are written only when used.
- **D11 Creator flow, templates, examples, AI helper.**
  - Library starter **Status effect** (new Creator group "Magic"): name, colour, good, bad or neutral; "what it does": nothing extra, heals, hurts, particles, runs a function; amount and "every N seconds", "stronger levels act faster"; up to two stat changes from a fixed list checked against each target's `attribute` registry (movement speed, attack damage, max health, armour, jump strength, scale, and so on); "how players get it": a drink (`msm:consumable`, glass bottle back, optional recipe), a throwable flask (ADR 0056, effect on the mob hit), or nothing. It writes the effect, the tinted icon, the optional item, model, texture, recipe, name and `msm:mod`.
  - Templates "Status effect", "Damage over time effect" and "Stat boost effect" (kind `msm:effect`); examples "Frost bomb" (a throwable giving a custom slowing effect) and "Scripted effect" (`msm:on_tick` with `run_script`). Counts are taken from the plugins at close.
  - AI helper: no new tool (the 22-tool catalogue, its order and schemas stay byte-identical). One system prompt paragraph: effects are `msm:effect`, throwables are `msm:throwable`, prefer the two starters, a per-tick script goes through `msm:on_tick` and `run_script`, and 3D thrown models and custom arrows are still gaps for `note_missing_feature`.
- **D12 Validators (`blocks-items.*`).** The event reference check extends to effect components. The interval nests inside `msm:on_tick`, so no `effect-interval-without-tick` check is needed. No asset checks in the plugin.
- **D13 Names.** Kind `msm:effect` and the Creator flow "Status effect" in the new group "Magic" are the default, vetoable.

## Consequences

- Format 1 grows additively: one kind, two actions, four script members. The corpus (prefix `effect-`), Codecs and the eject generator move together.
- The runtime gains `MsmMobEffect` and registers a second registry type before items; a project that names a custom effect needs the runtime release that ships this.
- Plugin API goes from 1.5.0 to 1.6.0, additive.
- Custom effects are not brewable and do not appear in vanilla potion lists.
- Follow-ups left in the ROADMAP: instant effects, brewing and potion registry entries.

## Status

Proposed (2026-11-13). Findings from the runtime brief (expiry and `AFTER_REMOVE`, any 26.4 seam, the 26.4 Fabric API) are added here before the mirrors are written. Accepted on close.

Runtime findings (B203, 2026-11-13; GameTests 97 of 97 on 26.3, 26.3 without GeckoLib and 26.4):

- `msm:on_end` fires both when the effect is removed and when it runs out: in 26.3 `LivingEntity.tickEffects` calls `onEffectsRemoved` after removing an expired instance, and Fabric's `ServerMobEffectEvents.AFTER_REMOVE` fires from there (GameTest `onEndFiresOnExpiry`).
- `msm:on_start` hooks `MobEffect.onEffectAdded`, not `onEffectStarted` (departs from D3): `addEffect` calls `onEffectStarted` on every call, refreshes included, while `onEffectAdded` runs only when the effect is new.
- `msm:on_tick` and `msm:on_end` run at Fabric `END_SERVER_TICK` in the same tick, not inside `tickEffects`: an action that adds or removes an effect while vanilla iterates the holder's effect map would throw `ConcurrentModificationException`. Queued events are skipped once the holder is removed. `msm:on_start` runs at once. The Java eject must mirror both rules.
- The tick interval is `duration % interval == 0` with `interval = max(1, interval_ticks / level)` when `faster_per_level` (level = amplifier + 1); infinite effects tick on `tickCount`.
- In effect events `self` and `other` are both the holder.
- Attribute, particle and sound ids are checked when the effect is built (built-in registries are bootstrapped by then): an unknown particle keeps the tinted swirl with a warning, an unknown sound plays nothing with a warning, an unknown attribute is an error and that modifier is skipped. Custom sound events are not registered yet (coverage audit S1).
- No 26.4 seam was needed; Fabric API 0.165.4+26.4 has `ServerMobEffectEvents`.
