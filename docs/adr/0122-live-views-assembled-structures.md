# ADR 0122: Live views 4, assembled structures

## Context

The third follow-up batch of "Everything visible live" ([ADR 0119](0119-live-worldgen-preview.md) D1). The audit [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) gives it three kinds: `minecraft:worldgen/template_pool`, `minecraft:worldgen/structure` and `minecraft:worldgen/processor_list`. A single template draws in 3D today; a pool, a jigsaw structure and a processor list show no building.

Live world generation draws markers where a structure may start (its B585) and keeps "structures in the ground" as reserve B595. The game modes plan adds chests to the Structure Studio (B555) and a structure as a Try it ground (B558). deepslate has structure placement and a structure renderer but no jigsaw assembly and no processors (fact 4F4 in [`docs/PLAN-live-views.md`](../PLAN-live-views.md), verify at implementation). How jigsaw assembly behaves in the game is learned only by observation: the spike B634 (questions 4S1–4S10).

The machinery (the `live_view` route, the registry, the frame, the fidelity levels) is [ADR 0120](0120-live-views-data.md)'s.

## Decision

### D1 Scope

The three kinds get a live view. Only jigsaw structures assemble; every other structure type shows a line saying it is built by the game itself.

### D2 The assembler lives in `@msm/terrain`

`@msm/terrain` gains `structures/` (assembly and processors), because the generated ground needs the same code and the package already holds live worldgen's structure markers. This takes over live worldgen's reserve B595; if B595 has run, this batch builds on it.

### D3 Clean room, by observation

The jigsaw rules are written from the data's own fields (name, target, pool, joint, priorities, weights, fallback, size, distance limit) and from structures the real server places from MSM's own fixture pools with the game's own commands, read back from the world. No Mojang method body is read. A rule that cannot be confirmed that way is not guessed: it is reported and listed as a limit.

### D4 Fidelity: a building your pools can make

- **Checked:** every join the assembler makes is one the game also accepts (matching names, the joint, no overlap, depth and distance kept), and over many seeds the piece counts, depths and pool use fall within the range the game's do (tolerance set by the spike).
- **About right:** which pieces a seed picks. The game's order of random draws is its code. The view says: "A building your pools can make. The one in your world will differ."
- **Only in the game:** non-jigsaw structure types, processor types the spike could not learn, mobs and block entity contents in pieces (listed, not placed).

### D5 Seeded and stepwise

The assembler is a generator of steps: a piece tried, placed, or refused with its reason. The view has a seed box and dice, **Play**, **Step** and a list of steps; each step lights the two jigsaw blocks that met. A pool edit reassembles after 150 ms and arrives piece by piece. An assembly stops at a piece limit the user can raise.

### D6 Processors

Applied by type id from the target's registry to a template the user picks, shown before and after with a swipe line and a seed, with the count of blocks each rule changed. Unsupported types are named and leave the template unchanged for that rule.

### D7 Vanilla pieces from the user's jar

A pool that names vanilla templates or pools reads them from the jar's structure files through the cache ([ADR 0011](0011-client-jar-asset-extraction.md)), never shipped or exported. Without the jar such a piece is a labelled box of its size where the size is known, else the set-up banner.

### D8 In Try it and on generated land

**Walk in it** loads an assembly as Try it's ground through the structure ground of the game modes plan, cut at the area's edge with a line. On the ground "My world generation" the pieces stand where the markers stood, on the generated land; terrain-matched pieces are flat unless reserve B648 runs.

### D9 Keeping it honest

A fixture `fixtures/structures-parity/` of self-written templates, pools, structures and processor lists; a parity GameTest places them on the real server on both versions and records statistics and before-and-after blocks in `expectations.json`; a Vitest test plays the same file through `@msm/terrain`. A schema-walk test fails on a processor type neither handled nor reported.

### D10 Order and budgets

Last of the three batches, after batch 3 and after the game modes plan closes (B562): it edits `StructureStudio.tsx` after B555 and uses B558's ground. Draft budgets (B634 sets them): a 100-piece assembly within 2 s in the worker, its first pieces within 250 ms; code 0.2 MB of renderer output.

## Alternatives considered

- **Place the structure on a local server and read the world back.** Exact, but needs Java and tens of seconds; not live. Kept as what the parity fixture does.
- **Show only the pool graph** (which pool leads to which). Cheap, and the Template Pool Studio's table already says most of it; it is not the building the rule asks to see.
- **Exact assembly at a seed.** Rejected: it needs the game's random order.
- **The assembler in the app or in `@msm/sim`.** Rejected: the generated ground is `@msm/terrain`'s, and `@msm/sim` stays free of deepslate.

## Consequences

- A jigsaw structure can be understood without starting the game, including why a piece never appears.
- `@msm/terrain` grows a structures area; live worldgen's markers become pieces.
- The cache holds the jar's structure files; a new fixture, a parity class and a CI step; an e2e spec.
- A third place, after terrain and loot, where MSM's result is "like the game's" rather than the game's; D4's line says so on every view.

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-live-views.md`](../PLAN-live-views.md) (batch 4, B634–B645; fact table 4F1–4F8, spike questions 4S1–4S10, limits 4L1–4L9); nothing after its wave 0 starts before the spike B634 has reported. Decided by the orchestrator under the user's rule and open to the user's veto: the assembler in `@msm/terrain`, taking over reserve B595 (D2); "a building your pools can make", not the world's (D4); only jigsaw structures assemble (D1); running last (D10).
