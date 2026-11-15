# ADR 0096: Commands, creative tabs, place and explosion events, and the small script and Rules gaps

## Context

[ADR 0065](0065-script-api-1-1.md) D11 deferred `block.place` ("no event without a mixin"), `msm.commands.register` ("the command tree and reload order need a spike"), a custom creative tab ("a definition feature, not script") and dropped items in `entitiesNear`. The research report (`popular-mods.md` section 3, rank 13) adds `entity.vehicle` and `passengers`, an explosion event that can keep blocks safe (anti creeper grief) and a "facing" reading for Rules (the conveyor belt example). Commands, creative tabs and game rules are vanilla systems; under the user's rule of 2026-11-14 they belong in the app.

Facts (plan F15–F18): Fabric's `CommandRegistrationCallback.EVENT` (`register(CommandDispatcher, CommandBuildContext, Commands.CommandSelection)`) and `FabricCreativeModeTab.builder()` are the same on both versions; Fabric API 0.165.2 and 0.165.4 have no block placement or explosion event in any module (all module jars searched); `BlockItem.place(BlockPlaceContext)` is public and `ServerExplosion.explode()` public with a private `interactWithBlocks(List<BlockPos>)`, both identical on 26.3 and 26.4. DESIGN §10 "Mixin policy" allows a Mixin where no event exists, with a justification comment and a GameTest. The runtime has no Mixin yet (audit L3).

## Decision

- **D1 Kind `msm:command`** (definition, frozen at start like other definitions; re-registered on every `/reload` if S8 confirms Fabric fires the callback again):

  ```
  struct Command {
    name: string,                    // the literal, lower case [a-z0-9_]; refused if vanilla or another project command has it
    aliases?: [string] @ 0..4,
    permission?: int @ 0..4,         // default 0: every player; 2 = operators, as vanilla's cheat commands
    arguments?: [Argument] @ 0..8,   // optional arguments only at the end
    function?: #[id="function"] string,   // run as and at the player or source, with the arguments as macro values
    event?: string,                  // an action list in the definition (ADR 0061 actions), context self = source entity
    feedback?: string,               // a lang key shown to the source on success
  }
  struct Argument { name: string, type: "integer" | "number" | "word" | "text" | "boolean" | "player" | "players" | "entity" | "position" | "block_position" | "item" | "block", min?: number, max?: number, optional?: boolean }
  ```

  A function receives the arguments as macro values (`$(name)`); scripts receive a `command` event with `name`, `source` and an `args` object. A command with neither `function` nor `event` is a validator error unless a script subscribes to it (a warning then). Permission 0 commands that run a function are an author's choice, like a data pack's `/trigger`; the validator gives an info line (`commands.runs-as-player`).
- **D2 Kind `msm:creative_tab`** (frozen): `icon: item id`, `title` (a lang key written by lowering from the editor's name), `order?: "as_listed" | "by_name"` (default `as_listed`). Items and blocks join by naming its id in their existing `creative_tab` field (today an unknown tab only warns, `MsmRegistrar`); the tab registers before blocks and items through `FabricCreativeModeTab.builder()` into the vanilla registry. A new project made by the Creator offers "Give my mod its own tab" (ADR 0101 D2).
- **D3 The first two Mixins.** In `engine-mod/src/main/java/.../mixin/` with `msm_runtime.mixins.json` (server side, `required: true`), each with a justification comment and GameTests on both versions:
  - `BlockItemPlaceMixin` at the head of `BlockItem.place(BlockPlaceContext)` when the context has a server player: fires the script event `block.place` (cancellable; `pos` is the placement position, `block` the item's block id, `item`, `player`) and the Rules trigger "When a player places a block". A cancel returns `FAIL` and resyncs the held slot and the position (ADR 0058's resync). Placement by dispensers, endermen and commands is not seen (limit Q17).
  - `ServerExplosionMixin` at the head of `explode()` fires `world.explosion` (`pos`, `radius`, `source` entity or null, `cause`: the direct source's type id or `"block"`); `cancel()` stops the explosion; `keepBlocks()` cancels the head of `interactWithBlocks`, so entities still take damage and knockback but no block breaks or drops. Rules: "When something explodes" with steps "Stop the explosion" and "Keep the blocks safe" and the condition "caused by <mob or block>".
  We chose Mixins because neither event exists in Fabric API and both are what the research's anti-grief and building-rule ideas need; both targets are public or private methods with identical signatures (F15, F16). The spike (S7) proves the Loom setup on both versions before any brief writes one.
- **D4 Script API 1.6** (vehicles take 1.5; renumbered at merge if needed): `Entity.vehicle` (`Entity | null`), `Entity.passengers` (`Entity[]`), `Entity.ride(entity)` and `Entity.dismount()` (refused for players riding players); `World.itemsNear(pos, radius)` returning `DroppedItem` objects (`item: ItemRef`, `pos`, `age`, `remove()`, `setItem(spec)`, `owner` uuid or null), while `entitiesNear` keeps living entities only; `ItemRef.contents` ([ADR 0095](0095-item-inventories.md) D5); events `block.place`, `world.explosion` and `command`. Members are labelled with the release that ships them at close.
- **D5 Rules additions** (catalogue and compile, [ADR 0082](0082-rules-no-code-behaviour.md)): the value **Facing** (of the player, of a mob, or of the block "here": its `facing` or `axis` property, as north, east, south, west, up or down), the condition **is facing**, the place **in front of here** (one block along the block's facing), the triggers **When a player places a block**, **When something explodes** and **When a player uses the command /…** (which makes the `msm:command` element for the user), and the steps **Stop the placing**, **Stop the explosion**, **Keep the blocks safe** and the condition **is riding** (a mob or vehicle, from `Entity.vehicle`). Compilation prefers plain events (the command's `event`, the explosion through the script bridge only when a step needs `cancel` or `keepBlocks`).
- **D6 Versions and eject.** No seam expected (F15–F18 identical). Plugin API 1.17.0 adds `TargetFacts.commands?: { vanillaNames: readonly string[]; argumentTypes: Readonly<Record<string, { parser: string; properties?: Readonly<Record<string, string>> }>> }` (a map from MSM's twelve argument names, because `player`, `players` and `entity` share one parser; amended at B444) (vanilla command literals from the vendored `commands.json`, for the clash check) and `ItemFacts.creativeTabs` is already the vanilla tab list. The 26.3 generator emits commands (a generated `ModCommands` with Brigadier builders) and creative tabs; the two events are script-only, and scripts are not ejected (L10), so the Mixins are not ejected.
- **D7 Not in this batch.** Client-side commands, custom argument types and suggestions beyond the listed types, changing explosion radius or knockback, placement events for non-players, `block.break` by non-players, cancelling vanilla commands, game rules of our own (ADR 0082 R10 lists them for a later batch).

## Consequences

- `msm_runtime` gains its first Mixin configuration; DESIGN §10's policy applies, and every later Mixin follows these two in package, naming and test shape.
- Commands make Rules and scripts reachable by players directly; the guide warns that permission 0 commands are for everyone.
- Two kinds (99 with vehicles' three) and one Script API minor.

## Status

Proposed (2026-11-14). Nothing about Mixins starts before the spike's S7 answer. Defaults the user may veto: commands as a kind with permission 0 by default (D1); macro arguments into functions (D1); creative tabs as a kind and items joining through `creative_tab` (D2); Mixins for the two events, `block.place` cancellable at the head and placements by players only (D3); `itemsNear` as a new method rather than a flag on `entitiesNear` (D4); the Rules wording (D5).
