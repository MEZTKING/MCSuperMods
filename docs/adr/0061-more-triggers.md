# ADR 0061: More triggers

## Context

The event model has a small set of triggers: item `on_use`, block `on_interact` and `on_step`, entity `on_hurt`, `on_death` and `on_interact`, and the effect and throwable triggers (coverage audit L6, backlog B4). A project cannot react to a hit with its sword, a click on a block, an item held or worn, a block being broken or placed, a random block tick, an entity inside a block, or a mob's tick and spawn. Facts read on 2026-11-13 (`docs/PLAN-vanilla-additions.md` section 1, V9–V11):

- Item hooks, the same on 26.3 and 26.4: `postHurtEnemy(ItemStack, LivingEntity target, LivingEntity attacker)`, `useOn(UseOnContext)`, `inventoryTick(ItemStack, ServerLevel, Entity, EquipmentSlot)` (server only), `onCraftedBy`. `Inventory.tick` calls `inventoryTick` for every main inventory stack with `MAINHAND` for the selected slot and `null` otherwise; `EntityEquipment.tick` calls it for every equipment slot with that slot. Whether the main hand is reported by both paths in one tick: (verify at implementation; the acceptance test is "exactly once per interval").
- Block hooks, the same on both: `playerWillDestroy`, `setPlacedBy`, `randomTick` with `Properties.randomTicks()`, `entityInside`, `onPlace`. `spawnAfterBreak` differs (26.4 adds an `Entity` argument) and is not used.
- Entity hooks, the same on both: `Mob.customServerAiStep(ServerLevel)` and `Mob.finalizeSpawn(...)`.
- Actions already receive an `ActionEvent` that carries `player`, `entity`, `other` and `block` ([ADR 0058](0058-event-actors-entity-commands-and-cancel-resync.md)), so scripts reach any trigger through `run_script`.

## Decision

- **D1 Item components** (each `{ event }` plus the fields named): `msm:on_hit` (`postHurtEnemy`; self is the attacker, player or mob; `other` is the entity hit); `msm:on_use_on_block` (`useOn`; `cooldown_ticks?`; `base` and `block` are the clicked block; the result and cooldown are applied on both sides as `msm:on_use` does, the event on the server; `useOn` runs before `use`, so no conflict with right-click owners such as `msm:throwable` arises); `msm:while_held` (`interval_ticks?: int @ 5..`, default 20; `hand?: ("main" | "off" | "either")`); `msm:while_worn` (`interval_ticks?` as above; fires in the armour slot of `msm:armor`, an error without it).
- **D2 Block components:** `msm:on_break` (`playerWillDestroy`, any game mode; self is the player); `msm:on_place` (`setPlacedBy`; self is the placer when there is one); `msm:on_random_tick` (`chance?: float @ 0..1`, default 1; `randomTicks()` only when the component is present); `msm:on_entity_inside` (`cooldown_ticks?: int @ 5..`, default 20, per entity, actor rule of ADR 0058 D1; it fires only for blocks an entity can be inside, so the validator warns unless `msm:shape` is non-full or walk-through).
- **D3 Entity components:** `msm:on_tick` (`interval_ticks?: int @ 5..`, default 20; `customServerAiStep`) and `msm:on_spawn` (`finalizeSpawn`: natural, egg, spawner; not on chunk load).
- **D4 Tick cost limits.** Intervals are at least 5 ticks; firings are staggered by entity id; one shared counter stops tick-trigger firings (`while_held`, `while_worn`, `on_tick`, `on_entity_inside`, `on_random_tick`) at 2,000 per server tick and logs once a minute when it skipped any (default, vetoable); the per-entity cooldown map of `msm:on_step` is generalised and bounded. The validator reports info `blocks-items.fast-tick-trigger` when an interval under 20 runs `run_function` or `run_script`.
- **D5 No script API change.** Scripts reach every trigger through `run_script`.
- **D6 Eject and versions.** The 26.3 generator mirrors each override; shared runtime code, no seam. Deferred: `on_crafted`, block neighbour-change, entity `on_death` beyond the existing triggers, client-side triggers.

## Consequences

- Format 1 grows additively by ten components; the corpus (prefix `trigger-`), the Codecs, the validators and the eject generator move together.
- Tick triggers have a cost ceiling that can skip firings under extreme load; the log line says so.
- `on_use_on_block` applies result and cooldown on both sides, as `on_use` does, to avoid ghost placements.
- A project using the new components needs the runtime release that ships them.

## Status

Proposed (2026-11-13). Defaults the user may veto: the 5-tick minimum interval and the 2,000 firings per server tick. Findings from the runtime brief (the main-hand double report, any seam) are added here before the mirrors are written. Accepted on close.
