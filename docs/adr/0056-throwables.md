# ADR 0056: Throwables (`msm:throwable`)

## Context

[ADR 0044](0044-gear-weapons-and-consumables.md) D8 deferred trident-style throwables and custom projectiles: the thrown entity renders the vanilla trident model, so a custom one needs a projectile entity and a renderer. The user asked on 2026-11-13 for throwables together with custom status effects ([ADR 0055](0055-custom-status-effects.md)). Facts read from the 26.3 client jar and the vendored data (full table in `docs/PLAN-effects-throwables.md` section 1):

- No data component makes an item throw a projectile: none of the 122 `data_component_type` ids spawns an entity on use. Throwing is item class code.
- `SnowballItem` implements `ProjectileItem` and calls `Projectile.spawnProjectileFromRotation(factory, ServerLevel, ItemStack, LivingEntity, 0.0f, 1.5f, 1.0f)`. `TridentItem` has a throw threshold of 10 ticks, shoot power 2.5, base damage 8, and overrides `getUseAnimation`, `getUseDuration` and `releaseUsing`. `ItemUseAnimation` has `TRIDENT` and `SPEAR`.
- `ThrowableItemProjectile` (constructors, abstract `getDefaultItem()`, the stack as synched data), `ThrowableProjectile.getDefaultGravity()` (0.03) and `getAirDrag()` (0.99), `Projectile.onHit`, `onHitEntity`, `onHitBlock` and `getOwner()`, `DamageSources.thrown`, and `EntityType.Builder` are identical on 26.4-snapshot-7.
- Vanilla `ThrownItemRenderer` draws an entity's item as a camera-facing sprite; the trident's own renderer draws the vanilla trident model only.
- The renderer seam `client/EntityRendererRegistration` exists for both versions, but `MsmRuntimeClient` registers renderers only when GeckoLib is loaded today.

## Decision

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

  `consume` uses one item (snowball); `keep` uses none; `drop` leaves the thrown item where it lands (a throwing knife); `return` puts it back in the thrower's inventory when it lands, or drops it at their feet. `keep`, `drop` and `return` take one durability per throw when the item has `msm:durability`. Default, vetoable: `return` is a simple boomerang with no return flight in this version.
- **D2 Conflicts.** `msm:throwable` joins the exclusive set with `msm:ranged_weapon`, `msm:shield` and `msm:armor`, and is also an error with `msm:consumable`, `msm:food` or tool type `mace` (all own right-click or the item class): `blocks-items.component-conflict` in the app, "none is applied" in the runtime. It combines with `msm:tool` (other types), `msm:durability` and `msm:on_use` (the event fires, then the throw).
- **D3 Runtime.** `MsmThrowableItem extends MsmItem implements ProjectileItem`: `use` throws at once or starts using; `releaseUsing` throws after `charge_ticks`; `getUseAnimation` is `SPEAR` (or `TRIDENT`, chosen in game; verify at implementation); dispenser behaviour through `DispenserBlock.registerProjectileBehavior`. **One** entity type for all throwables, `msm_runtime:thrown_item`: `MsmThrownItem extends ThrowableItemProjectile` reads its behaviour from its item's definition; sized 0.25 by 0.25, tracking range 4, update interval 10 (the snowball's; verify at implementation). `getDefaultGravity` comes from the definition; `onHitEntity` deals `damage` then fires `on_hit_entity`; `onHitBlock` fires `on_hit_block`; `onHit` applies `after_throw` and discards. Hit event context: origin at the hit point, base the hit block (or the victim's block), `player` the thrower when a player, `other` the living entity hit, so `apply_effect`, `damage` and `launch` with `target: "other"` act on the victim and `self` on the thrower. No Mixin.
- **D4 Rendering.** The vanilla `ThrownItemRenderer` is registered for the one type in `MsmRuntimeClient` through the existing seam, whether or not GeckoLib is loaded: the thrown item looks like its item model, facing the camera. No GeckoLib dependency. Default, vetoable: this look applies to every style. Not in this version, recorded as follow-ups: a trident-like 3D model in flight, loyalty-style return flight, custom arrows for bows, GeckoLib projectile entities.
- **D5 Lowering** adds no files: the definition passes through; the item model and name are as for any item.
- **D6 Versions.** As [ADR 0055](0055-custom-status-effects.md) D8: shared runtime code, no `supports` gate, the Java eject stays 26.3 only. Examples that also contain a GeckoLib entity keep `hasGeckolib`.
- **D7 Java eject (26.3 generator).** Throwables become `item/<Name>Item` over a template, plus one `entity/ThrownItemEntity.java` registered as `<mod id>:thrown_item`; the client entrypoint rule is in ADR 0055 D10.
- **D8 Creator flow.** Library starter **Throwable** (group "Gear"): name, colour, style (ball, knife that can be picked up again, boomerang, bomb), damage, speed, gravity (floaty, normal, heavy), hold to throw, "when it hits": nothing, a vanilla effect from `EFFECT_CHOICES`, push away, place a block, burst (particles, sound and `damage`); stack size, optional recipe. Placeholder patterns `ball`, `knife`, `boomerang`, `flask` and `effect_icon`. Template "Throwable item"; example "Frost bomb" (see ADR 0055 D11). The flow name and group are the default, vetoable.
- **D9 Names.** Component `msm:throwable` and entity type `msm_runtime:thrown_item` are the default, vetoable.
- **D10 Release.** Shipped with the unreleased work since 1.3.0 as 1.4.0 (default, vetoable), after the user's Windows test of the 1.3.0 draft.

## Consequences

- Format 1 grows additively again (one component, the validator pairs, the hit events); the corpus (prefix `item-throwable-`), Codecs and the eject generator move together.
- The runtime gains `MsmThrowableItem`, `MsmThrownItem`, one entity type and a vanilla renderer registration that no longer depends on GeckoLib; dispensers shoot throwables.
- A runtime older than the release that ships this ignores the unknown component; throwables then do nothing.
- In-game checks only the user can do (the container has no OpenGL): the thrown item visible in flight from first and third person, the hold-to-throw arm animation (and which of the two animations looks right), a dispenser shooting a throwable, and picking a dropped knife up again. They go into the `fixtures/sample-mod/README.md` checklist.
- Follow-ups stay in the ROADMAP: 3D thrown models, return flight, custom arrows and GeckoLib projectile entities.

## Status

Proposed (2026-11-13). Findings from the runtime brief (the use animation, tracking numbers, any seam) are added here before the mirrors are written. Accepted on close.

Runtime findings (B203, 2026-11-13):

- Use animation: `SPEAR` while charging, `NONE` otherwise; whether `TRIDENT` looks better is an in-game check.
- `msm_runtime:thrown_item` copies the snowball's entity type settings read from 26.3 `EntityTypes`: no loot table, 0.25 by 0.25, tracking range 4, update interval 10.
- `ThrownItemRenderer` is registered through the existing `EntityRendererRegistration` seam on every client, with or without GeckoLib; no new seam. Compiled for 26.3 and 26.4, not run (no client in the container).
- Dispensers use vanilla's projectile behaviour, which always uses one item: `keep` from a dispenser loses the item, `drop` and `return` drop it where it lands.
- A throwable combined with armour, a ranged weapon, a shield, a consumable, food or a mace drops the throwable and the clashing components with an error; the existing tool and armour conflict check runs first.
