# ADR 0065: Script API 1.1

## Context

Scripts can read and move entities and worlds but cannot read a player's inventory or armour, change XP, hunger or game mode, show titles or boss bars, deal typed damage with an attacker, cast a ray, teleport across dimensions or react to a respawn, leave or chat message without commands (coverage audit backlog B5 and L12). Facts read on 2026-11-14 (the working plan is deleted at close and its findings live in this ADR; sources: `javap` over the Loom-cached merged jars for 26.3 and 26.4-snapshot-7, the pinned Fabric API module jars, this repository):

- Player state is public API: `ServerPlayer.setExperienceLevels`, `setExperiencePoints`, `giveExperienceLevels`, `giveExperiencePoints`, `setGameMode`, `gameMode`; `Player.experienceLevel`, `totalExperience`, `getFoodData`; `FoodData` get and set for food level and saturation; `Inventory` get, set, size, selected slot, off-hand slot; `LivingEntity.getItemBySlot` and `setItemSlot`.
- Components: `ItemStack.getComponents`, `getComponentsPatch`, `set`, `remove`, `applyComponentsAndValidate(DataComponentPatch)`; `DataComponentPatch.CODEC`; `DataComponentType.codec()`.
- Packets for title text, subtitle, animation times, action bar and clear exist; `ServerBossEvent` has progress, name, colour, overlay, add and remove player.
- `DamageSource(Holder<DamageType>, Entity direct, Entity causing)`; `LivingEntity.hurtServer`; `BlockGetter.clip(ClipContext)` and `ProjectileUtil.getEntityHitResult`; `Entity.teleportTo` with a level and `teleport(TeleportTransition)`.
- Fabric events present in both builds: `ServerPlayerEvents.AFTER_RESPAWN`, `LEAVE`, `JOIN`; `ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL`; `ServerLivingEntityEvents.AFTER_DAMAGE` (`ALLOW_DAMAGE` cannot change the amount); `ServerMessageEvents.ALLOW_CHAT_MESSAGE`; `ServerEntityCombatEvents.AFTER_KILLED_OTHER_ENTITY`. There is no block-place event without a mixin, and the runtime has no mixins.
- The contract is `script-api-v1.json` (`version: 1`; 17 types; 9 events; `msm.events.on` is one overload per event); it generates `msm-runtime.d.ts`, and `ScriptApiContractTest` compares type names, `extends`, member names and kinds, parameter counts, and per event its type, `cancellable` and Fabric source. Typings properties are all `readonly`. Scripts are not ejected ([ADR 0033](0033-java-project-eject-v1.md)), so script parity is content-jar only ([ADR 0058](0058-event-actors-entity-commands-and-cancel-resync.md) D4).

## Decision

Additive: `version` stays 1, every existing member keeps its meaning, and the JSON, the typings golden and `ScriptApi` change in one push (`ScriptApiContractTest`). "1.1" is a documentation name; new doc strings say "Since runtime <release version>" (verify at implementation). This amends [ADR 0032](0032-script-api-v1-and-typings.md).

- **D1 Items.** `ItemRef` (still a copy) gains `name`, `maxCount`, `damage`, `maxDamage`, `hasComponent(id)` and `getComponent(id): unknown` (the component's codec output as a JSON value). New `ItemSpec = string | { id, count?, components? }` (components decoded with `DataComponentPatch.CODEC`, applied validated); `Player.give` accepts it.
- **D2 Inventory.** `Player.inventory: Inventory` with `size`, `selectedSlot`, `get(slot)`, `set(slot, item?: ItemSpec)`, `count(item)`, `remove(item, count?): number`, `find(item): number` and `setComponent(slot, id, value?)` (undefined removes). A slot is 0 to 35 or `"mainhand" | "offhand" | "head" | "chest" | "legs" | "feet"`. Every living entity gains `Entity.equipment(slot): ItemRef | undefined` and `Entity.setEquipment(slot, item?)`.
- **D3 Player state.** `xpLevel`, `xpPoints`, `food`, `saturation`, `gameMode` (read); `addXp(points)`, `addXpLevels(n)`, `setXpLevels(n)`, `setFood(level, saturation?)`, `setGameMode(mode): boolean`. Each write has a test that the client is told.
- **D4 Screen text.** `Player.showTitle(title, options?: { subtitle?, fadeIn?, stay?, fadeOut? })`, `showActionBar(text)`, `clearTitle()`. `msm.bossBars.create(id, { title, color?, style?, progress? }): BossBar` and `get(id)`; `BossBar` has `setTitle`, `setProgress`, `setColor`, `setStyle`, `addPlayer`, `removePlayer`, `players()` and `remove()`. Bars belong to the script's namespace, at most 32 per namespace (default, vetoable), are not saved, and are removed on `/reload` and on stop (as `msm.schedule`).
- **D5 Damage.** `Entity.damage(amount, options?: { type?: damage type id, attacker?: Entity, direct?: Entity })`; without options it stays generic. An unknown type is a script error. This closes audit L12.
- **D6 Raycast.** `World.raycast(from, direction, maxDistance, options?: { fluids?, entities?, ignore? }): RayHit | undefined` and `Entity.raycast(maxDistance, options?)` from the eyes along the look; `RayHit { kind: "block" | "entity", pos, distance, block?, face?, entity? }`. More than 128 blocks (default, vetoable) is a `RangeError`.
- **D7 Teleport and worlds.** `Entity.teleport(pos, options?: { dimension?, yaw?, pitch? })`; `msm.getWorld(dimension): World | undefined`; `msm.players(): Player[]`. A wrapper stays valid after a cross-dimension move (non-players are re-created by vanilla, so the wrapper resolves by UUID).
- **D8 Events.** `player.tick` (`ServerTickEvents.END_SERVER_TICK`; `on("player.tick", fn, { interval? })`, default 20, minimum 5 ticks as [ADR 0061](0061-more-triggers.md) D4 (default, vetoable), staggered by entity id, counted by the shared limiter), `player.respawn`, `player.leave`, `player.changeDimension` (`from`, `to`), `player.chat` (cancellable, `message`) and `entity.damaged` (after damage, final `amount`). `EntityHurtEvent` gains `source` (damage type id) and `direct`.
- **D9 Limits.** Component values pass through `ScriptJson` (depth 128) and at most 64 KiB per call; the 2000 ms script budget is unchanged.
- **D10 Tests and parity.** Runtime GameTests for every member; `SampleScriptParityTest` on the content jars of both versions (no ejected half).
- **D11 Deferred:** `block.place` (no event without a mixin; project blocks have `msm:on_place` with `run_script`), changing the damage amount in `entity.hurt`, `msm.commands.register` (the command tree and reload order need a spike), a custom creative tab (a definition feature, not script), dropped items and projectiles in `entitiesNear`, and anything client-side.

## Consequences

- The contract JSON, the typings golden and `ScriptApi` grow together; a test asserts every member of the previous golden is still present with the same parameter counts.
- The sandbox surface grows: inventory writes, game mode, damage and teleport are now script powers, bounded by the existing budget and the new limits.
- Scripts that loop on `server.tick` can move to `player.tick` with its interval.
- No plugin API change: scripts are not part of `JavaProjectInput`.

## Status

Proposed (2026-11-14). Defaults the user may veto: the `player.tick` minimum of 5 ticks; 32 boss bars per namespace; the 128-block raycast limit.
