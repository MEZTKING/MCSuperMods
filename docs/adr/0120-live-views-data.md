# ADR 0120: Live views 2, data: Roll it, trees, tags, predicates, dialogs and functions

## Context

[ADR 0119](0119-live-worldgen-preview.md) D1 made "Everything should be visible live" (user, 2026-11-22) a standing rule and left three follow-up batches. The audit [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) (B575) gives the first of them 34 kinds: loot tables and extra drops, advancements, predicates, item modifiers, functions, the 20 tag kinds without a view, enchantments, damage types, chat types, dialogs, enchantment providers, trial spawners, block transformers and vanilla block rules. It also names two surfaces that are not kinds: the Creator's flows whose preview shows only an element list (9 mob flows, 4 vehicle flows, particle, fluid, the villager flows, the sound flows), and the AI helper's proposals, shown as a JSON diff.

Facts at 505d7c3 (the fact table 2F1–2F15 in [`docs/PLAN-live-views.md`](../PLAN-live-views.md)): the preview panel routes on eight preview kinds and of the data pack kinds only recipes have a picture; `@msm/sim` has no loot, predicate or tag code beyond two block tags, and says a function is "only in the game"; no vanilla tag, loot table or advancement is vendored, and none may be; the Creator previews a bundle from memory through `preview/bundle-source.ts`; `app.asar` is at 30.5 of 32 MB and the renderer at 17.2 of 18 MB. How well MSM's own evaluators match the game is not known: that is the spike B600 (questions 2S1–2S15).

## Decision

### D1 Scope

Every one of the 34 kinds gets a live view as ADR 0119 D1 defines it, in the place listed in the plan's batch 2 table. This ADR also builds the machinery batches 3 and 4 ([ADR 0121](0121-live-views-looks-and-sounds.md), [ADR 0122](0122-live-views-assembled-structures.md)) reuse. It adds no kind, no editing Studio and no runtime code outside tests.

### D2 One route, a registry in the app, views as functions of files

- The preview panel gains one preview kind, `live_view` (a string in the plugin API; no API change). A registry in the app (`app/src/renderer/src/liveviews/registry.ts`) maps an element kind to a lazily loaded view.
- A view takes the project (or a bundle laid over it), the element, the vanilla reader and the view preferences. It reads nothing from the session store. The same view therefore draws in the panel, in a Studio section, in the Creator and in the AI review.
- Every view sits in one frame that carries the **Preview** tag, the fidelity level, the notes naming what was left out, and the set-up banner when a vanilla file is needed. Silence is not allowed ([ADR 0085](0085-try-it-in-app-test-area.md) D5).
- Fidelity levels, one per part: **As in the game, checked**; **About right**; **Only in the game**.
- View choices (seed, situation, sample item or text) are kept with the app's view preferences, never in the project file.
- Third-party kinds are not served. Opening the registry to plugins is a plugin API decision for a later ADR.

### D3 Roll it: a loot evaluator in `@msm/sim`

- `@msm/sim` gains `loot/`: tables, pools, entries, functions and number providers, keyed by type id. Which ids a target has comes from the target's vendored registries; the package holds no version name. It lives in the simulation, not the app, because Try it needs it (a project block's drops, chest contents, the game modes plan's loot steps).
- The view shows one roll at a seed, and the odds over 1,000 rolls for every item that can drop.
- **Checked:** which items can drop, count ranges and the odds, within the tolerance the spike sets. **About right:** a single roll. The order in which the game draws random numbers is its code, which MSM does not read; a roll at a seed is MSM's own, and the view says so.
- A type the evaluator does not know is named and shown as "only in the game". It is never skipped silently and never guessed.
- Item modifiers are loot functions and use the same code; enchantment providers, trial spawner rewards and `msm:loot_addition` (with and without) use the same view.

### D4 The situation, and three answers

- Loot, predicates and item modifiers are evaluated against a **situation** the user picks: presets in plain words, with the fields behind them in Advanced.
- A condition answers yes, no or **unknown**. Unknown means the situation does not hold what the condition asks about (a structure, light, scores, nearby entities) or the type is not supported. Unknown is shown as "only the game knows" and is never turned into no. A predicate's view shows the answer of each of its parts.

### D5 Tags are resolved once, in `@msm/sim`

`@msm/sim` gains `tags/`: a tag resolved over data pack order (project files over vanilla's from the jar), with `replace`, optional entries and tags inside tags; cycles and missing entries are reported. The Tag Studio shows the resolved members with pictures and where each came from; loot and predicates use the same resolver.

### D6 Advancements, dialogs, enchantments and sample lines are MSM's own drawings of the data

- The advancement tab is drawn as a tree with MSM's own tidy layout (about right); parents, children, frames, icons and criteria are the data's. Criteria are listed, not triggered.
- A dialog is drawn as its screen (about right); its buttons run nothing and say what they would do.
- An enchantment shows its tooltip on a chosen item, its level table and what it goes on; its effects are described in plain words, not played.
- Damage types and chat types show a sample line.

### D7 The Creator and the AI helper show the thing

- The Creator's preview gains a tab **Live**, and the AI review a pane **See it**. Both draw the registry's view of each element the bundle or proposal makes, over `bundlePreviewProject`. Looking applies nothing.
- The previews that exist today (the geo renderer for mobs, the vehicle, particle, fluid and effect previews, Try it's merchant screen) are wrapped as registry entries in this batch, so the mob, vehicle, particle, fluid and villager flows show their thing now and not in batch 3. The audit attributes them to "Live views 3"; they are moved forward because the mechanism is this batch's and the views already exist.

### D8 Functions run in Try it as far as the simulation understands them

- `@msm/sim`'s command code gains the game's own commands the simulation can honour (the list is the spike's; the plan holds the draft). Every other command is said out loud, as today.
- The Function editor marks each line as running in Try it or not; **Run in Try it** and `/function` in Try it's chat box run a function; the load and tick tags run. A tick is capped at 10,000 commands.
- This amends ADR 0085's "functions are only in the game" and softens the game modes plan's limit M15.
- Block transformers and vanilla block rules are tried on vanilla blocks as props in Try it.

### D9 Keeping it honest

- A fixture `fixtures/live-views/` holds self-written tables, predicates, tags, modifiers, an enchantment, advancements, a dialog and functions. A parity GameTest runs them on the real server on both versions and records what it saw in `expectations.json`; a Vitest test plays the same file through `@msm/sim`. The recorded values are observations of worlds made from MSM's own files.
- A part shown as "checked" without a fixture case is refused at review. A schema-walk test fails on a condition, function or entry type of either target that is neither handled nor reported.
- Vanilla's own tables are compared only where a jar is present (the `engine-mod` CI job) and nothing of them is written to the repository.

### D10 Size

- The gzip reserve of [ADR 0079](0079-compact-vendored-target-data-in-the-asar.md) D4 is run by this batch's B602 before any view code, unless an earlier plan has run it.
- The spike looks for 1 MB of savings in the renderer output. If it finds less, the renderer budget moves from 18 to 19 MB (stop line 18.5 MB), amending the number first set with [ADR 0031](0031-rhino-runtime-and-typescript-es5-scripts.md) D6; `app.asar` stays at 32 MB.
- Draft code budgets: 0.4 MB for this batch, 0.4 MB for batch 3, 0.2 MB for batch 4, each view in a lazy chunk.

### D11 Vanilla data comes from the user's jar

The jar extraction ([ADR 0011](0011-client-jar-asset-extraction.md), ADR 0119 D4) is extended to the data folders these views read. The files stay in the cache: never committed, bundled, exported, written into a project or sent to the AI helper. Without the jar, project-only data draws in full and a view that names a vanilla file shows the set-up banner.

### D12 Budgets, and the go or no-go

Draft numbers; B600 sets the final ones:

- A view asks again 150 ms after the last edit and shows a first result within 250 ms of that; the odds of 1,000 rolls within 1 s, in a worker, in steps.
- **No-go routes:** a loot type that does not match within tolerance moves to "only in the game"; if fewer than half of the lines of the library's functions run, reserve B647 is run before B613; if the evaluator cannot reach the tolerance on plain weighted pools, the plan stops after the spike and comes back to the user.

### D13 Order

After live world generation closes (B591). Recommended beside the first waves of the game modes plan and before its wave 2, which then uses the loot, predicate and function code instead of writing its own (the plan's "Order").

## Alternatives considered

- **Run the real game for each view** (a local server evaluating loot and predicates). Exact, but needs Java and seconds per change; it cannot be live. Kept as what the parity fixture does.
- **The evaluator in the app, not in `@msm/sim`.** Rejected: Try it and the game modes plan need it, and the simulation's rules (pure, seeded, says what it cannot do) are the ones wanted.
- **A preview kind per view.** Rejected: thirty strings in `PREVIEW_KINDS` and no way for the Creator and the AI review to reach a view by kind.
- **Exact rolls at a seed.** Rejected: it needs the game's order of random draws, which is its code.
- **An Advancement Studio.** Not now: the rule asks for seeing, not for a new editor; kept as a ROADMAP idea.
- **Vendoring vanilla tags and loot tables.** Rejected: Mojang's data in the installer.

## Consequences

- The most used data kinds stop being forms without a picture, and the Creator's mob and vehicle flows show a body.
- `@msm/sim` grows three areas and a wider command reader; Try it can run functions, which changes one of its stated limits.
- A new app folder `liveviews/`, one new line in `PREVIEW_KINDS`, a fixture, a parity class, a CI step, an e2e spec and a guide page.
- The cache holds more of the jar; users re-extract once.
- The size reserve is spent, and the renderer budget may move by 1 MB.
- MSM gains more places where it can disagree with the game; D2's frame, D4's unknown and D9 bound it.

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-live-views.md`](../PLAN-live-views.md) (batch 2, B600–B618; fact table 2F1–2F15, spike questions 2S1–2S15, limits 2L1–2L12); nothing after its wave 0 starts before the spike B600 has reported. Decided by the orchestrator under the user's rule and open to the user's veto: the evaluators in `@msm/sim` (D3, D5); odds checked and single rolls MSM's own (D3); unknown as a third answer (D4); the mob, vehicle, particle and fluid flows moved forward into this batch (D7); functions running in Try it with a command cap (D8); the gzip reserve and the possible renderer budget of 19 MB (D10); running before the game modes plan's wave 2 (D13).
