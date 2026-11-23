# ADR 0115: Rules 3 for games

## Context

Rules (ADR 0082) can do parts of a lucky block or minigame (fact G11). They have no triggers for areas or timers, and no steps for loot table rolls, placing structures, a weighted pick, teams, scoreboard scores, the world spawn, a player's spawn point or the world border. Rules compile to generated scripts run by the runtime, and `runCommand` returns the result count (G13), so most of this needs no runtime change. The games kinds (ADR 0113) live in functions, which cannot call a script directly.

## Decision

- **D1 Steps.** The new steps are:
  - "Drop from a loot table" (`loot spawn`) and "Give from a loot table" (`loot give`);
  - "Place a structure" (`place template`, rotation and mirror);
  - "Pick one at random" (weighted branches, compiled in the script);
  - "Join a team" and "Leave the team";
  - "Set a score" and "Add to a score" (any objective: project or vanilla by name);
  - "Start a timer" and "Stop a timer";
  - "Reset an area";
  - "Set the world spawn", "Set the player's spawn point" and "Set the world border".

  Each step compiles to `runCommand` with the forms in `TargetFacts.commands.forms`.
- **D2 Conditions.** "The player is in the area" (`execute if predicate`), "The player is on the team", "The score is at least" and "The timer is running", each as a `runCommand` result above zero.
- **D3 Values.** "The score of", "Time left on the timer" and "Players on the team" (read through `execute store result`; verify at implementation).
- **D4 Triggers.** "A player enters the area", "A player leaves the area", "A timer ends" and "The one block is broken" (with its phase).
- **D5 The function bridge.** The rules expander adds one hidden project command per project, `<ns>:msm_signal` (an `msm:command` at permission 2, one word argument). The games kinds' functions run it as the player when an area is entered or left, a timer ends or the one block breaks, and only when a rule listens. Its event fires the matching rules. This holds only if Y13 shows a data pack function can run a project command. If not, reserve B563 adds a runtime command instead.
- **D6 Counters stay.** Rules counters remain script data (fact G12). Scores are a separate thing, and the Rules book shows both under "Counters and scores" (limit M10).

## Consequences

- Lucky blocks, arenas and races can be built in Rules with no `run_command` text.
- The rule book needs the jar, as before (limit M1). The games kinds without rules do not.
- The signal command shows in tab completion only for operators.

## Findings at the close (B562, 2026-11-23)

Reviewed against the merged code of B553, the B557 follow-up and the fix "Rules on block_broken: blocks placed a tick after the break" (2026-11-23): `packages/plugins/rules/src/catalogue/`, `compile/games.ts`, `compile/plain.ts`, the expander's signal command, `rulesGeneratedIds`, `packages/schemas/mcdoc/msm/rules.mcdoc`, the app's `withExpandedRuleBooks` and `maskProjectCommands` (`app/src/renderer/src/session/`), the Rule book Studio's chips (`studios/rules/SlotChip.tsx`), and the tests `packages/plugins/rules/test/games.test.ts`, `app/test/session-rules-signal-export.test.ts` and the fixture's parity class (ADR 0117 D5). Y10 and Y13 of [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md) apply here.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Steps | Built, 14 steps: `give_loot`, `drop_loot`, `place_structure` (rotation and mirror), `pick_random` (each step of `do` one choice, weights 0 to 1000, at most 16, compiled in the script), `join_team`, `leave_team`, `set_score`, `add_to_score` (from 0, as `scoreboard players add` takes), `start_timer`, `stop_timer`, `reset_area` (label **Reset an area**, not the plan's "Rebuild an area"; the Area Studio's line matches it), `set_world_spawn`, `set_spawn_point`, `set_world_border` (width, seconds as `<n>s`, centre; Y10). Each is a `runCommand` as `@s` for players and mobs and as the server at the place otherwise; timers and areas run the games kinds' own `start`, `stop` and `reset` (or `clear`) functions. Forms come from `TargetFacts.commands.forms`, with four fallback forms the targets do not list yet (`execute if entity`, `execute if score … matches … run`, `setworldspawn`, `spawnpoint`); a target form of the same name wins. New codes `rules.no-command-form` and `rules.no-such-phase`. |
| D2 Conditions | Built: `in_area` (the entity tag `<ns>.area.<path>`), `on_team`, `score_at_least`, `timer_running` (`#<path>.on`). |
| D3 Values | Built differently: `score` (one someone), `timer_left` (for a timer counting up, its length less the count) and `team_size` are read from a command's result (`scoreboard players get`, `execute if entity`), not through `execute store result`. |
| D4 Triggers | Built: `area_entered`, `area_left`, `timer_ended`, `one_block_broken` (an optional phase from 1; no player and no place, since the hook runs from the server before the break is counted). Seven new slot types: `loot_table`, `structure`, `team`, `objective`, `timer`, `area`, `one_block`. With ADR 0127's `set_on_fire` the catalogue holds 66 triggers, 62 steps, 25 conditions, 17 values and 7 places. |
| D5 The function bridge | Built differently, on Y13's go (reserve B563 not needed): the command is `msm_signal_<ns>` (an `msm:command` at permission 2 with one `word` argument), made by the expander on the first rule book in id order that has a signal rule. The games kinds' functions **never name it**: for each signal the rules add a function `<ns>:msm_rules/signal/<area|timer|one_block>/<path>/<event>[/<phase>]` to the games kind's hook tag as an optional entry (`required: false`, merged), and that function runs the command; a phase rule's line tests `#<path>.phase`. The rules listen to the Script API `command` event filtered by the command and the word. In a vanilla data pack the game drops the three bridge functions at load and the optional entries keep the hook tags loading (the vanilla pack safety rule keeps them without a warning; `tools/run-fabric-server/vanilla-packs.ts` lists them as expected failures). The app's export gives the registry view the expanded rule books and masks calls of the project's own commands before the offline checker (`maskProjectCommands`), so such a project exports with nothing above info. "Copy as my own script" is refused for signal rules. |
| D6 Counters stay | As decided: scores and timers sit in the Do picker's "counters" group; no new picker group. |

### Found by the fixture

- Steps that change blocks on "A player breaks the block" and "A player breaks any block" ran before the game removed the block, so the break took away what they placed (the Lucky block flow's hut lost its corner floor block in B559's parity test). Fixed in the compiler: the two triggers are marked `beforeRemoval`, the steps `place_block`, `remove_block`, `place_structure`, `reset_area` and a breaking `explode` are marked `changesBlocks`, and on such a trigger each of those steps runs one tick later through `msm.schedule(1, …)` at any depth; every other step, Stop the normal action included, still runs at once. The parity test checks the hut's corner. The guide's `rules.md` says so.

### Open items

- **The Rule book Studio has no picker for the seven new slot types**: their chips show the chosen thing in words but cannot be changed outside Raw JSON (`SlotChip.tsx` falls through to plain words). The flows, Add this rule and the AI helper fill them; a small app brief should add pickers for loot tables, buildings, teams, scores, timers, areas and magic blocks.
- The four fallback forms (and `set_fire` of ADR 0127) into `TargetFacts.commands.forms` (a plugin API minor).
- The live check of a hand-written function element still shows a parse error for a call of a project command until it is exported (only the export masks; `#functionProblems` can pass `projectCommandLiterals`).
- The AI helper's `kind_schema` allowance for `msm:rules` is 31,000 characters (28,516 used).

## Status

Accepted with findings (2026-11-23, close B562; brief B553, the B557 follow-up and the block_broken fix). Vetoable defaults:

- the bridge as a hidden project command reached through optional entries in the games kinds' hook tags;
- permission 2;
- counters and scores kept apart;
- weighted picks compiled in the script rather than by `random` in a function;
- block-changing steps on a break trigger run one tick after the break;
- readings from a command's result rather than `execute store`.
