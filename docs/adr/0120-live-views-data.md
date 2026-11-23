# ADR 0120: Live views 2, data: Roll it, trees, tags, predicates, dialogs and functions

## Context

[ADR 0119](0119-live-worldgen-preview.md) D1 made "Everything should be visible live" (user, 2026-11-22) a standing rule and left three follow-up batches. The audit [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) (B575) gives the first of them 34 kinds: loot tables and extra drops, advancements, predicates, item modifiers, functions, the 20 tag kinds without a view, enchantments, damage types, chat types, dialogs, enchantment providers, trial spawners, block transformers and vanilla block rules. It also names two surfaces that are not kinds: the Creator's flows whose preview shows only an element list (9 mob flows, 4 vehicle flows, particle, fluid, the villager flows, the sound flows), and the AI helper's proposals, shown as a JSON diff.

Facts at 505d7c3 (the fact table 2F1–2F15, below since the close): the preview panel routes on eight preview kinds and of the data pack kinds only recipes have a picture; `@msm/sim` has no loot, predicate or tag code beyond two block tags, and says a function is "only in the game"; no vanilla tag, loot table or advancement is vendored, and none may be; the Creator previews a bundle from memory through `preview/bundle-source.ts`; `app.asar` is at 30.5 of 32 MB and the renderer at 17.2 of 18 MB. How well MSM's own evaluators match the game is not known: that is the spike B600 (questions 2S1–2S15).

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

## Findings at the close (B618, 2026-11-23)

Reviewed against the merged code of B601 and B603–B617: `app/src/renderer/src/liveviews/` (the registry, `data/`, `existing/`, `frame/`, `client.ts`, `worker.ts`, `vanilla-data.ts`, `view-prefs.ts`, `BundleLiveView.tsx`, `LiveThings.tsx`), `preview/PreviewPanel.tsx`, `components/function-editor/`, `components/ai/AiSeeIt.tsx`, the Creator's Live tab, `packages/sim/src/{tags,predicates,loot,commands}` and `blocks/vanilla-rules.ts`, `packages/interop/src/minecraft-install/` (cache schema 5), `fixtures/live-views/`, `engine-mod/parity` `LiveViewsDataParityTest`, the tests under `app/test/components/liveviews/` and `packages/sim/test/` (`tags/`, `predicates/`, `loot/`, `commands/`, `live-views-parity.test.ts`), `app/e2e/live-views-data-path.spec.ts`, `packages/ai/src/prompt/live-views.ts` and `docs/guide/live-views.md`. D1 to D13 hold, with the outcomes below. The close changed only docs and ran no suite; every number here is a brief's own, from its DEVLOG entry of 2026-11-22 or 2026-11-23. B602 did not run ([ADR 0123](0123-gzipped-vendored-target-data.md) had done it); reserve B647 did not run.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Scope | Met: all 34 kinds have a live view, and `docs/LIVE-VIEW-AUDIT.md` counts 76 kinds with one, 33 waiting (Live views 3 30, Live views 4 3) and 9 exempt (42, 67 and 9 when the batch started). No kind and no editing Studio was added. The runtime changed once, outside the batch's briefs: the passthrough `minecraft:block_transformer` component (2026-11-23, B614's follow-up, with a GameTest), so a project item can name a transformer in the game too. |
| D2 One route and a registry | Built as decided: one line `live_view` in `PREVIEW_KINDS`; `LIVE_VIEWS` in `liveviews/registry.ts` is `DATA_VIEWS` (the 34 kinds, `data/index.ts`) and `EXISTING_VIEWS` (18 kinds, `existing/index.ts`, see D7), each a lazy loader. `LiveViewProps` gained `vanilla` (the data reader, always given), `vanillaAssets` (pictures, B603) and `readProject` (a project or bundle file, B615). `frame/imports.test.ts` fails when a file under `liveviews/` imports the session store. View choices are kept per project root in local storage (`view-prefs.ts`); a bundle without a root keeps them in memory under `BUNDLE_PREFS_KEY`, never written. Third-party kinds are not served. |
| D3 Roll it | Built in `packages/sim/src/loot/`: all 9 entry types (`dynamic` and `slots` said to need the game), all 42 function types of both targets (14 checked, 19 about right, 9 only in the game and named), the enchantment providers, `withLootAdditions`, `trialSpawnerSummary`. The odds roll with a fixed seed (`ODDS_SEED`), so a new seed changes the roll and never the odds. One refinement: a condition the evaluator cannot answer is taken as passing, and every stack and row it touched is marked `uncertain` ("Only the game knows") with what the situation lacked; nothing is dropped or guessed silently. Measured against the game: see "Parity". |
| D4 The situation | Built: `predicates/` handles 18 of the 20 condition types and names the other two (`enchantment_active_check`, `environment_attribute_check`); ten presets in plain words (`SITUATION_PRESETS`) shared by the views and Try it; Advanced shows every field. A missing tool, killer, entity or damage answers no, as the game does (B600); what the situation does not hold (weather, time, place, scores, flags, light, structures, NBT) answers unknown. In Try it an `execute if predicate` that answers unknown passes neither `if` nor `unless`, with a line. |
| D5 Tags | Built: `tags/resolve.ts` as B600 observed (the project merged after vanilla's entries, `replace`, optional entries, a missing required entry dropping the tag and every tag naming it, cycles dropping every tag in them). The resolution is **checked**; it is about right when the registry ids are not known or Minecraft's tags were not opened. Without the jar a missing `#minecraft:` tag is "not opened", never "not found". |
| D6 MSM's own drawings | Built, every part **About right** (no `expectations.json` case covers the drawings): the advancement tab as a tidy tree in id order (columns 15 of 15 against the game, rows 2 of 15 on 26.3 and 0 of 15 on 26.4, because the game's sibling order is its own and changes between starts); the dialog screen at the client's exact rectangles for all 41 widgets of the six fixture dialogs; death and chat lines from `en_us`. Changed: the enchantment card is the panel's only; the Creator's Card tab keeps its own card. The tree is laid out on the renderer's thread (under 1 ms for the largest vanilla tab), so these views use no worker job. |
| D7 The Creator and the AI helper | Built, and wider than decided: the Creator's tab **Live** (first of `CREATOR_TABS`, opening first when the flow's main thing has a view and is not an item, a block or what Card shows) and the AI review's pane **See it** (`AiSeeIt.tsx`, first in the review, the open project with every kept change applied, following the ticks 150 ms later). `existing/` wraps today's previews for 18 kinds: mobs, vehicles, particles, liquids, effects, potions, the four merchant kinds, and also blocks, items and the six mob skin kinds (the AI review's block and the Mob skin flow needed them). They are reached only by the Creator and the AI review; the preview panel routes those kinds as before. The Status effect, Enchantment and Painting flows keep opening on Card. |
| D8 Functions in Try it | Built, wider than the draft: `commands/vanilla.ts` runs `give`, `clear`, `setblock`, `fill`, `clone`, `summon` (project mobs), `kill`, `tp`, `effect`, `say`, `tellraw`, `title`, `playsound`, `particle`, `time`, `function` (with arguments and `with storage`), `schedule`, `scoreboard objectives` and `players`, `tag`, `return`, `data get entity` (named paths) and `data get storage`, `dialog show`, and `execute` with `as`, `at`, `positioned`, `align`, `rotated`, `in`, `if`/`unless`, `store result`/`success score` and `run`; `functions.ts` (`FunctionEngine`) runs the load and tick tags and schedules with the 10,000-command cap. 62 of the library's and fixtures' 70 lines run (the other 8 are `/spreadplayers`); B647 was not needed. Also built: the event action `run_function` runs the project's function as the runtime does; Try it reads vanilla's block, item and entity type tags and predicates from the jar cache. The Function editor's marks come from `lineSupport` in a lazy module, not from the worker; the panel's view shows the marks without a Run button (a view only reads files). [ADR 0085](0085-try-it-in-app-test-area.md)'s limit L4 is narrowed accordingly. |
| D9 Keeping it honest | Built: `fixtures/live-views/` (132 elements written by `make_fixture.py`, one project for both targets), `expectations.json` (format 1, about 250 KB), `LiveViewsDataParityTest` (11 GameTests in a fixture jar of its own, Gradle tasks `liveViewsFixtureJar` and `liveViewsParity`, run by CI's `engine-mod` job on both versions), `packages/sim/test/live-views-parity.test.ts` (309 cases pass; the 10 that need vanilla's files skip without a Loom jar), the exporters' fixture test, and schema-walk tests for the conditions, numbers, entries and functions of both targets. Not recorded: advancement rows (the game orders siblings anew on every server start); columns, parents and children are. |
| D10 Size | B602 was not needed: ADR 0123 had gzipped the vendored data and set the renderer budget at 19 MB (stop line 18.5). The renderer was 17.6 MB when the batch started, 17.9 MB after B613 (new lazy chunks `RollIt` 41 kB, `TagMembers` 21 kB, `FunctionLines` 2.5 kB, `line-support` 0.2 kB) and 18.0 MB at B687 (after B615, together with AI helper 2's work; B615 itself ran no build); `app.asar` 26.2 to 26.7 MB of 32. Inside the draft 0.4 MB. **0.5 MB is left before the renderer's stop line** for batches 3 and 4, the game modes plan and search. |
| D11 Vanilla data from the jar | Built: 25 more folders (B600's list), cache schema 5, +3,875 files and +2.6 MB, extraction 135 to 200 ms on 26.3 and 145 to 193 ms on 26.4; the channel `msm:v1:minecraft:dataFiles` (at most 64 folders and 20,000 files an answer); `vanilla-data.ts` is the renderer's only reader. Changed: the folder list is the app's `LIVE_VIEW_DATA_FOLDERS` (`shared/platform.ts`), not a target fact: it is the same on both targets, a jar without a folder extracts nothing for it, and a target fact would have needed a plugin API minor. Tests pin that no export, content jar, project file, AI helper, exporter or core code carries or names it. The cache keeps no `recipe` folder, so `furnace_smelt` is reported, not guessed. |
| D12 Budgets | Met after an edit: a weight edit to the first step of the odds 182 to 253 ms and to all 1,000 rolls 202 to 281 ms in the built app (the 150 ms debounce included; 215 to 311 ms in the e2e); 1,000 rolls of the largest vanilla table 46 to 90 ms in Node; a 1,200-member tag about 2 ms; marking 500 function lines 3 to 10 ms. Opening a loot table for the first time after a launch (worker start and jar folders) takes 1.1 to 1.6 s. No no-go route was taken. |
| D13 Order | Ran beside the game modes plan's waves 0 and 1 (B547–B550) and AI helper 2 (B680–B689); the game modes plan's B551 and B552 came after the simulation modules and can use `rollLoot`, `testPredicate` and the function engine. |

### Parity

Played from `fixtures/live-views/expectations.json` through `@msm/sim` (100,000 seeded rolls a case against the game's 10,000; tolerance 2 points, 3 for explosions), worst difference in percentage points, 26.3 / 26.4: loot (30 cases) 1.22 / 0.99, blocks mined (48) 1.14 / 1.68, mobs killed (8) 1.32 / 0.99, explosions (9) 1.66 / 1.83, random predicates 0.85 / 0.41, enchanting picks at costs 1 to 40 0.58 / 0.58. Every deterministic predicate (33 cases with the random ones), item modifier (10), tag (16), function (7) and the load function's score came out as the game's. B605's run of B600's cases (85 a target): 1.35 / 1.51 (explosions 2.18 and 1.72 of 3). Two runs of the game differ from each other by up to 1.83 and 2.35 points (2.75 and 3.5 for explosions), so the game-side check allows 2 points or five standard deviations of the difference, whichever is larger (B607).

### What moved

- **Interfaces grew, all additively:** `PartResult.chance` (the chance of yes), a fourth argument of `resolveTag` (`project`, `exists`, `tagsFolder`), `LootContext.ids`, `items` and `smelt`, `ModifyResult.parts`, `LiveViewProps.readProject`.
- **Which vanilla items take an enchantment** is known only for tools (`TargetFacts` has `vanillaTools`); vanilla armour, fishing rods and the project's own items roll as uncertain under `enchant_randomly` and `enchant_with_levels`.
- **Block transformers** are covered by Vitest only (about right): a fixture transformer of a vanilla tool's id would change every GameTest's tools, and the runtime could not apply one named by a project item until the passthrough fix of 2026-11-23. Five sim-parity scenarios for the vanilla block rules were recorded in the game on both versions (83 scenarios in all).
- **Validators from the spike:** five export-blocking errors for forms the game refuses (a predicate or item modifier file that is a list or an id, `time_check` without `clock`, a damage tag id without `#`, a block transformer `state` without `id`), each with plain words.
- **The AI helper's prompt** gained `prompt/live-views.ts` (2,081 characters) and its budget moved from 96,000 to 98,000 characters ([ADR 0125](0125-ai-helper-clarity.md) D7); confirmed at this close. The prompt is at the limit, so every later plan's words need their own budget line.
- **Try it's first-run card** said commands do not run there; since 2026-11-23 it names what runs.
- **e2e:** Monaco draws the function marks in its glyph margin, so `live-views-data-path` checks the panel's marks and the editor's summary rather than the editor's mark ids; the full e2e run was left to CI.

### Rules that stay

For batches 3 and 4 and any later brief that adds a live view: a view is a function of its props and reads nothing from the session store; it sits in `LiveViewFrame` with its fidelity per part and names what it left out; "checked" needs a fixture case measured on the real server on both targets; evaluators are pure, seeded and keyed by type id with no version name; heavy work goes to the live views worker with a lane and a cancel token; vanilla data comes only from the user's jar into the cache, through the batch's jar brief; a kind's view is registered once, in its batch's index (no later brief of a batch edits an index, a kind file or a package index).

### Follow-ups

Kept in `docs/ROADMAP.md` "Live views 2 to 4" and `docs/HANDOFF.md`:

- **Loot:** a `recipe` folder in the cache for `furnace_smelt`; the enchantability of vanilla armour, fishing rods and project items for `LootContext.items`.
- **Views:** project item icons in Roll it, Try it on and the advancement tree (pass `readProject` to their picture sources); the hurt sound's Play on a damage type (batch 3, B622); export the checked condition types from `@msm/sim` (the predicate view keeps B600's list) and give an `all_of` part its own path; a settings opener in the Studio hosts, so the Tag and Extra drops Studios' banners open Settings; the AI review's See it names things by the element's name and shows a rename in every mode, where the cards use the proposal's language file (B688's note).
- **Try it:** the clicked face for block transformers and the bottom-face rule; rules while sneaking; Minecraft's tags in Try it for transformers that name them; a sim-parity scenario for a project item naming a project transformer, now that the runtime applies it.
- **Checked levels:** advancement columns and dialog layouts could claim "checked" once `expectations.json` covers them.
- **Not run at this close:** a full e2e run and a clean-worktree run of the whole repository.

### The spike's answers (2S1 to 2S15)

The questions were the plan's; the full answers and evidence are in [`docs/reference/spikes/b600/README.md`](../reference/spikes/b600/README.md).

| # | Question | Answer |
|---|---|---|
| 2S1 | Types per target | The same lists on both targets. Since 26.3 `modifier` and `condition` replace `functions` and `conditions`, numbers are `context_int_provider` and `context_float_provider`, and there is no `block_state_property`. The checked, about right and only-in-the-game lists are in the spike's README. |
| 2S2 | Odds on the server | 10,000 rolls a case through `loot insert`, 25 to 460 ms a case, under a minute a version (B607's whole check 1 min 42 s with Gradle and the server start). |
| 2S3 | Bonus formulas | Every measured type, all bonus formulas and `enchant_with_levels` included, within 1.43 points; none moved to "only in the game" for want of a match. |
| 2S4 | The jar's folders | 25 folders, +3,875 files, +2.6 MB, read in bulk by folder; no `tags/function` and no `item_modifier` folder in either jar. |
| 2S5 | Tags | Merged after vanilla's entries, `replace`, optional entries skipped, duplicates once; a missing required entry and a cycle drop the tags concerned. |
| 2S6 | Speed | All advancements parse in 8 to 15 ms; B605 measured 46 to 90 ms for 1,000 rolls of the largest vanilla table. |
| 2S7 | Commands | 74 % of the lines with the draft list, 89 % with the spike's list; B647 not needed. |
| 2S8 | Advancement screen | A tidy tree (contours, sibling gap 1, parent at the midpoint, nodes without a display skipped) in the game's own sibling order, which differs by version and between server and client: 98 to 100 % of rows in that order, 0 to 33 % in id order (2L5 stands). |
| 2S9 | Dialogs | Proportions at 427 by 240 (title at y 13, footers 26 from the bottom, 200-wide inputs, 150-wide buttons, rows 22 apart), the same on both targets. |
| 2S10 | Death and chat lines | `death.attack.<message_id>` with the victim, with a killer, and `.item` with a named item; chat decorations by `translation_key` and `parameters` in order, the style on the whole line. |
| 2S11 | Enchantments | Tooltip and level names from `en_us`; the enchanting table's offered levels follow from the cost fields as modelled in the README. |
| 2S12 | Trial spawners, block transformers | Both registries on both targets with the same fields; a block transformer is a list of steps. |
| 2S13 | Size | B602 already done by ADR 0123; no 1 MB saving needed (renderer 17.6 of 19 MB at the spike). |
| 2S14 | Today's previews over a bundle | None imports the session store; one bundle-backed `BlocksItemsStudioHost`, the fluid picture, effect icon and potion bottles extracted into components, a wrapper for the merchant screen. |
| 2S15 | Item slots | The recipe picture's slot look and Try it's hotbar lookup reused; the count and the tooltip lines were new. |

## Fact table (2F1 to 2F15)

Moved here from the plan at its close. The facts are as at 505d7c3, when the plan was written; what changed by the close is in the findings above (2F1: the audit counts 76, 33 and 9; 2F2: `live_view` and `worldgen_map` are preview kinds; 2F3 and 2F4: `@msm/sim` has tags, predicates, loot and functions; 2F5: cache schema 5 with 25 more folders; 2F9: Try it reads vanilla's block, item and entity type tags and predicates; 2F10: `app.asar` 26.7 of 32 MB and the renderer 18.0 of 19 MB).

| # | Fact | Source |
|---|---|---|
| 2F1 | 118 kinds; has one 28, needs one 81 (live worldgen 14, data 34, looks 30, structures 3), exempt 9 | `docs/LIVE-VIEW-AUDIT.md` |
| 2F2 | `PREVIEW_KINDS` is `model`, `block_definition`, `item_definition`, `structure`, `climate_map`, `geo_model`, `animation`, `entity`; of the datapack kinds only recipes have a picture | `app/src/renderer/src/preview/PreviewPanel.tsx`; the audit |
| 2F3 | `@msm/sim` has no loot, predicate or item modifier code; only `commands/catalogue.ts` and `parse.ts` mention loot | `grep -rli loot packages/sim/src` |
| 2F4 | Try it does not run functions: `commands/run.ts` says a function is "only in the game"; the game's own commands are said out loud | `packages/sim/src/commands/run.ts` |
| 2F5 | The jar extraction keeps models, block and item definitions, block and item textures with their `.mcmeta`, `lang/en_us.json` and `data/minecraft/worldgen/placed_feature`; live worldgen's B577 adds worldgen folders and moves the cache to schema 4 | `packages/interop/src/minecraft-install/extract.ts`; ADR 0119 D4 |
| 2F6 | Vendored per target: `mcmeta/registries.json`, `blocks.json`, `commands.json`, the vanilla mcdoc symbols, `worldgen/feature-order.json`. No vanilla tag, loot table or advancement content is vendored, and none may be | `packages/targets/mc-26.3/vendor/` |
| 2F7 | The Creator previews a bundle from memory through `bundlePreviewProject` and `bundleAssetReader`, 150 ms after an answer | `app/src/renderer/src/preview/bundle-source.ts`; the audit |
| 2F8 | The AI helper's proposal is shown as a line diff per element and placeholder pictures | `app/src/renderer/src/components/ai/AiChangesetReview.tsx`; the audit |
| 2F9 | Try it lowers the project again 300 ms after an edit and reads the block tags `climbable` and `wooden_fences` only | the audit |
| 2F10 | `app.asar` 30.5 of 32 MB, renderer 17.2 of 18 MB; budgets in `tools/check-size/index.ts` (`asarBytes`, `rendererBytes`); the gzip reserve is worth about 4.9 MB of `app.asar` | root `CLAUDE.md`; ADR 0079 D4 |
| 2F11 | The game modes plan adds Rules steps for loot table rolls, chests with loot tables in the Structure Studio (B555), a Goals flow that makes an advancement tab, and keeps "Try it does not run functions" as its limit M15 | the game modes plan (deleted at B562; [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md)) |
| 2F12 | The datapack plugin's kind files: `advancement.ts`, `function.ts`, `generic.ts` (35 generic kinds, schema form only), `item-modifier.ts`, `loot-table.ts`, `predicate.ts`, `recipe.ts`, `tag.ts` | `packages/plugins/datapack/src/kinds/` |
| 2F13 | The Tag Studio shows the list as typed; the Function editor has live Spyglass problems | `app/src/renderer/src/studios/TagStudio.tsx`, `FunctionEditor.tsx` |
| 2F14 | Measured by B575 (SwiftShader, one run): recipe picture 16 ms, particle 9 ms, potion 34–105 ms, block model 68–146 ms, climate map 0.20–0.25 s after Apply; Try it opens in 0.76 s | the audit |
| 2F15 | `@msm/sim` may depend only on `@msm/plugin-api` and `@msm/core`, is pure and seeded, and holds no version name | `packages/sim/CLAUDE.md` |

## Limits (2L1 to 2L12) and their outcome

Moved here from the plan at its close; the guide's page `live-views.md` and the AI helper's topic file say them in plain words.

| # | Limit | Why | What users see | Outcome at the close |
|---|---|---|---|---|
| 2L1 | **The odds are checked; a single roll is MSM's own.** | The order in which the game draws random numbers is its code. | "Your roll in the game will differ; the odds are the same." | Stands. Tolerance 2 points over 10,000 game rolls against at least 100,000 seeded MSM rolls, 3 for explosions; worst measured 1.83 points (see "Parity"). |
| 2L2 | **Some loot parts are only in the game.** | Types that cannot be learned from the data and observation. | The part is named and its rows marked "Only the game knows". | Stands: 9 function types, `dynamic` and `slots` entries, 2 condition types and the `score`, `storage` and `environment_attribute` numbers; `furnace_smelt` without a `recipe` folder; vanilla armour, fishing rods and project items under the enchanting functions. |
| 2L3 | **Vanilla tables, tags and parents need your Minecraft jar.** | Mojang's files are never shipped. | The set-up banner on views that name a vanilla file. | Stands; project-only data draws in full. 10 parity cases skip without a jar. |
| 2L4 | **A situation is a sample, not a world.** | No world around it. | Conditions about structures, light, nearby entities or scores answer "Only the game knows". | Stands. In Try it the sky is always clear (said) and the player's health, hunger and air are fixed. |
| 2L5 | **The advancement tree's layout is about right.** | The game's sibling order is its code and changes between starts. | Same parents and children; rows may differ. | Stands: columns 15 of 15, rows 2 of 15 (26.3) and 0 of 15 (26.4) in MSM's id order. |
| 2L6 | **Criteria are listed, not triggered.** | Triggers need the game. | A checklist that never ticks. | Stands. |
| 2L7 | **A dialog's buttons run nothing.** | Commands and links belong to the game. | "This button would run …" | Stands; `dynamic/run_command` is filled from the inputs. |
| 2L8 | **Functions run as far as Try it understands them.** | Try it is a small simulation (ADR 0085). | Each line marked; the rest said in What happened. | Narrower than drafted: 62 of the 70 library and fixture lines run. Said: `/spreadplayers`, `execute store … storage`, `/clone from`, selector filters such as `gamemode=`, `execute in` another dimension (the branch stops), macro lines run by an event (no values). B647 not run. |
| 2L9 | **Selectors see one player and Try it's mobs.** | Single player, 48 by 48 by 32, one Overworld. | `@a` is the one player; positions outside the area are said. | Stands. |
| 2L10 | **An enchantment's effects are described, not played.** | Combat and movement are not simulated. | A list in plain words (31 effect components; unknown ones named). | Stands. |
| 2L11 | **Vanilla blocks in Try it are props.** | ADR 0085 L10. | A transformer or a vanilla block rule changes the prop; its other behaviour is not there. | Stands; the clicked face is not known, rules do not run while sneaking, ageing and burning are only in the game. |
| 2L12 | **Third-party kinds have no live view.** | No plugin API in this plan. | The schema form, as today. | Stands; the Creator and the AI review also lower with the built-in kinds only. A ROADMAP idea. |

## Status

Accepted with findings (2026-11-23, close B618; briefs B600, B601 and B603–B617; B602 done ahead by ADR 0123; reserve B647 not run). The plan's fact table, limits and spike answers are above; `docs/PLAN-live-views.md` keeps batches 3 and 4. Decided by the orchestrator under the user's rule and open to the user's veto, as vetoable defaults:

- the evaluators in `@msm/sim` (D3, D5), the odds checked and a single roll MSM's own (D3), unknown as a third answer, and a condition the evaluator cannot answer counted as passing with its rows marked (D3, D4);
- the advancement tree, the dialog screen, death and chat lines and the enchantment card drawn by MSM and labelled About right (D6), the Creator's Card tab keeping its own enchantment card;
- the Creator's Live tab and the AI review's See it pane, with today's previews of 18 kinds wrapped for them, blocks, items and mob skins included (D7);
- functions running in Try it with the 10,000-command cap, the event action `run_function` running there too, and the panel's function view without a Run button (D8);
- the vanilla data folder list in the app rather than a target fact, cache schema 5 (D11);
- the AI helper's prompt budget at 98,000 characters (ADR 0125 D7, confirmed here);
- running before the game modes plan's wave 2 (D13).
