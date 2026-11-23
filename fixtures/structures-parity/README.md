# structures-parity

Parity fixture for batch 4 of the live views, assembled structures (ADR 0122 D9; plan briefs B635 and B639). **Stub:** B635 made this folder so that no later brief of the batch creates a shared registration point; B639 fills it.

## What will be here (B639)

- An MSM project of self-written files: templates (`.nbt`), template pools, jigsaw structures, structure sets and processor lists, on both targets. Every file is MSM's own, written from the data format, never copied from vanilla.
- `expectations.json`: what the real server did with those files (piece counts, depths, pool use, joins, overlaps and distances over many seeds; the before and after blocks of each processor), on both targets, written by a flag of the parity GameTest `StructuresParityTest` in `engine-mod/parity/`. They are observations of worlds made from MSM's own files.
- Its lowering test, and the Vitest test that plays the same file through `@msm/terrain`'s assembler and processors.
- The evidence and the rules J1 to J20 these checks rest on: `docs/reference/spikes/b634/README.md`.

## Rules

- No vanilla file is ever committed here. Vanilla's own structures are compared only where a jar is present (the `engine-mod` CI job).
- One structure per structure set (a set's structure choice and start rotation come from one random draw), and `/place` only for single checks.
- Tolerance (B634): exact for joins, overlaps, depth, distance and priority winners; statistical for the rest (|z| at most 4, means within 4 standard errors, at least 200 assemblies).
- Processors that use a random are compared as shares, not cells (the game's per-placement random is not reproducible from the position).
- Carried facts for later briefs: 26.4 renames the registry `rule_test` to `rule_test_type` and reads `corner_constraint` (named only, ADR 0122 4L4); they belong to `packages/targets`.
