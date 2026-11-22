# ADR 0111: Command arguments in Rules, more argument types, the R10 triggers, dialogs, game rules, statistics and tab order

## Context

[ADR 0096](0096-commands-creative-tabs-and-script-and-rules-gaps.md) gave projects their own commands (`msm:command`: twelve argument types passed to a function as macro values or to an event) and creative tabs (`as_listed` or `by_name`). Its findings and the coverage audit leave open (fact H15 of [the plan](../PLAN-vanilla-parity-3.md#fact-table-h1-to-h16)):

- Rules cannot read a command's arguments (a Rules value for them "needs an ADR");
- vanilla has 62 command argument types ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) F36) and MSM offers twelve;
- [ADR 0082](0082-rules-no-code-behaviour.md) limit R10: no triggers for crafting, picking up, eating, sleeping or advancements (server events, not client work);
- a data pack dialog can be opened only by a command in a function;
- game rules and statistics of a mod's own (vanilla has 59 game rules and a `custom_stat` registry; both are registries a mod adds to at start);
- a project tab cannot list its items in a hand-chosen order.

## Decision

- **D1 Command arguments as Rules values.** The Rules value "What the player typed for <argument>" (`command_argument`, slot `name`, typed by the argument's type) is offered on rules whose trigger is "A player types the command"; the compiler reads it from the event context, where the runtime puts each argument under `args.<name>` (as the Script API's `command` event already does). Only the types of D2 that have a Rules value type (number, text, player, entity, position, block, item, dimension, effect) are readable (limit N20).
- **D2 More argument types.** The argument type list grows by those B525 finds working on both versions and reaching the client's command tree (X30): candidates dimension, time, colour, rotation, angle, UUID, objective, score holder, item predicate, block predicate and resources of the effect, enchantment, biome and structure registries. The list lives in `TargetFacts.commands.argumentTypes` (plugin API 1.20.0).
- **D3 The R10 triggers.** Script events `item.crafted` (player, item, count), `item.picked_up` (player, item, count), `player.ate` (player, item), `player.slept` and `player.woke` (player, bed position), `player.advancement` (player, advancement id), and the matching Rules triggers. Fabric events where they exist; otherwise head or return injections under DESIGN section 10's Mixin policy, named by the spike (X33), each with a justification comment and a GameTest on the real path (crafting through the menu, picking up from the ground, eating to the end, a night's sleep, an advancement granted by its own trigger). Not ejected (limit N23).
- **D4 Dialogs.** Event action `open_dialog { dialog }` (a vanilla or project dialog id, for `self` or `other`) and the Rules step "Open a dialog"; Script API `Player.openDialog(id)` (X34).
- **D5 Game rules.** Kind `msm:game_rule` (frozen): `kind` (`boolean` or `integer`, vanilla's two; limit N21), `default`, `category` (vanilla's categories), `min` and `max` for integers, lang for its name and description. Registered at start (X31), set with `/gamerule`, saved per world. Rules condition "The game rule is", step "Set a game rule"; Script API `World.gameRule(id)` and `World.setGameRule(id, value)`.
- **D6 Statistics.** Kind `msm:stat` (frozen): `format` (`default`, `distance` or `time`; limit N22), lang. Registered at start in `custom_stat` (X32); its scoreboard criterion `minecraft.custom:<ns>.<path>` is offered in completions. Rules step "Add to a statistic", condition "The statistic is at least"; Script API `Player.stat(id)` and `Player.addStat(id, amount)`.
- **D7 Tab order by hand.** `msm:creative_tab`'s `order` gains `by_hand` with an `items` list (any item ids, vanilla or project); items of the tab not in the list follow in registration order.
- **D8 Versions.** Script API 1.7 (the events of D3, D4's `openDialog`, D5's and D6's members; labelled with the runtime release at the close). Plugin API 1.20.0 (argument types, `gameRuleKinds`, `statFormats` as target facts).

## Consequences

- Commands become usable from Rules end to end; the When picker gains six triggers.
- Up to five more Mixins (D3), each with its own GameTest; none ejected.
- Two more frozen registries (game rules, statistics; limit N1).

## Status

Proposed (2026-11-22). Vetoable defaults: arguments readable only on the command's own rules; the argument types the spike confirms; Mixins where Fabric has no event; game rules of vanilla's two kinds only; `by_hand` order with unlisted items after.
