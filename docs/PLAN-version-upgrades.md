# Version upgrades: plan and briefs (Plan D)

Orchestrator (Fable), 2026-11-25. Checked at commit `e61050d` on `ccr-d077e76e-4gnbx2`. Nothing in the repository was changed by this plan but for this file, [ADR 0136](adr/0136-version-upgrades-noticed-moved-and-explained.md) (Proposed), a ROADMAP section, one pointer line in DESIGN §9 and a DEVLOG entry. Brief ids **B810 to B839** (B801 to B809 are left free for the plans already running). The running plans (`PLAN-one-mode-rest.md`, `PLAN-game-studio.md`, `PLAN-instances.md`, `PLAN-paper.md`, `PLAN-live-views.md`) are not changed.

The user's words (2026-11-25): "also make a system to automatically upgrade a mods version for the next minecraft, it should tell you what has changed and what needs to change. etc"

In one paragraph: the app notices that a newer Minecraft is ready for the open mod and has already tried the move on a copy; one button moves the mod, as one undo step, with a copy kept; a report says what changed in Minecraft for this mod, what MCSuperMods changed, what the user must change (each with Show me, and kept in Things to fix until done), what players need and what to check in the game; and MSM's own targets are made by a tool that diffs two versions, so the report is drawn from data.

## 1. What was checked, and what is true

In the code:

| # | Subject | Verified in | Finding |
|---|---|---|---|
| U1 | The migration hook | `packages/plugin-api/src/target.ts` (`MigrationChange`, `MigrationReport`, `Target.migrateFrom`, lines 26 to 52 and 1674) | A change is `{ elementId, description, kind?, data? }`: the element's whole new data and one sentence. No path, no before and after, no link to what changed in Minecraft. Problems are ordinary `Problem`s. |
| U2 | 26.4's migration | `packages/targets/mc-26.4/src/migrate.ts` (277 lines), `removed-ids.ts` (94), `test/removed-ids.test.ts`, `test/migrate.test.ts` | Written by hand. `findRemoved` visits strings in element data and matches a whole string that is a `minecraft:` or bare id (or `#tag`). It does not look inside longer strings (a function's lines, a script's text). One reshape (`default_block`), one rename reported and not applied. The removed-id table is tied to the vendored files by a test. |
| U3 | The move in the app | `app/src/renderer/src/session/project-session.ts` (`upgradeTargetPreview` line 1305, `upgradeTarget` line 1339) | Preview calls the chosen target's `migrateFrom(previous, state)` only: one hop, and a target without a hook answers "No migration needed" (so moving back does nothing but switch). Apply is one `stack.execute` (`app.upgrade-target`), then schemas reload and validation runs. The report is not kept. |
| U4 | The dialog | `app/src/renderer/src/components/UpgradeTargetDialog.tsx` (216 lines; title "Move to another Minecraft version", B716) | Lists the other targets, "n changes, n problems", changes then problems by severity; ids under More options. No Show me, no before and after, nothing about players' needs. |
| U5 | Noticing | `StatusBar.tsx` (`data-testid="project-target"`, "For Minecraft 26.3"), `components/home/YourMods.tsx`, `ThingsToFix.tsx` | Nothing mentions a newer version. Home's cards do not show a mod's Minecraft version. Things to fix has Show me, Fix it and Ask the helper for validation problems. |
| U6 | The dry run exists as a tool | `tools/check-project/` (README steps 2 to 5) | Opens a project in memory with the app's `ProjectSession`, upgrades it as the dialog does, validates and exports it on each target. The app itself never does this before a move. |
| U7 | Developer tools | `tools/sync-mcmeta` (212 lines; `version.json`, `registries.json`, `commands.json`, `blocks.json`), `tools/sync-mcdoc` (254), `tools/sync-feature-order` | Each vendors one target's data. Nothing compares two targets. `packages/targets/CLAUDE.md` "Do add a version by copying the previous folder…" is the whole procedure. |
| U8 | One mcdoc tree for both versions | ADR 0037 Context; `mc-26.4/vendor/vanilla-mcdoc/symbols.json` | The export carries `since` and `until` gates, so both versions' formats can be resolved from one file: a field diff is two resolutions of the same tree, exact as far as upstream is. B810 V3: the gates are by release, never by snapshot, so this holds only across release lines; a re-pin within one line needs the diff of two refs. |
| U9 | Hand-verified facts | `mc-26.4/CHANGES.md` (about 90 rows, each with date and source; several say "(verify at implementation)" or "not re-read on 26.4") | These are the facts a new version must have re-read. No list of them exists as a checklist. |
| U10 | The runtime per version | `engine-mod/versions/26.3.properties`, `26.4.properties`; `app/scripts/stage-runtime.mjs` (`msm_runtime-mc-<mc>.jar`) | Per-version jars staged with the app; versions typed by hand and checked against target facts by `tools/check-deps`. |
| U11 | Per-version gaps | `mc-26.4/src/target.ts` (no `geckolib`, no `javaProject`); exporters' `export.no-geckolib-target`, `export.no-java-project-target` | Shown only when the user exports after moving. |
| U12 | Modpacks | `packages/exporters/src/modpack/` (the `minecraft` dependency is the target's version); ROADMAP line 497 "Update mods re-pins every Modrinth mod for the modpack's Minecraft version" | The re-pin exists as its own action; the move does not offer it or say which mods have no build. |
| U13 | Known gaps on record | ADR 0037 amendment (2026-11-22) | A project moved before a migration fix keeps the old field; moving back does not restore `default_block`. |
| U14 | Sizes | root `CLAUDE.md` | `app.asar` 27.2 of 32 MB, renderer 18.8 of 21, first paint 4.7 of 6. Anything new in the renderer is a lazy chunk. |

Outside the code (read 2026-11-25):

- `piston-meta.mojang.com` version manifest: latest release **26.3**; latest snapshot **26.4-pre-1** (2026-11-24); `26.4-snapshot-8`, `-9`, `-10` between it and the pinned `26.4-snapshot-7`. A pre-release means the 26.4 release is near (an expectation, not a fact). Whether mcmeta, vanilla-mcdoc, Fabric API and GeckoLib have caught up with `26.4-pre-1` is spike question V2: (verify at implementation).

## 2. Decisions taken here (vetoable defaults) and questions for the user

The decisions are ADR 0136's D1 to D15; in short:

- **D1** Automatic means: noticed, prepared, one click, explained, and fed by a diff tool. Never moved without a click.
- **D2** Each target carries a change set against the one before it: a generated part (tool-written, test-tied to the vendored data) and a curated part (renames, sentences, in-game checks, changes not in data).
- **D3** One shared migration engine fed by the change set; chains across versions; inverse steps for moving back.
- **D4** The report comes from a dry run on a copy: migrate, validate, lower, compare with today. Six parts.
- **D5** Notices in the status bar, Things to fix and Home; releases only unless a setting is on.
- **D6** One button; a copy and the report kept in `.msm/upgrades/`; what is left goes to Things to fix under "After moving to Minecraft X" and clears by itself.
- **D7** Check on other versions; moving back restores what moving up dropped.
- **D8** Ejected Java projects get written upgrade notes and a read-only scan; never rewritten.
- **D9** Modpacks: a Modrinth check on a click, re-pins in the same undo step.
- **D10** What players need (loader, Fabric API, runtime jar, GeckoLib, exports) from facts and the dry run's export problems.
- **D11** `tools/diff-targets`, `tools/new-target`, a changed-vanilla-files fact, `VERIFY.md`; proved by rediscovering 26.3 to 26.4.
- **D12** What to check in the game is always listed.
- **D13** Live view: the report follows edits; before and after pairs of each thing's own live view.
- **D14** Dropped targets keep a migration-only record.
- **D15** Plain words; search and the AI helper read the report.

Questions for the user (the spike and wave V1 do not wait for them):

1. **Test versions.** Should the app tell you about snapshots and pre-releases of the next Minecraft, or only about real releases? *Default: only releases. A setting, off by default, turns on notices for test versions; they stay choosable by hand as today.*
2. **A copy before moving.** May the app keep a copy of the mod as it was, in the mod's own hidden folder, each time it is moved (the three newest kept)? *Default: yes. Undo still works; the copy is for after the app was closed.*
3. **Never by itself.** The app prepares the move and shows it, and moves only when you press the button; it never moves a mod on open. *Default: as said. Say so if you want an "always move my mods" setting; it is not planned.*
4. **How many Minecraft versions at once.** When 26.4 is released, should MSM keep building for 26.3 as well? *Default: the newest release, the release before it, and the next version's test builds. Older mods can still be opened and moved up.* (Each extra version costs about 5 MB of the app and doubles the per-version tests.)
5. **Asking Modrinth.** For a modpack, may the report ask Modrinth which mods have a build for the new version? *Default: yes, and only when you press Check my mods, as Update mods does today.*
6. **26.4.** Pre-release 1 came out on 2026-11-24. *Default: when 26.4 is released and Fabric API has a build for it, MSM re-pins its 26.4 target with the new tool as that tool's first real run (B826), and 26.4 becomes the version new mods start on, as the code already does for the newest release. Before the release, B826 only reports what a re-pin would change.*

Not asked, decided: no scheduled GitHub Actions job watches for new versions (Actions sparingly); the main session runs `tools/new-target --check` at each release cut. Moving every mod on Home at once is a reserve brief (B829) that checks all and moves none.

## 3. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules" and "Rules for every brief" and to section 3 of `docs/PLAN-one-mode-rest.md`, which all apply.

- **Read first:** root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the last DEVLOG entry, ADRs 0036, 0037 (with its amendment), 0038, 0130 and 0136, `packages/targets/CLAUDE.md`, `docs/reference/spikes/b810/README.md` once it exists, and section 8's notes.
- **Version facts only in `packages/targets`.** The change sets, the sentences that name a version's things, pack formats and loader versions live in a target package. The app's sentence templates name no version, id or registry member. `tools/check-deps` keeps `26.<n>` out of everything else; the tools under `tools/` take versions as arguments.
- **Not guessed.** A sentence about Minecraft in the report comes from a change-set entry or from a target fact, and a test can point at the entry. A rename is applied only when confirmed in the curated file and proved the same shape against the newer target's mcdoc; otherwise it is reported with a hint.
- **Never without a click; one undo step; the `migrateFrom` contract stays.** New fields on `MigrationChange` and `MigrationReport` are optional. `mc-26.4`'s existing `test/migrate.test.ts` expectations stay green unchanged until a brief says otherwise.
- **Vendored data** is written only by the sync tools; the generated change set only by `tools/diff-targets`. Never by hand.
- **No network in tests.** `tools/new-target` and `sync-*` are the only code that fetches; their tests use fixtures. In the app, only D9's Modrinth check uses the network, on a click.
- **Mojang's files** are never stored: the changed-files fact holds paths and the kind of change, nothing of the contents.
- **One mode** (ADR 0130): plain words first; ids, paths, registries and the text difference under More options. British English, no emojis.
- **Size:** everything the report needs in the renderer is a lazy chunk; the dry run runs in a worker. `node tools/check-size/index.ts` in every app brief, with the three numbers in the DEVLOG entry.
- **Files with one owner at a time across all plans** (named by the main session): `packages/plugin-api/src/target.ts` and both targets' `target.ts` (also Plan A's and Plan C's), `app/src/renderer/src/session/project-session.ts`, `app/src/renderer/src/App.tsx`, `app/src/shared/ipc-channels.ts`, `app/src/renderer/src/components/ThingsToFix.tsx`, `tools/check-deps/layers.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `docs/guide/`, `packages/ai/src/prompt/`.
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests, `node tools/check-deps/index.ts`; app briefs also `pnpm --filter @msm/app build` and `node tools/check-size/index.ts`; a DEVLOG entry.
- **Models:** Opus `claude-opus-5-5` at medium unless said; Sonnet `claude-sonnet-5-5` where said. A stuck brief is rerun on Opus at high.

## 4. Order, and how it fits the other plans

At most five executors at once across all plans. This plan's waves V0 to V2 touch only `tools/`, `packages/targets`, `packages/plugin-api` and `packages/core`; they can run beside the app work of the other plans, apart from the single-owner files above.

| Wave | Briefs (model, effort) | Notes |
|---|---|---|
| V0 | **B810** spike (Opus, high) | Any free slot. Writes only under `docs/reference/spikes/b810/`. |
| V1 | **B811** `tools/diff-targets` (Opus, high) · **B812** plugin API: change sets and migration detail (Opus, medium) | Different areas. B812 not in the same wave as Plan C's B782 or any brief owning `target.ts`. |
| V2 | **B813** the shared migration engine and 26.4 on it (Opus, high) · **B814** `tools/new-target` and the checklist (Opus, medium) · **B815** core: chains, inverse and the report model (Opus, medium) | B813 after B811 and B812. B814 after B811. B815 after B812. No shared file. |
| V3 | **B816** the dry run and the kept copy in the app (Opus, high), then **B817** the notice (Opus, medium) · **B818** the dialog as the report (Opus, high) | B816 first and alone (it owns `project-session.ts` and the IPC file). B817 and B818 then run together: B817 owns the status bar, Home and the Things to fix note; B818 the dialog and the After moving list. `ThingsToFix.tsx` is B818's; B817 passes its note through the props B818 adds first (B818 commits that seam before B817 starts). |
| V4 | **B819** before and after live views (Opus, high) · **B820** other versions and moving back (Opus, medium) · **B821** modpacks (Opus, medium) · **B822** Java project notes (Opus, medium) · **B823** changed vanilla files (Opus, medium) | B823 needs only B811 to B813 and may run in V3's free slots. B821 after question 5. |
| V5 | **B824** `check-project --upgrade-report` and the community repository (Sonnet) · **B825** e2e, guide, search, AI helper lines, changelog (Opus for e2e and prompt, Sonnet for the guide) · **B826** the 26.4 run of the tools (Opus, high) | B826 uses Gradle (counts as one of the two that may). Its re-pin half waits for the release and question 6. |
| V6 | **B827** close (main session) | |
| Reserve | **B828** migration-only records for a dropped target (D14; when question 4 first drops one) · **B829** Check all my mods on Home · **B830** a quick fix for projects moved before a migration was corrected (U13) · **B831** `sync-mcmeta` adapter for the new command report format, or a Spyglass update, with the snapshot-release gating fix (blocks B826; Opus, medium) · **B832** to **B839** free | |

## 5. The briefs

### B810 Spike: what a version change really is, measured (wave V0; Opus, high)

- **Purpose:** the facts the design rests on, before any code.
- **Owner files:** new `docs/reference/spikes/b810/` (README with the answers, throwaway scripts, outputs). Nothing else; throwaway work in the scratchpad.
- **Method:** throwaway scripts over the two vendored folders and over `examples/` and `fixtures/`; mcmeta and vanilla-mcdoc read from their public repositories; no Mojang file stored (paths, counts and hashes only).
- **Questions:**
  - V1 A throwaway differ over 26.3 and `26.4-snapshot-7`: does it find again every hand-found change (the removed-id table to the member, `rule_test` moved, `default_block`, `LargeSpeleothemConfig.base_block`, the changed key name)? List what it finds that nobody wrote down, and what was written down that no data shows.
  - V2 Upstream today: do mcmeta tags, a vanilla-mcdoc ref, Fabric Loader, Fabric API, Loom and GeckoLib exist for `26.4-pre-1` (and the release, if out)? How far behind a new snapshot does each usually run (dates of the last five)?
  - V3 The mcdoc field diff: resolving one `symbols.json` for two versions through its gates; how many dispatcher entries and struct fields differ; false differences; what a diff of two different refs adds.
  - V4 Command tree diff: its size between the two versions; which differences matter to a function's text; whether `@msm/schemas/mcfunction` on the newer target already reports each as a problem with a line and column (so the dry run covers it).
  - V5 Block state diff: properties and defaults changed; where projects hold block states (structures' palettes, worldgen state providers, block predicates, functions).
  - V6 Where ids live outside whole-string element data: functions' text, Rules, scripts, `msm:components`, text components, asset paths, structure `.nbt`. For each, count over `examples/` and `fixtures/` how many removed ids of 26.4 the present walk misses and the newer target's validators catch anyway.
  - V7 Rename candidates: how well "one removed and one added in the same registry, same mcdoc shape or near name" does on 26.2 to 26.3 (a format change with real renames, from mcmeta's tags; nothing vendored) and 26.3 to 26.4: precision and recall against the changelog.
  - V8 Mcmeta's data and assets summaries: can a list of changed vanilla files (paths and kind) be built cheaply; its size for one version step; which paths a project can replace or add to (tags, loot tables, recipes, models, biome additions).
  - V9 The dry run's cost: time and memory to copy, migrate, load the second schema context, validate and lower, for the largest example and for a made 300-element project; in a worker; whether lowering can be skipped or sampled.
  - V10 Two targets' contexts loaded at once in the renderer: memory, and whether the preview registry can draw one element from two lowered sets side by side without a second Try it world.
  - V11 Problem identity: how to say "this problem is new on the new version" (code, element, path) when paths shift; false news on the examples.
  - V12 The After moving list: can each item's own check be the problem's code, element and path re-evaluated by the normal validation pass, plus the id walk; which report items have no such check.
  - V13 Moving back: which of 26.4's steps have exact inverses; what the saved report must hold to restore dropped values; what happens when the element was edited since.
  - V14 Chains: a stand-in third target made in the scratchpad from the 26.4 folder with two invented changes; does 26.3 to the stand-in give the same result as two moves; undo.
  - V15 `.msm/`: what lives there today, what the loader, the exporters and `check-project` do with it, and the size of a project copy for the largest example.
  - V16 Ejected Java projects: what in `docs/reference/eject` and an ejected sample's files names the version (`gradle.properties`, `fabric.mod.json`, data files); does a project record that it was ejected and where; what the read-only scan can and cannot see.
  - V17 Modpacks: the Modrinth calls **Update mods** makes; whether one batched call answers "which of these have a build for version X"; rate limits.
  - V18 Where the shared engine can live so that `tools/check-deps` layers hold (a package under `packages/targets/` imported by target packages only), and what `packages/targets/CLAUDE.md` must say.
  - V19 Asar cost of a generated change set, raw and gzipped; what to leave out (additions as counts with a lazy list).
  - V20 Facts derived from vendored data against facts typed by hand in `mc-26.4/src/target.ts`: a table of every fact, which kind it is, and for the hand ones the `CHANGES.md` row that verified it. This is the seed of `VERIFY.md`.
- **Exit criteria:** V1 to V20 answered with evidence files; a table "kind of change, found by which source, migrated, reported or invisible"; go or no-go on the 5 s budget of ADR 0136 with the fall-back if no-go; the shapes B811 and B812 should use; the changes it asks of section 2 and of the ADR.

### B811 `tools/diff-targets` (wave V1; Opus, high)

- **Purpose:** the generated half of a change set, from data. *The source of "what has changed".*
- **Owner files:** new `tools/diff-targets/` (`index.ts`, `registries.ts`, `mcdoc.ts`, `commands.ts`, `blocks.ts`, `packs.ts`, `candidates.ts`, `README.md`, tests and small fixtures); `tools/package.json` and `tools/vitest.config.ts` lines if needed.
- **Scope:** `node tools/diff-targets/index.ts --from packages/targets/mc-<a> --to packages/targets/mc-<b> [--out <file>] [--draft <CHANGES-draft.md>] [--check]`. Pure and offline. Output, with sorted keys and stable ids: registries added, removed and moved (a moved registry is one whose members all live on unchanged under another name); members added and removed per registry, with "still registered elsewhere"; data format fields added, removed and retyped per resource (shape as B810 V3 settled); command changes; block state changes; pack formats, data version, folder names. `candidates`: likely renames and field moves with the evidence for each, marked unconfirmed. `--check` exits 1 when the file on disk differs from a fresh run. The shape is the `TargetChangeSet` of B812 (agree it from the spike's README; B812 owns the type, this brief a structurally equal local type until B813 joins them).
- **Scope additions (B810):** mcdoc diffed both ways (gated, one tree at two versions, for release steps; two refs for re-pins, refs recorded); registries matched by member overlap, one to one, same-name pairs winning ties; the command report normalised (old `parser`/`properties` and new `argument`, argument-type ids mapped); structure `.nbt` left out of the changed-files input.
- **Acceptance tests:** the candidates also list `large_dripstone` to `large_speleothem` (superset shape), `freeze_immune_entity_types` to `immune_to_freezing`, `friends/loading` to `widget/loading` and `pause_menu/social_interactions` to `pause_menu/feedback`; `interpolated` to `upscale` and `friends/button` to `friends/tab` are marked ambiguous; `rule_test` is moved, not removed; the 12 format changes, `effect`, `test` and `jukebox` `playlist_mode` are found; the 26.4 key names are not expected. Corrected facts: `removed-ids.ts` records three renames (the entity type tags, four GUI sprites, `interpolated` to `upscale`) as removals, and Mojang's snapshot 3 notes state the speleothem rename the wrong way round. On the repository's own 26.3 and 26.4 folders the output's removed members equal `mc-26.4/src/removed-ids.ts` `REMOVED_IDS`, `MOVED_REGISTRIES` and `STILL_REGISTERED_ELSEWHERE` exactly; it lists `default_block` removed from noise settings and `base_block` added to the large speleothem config; `large_dripstone` to `large_speleothem` is among the candidates and marked "shape differs"; a fixture pair with an invented rename, field move and command change is diffed as expected; two runs give byte-equal files.
- **Out of scope:** writing into `packages/targets` (B813), fetching anything, the changed-files list (B823).

### B812 Plugin API: change sets and migration detail (wave V1; Opus, medium)

- **Owner files:** `packages/plugin-api/src/target.ts`, the API report and version files, `packages/plugin-api/CLAUDE.md` if its list needs a line, both targets' `target.ts` (only `previous`), `packages/targets/all/test/targets.test.ts`.
- **Scope:** the next free plugin API minor (1.28.0 is Plan C's B782's; take the next free when this runs). `Target.previous?: string`. `TargetChangeSet` and `TargetChange` (id, area, what happened, registry or resource, subject, from, to, handling `auto` | `manual` | `none`, source, optional sentence, hint and in-game check), `TargetFacts.changes?`. On `MigrationChange`, optional `details` (path as RFC 6901, before, after, change id, one sentence each). On `MigrationReport`, optional `inGameChecks` and `reverses`. Every field documented with "Since". `mc-26.4` sets `previous: 'mc-26.3'`; `changes` stays unset until B813.
- **Exit criteria:** the API tests and report; a targets test that every `previous` names a built-in target and the chain has no loop; nothing else changes behaviour.
- **Out of scope:** any engine or app code.

### B813 The shared migration engine, and 26.4 on it (wave V2; Opus, high)

- **Owner files:** new `packages/targets/migrate/` (`@msm/target-migrate`: `package.json`, `src/engine.ts`, `src/steps/`, `src/walk.ts`, tests, no version fact in it); `packages/targets/mc-26.4/src/migrate.ts`, `removed-ids.ts`, new `src/changes/generated.json`, `src/changes/curated.ts`, `src/changes/index.ts`, `target.ts` (only `changes`), `test/` (`changes.test.ts`, `removed-ids.test.ts`, `migrate.test.ts`), `CHANGES.md`; `packages/targets/all/` (exports, tests); `packages/targets/CLAUDE.md`; `tools/check-deps/layers.json`; the app's vendored-data bundling only if the generated file needs gzipping there (name the file in the DEVLOG entry).
- **Scope:** step types of ADR 0136 D3 (rename id, drop, rename and move field, set a newly required field, block state property and value; no command-word step, since B810 V4 and V6 found no change that needs it); one `update` per element with `details`; inverses where exact; the walk keeps to whole strings and skips `minecraft:lang`, with a report-only token search for removed ids in function and script text (V6). `check-deps`: `@msm/target-migrate` gets its own exact `layers.json` entry (`@msm/plugin-api`, and `@msm/schemas` if the shape test lives there) and joins `@msm/target-*`'s allowed list; the version-fact check takes the engine's folder back in and its pattern is widened beyond `26.x`. `mc-26.4`'s `migrateFrom` is the engine over its change set; `removed-ids.ts` becomes a view of `generated.json` or is deleted with its test folded into `changes.test.ts`, which runs `diff-targets --check`. The curated file holds the speleothem rename (reported, with its hint), the `default_block` drop (driven by the fact, as now), a sentence and an in-game check for each change that touches the examples.
- **Acceptance tests:** every expectation of today's `migrate.test.ts` holds (the same changes' data and the same problems; descriptions may gain detail); `packages/exporters/test/library.test.ts` still exports every mirror project on 26.4; a curated step whose target shape is wrong fails `changes.test.ts`; check-deps proves the engine imports no target and no target fact.
- **Out of scope:** the app; a third target.

### B814 `tools/new-target` and the checklist (wave V2; Opus, medium)

- **Owner files:** new `tools/new-target/` (`index.ts`, `derive.ts`, `verify.ts`, `fabric-meta.ts`, `README.md`, tests with fixtures); `tools/README.md`; `packages/targets/CLAUDE.md` is B813's this wave: hand it the paragraph in the DEVLOG entry.
- **Scope:** `--from mc-<a> --version <new>` makes `packages/targets/mc-<new>/` from the newest target; `--repin mc-<b> --version <new>` refreshes one; `--check` only reports whether upstream has a version newer than each target (the one fetch, with a generic client name). Steps: copy, re-run `sync-mcmeta`, `sync-mcdoc`, `sync-feature-order`; run `diff-targets` and write the generated change set and `CHANGES-draft.md`; recompute the facts B810 V20 marked derived and print a fact diff; draft `engine-mod/versions/<mc>.properties` and the Fabric facts from Fabric's meta service, each value marked "(verify at implementation)"; write `VERIFY.md` (every hand fact with its last date and source; the tests, goldens, GameTests and parity fixtures to rerun; the manual work of ADR 0136 D11, as a list). `--dry-run` writes everything to a folder outside the repository.
- **Acceptance tests:** with fixture upstreams, a made `mc-99.0` folder type-checks and its target tests load; `--repin` on a fixture changes only vendored data, the generated change set and the drafts; `VERIFY.md` for 26.4 lists every row of `mc-26.4/CHANGES.md` that carries a date.
- **Out of scope:** running it on the real 26.4 (B826); editing the engine mod's Java.

### B815 Core: chains, inverse and the report model (wave V2; Opus, medium)

- **Owner files:** new `packages/core/src/upgrade/` (`chain.ts`, `report.ts`, `compare.ts`, `index.ts`), its tests, the `packages/core/src/index.ts` export line, `packages/core/CLAUDE.md` (one line).
- **Scope:** pure functions, no target imported (targets arrive as arguments). `migrationChain(targets, fromId, toId)` (up or down the `previous` links, or "no path"); `runChain(project, chain)` giving the moved project and one merged `MigrationReport`; `invert(report, savedReport)` for moving back (inverse steps plus the dropped values of a saved report, skipped with a note where the element is gone or the place is taken); `UpgradeReport` with the six parts of ADR 0136 D4 and `buildUpgradeReport({ changeSets, migration, problemsBefore, problemsAfter, factsBefore, factsAfter })`; `newProblems(before, after)` by the identity B810 V11 settled; `openItems(report, currentProblems, project)` for the After moving list.
- **Acceptance tests:** a three-target chain from fixtures equals two single moves; `invert` restores `default_block` on the 26.4 fixture and reports an edited element; the report of a fixture project names each change once, with its elements; a change that touches nothing is counted in "does not touch your mod" and listed nowhere else.
- **Out of scope:** validation, lowering, files, UI.

### B816 The dry run and the kept copy in the app (wave V3; Opus, high; first and alone)

- **Owner files:** `app/src/renderer/src/session/project-session.ts` (the upgrade methods only), new `app/src/renderer/src/session/upgrade/` (`dry-run.ts`, `dry-run.worker.ts`, `saved-report.ts`), `app/src/shared/ipc-channels.ts` and the main and preload lines for reading and writing `.msm/upgrades/`, `tools/check-project/check.ts` (to call the same dry run), tests.
- **Scope:** `session.upgradeReport(targetId)` (problem identity: code + element + path, paths mapped through `details`, warnings counted; the copy holds only `msm.project.json` and `content/`; the second Spyglass service is about 60 MB and the second schema context about 8 MB, as B810 V10 measured; the report's saved reverses hold element, pointer, value and post-move hash per dropped value): copy, `runChain`, second schema context, validate, lower, compare, `buildUpgradeReport`; in a worker by the route B810 V9 found; cancellable; cached until the project or the target list changes. `upgradeTargetPreview` and `upgradeTarget` keep working and now go through the chain (so two hops and moving back work). On apply: the copy and the report saved under `.msm/upgrades/<from>-to-<to>-<date>/` (three newest kept, if question 2 stands), then the one undo step. `session.savedUpgradeReports()`, `session.openUpgradeItems()` (live, from validation). `check-project` uses the same code path and stays green on every example.
- **Acceptance tests:** the report for `fixtures/sample-worldgen` moved to 26.4 names `default_block` under "changes for you" and no new problem; a fixture with the speleothem feature lists it under "you need to change" with element and path; undo restores target and data in one step; the copy is byte-equal to the project before; time within B810's budget in the test's own measure, printed.
- **Out of scope:** any visible UI.

### B817 The notice (wave V3; Opus, medium; after B816 and B818's seam)

- **Owner files:** `app/src/renderer/src/components/StatusBar.tsx`, `components/home/YourMods.tsx` and `recent-summary.ts`, new `components/upgrade/UpgradeNotice.tsx`, the Settings line for **Tell me about test versions of Minecraft**, the per-mod "Not now" memory (in `.msm/`), tests.
- **Scope:** ADR 0136 D5 exactly: the status bar mark, the Things to fix note with its counts, **See what changes** and **Not now**, Home's "Made for Minecraft X" and "can move to Y". Releases only unless the setting is on. Nothing shows while the dry run is still running or failed; a failed dry run is one quiet line under More options.
- **Exit criteria:** component tests for each state (no newer version, newer release, newer snapshot with the setting off and on, dismissed, dry run failed); no sentence names a version in the component's own text (versions come from `TargetFacts`); check-size.
- **Live view:** the note's counts follow edits (a test edits the element away and the count falls).

### B818 The dialog as the report (wave V3; Opus, high)

- **Owner files:** `app/src/renderer/src/components/UpgradeTargetDialog.tsx` (rebuilt), new `components/upgrade/` (`UpgradeReportView.tsx`, `parts/`, `sentences.ts`), `ThingsToFix.tsx` (the **After moving to Minecraft X** group and the note seam for B817, committed first), `App.tsx` and `commands/built-in-commands.ts` lines, `app/src/main/menu.ts` if a menu word changes, tests.
- **Scope:** the six parts of D4 with the count of what does not touch the mod; every item with **Show me** (opens the thing at the field, as Things to fix does), **Fix it** where one step fixes it, **Ask the helper**; ids, paths and registry names under More options; the button **Move my mod to Minecraft X** and **Not now**; **What changed when I moved** reopens a saved report; the version chooser stays for more than one newer or older target. `sentences.ts` holds a template per kind of change and uses a curated sentence when there is one. After the move, part 3's items live in Things to fix until their checks pass.
- **Exit criteria:** component tests over B816's fixtures for each part, empty parts hidden, a mod nothing touches says so in one sentence with the in-game list; keyboard and screen-reader labels; the old test ids that `targets-path.spec.ts` uses kept or the spec updated in the same commit; check-size (the report view is a lazy chunk).
- **Live view:** the open report recomputes when the project changes underneath it.

### B819 Before and after live views (wave V4; Opus, high)

- **Owner files:** new `app/src/renderer/src/components/upgrade/BeforeAfter.tsx` and `before-after/`, the smallest seam in `liveviews/` and the preview panel to draw a view from a given lowered set (name the files in the DEVLOG entry), the worldgen map's compare slot, tests, `docs/LIVE-VIEW-AUDIT.md` (a line under app surfaces).
- **Scope:** ADR 0136 D13: for each thing in "changes for you", its registered live view twice, from the project's lowered files and the dry run's, side by side or as a slider on narrow windows; "looks the same" said in words when the lowered files that view reads are equal; the text difference of lowered files under More options; worldgen things through the map's compare view. One pair alive at a time (the Showcase's rule). Minecraft's own pictures come from the installed jar of each version, stand-ins where absent, said.
- **Exit criteria:** tests for a model, a loot table, a noise settings element and a thing with no live view (falls back to the text difference and says why); no second Try it world; memory as B810 V10 measured; check-size.

### B820 Other versions and moving back (wave V4; Opus, medium)

- **Owner files:** new `components/upgrade/OtherVersions.tsx`, its line in the report view and in the export dialogs' More options (name the dialog files; one line each), `session/upgrade/` additions for moving back, tests.
- **Scope:** ADR 0136 D7: one row per built target from the dry run ("works as it is", "works after a move, n changes", "n things would break", each opening its report); moving back with `invert` and the saved report, listing first what cannot be put back.
- **Exit criteria:** a 26.3 worldgen fixture moved up and back equals the original; an element edited in between is reported, not overwritten; a project moved up before this system (no saved report) moves back with the honest list.

### B821 Modpacks (wave V4; Opus, medium; after question 5)

- **Owner files:** the modpack parts of the report (`components/upgrade/parts/ModpackMods.tsx`), the modpack session or main-process code that **Update mods** uses (name the files), tests with recorded answers.
- **Scope:** ADR 0136 D9: **Check my mods**, a row per mod (has a build, has none, could not be checked), re-pins applied in the same undo step, the choices for mods without a build; a line that the next Play makes the new version's instance.
- **Exit criteria:** no request before the click; a pack with one mod lacking a build moves with that mod listed under "you need to change"; offline says so plainly.

### B822 Notes for ejected Java projects (wave V4; Opus, medium)

- **Owner files:** new `packages/exporters/src/java-project/upgrade-notes.ts` (or beside it, as the exporters' guide prefers) and its test, the report part `parts/JavaProject.tsx`, the main-process read-only folder scan and its channel, `docs/guide/eject.md` is B825's.
- **Scope:** ADR 0136 D8: **Save upgrade notes** writes one Markdown file: the build lines that change (both targets' Fabric facts), ids found in the chosen folder's `src/main/resources` data and assets with file and line (the engine's walk, read-only), the curated Java notes, whether an eject exists for the new version, and the advice to eject again where the Java was not edited by hand. Never writes into the Java project but for that one file, where the user chooses.
- **Exit criteria:** on an ejected `fixtures/sample-mod` (26.3), the notes name the Fabric API and Minecraft lines and say that 26.4 has no eject yet, from facts; a planted removed id is found with its line; nothing else in the folder changes (hash before and after).

### B823 Changed vanilla files (wave V4 or V3's free slots; Opus, medium)

- **Owner files:** `tools/diff-targets/vanilla-files.ts` and tests, `tools/sync-mcmeta` (only if a summary file more must be read: paths and hashes, never vendored contents), `packages/plugin-api/src/target.ts` (the fact; single-owner, so not beside another `target.ts` brief), `mc-26.4/src/changes/` (the list), the report part `parts/VanillaFiles.tsx`, tests.
- **Scope:** per version step, the vanilla data and resource files added, removed and changed (paths and kind only), as B810 V8 found feasible; in the report, for every element that replaces or adds to one of them: "Minecraft changed this one too", with Show me, and under More options a side-by-side read from the user's own two jars when both are installed.
- **Exit criteria:** the list is rebuilt by `diff-targets --check`; a fixture that replaces a changed loot table is told so; nothing of Mojang's is in the repository or the app (a test greps the fact for anything but paths and kinds); asar growth reported.

### B824 `check-project --upgrade-report` and the community repository (wave V5; Sonnet)

- **Owner files:** `tools/check-project/cli.ts`, `README.md`, its test; `tools/community-repo/` (the line that runs it).
- **Scope:** the flag prints the report in plain words or JSON for each project and each newer target; the community repository's check shows it for shared mods.
- **Exit criteria:** the tool's tests; every example's report on 26.4 has no "you need to change" item, or the item is fixed in the example in a named follow-up.

### B825 e2e, guide, search, AI helper lines, changelog (wave V5)

- **Owner files:** `app/e2e/targets-path.spec.ts` (extended) and new `app/e2e/upgrade-path.spec.ts` (Opus, medium); `docs/guide/targets.md` rewritten as "Moving to a newer Minecraft", lines in `eject.md`, `modpacks.md`, `playing-and-testing.md`, the sidebar (Sonnet); `app/test/search/golden-queries.json` and the search data ("update", "upgrade", "new version", "port", a version number); `packages/ai/src/prompt/` (a topic line set and a read-only tool for the report, within the prompt budget of ADR 0125 D7; a raise is a line in that ADR); `CHANGELOG.md`.
- **Exit criteria:** e2e: open a 26.3 fixture, see the notice, open the report, Show me on an item, move, undo, move again, see After moving, fix the item, see it go, reopen What changed when I moved; search's golden score not lower; the prompt truth tests green.

### B826 The 26.4 run of the tools (wave V5; Opus, high)

- **Blocker (B810 V4):** mcmeta's command report changed format at `26.4-snapshot-8` and the vendored Spyglass cannot read it. A `sync-mcmeta` adapter that converts the new report to the shape Spyglass reads, or a Spyglass update, must land first (reserve brief B831), and the `commands.argumentTypes` fact is re-checked (`brigadier:integer` and the rest become `minecraft:integer`; the runtime's command code is (verify at implementation)). The re-pin also meets the pre-release's pack versions (data 128.1, resource 104.0) and its new registries `dispense_behavior`, `dispense_behavior_type` and `command_suggestion_type`. Re-pinning within one release line needs the two-ref mcdoc diff.
- **Owner files:** before the release: only `docs/reference/spikes/b826/` (the dry-run output for the newest 26.4 build, the fact diff, `VERIFY.md`). At the release and after question 6: `packages/targets/mc-26.4/` (vendored data, facts, change sets, `CHANGES.md`), goldens under `packages/plugins` and `packages/exporters` for that target, `examples/`, `engine-mod/versions/26.4.properties` and whatever its seams need, `.github/workflows/ci.yml` only if a matrix value is typed there.
- **Scope:** `tools/new-target --repin mc-26.4 --version <newest>` in `--dry-run` first, reported. Then the real re-pin of ROADMAP's "26.4 release re-pin" (was reserve B163) by the tool, with `VERIFY.md` worked through row by row and each row's new date and source in `CHANGES.md`; `channel: 'release'` and the rest of that ROADMAP line; both engine-mod variants built and GameTests and parity run.
- **Exit criteria:** every test of both targets, the exporters' library test, `tools/run-fabric-server` on the samples; a list of what the tool got right, what it drafted wrongly and what it could not know, as findings for the ADR; the report a 26.3 project now gets for 26.4, attached.
- **In-game (user):** the checks `VERIFY.md` marks as needing the real game with a screen.

### B827 Close (wave V6; main session)

- ADR 0136 accepted with findings; DESIGN §9 (targets carry change sets; the upgrade system) and the reworded support policy if question 4 changed it; `packages/targets/CLAUDE.md`, root `CLAUDE.md` and `docs/CLAUDE.md` lines; ROADMAP ticks and a Milestone Log row; `docs/LIVE-VIEW-AUDIT.md`; this plan deleted, its fact table, limits and the spike's answers moved into the ADR.

## 6. The main session's own steps

- Put questions 1 to 6 to the user; record answers here and in the ADR.
- Name the owner of each single-owner file per wave across Plans A to D.
- Run `tools/new-target --check` at each release cut once B814 is in.

## 7. Limits to say in the guide

- The report is about files and formats. It cannot know that a mob walks differently or a recipe book looks different in the new version: play it once.
- "Does not touch your mod" means none of the data MCSuperMods holds about the new version touches it.
- A world opened in a newer Minecraft cannot go back; the mod can.
- Scripts are searched for ids that went away and are not rewritten.
- A Java project you ejected is yours: MCSuperMods writes notes for it and changes nothing.
- A test version of Minecraft can change every week; a mod moved to one may need moving again when MSM follows the next one.
- Pictures and sounds of Minecraft's own in the before and after views need that version installed.

## 8. Notes from implementation

B810 answers are in `docs/reference/spikes/b810/README.md` and folded into ADR 0136 and the briefs above (2026-11-25). Outside this plan: the checker's snapshot gating makes `since="26.4"` fields unknown on `26.4-snapshot-7`.


### B812's notes (for B811, B813 and the app briefs)

The plugin API is 1.29.0 (1.28.0 stays reserved for B782). B811's local type must match `TargetChange` exactly, and write format fields as RFC 6901 pointers with the leading `/` (`#/default_block`, not the spike draft's `#default_block`); `MigrationDetail.from?` holds a moved value's old pointer. B813: make `@msm/targets`' `targetFacts` carry `changes`. App briefs: `toTargetFacts` in `app/src/renderer/src/plugins/external-plugins.ts` drops `changes` and `previous` for third-party targets, and the AI helper's target dump (`app/src/renderer/src/ai/tool-executor.ts`) should strip `changes` as it strips other large facts.

### B811's notes

`tools/diff-targets` on 26.3 to 26.4-snapshot-7: 124 changes (ids 18, formats 93, commands 5, block states 1, packs 7; 25 manual, 3 auto, 96 none), 945 additions, 0.9 s, 3.5 KB gzipped. Deviations: additions use a local `TargetAddition` (`registry-added`, `member-added`, `path-added`) and the set keeps their counts; a registry gone with no successor is one `member-removed` per member; a changed literal is `argument-changed`; an ambiguous candidate's `candidate.to` is the first partner and every partner is in the change's `to` (an `alternatives` field could replace this); the speleothem pair is `superset`, so never applied without a person; `NoiseGeneratorSettingsRef#/default_block` is kept beside the resource (inline settings in dimensions and world presets). Ids are `${area}:${subject}#${field}`. Wrong candidates by Mojang's notes: `player_reporting` to `other_players`, `cube_top` to `calcite_slab_top`. For B813: write `--out packages/targets/mc-26.4/src/changes/generated.json` with a `--check` test, decide whether the additions list ships, and in the curated file set `default_block` to `auto`, confirm the speleothem rename with its hint, and optionally the tag and sprite renames. For B826: map the nested-argument command format's argument-type renames.

### B815's notes (the API B816 calls)

1. `migrationChain(targets, from, to)`; report `reason` when not ok. 2. `runChain(project, chain.steps)` (an in-memory copy; up hops migrate, down hops run nothing). 3. Validate and lower `run.project` on the new target. 4. `buildUpgradeReport({ changeSets, migration: run.report, problemsBefore, problemsAfter, factsBefore, factsAfter, project, moved: run.project, touches })`, with `touches` from the function and script token search. 5. Apply: `run.report` with `targets = [to]` as one undo step; save `run.report` beside the copy (its `reverses` carry the hashes) and the `UpgradeReport`, so `openItems(report, currentProblems, project, ticked)` drives the After moving list. 6. Moving back: `runChain(project, downSteps)`, then `invert(back.report, saved, project)` (a third argument, the project), apply `result.report` as one undo step, and show `result.notRestored` and `result.edited` first. Problem keys are code + element + path + file; `newProblems` counts errors and warnings. `UpgradeProblemCodes` live in `core/src/upgrade/chain.ts` until `problems/codes.ts` has an owner. B813: `afterHash` may be left empty (runChain sets it). B820: with no saved report, renames could be inverted from the newer target's change set.

### B814's notes

`tools/new-target` writes the engine-mod properties draft to the target's `drafts/engine-mod.properties` (copied to `engine-mod/versions/` only once checked); a re-pin never edits `target.ts` (its fact diff is in `VERIFY.md` section 1); a new target gets no `migrateFrom` until wired to the engine; Modrinth facts (Fabric API jar, GeckoLib) are listed for a person. Decision (main session, 2026-11-25): a patch release `x.y.z` re-pins its line's target rather than making a new target, so `--check` should suggest `--repin` for it (B826 or a small follow-up). After B813 merges, rerun `tools/new-target/test/new-target.test.ts` (it copies the live `mc-26.4`). B826: run `--repin mc-26.4 --version 26.4-pre-1 --dry-run` first; the data is usable only after B831.

### B813's notes

`@msm/target-migrate` steps `rename-id`, `drop`, `move`, `set`, `block-state` (pointer patterns with `*`); per element field steps, block-state steps, then the id walk (skips `minecraft:lang`); removed `minecraft:` ids inside any longer string are reported as `target.removed-id-in-text` (warning), never rewritten; `target.field-not-moved` when a move's place is taken. 26.4's set: `src/changes/generated.json` (124 changes) plus `curated.ts` (`default_block` auto; speleothem, `interpolated`, the freeze tag and four sprites confirmed but reported with hints, not applied, since only a same-shape rename is applied); `removed-ids.ts` is a view of the merged set; `targetFacts` carries `changes` (about 45 KB raw, 3.5 KB gzipped, a static import: measure in B816). `biome.json` ignores the generated change-set JSON. Hashes: the engine's `dataHash` (canonical JSON, cyrb53, 14 hex) differs from core's `elementDataHash`; `runChain` rewrites every `afterHash`, so core's is the one saved. The inverse plan runs field steps before the id walk; fine until one change both moves a field and renames an id inside it. All 168 projects move to 26.4 with 31 elements updated and one problem (`interpolated` in `fixtures/worldgen-parity/mc-26.3`).

### B816's notes (the seams B817 to B820 use)

`session.upgradeReport(targetId, { signal })` gives `UpgradeDryRun` (`app/src/renderer/src/session/upgrade/dry-run.ts`): `report` (the `UpgradeReport`), `migration` (what to apply), `chain`, `inverted?` (moving back), `moved`, `problemsBefore`, `problemsAfter`, `filesBefore`, `filesAfter`, `hops`, `direction`, `timings`. It is cached per target and project state; an edit while it runs rejects it with `DryRunCancelled` (`reason` `stale`), so B817 catches that and asks again when idle. Apply with `session.upgradeTarget(id, dry.migration, { upgradeReport: dry.report })` (one undo step; returns `{ saved?, saveError? }`). `session.savedUpgradeReports()` lists `.msm/upgrades/` newest first (`SavedUpgrade`: `folder`, `from`, `to`, `movedAt`, `migration`, `report?`, `ticked`); `session.openUpgradeItems()` is synchronous and live (call `savedUpgradeReports()` once after open); `session.setUpgradeItemTicked(folder, id, ticked)` for manual items. No Web Worker and no new IPC channel (B816's DEVLOG entry says why). No exporter runs in the dry run, so part 4's `exports` is empty; the GeckoLib and Java project rows carry it. Moving back finds a saved move whose ends match exactly; two moves saved separately are not chained back (B820).

### B823's notes

Plugin API 1.30.0: `TargetChangeSet.vanillaFiles?` (paths only; 26.3 to 26.4-snapshot-7: 823 added, 26 removed, 5 moved, 319 changed). It is static data on the change set (+63 kB first paint, now 5.28 of 6 MB, stop line 5.5); a lazy `Target.loadVanillaFiles?()` is the fallback if first paint nears 5.5 MB. Before B826: `tools/new-target` must add `src/changes/generated.vanilla-files.json` to `REPIN_OUTPUTS` and write it in `make.ts` with `diffVanillaFiles`, or a re-pin leaves a stale list and `--check` fails. The report part `components/upgrade/parts/VanillaFiles.tsx` ("Minecraft changed these too") is ready for B818/B819: `vanillaFileListsOf(changeSetsOf(steps))`, `elementFilesOf(expandedProject, lower, displayNameOf)`, `vanillaFileHits(lists, elementFiles)`, `readVanillaFile={platform.minecraft.readAsset}`.

### B818's notes

Seams: B817 passes the notice as `<ThingsToFix note={…} />` beside `afterMoving` in `App.tsx`; **See what changes** opens `setDialog({ type: 'upgrade-target', targetId: newer.id })`. B819: `extras(targetId, move)` returns `{ lead?, after?, doneExtra?(item) }`; `doneExtra` renders under each part 2 thing (the before and after pair); extend `MoveReport` in `UpgradeTargetDialog.tsx` with `filesBefore`, `filesAfter`, `moved`; B823's `VanillaFiles` goes in `after` (it needs the session's expanded project and lowering from `project-session.ts`). B820: `extras(...).lead` for what cannot be put back (`dry.inverted`), `after` for Check on other versions; saved reports open through `initialSavedFolder` or the `upgrade-saved-<n>` buttons. Follow-ups: the undo label "Upgrade target to <id>" in `project-session.ts` is not plain words; guide `targets.md` (lines 32-46) and `README.md` line 45 still say "Upgrade project target…", **Upgrade** and **Cancel** (B825, with B818's five guide sentences in its DEVLOG entry).
