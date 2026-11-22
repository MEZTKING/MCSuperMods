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

## Status

Proposed (2026-11-22). Vetoable defaults:
- the bridge as a hidden project command;
- permission 2;
- counters and scores kept apart;
- weighted picks compiled in the script rather than by `random` in a function.
