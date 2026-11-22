# ADR 0117: Game modes: flows, Studios, Very easy, Try it and tests

## Context

Every batch since ADR 0101 ships its kinds with Studios, Creator flows with Very easy picks, Try it support, a fixture with parity tests and e2e paths. Today Try it has the grounds grid, flat, quick and world in a 48 x 32 x 48 area. It does not run functions, and its fluids do not flow (fact G18). No flow or tile covers games (G14, G15).

## Decision

- **D1 Studios.** There are six new Studios: World Setup, One Block, Team, Objective, Timer and Area. The Area Studio shows the box over a Try it ground. Each has a Very easy section list. The Structure Studio gains "Chests and containers" (ADR 0116 D4).
- **D2 Flows.** There are eight Creator flows in a new group `games`: Skyblock, One block, Sky islands, Lucky block, Adventure map, Arena game, Race and Goals. Their questions are in the plan's flow table. Islands are drawn by the flow from parameters as structure templates of vanilla block names. New pictures (the lucky block, icons) come from the art generator (ADR 0092).
- **D3 Very easy.** A Home tile "Make a game" offers the eight flows as picks. Labels follow the plan's "Very easy wording". There are no ids in Very easy.
- **D4 Try it.** There are new grounds:
  - `void`: empty sky, with the world setup's start structure centred and the player on it, holding the kit;
  - `structure`: any project structure template as the ground.

  The sim plays the games kinds from their elements, not from functions (limit M15):
  - the one block refills by phase;
  - areas are outlined and fire enter and leave;
  - timers count on a boss bar or action bar mock-up;
  - objectives on the sidebar show in a sidebar mock-up;
  - team colours show on names;
  - adventure mode stops breaking unless `can_break` allows it;
  - a mock generator refills a broken block with cobblestone after a second when the block touches both a water and a lava prop (vanilla's rule simplified; said once in What happened).
- **D5 Tests.** `fixtures/sample-game-modes` (a Skyblock with a one block, teams, a sidebar objective, a timer, areas with a reset, a lucky block rule book and goals) has:
  - parity tests on both content jars and as vanilla packs (the island once at the first mock join, the kit once, phases, a timer ending its rule, an area reset);
  - e2e `games-path` and `maps-path`;
  - sim-parity scenarios for the one block and areas.
- **D6 Spike first.** B547 answers Y1–Y16 before anything after Wave 0 starts. Its answers can change ADRs 0113–0116, recorded as amendments.
- **D7 Facts and limits.** The plan's facts G1–G22 and limits M1–M16 move into this ADR at the close (B562), with an outcome column.

## Consequences

- Games are made in about a minute in Very easy, and seen in Try it before Play.
- Try it stays single player (limit M14).
- The size budget grows by six Studios. B555 reports `app.asar` and the renderer against the 31 and 17.5 MB stop lines.

## Status

Proposed (2026-11-22). Vetoable defaults:
- the eight flows and their order;
- the `games` group;
- the mock generator in Try it;
- the Home tile's label "Make a game".
