# Plan: Live views 2 to 4

**Status: draft (2026-11-22).** Brief ids B600–B648 (B596–B599 stay free); ADRs [0120](adr/0120-live-views-data.md) (data; accepted with findings at B618, 2026-11-23), [0121](adr/0121-live-views-looks-and-sounds.md) (looks and sounds) and [0122](adr/0122-live-views-assembled-structures.md) (assembled structures), the last two Proposed. **Batch 2 is closed** (B600–B618); batch 3 is next, with its spike B619. Live world generation is closed (B591, 2026-11-22; [ADR 0119](adr/0119-live-worldgen-preview.md) accepted with findings). Each batch starts with a spike; nothing after a batch's wave 0 starts before its spike has reported.

Working plan for the rest of the user's standing rule of 2026-11-22, **Everything visible live** ([ADR 0119 D1](adr/0119-live-worldgen-preview.md)). The audit [`docs/LIVE-VIEW-AUDIT.md`](LIVE-VIEW-AUDIT.md) (B575) counted 118 kinds when this plan was written: 28 had a live view, 9 were exempt, 81 needed one. Fourteen of those were live world generation's (B574–B592, closed at B591 into ADR 0119) and now have one, so the audit stands at 42, 9 and 67. This plan closes the other 67 in three batches, plus the two surfaces that are not kinds: the Creator's flows that show nothing of what they make, and the AI helper's proposals, seen only as JSON. Written 2026-11-22 by the orchestrator at 505d7c3 (branch `ccr-d077e76e-4gnbx2`). Every "today" claim was checked against the code at that commit or is the audit's; what was not checked says "(verify at implementation)".

## In plain words

- **Batch 2, data (34 kinds).** Things that are only numbers and lists today get something to look at. A loot table gets **Roll it**: the drops of one roll, and the odds over a thousand rolls, for a situation you choose (which tool, which enchantment, who killed it). Advancements show as the tree the game draws. A tag shows everything in it, vanilla tags opened up, with pictures. A predicate says yes or no for a situation you choose; an item modifier and an enchantment are shown on an item. A dialog is drawn as the screen it becomes. A function runs in Try it, as far as Try it understands its commands, and says the rest out loud.
- **Batch 3, looks and sounds (30 kinds).** Every place a sound is picked or defined gets a **Play** button, for your own sounds and for Minecraft's (read from your own Minecraft folder). Songs and goat horn calls play. Mob variants and villager clothes are worn by a body; paintings hang on a wall; banner patterns, armour trims and pot patterns are drawn on a banner, an armour figure and a pot; a font draws a line of text you type; a potion shows its bottles; a creative tab shows its page of items; shaders and post effects are drawn where the app's graphics allow it, and say so where they do not.
- **Batch 4, assembled structures (3 kinds).** A template pool or a jigsaw structure is put together piece by piece in front of you, with a seed and a **Step** button, and a processor list shows a building before and after.
- **The Creator and the AI helper.** A flow shows the thing it makes while you answer (a mob's body, a vehicle, a particle, a liquid, a merchant's screen), and a change the AI helper proposes is shown the same way before you press Apply.
- **Honest.** Each view says how close it is: checked against the game, about right, or only in the game. One roll at a seed is MSM's own roll, not the game's; the odds are checked. Mob bodies are MSM's own stand-ins. A jigsaw building is a building your pools can make, not the one a given world seed makes.
- **What it is not.** No new kinds, no new Studio for editing (an Advancement Studio stays an idea), no runtime changes outside tests and one reserve, nothing of Mojang's shipped.
- **Build first:** batch 2 (the most used kinds and the shared machinery), then the game modes plan, then batches 3 and 4. See "Order".

## What exists to build on

| Piece | Today | Reuse as is | Missing |
|---|---|---|---|
| Preview panel | Routes on `previewKind` over eight kinds (`PREVIEW_KINDS` in `preview/PreviewPanel.tsx`); live worldgen adds `worldgen_map` (fact 2F2) | The panel, lazy loading, the 2D route outside the WebGL gate | One route for every other kind (ADR 0120 D2) |
| Try it and `@msm/sim` | Lowered files into a 48 by 48 by 32 world; lowers again 300 ms after an edit; reads two block tags; says what it cannot do (2F4, 2F9) | `LocalWorldSource`, `SimLog.onlyInMinecraft`, the trace | Loot, predicates, tags, functions (2F3) |
| The jar cache | Models, block and item definitions, block and item textures, `en_us`, placed features; live worldgen adds worldgen folders at schema 4 (2F5) | The extraction, the cache, the set-up banner | Vanilla tags, loot tables and the other data folders; more texture folders; structures; sounds are not in the jar at all (3F2) |
| Creator preview | `CreatorPreview` over `bundlePreviewProject` (`preview/bundle-source.ts`), 150 ms after an answer (2F7) | The bundle-backed project and asset reader | A tab that shows the Studio's own view of the thing |
| AI review | `AiChangesetReview`: a line diff per element and placeholder pictures (2F8) | The review, its Apply | The proposal drawn |
| Sound | Try it's `webAudioOut` (one `AudioContext`, Ogg Vorbis bytes) plays project sounds when an event fires (3F1) | The player | A shared module, a button, vanilla sound files |
| Bodies | The geo renderer and the armour figure; no vanilla mob body (3F4) | Both renderers | Stand-in bodies for vanilla mobs |
| Structures | One template in 3D (`preview/structure.ts`); the Template Pool Studio's pieces and connections table (4F1) | The renderer, `connections.ts` | An assembler and processors |
| Live worldgen | `@msm/terrain`, a worker protocol, markers where a structure may start, reserve B595 (4F3) | The package, the worker, the view controls (seed box, notes, Preview tag) | Pieces in place of markers |

## Size

`app.asar` is 30.5 of 32 MB and the renderer 17.2 of 18 MB (after B569); the stop lines are 31 and 17.5 MB. Live world generation budgets another 0.3 MB. Three batches of views do not fit in what is left, so this plan decides (ADR 0120 D10):

- **B602 runs the gzip reserve of [ADR 0079 D4](adr/0079-compact-vendored-target-data-in-the-asar.md)** (the vendored target data stored gzipped, about 4.9 MB of `app.asar`) before any view code, unless an earlier plan has already run it.
- **The renderer is the tighter budget.** The spike B600 looks for 1 MB of savings in the renderer output first. If it finds less, ADR 0120 D10 raises the renderer budget from 18 to 19 MB (stop line 18.5), amending [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D6; `app.asar` stays at 32 MB.
- **Draft code budgets** (set by each batch's spike): batch 2 0.4 MB, batch 3 0.4 MB, batch 4 0.2 MB of renderer output, every view in a lazy chunk; nothing of the views in the first-paint bundle but the registry's ids.
- Every app brief runs `pnpm build` and `node tools/check-size/index.ts` and reports `app.asar`, the renderer and its new chunks. A brief that would cross a stop line stops and reports.

## Shared decisions

Recorded in ADR 0120 and used by all three batches.

- **One route: `live_view`.** The preview panel gains one preview kind, `live_view`. Which component draws an element is decided by a registry in the app keyed by element kind (`app/src/renderer/src/liveviews/registry.ts`, assembled from `data/index.ts`, `looks/index.ts` and `structures/index.ts`). No plugin API change; third-party kinds are not served (an idea, see ROADMAP).
- **A view is a function of files.** Every view takes a project (or a bundle laid over one), the element, the vanilla reader and the view preferences, and nothing from the session store. That is what lets the same view draw in the panel, in a Studio section, in the Creator and in the AI review (through `bundlePreviewProject`).
- **The frame.** Every view sits in `LiveViewFrame`: the **Preview** tag, the fidelity line (below), the notes naming what was left out, the set-up banner when a vanilla file is needed and the jar is not set up. Silence is not allowed (ADR 0085 D5, ADR 0119 D6).
- **Fidelity levels**, one per part of a view, always shown: **As in the game, checked** (backed by a fixture case measured on the real server on both targets), **About right** (MSM's own drawing or MSM's own random sequence), **Only in the game** (named, never drawn wrong).
- **Follows an edit.** A panel or Studio view asks again 150 ms after the last edit and shows a first result within 250 ms of that; heavy work (a thousand rolls, an assembly, a shader) runs in a worker and arrives in steps. Try it keeps its 300 ms.
- **View choices are not project data.** The seed, the situation, the sample text, the chosen item: all kept with the app's view preferences, never in the project file.
- **Pure logic lives outside the renderer.** Loot, predicates, tags and functions go to `@msm/sim` (Try it needs them too); jigsaw assembly and processors to `@msm/terrain` (the generated ground needs them too); everything else is a view model in the app.

## Batch 2: data (ADR 0120, B600–B618)

### Goals

1. Every one of the 34 data kinds has a live view that follows an edit.
2. Loot, predicates, tags and functions exist once, in `@msm/sim`, so Try it can use them (block drops, chests, the game modes plan's loot steps).
3. The Creator and the AI helper show the thing through the same views.

### Views

| Kind | What the view shows | Where | Follows an edit | Brief |
|---|---|---|---|---|
| `minecraft:loot_table` | **Roll it**: the stacks of one roll at the seed (a dice button rolls again), and **The odds**: for every item that can drop, how often and how many, over 1,000 rolls; the situation picker; what could not be worked out, by name | Preview panel; Try it uses the same code for a project block's drops | 150 ms, the roll at once, the odds in steps | B609 |
| `msm:loot_addition` | Roll it on the vanilla table **with and without** the addition, side by side, the added lines marked | Extra drops Studio section and the panel | as above | B609 |
| `minecraft:enchantment_provider` | Roll it on a chosen item: the enchantments and levels it gives, and the odds | Panel | as above | B609 |
| `minecraft:trial_spawner` | The waves (which mobs, how many at once and in all, per player count) as a strip, and Roll it on its reward tables | Panel | as above | B609 |
| `minecraft:predicate` | **Try it on**: a chosen situation, the answer (yes, no, or "only the game knows"), and the answer of every part of the predicate beside that part | Panel | 150 ms | B610 |
| `minecraft:item_modifier` | A chosen item before and after, as slots with their tooltips | Panel | 150 ms | B610 |
| `minecraft:enchantment` | The tooltip line on a chosen item at each level, the level table (cost, the levels an enchanting table can give, weight), what it goes on (the tag opened up), what it cannot be combined with, and its effects in plain words | Panel; the Creator's Card tab uses it | 150 ms | B610 |
| `minecraft:advancement` | The tab as a tree: this advancement lit, its parents and children, frames and icons, the toast, the criteria as a checklist | Panel | 150 ms | B611 |
| `minecraft:dialog` | The screen: title, body, inputs and buttons, clickable (a button says what it would do) | Panel | 150 ms | B611 |
| `minecraft:damage_type` | The death line for a sample player and killer, in its three forms, and the hurt sound with Play (after batch 3) | Panel | 150 ms | B611 |
| `minecraft:chat_type` | A sample chat line and its narration line, styled | Panel | 150 ms | B611 |
| The 20 tag kinds (`tag/block`, `item`, `entity_type`, `fluid`, `game_event`, `function`, `damage_type`, `enchantment`, `painting_variant`, `banner_pattern`, `dialog`, `instrument`, `point_of_interest_type`, `potion`, `timeline`, `worldgen/biome`, `worldgen/feature`, `worldgen/flat_level_generator_preset`, `worldgen/structure`, `worldgen/world_preset`) | **Everything in it**: the resolved members, tags inside tags opened up (vanilla's from the jar), each with its picture where it has one (blocks, items, mobs' eggs) and where it came from; missing and optional entries marked; **What changed** against vanilla's tag of the same id | Tag Studio section | 150 ms | B612 |
| `minecraft:function` | Beside each line: runs in Try it, or said only. **Run in Try it** runs the function at the player; `/function` works in Try it's chat box; the load and tick tags run in Try it | Function editor gutter; Try it | gutter 150 ms; Try it 300 ms | B613 |
| `minecraft:block_transformer` | The block before and after, with the tool; in Try it the vanilla block as a prop that changes when used | Panel; Try it | 150 ms; 300 ms | B614 |
| `msm:vanilla_block_rules` | The vanilla block as a prop in Try it's hotbar: flattened, tilled, sounding as the rules say | Vanilla block rules Studio section **Try it here**; Try it | 300 ms | B614 |

### Key items

- **Roll it.** `@msm/sim` gains `loot/`: pools, entries (item, tag, loot table, alternatives, group, sequence, dynamic, empty), conditions, functions and number providers of the target, keyed by type id; which ids a target has comes from the target's vendored registries. Random numbers come from a seeded source passed in. **What is checked:** which items can drop, the count ranges, and the odds, against 10,000 rolls per fixture table on the real server (limit 2L1 tolerance). **What is about right:** one roll at a seed is MSM's own roll; the game's roll at the same seed differs, and the view says "Your roll in the game will differ; the odds are the same." A type the evaluator does not know is named and its entry shown as "only in the game", never dropped silently.
- **The situation.** One picker for loot, predicates and item modifiers: presets in plain words ("A player breaks it with a diamond pickaxe", "with Fortune III", "with Silk Touch", "A player kills it", "with Looting III", "It dies by itself", "A chest is opened", "Fishing", "An explosion breaks it") and, in Advanced, the fields behind them (tool and its enchantments, block state, the entity and its flags, the killer, the damage type, weather, time, dimension, biome, position, luck). A condition that needs something the situation does not have answers "only the game knows".
- **Advancements as a tree.** The layout is MSM's own tidy tree (about right); parents, children, frames, icons, titles, hidden ones and the criteria are from the data (checked by structure, not by pixels). Vanilla parents come from the jar. Editing stays in the schema form.
- **Enchantments and item modifiers on a preview item.** Item modifiers are loot functions, so they share `loot/functions`; the result is a slot with the game's tooltip lines drawn by MSM (names from `en_us`). What an enchantment does in a fight is listed in plain words from its effect components, not simulated.
- **Tags.** `@msm/sim` `tags/` resolves a tag over data pack order: project files over vanilla's, `replace`, optional entries, cycles reported. The loot and predicate code use the same resolver.
- **Dialogs.** Drawn by MSM from the dialog's data (about right); buttons run nothing and say what they would do. The Rules step Open a dialog and the game modes plan's welcome dialog get the view through the registry.
- **Functions in Try it.** `sim/commands/` gains the game's own commands the simulation can honour (the list is the spike's 2S7; the draft is `give`, `clear`, `setblock`, `fill` and `clone` inside the area, `summon` of project mobs, `kill`, `tp`, `effect`, `say`, `tellraw`, `title`, `playsound`, `particle`, `time`, `function`, `schedule`, `scoreboard players` set, add and remove, and `execute` with `as`, `at`, `if block`, `if score`, `unless` and `run`). Every other command is said, as today. At most 10,000 commands a tick; a function over that stops with a line.
- **The Creator and the AI helper (B615).** `CreatorPreview` gains a tab **Live** and `AiChangesetReview` a pane **See it**, both drawing `BundleLiveView`: the registry's view of each element the bundle or proposal makes, over `bundlePreviewProject`. B615 also wraps the previews that exist today (the geo renderer for the 9 mob flows, the vehicle preview for the 4 vehicle flows, the Particle and Fluid previews, Try it's merchant screen for the villager flows) as registry entries, so those flows stop showing only an element list. Sounds, looks and patterns join in batch 3 through the same registry.

### Fact table, spike questions and limits

Batch 2 is closed (B618, 2026-11-23): its fact table 2F1–2F15, the spike's answers 2S1–2S15 and the limits 2L1–2L12 with their outcome are in [ADR 0120](adr/0120-live-views-data.md), accepted with findings.

### Briefs

#### B600 Spike: data views against the real game (wave 0; Opus, high effort; one session; engine-mod)

- **Owner files:** throwaway only: a scratch folder outside the repository; `packages/sim/test/loot-spike/` and `app/e2e/live-views-spike.spec.ts` while measuring, deleted before the report; evidence (numbers, tables, screenshots of MSM's own fixture content) in `docs/reference/spikes/b600/`.
- **Scope:** 2S1–2S15 on both targets with `tools/run-fabric-server`, GameTests and client GameTests; data packs written by the spike; vanilla files only from the Loom cache jar, never committed.
- **Exit criteria:** a report answering 2S1–2S15 per target; the supported type lists and the "only in the game" list for B604 and B605; the command list for B606; the jar path list for B603; the tolerance of 2L1; the size answer (savings found, or the budget change of ADR 0120 D10); the interface B601 should stub; throwaway files deleted; `pnpm lint`, `pnpm typecheck` green.

#### B601 Scaffold and stubs (wave 1; Sonnet; after B600 reports)

- **Owner files:** new `app/src/renderer/src/liveviews/`: `registry.ts`, `data/index.ts` (an entry per batch 2 kind, each lazily importing a stub file under `data/`), `frame/LiveViewFrame.tsx`, `frame/fidelity.ts`, `BundleLiveView.tsx`, `view-prefs.ts`, `worker.ts` and `client.ts` (stubs); `app/src/renderer/src/preview/PreviewPanel.tsx` (the `live_view` entry and its lazy route, nothing else); `packages/plugins/datapack/src/kinds/*.ts` and the blocks-items kind files of `msm:loot_addition` and `msm:vanilla_block_rules` (`previewKind: 'live_view'` only); new `packages/sim/src/tags/`, `predicates/`, `loot/` with `api.ts` each and stub modules, new `packages/sim/src/commands/vanilla.ts` and `functions.ts` (stubs); `packages/sim/src/index.ts` (the export lines); new `fixtures/live-views/README.md`; a stub parity class in `engine-mod/parity/`; new skipped `app/e2e/live-views-data-path.spec.ts`.
- **Scope:** the interfaces as B600 reported them: `Situation`, `resolveTag`, `testPredicate` (yes, no, unknown, with a result per part), `rollLoot`, `lootOdds`, `applyItemModifier`, `unsupported()`; `LiveViewProps` (project, element, vanilla reader, preferences); every stub says "not yet" inside the frame.
- **Exit criteria:** `pnpm i` unchanged lockfile, lint, typecheck, `node tools/check-deps/index.ts`, all tests green; the app builds; a loot table selected in the panel shows the frame with "not yet"; check-size.

#### B602 Size reserve: vendored data gzipped (wave 1; Opus; skipped if already done)

- **Done ahead (2026-11-22, [ADR 0123](adr/0123-gzipped-vendored-target-data.md)):** vendored data gzipped and deepslate tree-shaken; `app.asar` 26.0 of 32 MB, renderer 17.4 MB with its budget at 19 MB; stop lines now 31 MB and 18.5 MB. Skip this brief.

- **Owner files:** the main-process reader of vendored data (`readVendored` in `targets.ts`; find with `grep -rn readVendored app/src/main`), the build step that compacts vendored JSON (ADR 0079), `tools/check-size/index.ts` and its README (the gzip check; the renderer budget only if B600 said so), their tests.
- **Scope:** ADR 0079 D4 as written there; ADR 0120 D10.
- **Exit criteria:** app tests and `smoke:packaged` green; `app.asar` reported before and after (expected about 4.9 MB less); cold start time before and after.

#### B603 Jar data reading and IPC (wave 1; Opus; after B601)

- **Owner files:** `packages/interop/src/minecraft-install/extract.ts`, `cache.ts` and their tests; `app/src/shared/platform.ts`; the preload and main files that serve vanilla cache reads (find with `grep -rn "cached vanilla asset" app/src`); `app/src/renderer/src/liveviews/vanilla-data.ts` (new: the renderer's reader, by registry folder and id).
- **Scope:** the path list of 2S4 added to the extraction; the cache schema moves on by one from where live worldgen left it; a bulk read by folder; the rule that these files never leave the cache (no exporter output, no project write, no AI helper context), tested as B577 tests it.
- **Exit criteria:** interop and app tests green; extraction time and cache size reported; without a jar every call answers "not set up".

#### B604 Sim: tags, the situation and predicates (wave 2; Opus)

- **Owner files:** `packages/sim/src/tags/`, `packages/sim/src/predicates/` (conditions and number providers by type id, `situation.ts`), tests under `packages/sim/test/tags/`, `test/predicates/`.
- **Scope:** ADR 0120 D4 and D5. Three answers (yes, no, unknown), a result per nested part, every unknown type reported. Type ids from the target's registries; no version literal.
- **Exit criteria:** package tests green (each supported condition type has a yes and a no case; an unknown type reports; a tag cycle reports; project over vanilla over order); a schema-walk test fails on a condition type of either target that is neither handled nor reported.

#### B605 Sim: loot tables, functions, item modifiers (wave 2; Opus, high effort)

- **Owner files:** `packages/sim/src/loot/` (`table.ts`, `entries.ts`, `functions.ts`, `odds.ts`, `additions.ts` for `msm:loot_addition`, `enchant.ts` for enchantment providers, `trial.ts`), tests under `packages/sim/test/loot/`.
- **Scope:** ADR 0120 D3. Uses B604's interface from B601's `api.ts`; seeded; `lootOdds` in steps so a worker can post progress.
- **Exit criteria:** package tests green (each supported function and entry type; the same seed gives the same roll; odds of a hand-computed table within tolerance); the schema-walk test for functions and entries; speeds of 2S6 reported.

#### B606 Sim: functions and the game's own commands (wave 2; Opus)

- **Owner files:** `packages/sim/src/commands/vanilla.ts`, `functions.ts`, `run.ts`, `parse.ts`, `packages/sim/src/local-source.ts` (the load and tick tags, the command budget), tests under `packages/sim/test/commands/`.
- **Scope:** ADR 0120 D8: the command list B600 set; `understands(line)` for the editor's gutter; everything else said through `SimLog.onlyInMinecraft`.
- **Exit criteria:** sim tests green, `sim-parity.test.ts` unchanged and green; a function of the fixture runs line by line with the expected world; a runaway function stops at the budget with a line.

#### B607 Fixture and measured expectations (wave 2; Opus; engine-mod)

- **Owner files:** `fixtures/live-views/` (a project of self-written tables, predicates, tags, modifiers, an enchantment, advancements, a dialog, functions), its lowering test, `fixtures/live-views/expectations.json`; the parity class in `engine-mod/parity/` and its `fabric.mod.json` line; the step in `.github/workflows/ci.yml`.
- **Scope:** ADR 0120 D9: the real server rolls each table 10,000 times, evaluates each predicate on set-up situations, applies each modifier, resolves each tag and runs each function, on both targets, and records what it saw (observations of MSM's own files).
- **Exit criteria:** the parity class green on both versions; `expectations.json` written by a flag and stable over two runs within tolerance; `./gradlew -p parity build`.

#### B608 App: the frame, the situation picker, item slots and the worker (wave 2; Opus)

- **Owner files:** `app/src/renderer/src/liveviews/frame/` (`LiveViewFrame.tsx`, `fidelity.ts`, new `SituationPicker.tsx`, `ItemSlot.tsx`, `Tooltip.tsx`, `SeedBox.tsx`), `liveviews/worker.ts`, `client.ts`, `view-prefs.ts`; tests under `app/test/components/liveviews/frame/`.
- **Scope:** the shared decisions above; the worker runs odds and any view's heavy work with a cancel token, as live worldgen's client does (reuse its pattern, not its file).
- **Exit criteria:** app tests green (the frame lists a reported type; the banner without the jar; the picker's presets fill the Advanced fields; keyboard use); check-size.

#### B609 Roll it (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/liveviews/data/loot/` (`RollIt.tsx`, `Odds.tsx`, `WithAndWithout.tsx`, `EnchantRoll.tsx`, `TrialSpawner.tsx`), `app/src/renderer/src/studios/blocks-items/AdditionStudios.tsx` (the section), tests.
- **Scope:** the four loot rows of the table; wording of 2L1 and 2L2.
- **Exit criteria:** app tests green (an edit to a weight changes the odds within the budget; a new seed changes the roll and not the odds; an unsupported function is named); check-size.

#### B610 Try it on: predicates, item modifiers, enchantments (wave 3; Opus)

- **Owner files:** `liveviews/data/predicate/`, `liveviews/data/item-modifier/`, `liveviews/data/enchantment/`; `app/src/renderer/src/components/creator/creator-cards.ts` only if the Card tab's enchantment card is replaced by the view (else untouched); tests.
- **Exit criteria:** app tests green (a predicate's parts each show their answer; unknown is shown as unknown, never as no; the level table follows a cost edit); check-size.

#### B611 The advancement tree, dialogs and sample lines (wave 3; Opus)

- **Owner files:** `liveviews/data/advancement/` (`tree-layout.ts`, `AdvancementTree.tsx`), `liveviews/data/dialog/`, `liveviews/data/lines/` (damage type, chat type); tests.
- **Exit criteria:** app tests green (a parent edit moves the node; a vanilla parent without the jar shows the banner; a dialog's every body and input type of the target draws or is named); check-size.

#### B612 Everything in a tag (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/studios/TagStudio.tsx`, new `liveviews/data/tag/` (`TagMembers.tsx`, `tag-pictures.ts`); tests.
- **Exit criteria:** app tests green for a block, an item, an entity type and a worldgen tag (nested tags open; optional and missing entries marked; What changed against vanilla); the largest vanilla tag within the budget; check-size.

#### B613 Functions in Try it and in the editor (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/studios/FunctionEditor.tsx` and `components/function-editor/` (the gutter, Run in Try it), `app/src/renderer/src/tryit/session-source.ts` and the chat box's file (find with `grep -rn "chat" app/src/renderer/src/tryit --include=*.tsx -l`), `liveviews/data/function/`; `packages/sim/test/live-views-parity.test.ts` (plays B607's `expectations.json` through B604–B606); tests.
- **Exit criteria:** app and sim tests green; the parity test green on both targets within tolerance; `e2e/tryit-path` green.

#### B614 Block transformers and vanilla block rules in Try it (wave 4; Opus)

- **Owner files:** new `packages/sim/src/blocks/vanilla-rules.ts` and its one line in `packages/sim/src/blocks/types3/area.ts`, `app/src/renderer/src/tryit/hotbar.ts`, `liveviews/data/block-rules/`, the Vanilla block rules Studio file (find with `grep -rn vanilla_block_rules app/src/renderer/src/studios -l`); tests and one sim-parity scenario per behaviour.
- **Exit criteria:** sim and app tests green; scenarios recorded in the game by the usual flag (one engine-mod run).

#### B615 The Creator and the AI helper show it (wave 4; Opus)

- **Owner files:** `app/src/renderer/src/liveviews/BundleLiveView.tsx`, new `liveviews/existing/index.ts` (registry entries wrapping today's previews for `msm:entity`, `msm:vehicle`, `msm:particle`, `msm:fluid`, `msm:effect`, the merchant kinds), `app/src/renderer/src/components/creator/CreatorPreview.tsx`, `creator-model.ts` (the tab), `app/src/renderer/src/components/ai/AiChangesetReview.tsx`; the preview files 2S14 named as needing a change; tests.
- **Scope:** ADR 0120 D7. The Live tab is the default tab for a flow whose main thing has no Items or Blocks picture.
- **Exit criteria:** app tests green: each of the 9 mob and 4 vehicle flows, Particle, Fluid, Villager trade, Village job, Wandering merchant and Extra drop shows a non-empty Live tab that changes with an answer within 150 ms plus the budget; an AI proposal that adds a block, a mob and a loot table shows all three before Apply; nothing is applied by looking; check-size.

#### B616 e2e (wave 5; Opus)

- **Owner files:** `app/e2e/live-views-data-path.spec.ts`.
- **Scope:** the fixture project: Roll it, a weight edit, a new seed; a predicate turning from yes to no; a tag's members; the tree; a dialog; a function run in Try it; the Mob flow's Live tab; an AI proposal's See it with a fake provider.
- **Exit criteria:** green three runs in a row and in the full e2e run.

#### B617 AI helper words, guide and changelog (wave 5; Opus for the AI part, Sonnet for the guide)

- **Owner files:** the AI helper's prompt files (find with `grep -rln "loot" packages/ai/src`), new `docs/guide/live-views.md`, `docs/guide/README.md`, `docs/site/.vitepress/config.ts`, `CHANGELOG.md` `[Unreleased]`.
- **Exit criteria:** `@msm/ai` tests green; the docs site builds; labels match the code; limits 2L1–2L12 in plain words.

#### B618 Close of batch 2 (wave 6; main session)

- ADR 0120 reviewed against the merged code and accepted with findings; DESIGN section 8; ROADMAP; HANDOFF; the audit's rows changed to *Has one*; `app/CLAUDE.md`, `packages/sim/CLAUDE.md`; the fact table and limits of this batch moved into the ADR.

## Batch 3: looks and sounds (ADR 0121, B619–B633)

### Goals

1. Every one of the 30 kinds has a live view; every sound in the app can be heard where it is picked or defined.
2. Vanilla sounds and looks come from the user's own Minecraft files at runtime, never from the installer.
3. The flows for sounds, patterns, looks and tabs show their result in the Creator through batch 2's registry.

### Views

| Kind | What the view shows | Where | Follows an edit | Brief |
|---|---|---|---|---|
| `minecraft:sounds` | A **Play** button per event and per file of the event, the subtitle, volume and pitch as the event sets them, which file was picked | The sounds form, the How it sounds and Sounds sections, every sound picker (Studios, Rules, the Creator's sound field) | at once | B622 |
| `minecraft:font` | A line of text you type, drawn with the font at GUI scales 1 to 4, missing letters marked | Panel | 150 ms | B624 |
| `minecraft:particle` | The sprites played in order, as the Particle Studio plays its own | Panel | 150 ms | B625 |
| `minecraft:waypoint_style` | The icon at each distance step, on a strip like the locator bar | Panel | 150 ms | B625 |
| `msm:potion` | The bottle, splash bottle, lingering bottle and arrow in the potion's colour, over the names it has today | Potion Studio Preview | at once | B625 |
| `msm:creative_tab` | The tab as a page: its icon on the tab, its items in rows in their order | Creative Tab Studio Preview | at once | B625 |
| `msm:effect` (has one; the rest of its look) | The icon in the corner frame and the swirl colour | Effect Studio Preview | at once | B625 |
| `minecraft:timeline`, `minecraft:world_clock` | A day strip: each value the timeline sets, drawn across the clock's day, with a marker you can drag; the sky colours as swatches | Panel | 150 ms | B626 |
| `minecraft:wolf_variant`, `cat_variant`, `pig_variant`, `cow_variant`, `chicken_variant`, `frog_variant`, `zombie_nautilus_variant` | The mob's body wearing the texture (wild, tame and angry for wolves; the model the variant names), turning; where it spawns as a biome list with the tags opened up | Panel | 150 ms | B627 |
| `minecraft:cat_sound_variant`, `pig_sound_variant`, `cow_sound_variant`, `chicken_sound_variant` | A Play button per sound of the set | Panel | at once | B627 |
| `minecraft:sulfur_cube_archetype` | The cube with its look, a bounce drawn from its numbers, and its sounds with Play | Panel | 150 ms | B627 |
| `msm:villager_type` (and the look of `msm:villager_profession`) | A villager body wearing the type, and a job's clothes over it at each level badge | Villager look and Profession Studio pictures | at once | B627 |
| `minecraft:painting_variant` | The painting on a wall at its size, beside a player figure for scale | Panel | 150 ms | B628 |
| `minecraft:banner_pattern` | On a banner and on a shield, in a dye colour you pick | Panel | 150 ms | B628 |
| `minecraft:trim_pattern`, `minecraft:trim_material` | On the armour figure, with a material (or pattern) and an armour you pick | Panel (the armour figure) | 150 ms | B628 |
| `minecraft:decorated_pot_pattern` | On the four sides of a pot | Panel | 150 ms | B628 |
| `minecraft:shader` | Whether it compiles for the app's graphics, with the compiler's lines; where it can be run, on a test picture | Panel | 150 ms after typing stops | B629 |
| `minecraft:post_effect` | The chain of passes as a diagram; where every pass can be run, the effect on a still frame of Try it | Panel | 150 ms | B629 |
| `minecraft:jukebox_song` | Play, stop and a time line; its length against the length the data states; the comparator output | Panel; the Music disc flow | at once | B630 |
| `minecraft:instrument` | Play the call; its range drawn as a circle with a scale | Panel; the Goat horn flow | at once | B630 |

### Key items

- **Sounds everywhere.** One shared `audio/` module (moved out of `tryit/effects.ts`, which then uses it) and one `SoundPlayButton`. It resolves an event id through the project's `sounds.json`, then vanilla's; picks a file by weight as the data says; plays at the event's volume and pitch. **Vanilla sound files are not in the client jar**: they are loose files in the launcher's asset store, named by hash and listed in its asset index (3F2, verify at implementation). They are read from the user's own Minecraft folder on demand through IPC and never copied anywhere. Without a set-up Minecraft folder the button is off with the set-up link. One sound at a time; a second press stops.
- **Stand-in bodies.** Vanilla mob shapes are code, not files, so the jar has no body to draw (3F4). MSM draws its own stand-in bodies for the seven variant mobs, the villager and the sulfur cube: geo models written by MSM from what the game shows (measured by client GameTest screenshots in B619) and from the layout the user's own texture files have. They are labelled **About right**. Mojang's Bedrock geometry files are Mojang's assets and are not used. If B619 finds a body cannot be learned well enough, that variant's view shows the texture sheet flat with its parts named, and says so. Reserve B646 lets the runtime's dev mode write the real boxes from the user's own game.
- **Paintings, banners, trims, pots.** MSM's own simple shapes (a wall and a frame, a banner and a shield, a pot); the armour figure exists. Trim colours come from the material's palette picture applied to the pattern's picture, as the data names them; vanilla's pictures from the jar (more texture folders in B621).
- **Fonts.** Bitmap, space and reference providers are drawn exactly from their pictures; TrueType providers through the browser's own font loading (about right); `unihex` is named as only in the game unless B619 finds it cheap.
- **Shaders and post effects.** The app draws with WebGL 2; the game's shaders are written for desktop OpenGL. B619 measures how many of the jar's post programs and a set of self-written shaders compile after a small, mechanical translation (the version line, precision, `#moj_import` includes from the jar, uniform blocks). ADR 0121 D8: where a shader compiles, it is run on a test picture and a post effect on a still frame of Try it, labelled About right; where it does not, the view shows the compiler's lines against the user's own code and the pass chain as a diagram, and says the effect itself is only in the game. No shader is ever rewritten by guesswork.
- **Potion bottles and creative tabs.** The bottle is vanilla's own two pictures from the jar with the colour laid on the liquid as the item definition's tint says; without the jar, MSM's drawn bottle. The tab page is MSM's drawing with the items' pictures.
- **My things** gains cards for particles and sounds (the audit's note), each opening the view.

### Fact table (3F1 to 3F12)

| # | Fact | Source |
|---|---|---|
| 3F1 | Try it's sound player: `webAudioOut`, one `AudioContext` for the app, Ogg Vorbis bytes, project sounds only; a vanilla sound is a caption with a note | `app/src/renderer/src/tryit/effects.ts`, `TryItView.tsx` |
| 3F2 | The client jar holds no sound files; `sounds.json`, the `.ogg` files and the non-English language files are in the launcher's asset store (`assets/indexes/`, `assets/objects/`) | (verify at implementation; B619) |
| 3F3 | No play button exists outside Try it; the Creator has an audio field (`CreatorAudioField.tsx`) and the Studios a Sounds section (`SoundsSection.tsx`) | the audit; `app/src/renderer/src/components/creator/`, `studios/blocks-items/` |
| 3F4 | The art generator draws vanilla mob variant textures as an even coat because "their layout is not MSM's to know" | `packages/plugins/library/src/art/skins.ts` |
| 3F5 | The geo renderer draws `msm:geo_model` bodies with animations; the armour figure draws equipment layers | `app/src/renderer/src/preview/geo/`, `ArmourPreviewView.tsx` |
| 3F6 | The Villager look Studio shows flat pictures; the Potion Studio the four names; the Creative Tab Studio a text summary | the audit |
| 3F7 | `minecraft:shader` is a raw file, unchecked; post effects and waypoint styles are schema forms | ADR 0106; the audit |
| 3F8 | The jar extraction keeps only `textures/block` and `textures/item` | `packages/interop/src/minecraft-install/extract.ts` |
| 3F9 | The Particle Studio plays `msm:particle` frames (`ParticlePreview.tsx`, `particle-frames.ts`) | `app/src/renderer/src/studios/blocks-items/` |
| 3F10 | The Creator's gaps: Music disc and Goat horn play nothing; Banner pattern, Armour trim and Pot pattern show items but not the pattern in place; Creative tab shows no tab | the audit |
| 3F11 | My things has no card for particles or sounds | the audit |
| 3F12 | Showcase and Try it already fall back to stills and captions without WebGL or under reduced motion | ADR 0118 D7–D9 |

### Spike questions (3S1 to 3S12), answered by B619 on both targets

| # | Question |
|---|---|
| 3S1 | Where the launcher keeps the asset index and objects for each supported launcher kind; how `@msm/interop` finds them from the install it already knows; read time for one sound |
| 3S2 | Do all vanilla sound files decode in the app (mono, stereo, long music)? Memory for a music disc; streaming or whole-file |
| 3S3 | For each of the seven variant mobs, the villager and the sulfur cube: can a stand-in body be written from screenshots and the texture layout so the user's texture sits right? Which model names does a variant offer per target? |
| 3S4 | The texture folders batch 3 needs from the jar (entity, painting, banner and shield patterns, trims and their palettes, pot patterns, GUI sprites for the tab and effect frame, particle, font, potion overlays), counts, sizes, cache growth |
| 3S5 | Trim colouring: is "the palette picture applied to the pattern picture" what the game shows (client GameTest screenshot against MSM's drawing)? |
| 3S6 | Banner and shield pattern layering and dye colours (from the target's dye facts), by screenshot |
| 3S7 | Font providers per target; which are exact from data; the cost of `unihex` |
| 3S8 | Shaders: the share of the jar's post programs, and of a self-written set, that compile under WebGL 2 after the mechanical translation; which constructs fail; whether core shaders can be shown at all |
| 3S9 | Post effects: the pass, target and uniform fields per target; a Try it still frame as the input; speed under SwiftShader |
| 3S10 | Timelines and world clocks: fields per target, which values can be drawn as a strip (verify both targets have both) |
| 3S11 | Waypoint styles, the creative tab page and the effect frame by screenshot, for proportions |
| 3S12 | Size of this batch's chunks; whether the stand-in bodies fit the 100 kB renderer JSON rule (they are code or small JSON) |

### Limits (3L1 to 3L12)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| 3L1 | **Minecraft's own sounds need your Minecraft folder.** | Never shipped; not in the jar. | The Play button is off with the set-up link; your own sounds always play. | Set up the folder once. |
| 3L2 | **A sound is heard flat.** | No world around it. | No distance, no echo, no category volume. | Try it, Play. |
| 3L3 | **Mob bodies are MSM's stand-ins.** | The game's shapes are code. | "About right"; small parts may sit differently. | Reserve B646; Play. |
| 3L4 | **No vanilla animations on stand-ins.** | As 3L3. | The body turns; it does not walk. | — |
| 3L5 | **Some bodies show as a flat sheet.** | Where 3S3 says no. | The texture with its parts named. | Reserve B646. |
| 3L6 | **Shaders run only where the app's graphics can.** | WebGL 2 is not the game's OpenGL. | Compiles and runs, or the compiler's lines and "only in the game". | Play. |
| 3L7 | **Post effects are shown on a still frame of Try it.** | No live game picture. | One frame, not motion. | Play. |
| 3L8 | **No WebGL: flat pictures.** | As the preview panel today. | Textures and sheets instead of bodies; sounds still play. | — |
| 3L9 | **TrueType and unihex fonts are about right or named.** | Browser text drawing; file size. | A label on the line. | Play. |
| 3L10 | **The creative tab page is a drawing.** | The game's screen is its code. | Order and icons are the data's; search and scrolling are not there. | Play. |
| 3L11 | **A day strip shows values, not the sky.** | The sky's drawing is the game's. | Swatches and numbers over the day. | Try it's Sky choice for dimension types. |
| 3L12 | **Other languages' text does not show.** | Only `en_us` is read (the audit). | English names. | An idea, not in this plan. |

### Briefs

#### B619 Spike: looks and sounds (wave 0; Opus, high effort; one session; engine-mod for client GameTest screenshots)

- **Owner files:** throwaway only; evidence in `docs/reference/spikes/b619/` (numbers and screenshots of MSM's own test content; no vanilla file).
- **Exit criteria:** a report answering 3S1–3S12 per target; go or no-go per stand-in body, for shaders and for post effects; the path lists for B621; the interface for B620; throwaway files deleted.

#### B620 Scaffold and stubs (wave 1; Sonnet; after B619 reports)

- **Owner files:** `app/src/renderer/src/liveviews/looks/index.ts` (an entry per batch 3 kind, lazy stubs under `looks/`), `liveviews/registry.ts` (the one line that adds `looks`), new `app/src/renderer/src/audio/` (`player.ts` moved from `tryit/effects.ts`, `SoundPlayButton.tsx` stub, `resolve.ts` stub), `app/src/renderer/src/tryit/effects.ts` (imports the moved player, nothing else), the kind files of the 30 kinds (`previewKind: 'live_view'` where the view is in the panel), new skipped `app/e2e/live-views-looks-path.spec.ts`, a stub client GameTest class if B619 asked for one.
- **Exit criteria:** all tests green; Try it's sounds as before (`e2e/tryit-path`); check-size.

#### B621 Jar textures, sound files and IPC (wave 1; Opus; after B620)

- **Owner files:** `packages/interop/src/minecraft-install/extract.ts`, `cache.ts`, new `packages/interop/src/minecraft-install/asset-index.ts`; `app/src/shared/platform.ts`, the preload and main files of vanilla reads; `app/src/renderer/src/audio/vanilla-sounds.ts`; tests.
- **Scope:** ADR 0121 D2 and D3: the texture folders of 3S4, the cache schema moved on by one; the asset index reader and a read of one object by its listed path, on demand, size-capped, never cached or copied.
- **Exit criteria:** interop tests green with a fake install for each launcher kind; a path outside the asset store is refused; cache size reported.

#### B622 The sound player and Play everywhere (wave 2; Opus)

- **Owner files:** `app/src/renderer/src/audio/` (all but `vanilla-sounds.ts`), `studios/blocks-items/SoundsSection.tsx` and the How it sounds section's file, `components/creator/CreatorAudioField.tsx`, `components/thing-picker/` (the sound rows), the Rules sound pickers (`studios/rules/id-pickers.tsx`), the schema form's widget for sound event ids (find with `grep -rn "sound_event" app/src/renderer/src/forms -l`), `liveviews/looks/sounds/`; tests.
- **Exit criteria:** app tests with a fake player: every listed place has the button; the event's weight, volume and pitch are honoured; one sound at a time; off without the folder for vanilla ids; a test fails if a new sound picker is added without the button (a walk over the picker registry); check-size.

#### B623 Stand-in bodies and shapes (wave 2; Opus)

- **Owner files:** new `app/src/renderer/src/liveviews/looks/bodies/` (one file per body, `index.ts`, `shapes.ts` for wall, frame, banner, shield and pot), tests.
- **Scope:** ADR 0121 D4, only the bodies B619 said yes to. Which body a variant's `model` names comes from the target (a fact added by B621 only if B619 asked; else a table keyed by the data's own strings).
- **Exit criteria:** every body loads in the geo renderer; a test draws each with a marked test texture and checks each named part shows its own colour.

#### B624 Fonts (wave 2; Opus)

- **Owner files:** `liveviews/looks/font/`; tests.
- **Exit criteria:** app tests green (a bitmap provider draws the typed line; a missing glyph is marked; a provider the view cannot draw is named).

#### B625 Flat looks: particle sprites, waypoint styles, potions, tabs, effect frames (wave 2; Opus)

- **Owner files:** `liveviews/looks/particle/`, `looks/waypoint/`, `looks/potion/`, `looks/tab/`, `studios/blocks-items/PotionStudio.tsx`, `CreativeTabStudio.tsx`, `EffectStudio.tsx`; tests.
- **Exit criteria:** app tests green (the bottle's colour follows the potion's; the tab's order follows the data); check-size.

#### B626 The day strip (wave 2; Opus)

- **Owner files:** `liveviews/looks/day/`; tests.
- **Exit criteria:** app tests green (a keyframe edit moves the strip; a clock's length rescales it; a value type the strip cannot draw is named).

#### B627 Variants, villagers, the sulfur cube and their voices (wave 3; Opus)

- **Owner files:** `liveviews/looks/variant/`, `looks/villager/`, `looks/sulfur-cube/`, `studios/entities/VillagerTypeStudio.tsx`, `ProfessionStudio.tsx`; tests.
- **Exit criteria:** app tests green for all seven variant kinds, four sound variant kinds, the archetype and the villager type; a body B619 refused shows the flat sheet with its line; check-size.

#### B628 Paintings, banners, trims and pots (wave 3; Opus)

- **Owner files:** `liveviews/looks/painting/`, `looks/banner/`, `looks/trim/`, `looks/pot/`, `app/src/renderer/src/preview/ArmourPreviewView.tsx` and `armour-preview.ts` (a trim layer); tests.
- **Exit criteria:** app tests green; the armour preview's existing tests unchanged and green; check-size.

#### B629 Shaders and post effects (wave 3; Opus, high effort)

- **Owner files:** `liveviews/looks/shader/` (`translate.ts`, `compile.ts`, `ShaderView.tsx`), `looks/post/` (`chain.ts`, `PostEffectView.tsx`); tests.
- **Scope:** ADR 0121 D8, exactly as far as B619's go reaches.
- **Exit criteria:** app tests green under SwiftShader (a self-written shader compiles and changes the picture; a shader with a failing construct shows the compiler's lines and the limit, and draws nothing wrong; without WebGL the diagram alone); check-size.

#### B630 Songs, calls and My things (wave 3; Opus)

- **Owner files:** `liveviews/looks/song/`, `looks/instrument/`, `app/src/renderer/src/components/home/MyThings.tsx` (cards for particles and sounds); tests.
- **Exit criteria:** app tests green (a song's stated length against the file's is shown; the Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab and Villager look flows each show a non-empty Live tab); check-size.

#### B631 e2e (wave 4; Opus)

- **Owner files:** `app/e2e/live-views-looks-path.spec.ts`.
- **Exit criteria:** a project sound plays (the fake audio out records it) from three different places; a painting, a banner pattern, a trim and a wolf variant draw and follow an edit; a font draws typed text; green three runs in a row.

#### B632 AI helper words, guide and changelog (wave 4; Opus and Sonnet)

- **Owner files:** the AI helper's prompt files for these kinds, `docs/guide/live-views.md`, `docs/guide/sounds.md`, `CHANGELOG.md` `[Unreleased]`.
- **Exit criteria:** as B617; limits 3L1–3L12 in plain words.

#### B633 Close of batch 3 (wave 5; main session)

- As B618, for ADR 0121.

## Batch 4: assembled structures (ADR 0122, B634–B645)

### Goals

1. A template pool, a jigsaw structure and a processor list each have a live view.
2. Assembly is seeded and stepwise, so a user can see why a piece was or was not joined.
3. The same code places pieces in Try it and in the ground "My world generation", in place of live worldgen's markers.

### Views

| Kind | What the view shows | Where | Follows an edit | Brief |
|---|---|---|---|---|
| `minecraft:worldgen/template_pool` | **Assemble from here**: a start piece of this pool and everything that joins to it, to a depth you choose; a seed box and dice; **Step** adds one piece and lights the two jigsaw blocks that met; a list of pieces tried and refused, each with the reason | Panel (3D); Template Pool Studio link **See it assembled** | 150 ms, then piece by piece | B640 |
| `minecraft:worldgen/structure` | For a jigsaw structure: the whole assembly from its start pool at its size and distance limit, on a flat floor; for every other structure type, a line saying it is only in the game | Panel (3D); **Walk in it** | as above | B640 |
| `minecraft:worldgen/processor_list` | A template you pick, before and after, with a swipe line and a seed; the count of blocks each rule changed | Panel (3D); Structure Studio link | 150 ms | B641 |

### Key items

- **Assembly.** `@msm/terrain` gains `structures/`: the jigsaw rules as the data and the game's behaviour show them (names and targets must match, the joint, a piece may not overlap another or leave the distance limit, the depth limit, the fallback pool, weights, the selection and placement priorities, rotation), written clean room and checked against structures placed on the real server from MSM's own fixture pools. **What is checked:** every join the assembler makes is one the game also accepts, and the piece counts and depths over many seeds fall in the range the game's do. **What is about right:** which pieces a given seed picks; the view says "A building your pools can make. The one in your world will differ."
- **Stepwise.** The assembler is a generator of steps (tried, placed, refused with a reason), so the view can play it, pause it and step it, and a test can read the reasons.
- **Processors.** By type id from the target's registry: the types B634 could measure are applied; others are named. Random ones are seeded.
- **Vanilla pieces** (a pool naming vanilla templates or vanilla pools) come from the jar's structure files; without the jar such a piece is a labelled box of its size if the size is known, else the banner.
- **In Try it.** **Walk in it** loads the assembly as the ground through the structure ground the game modes plan builds (its B558) and, on "My world generation", places the pieces where B585's markers stand, on the generated land. This takes over live worldgen's reserve B595; if B595 has already run, B642 builds on it.

### Fact table (4F1 to 4F8)

| # | Fact | Source |
|---|---|---|
| 4F1 | The Template Pool Studio shows pieces and connections (`connections.ts`), no picture; one template draws in 3D (`preview/structure.ts`) | `app/src/renderer/src/studios/structures/`; the audit |
| 4F2 | Kinds: `structure_template` (JSON lowered to `.nbt`; over 48 a side is a warning), `template_pool`, `structure`, `structure_set`, `processor_list` | game modes plan G5; `packages/plugins/structures/src/kinds/` |
| 4F3 | Live worldgen draws start markers (B585, limit WL5; `app/src/renderer/src/terrain/markers.ts`) and left structures in the ground as reserve B595, not run, with owner folder `packages/terrain/src/structures/` | ADR 0119 findings and limits |
| 4F4 | deepslate has structure placement (where a structure may start) and a structure renderer; no jigsaw assembly and no processors | ADR 0119 context; (verify at implementation) |
| 4F5 | The game modes plan adds chests and loot tables to the Structure Studio (B555) and a structure as a Try it ground (B558) | `docs/PLAN-game-modes.md` |
| 4F6 | The Jigsaw structure flow makes a village of huts placed by `random_spread` | game modes plan G22 |
| 4F7 | The jar extraction holds no structure files today | `packages/interop/src/minecraft-install/extract.ts` |
| 4F8 | Try it's area is 48 by 48 by 32 blocks (or what live worldgen's WS13 allowed) | `packages/sim/CLAUDE.md` |

### Spike questions (4S1 to 4S10), answered by B634 on both targets

| # | Question |
|---|---|
| 4S1 | The jigsaw block's fields and the pool element types per target; which rules can be confirmed by placing fixture structures with the game's own `place` commands and reading the world back |
| 4S2 | Overlap, the distance limit and depth: observed with fixture pools built to hit each rule |
| 4S3 | Priorities and weights: observed distributions over many seeds |
| 4S4 | Projection (rigid, terrain matching) and the structure's start height and terrain adaptation: what can be shown on a flat floor, what only on generated land |
| 4S5 | Processor types per target; which can be learned from before and after worlds of fixture templates |
| 4S6 | The jar's structure files: count, size, extraction time, cache growth; on demand or in bulk |
| 4S7 | Speed: assembling a 100-piece structure in the worker; drawing it; the largest vanilla village as the stress case (jar present only) |
| 4S8 | The tolerance: over how many seeds, and which statistics (piece count, depth, pool use) |
| 4S9 | Which structure types are jigsaw on each target, from the registry |
| 4S10 | How a structure larger than Try it's area is shown (cut, with a line) and what the structure ground of B558 accepts |

### Limits (4L1 to 4L9)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| 4L1 | **A building your pools can make, not your world's.** | The game's random order is its code. | The line above; a seed for MSM's own picks. | Play. |
| 4L2 | **Only jigsaw structures assemble.** | Other types are code. | "This kind of structure is built by the game itself." | — |
| 4L3 | **Vanilla pieces need your Minecraft jar.** | Never shipped. | A labelled box or the banner. | Set up the folder. |
| 4L4 | **Some processors are only in the game.** | 4S5. | Named; the template shown unchanged for that rule. | Added type by type. |
| 4L5 | **On a flat floor, terrain matching is flat.** | No land under it. | A line; pieces sit level. | Walk in it on My world generation; reserve B648. |
| 4L6 | **Feature pieces are about right.** | Features are live worldgen's approximate level. | A tree stands about there. | — |
| 4L7 | **Mobs and chest contents in pieces are listed, not placed.** | Try it's limits. | A count; chests show Roll it from batch 2. | Play. |
| 4L8 | **Big structures are cut in Try it.** | The area's size. | A line; the panel shows the whole. | — |
| 4L9 | **Very large assemblies stop at a piece limit.** | Time. | "Stopped at 500 pieces." | Raise the limit in the view. |

### Briefs

#### B634 Spike: jigsaw and processors by observation (wave 0; Opus, high effort; one session; engine-mod)

- **Owner files:** throwaway only; evidence in `docs/reference/spikes/b634/`.
- **Exit criteria:** a report answering 4S1–4S10 per target; the rule list for B637 and the processor list for B638, each rule with the fixture that showed it; the tolerance; the path list for B636; throwaway files deleted.

#### B635 Scaffold and stubs (wave 1; Sonnet; after B634 reports)

- **Owner files:** `packages/terrain/src/structures/` (`api.ts`, stubs `assemble.ts`, `processors.ts`), `packages/terrain/src/index.ts` (the export line), `app/src/renderer/src/liveviews/structures/index.ts` and lazy stubs, `liveviews/registry.ts` (one line), `packages/plugins/structures/src/kinds/json-kinds.ts` (`previewKind: 'live_view'` for the three kinds), `fixtures/structures-parity/README.md`, a stub parity class, new skipped `app/e2e/live-views-structures-path.spec.ts`.
- **Exit criteria:** all tests green; the app builds; check-size.

#### B636 Jar structure files and IPC (wave 1; Opus; after B635)

- **Owner files:** `packages/interop/src/minecraft-install/extract.ts`, `cache.ts`, `app/src/shared/platform.ts`, the preload and main files of vanilla reads, `liveviews/structures/vanilla-pieces.ts`; tests.
- **Exit criteria:** as B603, for the paths of 4S6.

#### B637 Engine: assembly (wave 2; Opus, high effort)

- **Owner files:** `packages/terrain/src/structures/assemble.ts`, `jigsaw.ts`, `boxes.ts`, tests.
- **Exit criteria:** package tests green (every placed pair is a legal join; no overlap; depth and distance kept; the same seed gives the same steps; each refusal has a reason); the speed of 4S7 reported.

#### B638 Engine: processors (wave 2; Opus)

- **Owner files:** `packages/terrain/src/structures/processors.ts` and `processors/`, tests.
- **Exit criteria:** package tests green; a schema-walk test fails on a processor type of either target neither handled nor reported.

#### B639 Fixture and measured expectations (wave 2; Opus; engine-mod)

- **Owner files:** `fixtures/structures-parity/` (self-written templates, pools, structures and processor lists), `expectations.json`, the parity class, the CI step.
- **Exit criteria:** as B607: both versions, stable over two runs within 4S8's tolerance.

#### B640 The assembly view (wave 3; Opus)

- **Owner files:** `liveviews/structures/assembly/` (`AssemblyView.tsx`, `steps.ts`, `StepList.tsx`), `app/src/renderer/src/studios/structures/TemplatePoolStudio.tsx` (the link), tests.
- **Exit criteria:** app tests green (Step adds one piece and lists it; a pool edit reassembles within the budget; a refused piece shows its reason; a non-jigsaw structure shows 4L2; without WebGL the step list alone); check-size.

#### B641 The processor view, the Studio link and the parity test (wave 3; Opus)

- **Owner files:** `liveviews/structures/processors/`, `app/src/renderer/src/studios/structures/StructureStudio.tsx` (the link; after the game modes plan's B555 has merged), `packages/terrain/test/structures-parity.test.ts`; tests.
- **Exit criteria:** app and package tests green; the parity test within tolerance on both targets.

#### B642 Structures in Try it and on generated land (wave 3; Opus)

- **Owner files:** `packages/sim/src/grounds/` (the structure ground's loader, as B558 left it), `app/src/renderer/src/tryit/grounds.ts`, `app/src/renderer/src/terrain/markers.ts` (pieces in place of markers on the ground), tests.
- **Exit criteria:** sim and app tests green; `e2e/tryit-path` and `e2e/worldgen-live-path` green; frame rate reported.

#### B643 e2e (wave 4; Opus)

- **Owner files:** `app/e2e/live-views-structures-path.spec.ts`.
- **Exit criteria:** the fixture's pool assembles, steps, changes with a seed and with an edit; a processor list changes a template; the Jigsaw structure flow's Live tab shows an assembly; green three runs in a row.

#### B644 AI helper words, guide and changelog (wave 4; Opus and Sonnet)

- **Owner files:** the AI helper's prompt files for structures, `docs/guide/structures.md`, `docs/guide/live-views.md`, `CHANGELOG.md` `[Unreleased]`.

#### B645 Close of batch 4 (wave 5; main session)

- As B618, for ADR 0122; the audit then has no *needs one* row left but those the other plans own; this plan is deleted, its fact tables and limits moved into the three ADRs; the golden rule line stays as live worldgen's close wrote it.

### Reserves

- **B646 Bodies from your own game (batch 3; engine-mod; only if the user wants exact bodies or 3S3 fails for most mobs).** The runtime, in dev mode only, writes the part boxes of the mobs' models, obtained through the game's own accessors on the user's machine, to the managed instance's folder; the app reads that file as it reads a save. Never shipped, exported or committed. The pattern of live worldgen's reserve B592.
- **B647 More of the game's commands for functions in Try it (batch 2; only if 2S7's share is low).** Owner files: `packages/sim/src/commands/vanilla.ts`.
- **B648 Terrain-matched pieces on generated land (batch 4; only on 4S4's go).** Owner files: `packages/terrain/src/structures/projection.ts`.

## Rules for every brief

The rules of `docs/HANDOFF.md` "Rules for every brief" apply (clean room, no new dependency, git worktrees in the scratchpad with the given identity and no `git config`, disk and Gradle limits, one owner per shared file per wave, notes for the plan, exit criteria, plain words, models), together with live world generation's own rules, kept in [ADR 0119](adr/0119-live-worldgen-preview.md) "Rules that stay" (clean room for worldgen, vanilla data only from the user's jar at runtime, the engine keyed by type id and folder key, no fork of deepslate, nothing sampled on the main thread, honest views), with these additions:

- **Clean room.** Only `javap` signatures of Mojang classes; never a method body. Behaviour is written from the data's own field names and from what the real game shows on MSM's own fixture content. What cannot be learned that way becomes "only in the game", not a guess. Mojang's Bedrock files are Mojang's assets and are not read.
- **Vanilla files come only from the user's own Minecraft files at runtime** (the client jar; for sounds the launcher's asset store). They are never committed, bundled, exported, written into a project or sent to the AI helper. Tests that need them run only where a jar is present and skip elsewhere; every other test uses MSM's own fixtures.
- **Version facts live in `packages/targets`.** Evaluators are keyed by type id; which ids a version has comes from the target's vendored registries and `TargetFacts`. No brief writes a version literal outside `packages/targets`.
- **Stubs first.** Each batch's scaffold (B601, B620, B635) makes every shared registration point: the registry index of its area with one lazy entry per kind, the `previewKind` lines in the plugins, the export lines of `packages/sim/src/index.ts` or `packages/terrain/src/index.ts`, the fixture folder, the parity class, the skipped e2e spec. No later brief of the batch edits a registry index, a plugin's kind file, a package index or the lockfile.
- **IPC.** Only the batch's jar brief (B603, B621, B636) edits `app/src/shared/`, `app/src/preload/` and `app/src/main/` (B602 edits main's vendored reader only).
- **A view is a function of files.** No view imports the session store; a test in B608 fails if a file under `liveviews/` does.
- **Honest views.** Every view sits in `LiveViewFrame`, shows its fidelity level and names what it left out; a view that silently draws something else is refused at review. A part shown as "checked" without a fixture case is refused at review.
- **Seeded and pure.** No `Math.random` or `Date` in an evaluator; the seed is passed in.
- **Heavy work off the main thread**, with a cancel token.
- **Size.** App briefs run `pnpm build` and `node tools/check-size/index.ts` and report; stop lines 31 MB and 17.5 MB (or the renderer line ADR 0120 D10 sets).
- **The audit.** A brief that gives a kind its view changes that kind's row in `docs/LIVE-VIEW-AUDIT.md` to *Has one* in the same commit, with the measured time.
- **Models.** Opus (`claude-opus-5-5`) at medium effort; the spikes B600, B619, B634 and B605, B629, B637 at high effort; Sonnet (`claude-sonnet-5-5`) for the scaffolds and the guide halves.

## Waves

At most five executors at once and at most two engine-mod executors; no file in two briefs of one wave.

| Batch | Wave | Briefs (parallel) | Engine-mod briefs | Depends on |
|---|---|---|---|---|
| 2 | 0 | B600 spike | B600 | B591 |
| 2 | 1 | B601 scaffold; B602 gzip reserve; then B603 jar data and IPC | none | B600 reported |
| 2 | 2 | B604 sim tags and predicates; B605 sim loot; B606 sim functions; B607 fixture; B608 app frame and picker | B607 | B601, B603 |
| 2 | 3 | B609 Roll it; B610 Try it on; B611 tree, dialogs, lines; B612 tags; B613 functions | none | wave 2 |
| 2 | 4 | B614 block rules in Try it; B615 the Creator and the AI helper | B614 (one recording run) | wave 3 |
| 2 | 5 | B616 e2e; B617 AI words, guide, changelog | none | wave 4 |
| 2 | 6 | B618 close | none | all |
| 3 | 0 | B619 spike | B619 | B618 |
| 3 | 1 | B620 scaffold; then B621 jar textures, sounds and IPC | none | B619 reported |
| 3 | 2 | B622 sounds; B623 bodies; B624 fonts; B625 flat looks; B626 day strip | none | B620, B621 |
| 3 | 3 | B627 variants and villagers; B628 paintings, banners, trims, pots; B629 shaders and post effects; B630 songs, calls, My things | none | wave 2 |
| 3 | 4 | B631 e2e; B632 AI words, guide, changelog | none | wave 3 |
| 3 | 5 | B633 close | none | all |
| 4 | 0 | B634 spike | B634 | B633, B562 |
| 4 | 1 | B635 scaffold; then B636 jar structures and IPC | none | B634 reported |
| 4 | 2 | B637 assembly; B638 processors; B639 fixture | B639 | B635, B636 |
| 4 | 3 | B640 assembly view; B641 processor view and parity; B642 Try it and generated land | none | wave 2 |
| 4 | 4 | B643 e2e; B644 AI words, guide, changelog | none | wave 3 |
| 4 | 5 | B645 close | none | all |
| reserve | | B646 bodies from your own game; B647 more commands; B648 terrain-matched pieces | B646 | their spikes |

## Order, and the game modes plan

**After live world generation's close (B591, done 2026-11-22).** This plan reuses its worker pattern, its view controls, its jar reading (cache schema 4) and, in batch 4, `@msm/terrain` and its markers.

**Recommended order:** live world generation, then **batch 2 with the game modes plan's first waves beside it**, then the rest of the game modes plan, then batch 3, then batch 4.

- Batch 2 comes before the game modes plan's wave 2 because that plan needs what batch 2 builds: its Rules loot steps and its Try it brief (B558) want a loot evaluator in the simulation; its limit M15 ("Try it does not run functions") is what B606 lifts; its Goals flow makes an advancement tab that today shows nothing; its Structure Studio chests want Roll it. Built the other way round, B558 would write a second, smaller loot and function reader to be replaced.
- **Side by side:** the game modes plan's waves 0 and 1 (B547 spike, B548 scaffold, B549 format, B550 plugin API 1.22.0) touch none of batch 2's files and run beside batch 2's waves 0 to 2. Both spikes use the real server: B547 and B600 are the two engine-mod executors. The game modes plan's wave 2 starts when batch 2's wave 2 has merged (the sim modules); from then its B553 and B558 use `rollLoot`, `testPredicate` and the function runner instead of their own. B558 and B563 edit `packages/sim/src/commands/` after B606; B557 edits the library, not `CreatorPreview.tsx` (B615's).
- **The games kinds** (`msm:world_setup`, `msm:one_block`, `msm:team`, `msm:objective`, `msm:timer`, `msm:area`) name their live views in the game modes plan's own briefs (ADR 0119 D1) and add their audit rows there; this plan adds none for them. A one-block phase list and a start chest use Roll it through the registry.
- **Batch 3** has no tie to the game modes plan and runs after it closes (B562), so the app's shared files (`MyThings.tsx`, `tiles.ts` neighbours, Try it's sound code) have one owner at a time.
- **Batch 4** runs last: B641 edits `StructureStudio.tsx` after B555, and B642 uses the structure ground B558 builds.
- **If the user wants the game modes plan whole and first:** batch 2 then follows it, and B604–B606 take over what B553 and B558 wrote for loot and functions; nothing else changes.

**Overlaps with live world generation:** B585's markers and reserve B595 (taken over by B642); the cache schema (each jar brief moves it on by one from wherever it stands); `PreviewPanel.tsx` (one line each, in different scaffolds, never in the same wave); the Creator's map for world flows stays B587's and is not replaced by the Live tab (the Live tab shows it for those flows).

**Versions:** no plugin API change and no Script API change are planned. If a spike shows the target must state something (the model a variant names, the jigsaw structure types), the batch's jar brief adds it as the next plugin API minor after live worldgen's 1.21.0 (B577) and the game modes plan's 1.22.0 (B550), numbered by the main session.

## Very easy wording

- Loot: "Roll it", "Roll again", "The odds", "out of 1,000 rolls", "What happens to it?", "A player breaks it with a diamond pickaxe", "A player kills it", "It dies by itself", "A chest is opened", "Your roll in the game will differ; the odds are the same."
- Tags: "Everything in it", "comes from", "not found", "optional", "What changed".
- Predicates and modifiers: "Try it on", "Yes", "No", "Only the game knows", "Before", "After".
- Functions: "Run in Try it", "Runs in Try it", "Only in the game".
- Sounds: "Play", "Stop", "Set up your Minecraft folder to hear Minecraft's own sounds."
- Looks: "About right", "Type some text", "Pick a colour", "On a banner", "On a shield", "On armour", "On a pot".
- Structures: "Assemble from here", "Step", "Play", "Seed", "Roll a new seed", "did not fit", "A building your pools can make. The one in your world will differ.", "This kind of structure is built by the game itself.", "Walk in it".
- The Creator and the helper: "Live", "See it".

## Notes from implementation

### B600 (spike, 2026-11-22; evidence and the full answers in [`docs/reference/spikes/b600/README.md`](reference/spikes/b600/README.md))

- **Go on every decision of ADR 0120**; no no-go route triggered; D10 already done by ADR 0123 (renderer 17.6 of 19 MB at 5d06bc5, no budget change, no saving needed).
- **2L1 tolerance:** 2 percentage points per outcome (item and count, or yes and no) between 10,000 game rolls and MSM's odds from at least 100,000 seeded rolls; 3 points for explosion cases (2,000 rolls). Correct models stayed within 1.43 points on both targets.
- **Format since 26.3 (both targets):** `modifier` and `condition` (one, a list, or an id) in place of `functions` and `conditions`; tag entries take `items: "#tag"`; `loot_table` entries take `value` and `expand`; no `block_state_property` (it is `match_block`); numbers are `context_int_provider` and `context_float_provider` with a required `type` (no `loot_number_provider_type` registry); `time_check` needs `clock`. A predicate or item modifier **file** must be one object (a list or bare id stops the server, though the vendored mcdoc allows it): a validator follow-up.
- **B604/B605 type lists:** checked: entries `item`, `empty`, `tag`, `loot_table`, `alternatives`, `group`, `sequence`; conditions `random_chance`, `random_chance_with_enchanted_bonus`, `table_bonus`, `survives_explosion`, `killed_by_player`, `match_tool` (enchantments), `inverted`, `all_of`, `any_of`, `weather_check`, `time_check`, `entity_properties` (type, flags), `entity_scores`, `int_value_check`, `location_check`, predicate ids; functions `set_count`, `limit_count`, `apply_bonus` (3 formulas), `enchanted_count_increase`, `explosion_decay`, `set_damage`, `enchant_randomly`, `enchant_with_levels`, `sequence`, `set_name`, `set_lore`, `set_enchantments`, `furnace_smelt`, `set_components`; ints `uniform`, `binomial`, `weighted_list`, `number_dispatcher`, plain. About right (not measured): `bonus_rolls`, `quality`, `match_block`, `float_value_check`, `conditional`, the arithmetic providers, level-based values other than `linear`, `set_item` and `discard` (must be supported: they change the odds), the component setters. Only in the game: `dynamic`, `slots`, `damage_source_properties` beyond the situation, `enchantment_active_check`, `environment_attribute_check`, `score`, `storage`, `environment_attribute`, `copy_*`, `fill_player_head`, `exploration_map`, `set_random_dyes`, `set_random_potion`.
- **Semantics:** a pool expands entries into candidates (conditions then), then picks one by weight per roll; modifiers entry, then pool, then table; Looting-style bonuses read the attacker's weapon, not a tool; explosion decay and `survives_explosion` apply only when the cause decays (block yes, TNT no by default); `set_damage` is durability left; `/loot` passes no luck.
- **B603 jar folders to add:** `advancement`, `loot_table`, `predicate`, `enchantment`, `enchantment_provider`, `damage_type`, `chat_type`, `dialog`, `trial_spawner`, `block_transformer`, `context_int_provider`, `context_float_provider`, `tags/item`, `tags/entity_type`, `tags/fluid`, `tags/game_event`, `tags/damage_type`, `tags/enchantment`, `tags/painting_variant`, `tags/banner_pattern`, `tags/dialog`, `tags/instrument`, `tags/point_of_interest_type`, `tags/potion`, `tags/timeline`: +3,875 files, +2.6 MB, extraction 179 to 237 ms median (26.3). No `tags/function` and no `item_modifier` in either jar. Read in bulk by folder (all advancements parse in 8 to 15 ms).
- **Tags (B604, B612):** project merges into vanilla's, `replace` replaces, optional missing entries skipped, duplicates once; a missing required entry drops the whole tag and every tag naming it; a cycle drops every tag in it.
- **B606 commands:** `give`, `clear`, `setblock`, `fill`, `clone`, `summon` (project mobs), `kill`, `tp`/`teleport`, `effect`, `say`, `tellraw`, `title`, `playsound`, `particle`, `time`, `function`, `schedule`, `scoreboard players set|add|remove`, `scoreboard objectives add|remove|setdisplay`, `tag`, `return`, `data get entity` (named paths), `dialog show`, `execute as|at|positioned|in|if/unless block|score|predicate|entity|store result/success score|run`, macro lines. Share of the 74 library and fixture lines: 74 % with the draft list, 89 % with this list; B647 not needed.
- **B611:** the game's tree is a tidy tree (contours, sibling gap 1, parent at the midpoint of its first and last child, nodes without a display skipped) in the game's own sibling order, which differs by version and between server and client; MSM's tidy tree reproduces 98 to 100 % of y given that order, 0 to 33 % in id order (2L5 stands). Dialog proportions in the README (title y 13, footer y 214 at 240 high, 200-wide inputs 10 apart, 150-wide buttons, 22-pixel rows).
- **Interface for B601 to stub** (`packages/sim/src/*/api.ts`): `type Answer = 'yes' | 'no' | 'unknown'`; `interface Situation { context: string /* a context_key_set id */; tool?: ItemSample; block?: { id: string; state?: Record<string, string> }; thisEntity?: EntitySample; killer?: EntitySample & { player: boolean; weapon?: ItemSample }; directKiller?: EntitySample; damage?: { type: string }; explosion?: { power: number; decays: boolean }; weather?: { raining: boolean; thundering: boolean }; time?: { clock: string; ticks: number }; dimension?: string; biome?: string; position?: readonly [number, number, number]; luck?: number }`; `interface ItemSample { id: string; count: number; enchantments?: Record<string, number>; components?: JsonObject }`; `interface Unsupported { kind: 'entry' | 'condition' | 'function' | 'number' | 'level_value' | 'formula' | 'reference'; type: string; path: string; reason: 'not_supported' | 'needs_world' | 'missing_file' }`; `interface EvalContext { random: SeededRandom; lookup(folder: string, id: string): Json | undefined; resolveTag(registry: string, id: string): ResolvedTag; types: TargetFacts /* registries */ }`; `testPredicate(p, situation, ctx): { answer: Answer; parts: PartResult; unsupported: Unsupported[] }`; `resolveTag(registry, id, lookup): ResolvedTag` (`members` with origin and the chain, `missing`, `cycles`, `dropped`, `replaced`); `rollLoot(table, situation, ctx): { stacks: LootStack[]; unsupported }`; `lootOdds(table, situation, ctx, { rolls, step, cancel }): Iterable<{ done: number; rows: OddsRow[] }>` (a row per item key: item, enchantments, damage; chance, mean, counts); `applyItemModifier(modifier, item, situation, ctx)`; `unsupported(kind, type, path, reason)`.
- **B607:** 10,000 rolls cost 25 to 460 ms a case through `loot insert`; under a minute a version in CI; roll blocks with `mine <pos> mainhand` as a mock player holding the tool, mobs with `DeathLootTable` and `kill` as the killer; the spike's Java and fixture generator are in the evidence folder.
- **B615:** no preview imports the session store; one bundle-backed `BlocksItemsStudioHost`, and extract the fluid picture, the effect icon and the potion bottles into components; `MerchantScreen` needs a wrapper building `OpenMerchant` from the bundle's lowered files.

### B619 (spike, 2026-11-23; evidence and the full answers in [`docs/reference/spikes/b619/README.md`](reference/spikes/b619/README.md))

- **Sounds (3S1, 3S2):** the asset store is `<store>/assets/indexes/<assetIndex.id>.json` (the version JSON names the id: 34 on 26.3, 36 on 26.4-snapshot-7) and `objects/<hh>/<sha1>`, under the official root, the Prism or MultiMC root, or CurseForge's `Install/` (the last two: verify at implementation). `sounds.json`, every `.ogg`, the unifont zips and the non-English lang files are there, not in the jar. All 4,961 and 5,231 sounds decode in the app's Chromium; short sounds decode in 3 ms (median), the longest track in 3 s to 319–347 MB, so `stream: true` and large sounds play through a media element (the CSP needs `media-src 'self' blob:`). IPC read 0.7 ms (first 34 ms), 31 ms for the largest object. Budgets: 200 ms project, 300 ms first vanilla press.
- **Bodies (3S3):** decoded from MSM's coded textures on 28 bodies on both targets: boxes with the standard texture layout, one texel one model pixel (cat 0.8, sulfur cube 0.5 or 1.5 by `Size`, outer layers inflated), the same on both targets; babies are their own models. Go for wolf, cat, pig, cow, chicken (wings at rest), frog, villager (by hand: arms at an angle, inflated robe and hat) and the sulfur cube, eighteen bodies with their babies and model names; **no-go for the zombie nautilus** (never still; flat sheet, B646). Face lists for B623 in the evidence.
- **Looks (3S5, 3S6, 3S11):** trim key level i becomes palette colour i, but only when the pattern's `.png.mcmeta` names its key (`palette.base_palette`, since 26.3); non-key colours pass through; equipment `trim_overrides` swap palettes. Banner layers are pattern × dye, alpha-blended in order (within 5.4 of 255 for all 16 dyes); **26.4 has no dye colour accessor**, the values are unchanged, and the app needs them from a fact or a table. Waypoint sprite by distance: first below near, last from far, the middle ones evenly between.
- **Fonts (3S7):** bitmap advance = round((rightmost opaque column + 1) × height ÷ cell height) + 1, missing glyph 6, space and reference exact; TrueType within about 1 px a word; unihex from the asset store, 250 ms in a worker: in scope.
- **Shaders (3S8, 3S9):** 26.x uses `#include <ns:path>`, the separate-shader-objects extension, varying locations and `gl_VertexIndex`, not `#moj_import`; seven mechanical rules make post programs 9 of 9 and core 73–76 % compile; MSM's own 9 of 14 (the rest desktop-only implicit conversions and `texture2D`). Go for post and self-written shaders; core compile-check only. All five jar post effects and MSM's chain run on a still frame, 18 to 554 ms a frame under SwiftShader; the post vertex shader is `core/screenquad` on 26.3 and `core/screentriangle` on 26.4.
- **Day strip (3S10):** a world clock has no fields; the period is the timeline's `period_ticks` (B626's exit criterion changes); 45 of 52 attribute types draw on a strip.
- **Size (3S12):** the renderer is 18.23 MiB of 19 at 29b3920 (0.27 MiB to the stop line); batch 3 needs about 0.35, so the lazy Java project generator (ADR 0123 D4 follow-up) comes first.
- **Interface for B620 and path lists for B621:** in the evidence README.

- **Orchestrator's decisions on B619 (2026-11-23):** the sixteen dye colours become a target fact (`TargetFacts.dyes`, plugin API **1.25.0**, since 1.24.0 is ADR 0126's), because version facts live only in `packages/targets` and 26.4 measures the same values without an accessor; B621 adds it with the jar folders. The size condition is met differently from what the spike assumed: ADR 0126 moved the Java project generator out of first paint, and `tools/check-size` gains a first-paint budget (ADR 0126 D4 as amended), so batch 3's lazy chunks count against the asar and the renderer total, not against start-up. ADR 0121 D8 uses the spike's seven translation rules in place of `#moj_import`; the CSP gains `media-src 'self' blob:` in B622.
