# live-views

Parity fixture for batch 2 of the live views, data (ADR 0120 D9; plan briefs B601 and B607). **Stub:** B601 made this folder so that no later brief of the batch creates a shared registration point; B607 fills it.

## What will be here (B607)

- An MSM project of self-written files: loot tables, predicates, tags, item modifiers, an enchantment, advancements, a dialog and functions. Every file is MSM's own, written from the data format, never copied from vanilla.
- `expectations.json`: what the real server did with those files (10,000 rolls of each table, each predicate in set-up situations, each modifier applied, each tag resolved, each function run), on both targets, written by a flag of the parity GameTest `LiveViewsDataParityTest` in `engine-mod/parity/`. They are observations of worlds made from MSM's own files.
- Its lowering test, and the Vitest test that plays the same file through `@msm/sim`.

## Rules

- No vanilla file is ever committed here. Vanilla's own tables are compared only where a jar is present (the `engine-mod` CI job).
- A part a view shows as "checked" needs a case in `expectations.json`; a part without one is "about right" at best.
- The tolerance is B600's: 2 percentage points per outcome (3 for explosion cases); see `docs/reference/spikes/b600/README.md`.
