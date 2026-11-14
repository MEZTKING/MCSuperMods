# ADR 0058: Event actors, entity-scoped script commands and cancel resync

## Context

Three suspects of the coverage audit (S4, S6, S7) share one theme: the runtime acts on the wrong thing or leaves the client out of step. Facts read on 2026-11-13 with `javap` (JDK 25.0.5) over the Loom-cached merged jars (26.3 and 26.4-snapshot-7) and from this repository (the full fact table lived in the working plan, deleted at close; see the DEVLOG entry of 2026-11-14):

- `MsmBlock.stepOn` receives the stepping `Entity` but builds `EventContext.forBlock(server, pos, player)` with `player` null for a non-player, so `entity` and `other` are null. `launch`, `apply_effect`, `damage`, `heal` and `run_function`'s `@s` do nothing for mobs. The step cooldown key is position and UUID without the dimension (audit S10). `Block.stepOn` is the same on 26.4.
- `EventContext.entity` also selects the sound source (`NEUTRAL` when set, else `BLOCKS`) and `ActionEvent.entity`; the script API documents `ActionEvent.entity` as "The entity involved, when there is one", so a stepping mob needs no contract change.
- `ScriptWorld.source` is `server.createCommandSourceStack()` with level, permission level 2 and suppressed output. That source uses the respawn dimension's spawn point, rotation zero and no entity: script commands run at the **world spawn point**, not the origin as the audit first wrote, with no `@s`.
- After every use-on-block packet, `handleUseItemOn` sends block updates for the clicked position and for its neighbour on the clicked face, whatever the result. `destroyAndAck` sends the block back when `destroyBlock` returns false. `handleUseItem` sends nothing after `useItem`, and nothing resends an inventory slot. `AbstractContainerMenu.sendAllDataToRemote()` and `broadcastFullState()` are public on both versions.
- So S7 is narrower than written: a cancelled `block.interact` already corrects the clicked block and the placement position. What stays stale is the held stack's count or durability, the second block of a two-block placement (door, bed, tall plant), a client-predicted cooldown of an MSM item after a cancelled `item.use`, and anything a cancelled `entity.interact` predicted (bucket, shears, name tag).

## Decision

- **D1 Step events carry the stepper (S4).** `EventContext` gains a `source` enum (`BLOCK`, `ITEM`, `ENTITY`, `EFFECT`, `THROWN`) and a factory `forBlockStep(level, pos, stepper)`: `player` is the stepper when it is a player; `entity` is the stepper when it is not; `other` is the stepper when it is living. In `msm:on_step` both `self` and `other` mean whoever stepped, exactly as before for players, and `launch` also moves non-living steppers (items, minecarts). Block events keep `SoundSource.BLOCKS`. In a block step event `run_function` runs as the stepper (`@s`, its rotation) when there is no player. Entity, effect and thrown-item events keep today's function source (player only); changing those is not part of this batch (default, vetoable). `ActionEvent.entity` is the stepping mob (doc string only). The cooldown key gains the dimension (S10). Thin shapes and sneaking follow vanilla's `stepOn` rules; `on_entity_inside` stays in audit B4.
- **D2 Script commands (S6), additive.** Existing calls keep their behaviour and get an honest doc string ("at the world spawn point, with no `@s`"). New: `World.runCommand(command, at?: Pos)` and `World.runFunction(id, at?: Pos)` run at `at`; `Entity.runCommand(command): number` and `Entity.runFunction(id): boolean` run as and at the entity (its level, position and rotation; `@s` is the entity), permission level 2, output suppressed, same return values as the `World` forms. Both do nothing and return 0 or `false` for an entity that is not in a server level. The contract `version` stays 1.
- **D3 Cancel resync (S7).** After a script cancels `block.interact`, `item.use`, `entity.interact` or `block.break`, the player's inventory state is sent (`inventoryMenu.sendAllDataToRemote()`). `block.interact` also sends block updates for the six neighbours of the placement position (clicked position offset by the clicked face), covering two-block placements beyond what vanilla resends. `item.use` also clears a client-predicted cooldown of the used stack if a packet for that exists (verify at implementation; else recorded as a known limit). `block.break` relies on vanilla's own block resend and adds the block entity packet only if a GameTest shows a gap. `entity.hurt` needs nothing. Resync runs once per cancelled call, only for real `ServerPlayer`s, and is skipped when no script cancelled. There is no API change; the guide says what a cancel restores.
- **D4 Parity for script behaviour.** Scripts are not ejected (ADR 0033), so D2 and D3 get runtime GameTests plus a new content-jar-only parity class `SampleScriptParityTest` (a fifth parity run per version). The "ejected jar" half is not applicable, and the plan says so rather than skipping silently.

## Consequences

- Script API v1 grows additively: two optional arguments, two `Entity` methods and corrected doc strings. The JSON, the typings and `ScriptApi` move together (`ScriptApiContractTest` ties them).
- Jump pads, conveyors and effect blocks work on mobs and items; behaviour for players is unchanged.
- The Java eject (26.3 generator) mirrors `source`, `forBlockStep`, the function source rule and the dimension key.
- A cancelled interaction costs one inventory resend; cooldown and entity-interaction predictions may remain stale where no packet exists.
- A runtime older than the release that ships this lacks the new script members; scripts using them fail with a script error there.

## Status

Accepted (2026-11-14). The decisions above stand as written.

### Implementation findings

- **Step events.** `EventContext` has a `source` field and the factory `forBlockStep`. Block events play their sounds as `BLOCKS`. `run_function` in a block event runs as the stepper, without a player. The step cooldown is keyed on dimension, position and entity.
- **Script commands.** `Entity.runCommand` and `Entity.runFunction` run as and at the entity; `World.*` take an optional `at`.
- **Resync after a cancel.** The inventory is always resent. `block.interact` also resends the six neighbours of the placement; `block.break` resends the block and its block entity. `item.use` sends `ClientboundCooldownPacket(group, 0)`, which clears a client-predicted cooldown (the packet exists, so this is not a known limit). A refused follow-up also resyncs.
- **Parity.** Script behaviour is observed through recording connections (`ParityEars`). `SampleScriptParityTest` runs on content jars only, because scripts are not ejected.
