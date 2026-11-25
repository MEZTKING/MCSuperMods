# ADR 0136: Version upgrades: the app notices a newer Minecraft, moves the mod and says what changed

## Context

The user (2026-11-25): "also make a system to automatically upgrade a mods version for the next minecraft, it should tell you what has changed and what needs to change. etc"

What exists today ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md), [ADR 0038](0038-per-version-runtime-builds.md)):

- Two targets, `mc-26.3` (release) and `mc-26.4` (pinned to `26.4-snapshot-7`). `mc-26.4` has a `migrateFrom` hook, written by hand in `packages/targets/mc-26.4/src/migrate.ts`: a removed-id table tied by a test to the diff of both vendored `registries.json` files, one known rename (reported, not applied, because the shape differs) and one reshape (`default_block` dropped from noise settings by a target fact).
- **File > Move to another Minecraft version** (`UpgradeTargetDialog`, command `upgradeTarget`): the user picks a target, sees "n changes, n problems" and presses Upgrade; the project's target and every changed element move as one undo step (`ProjectSession.upgradeTargetPreview` and `upgradeTarget`).
- `tools/check-project` opens a project in memory, upgrades it the same way and validates and exports it on each target.
- A runtime jar per version (`msm_runtime-mc-<mc>.jar`, `engine-mod/versions/<mc>.properties`), pack formats and `fabric.mod.json` from the target.

What is missing, measured against the user's sentence:

- **Nothing notices.** The status bar says "For Minecraft 26.3" and no more; Home and Things to fix never mention a newer version.
- **The report is thin.** It lists what the hook did and the removed ids it found. It does not say what changed in Minecraft, what does not touch this mod, what the new version needs from the players (loader, Fabric API, runtime, GeckoLib), or what will stop validating or exporting after the move; those show only after the move, mixed with every other problem.
- **The list is lost.** What the migration could not do is shown once in the dialog. After Upgrade, only what the validators happen to report again is in Things to fix.
- **One direction.** Moving back runs the older target's hook, which does not exist; the field the upgrade dropped is not put back (ADR 0037's amendment records the gap).
- **One hop.** `migrateFrom(previous, …)` knows only the target directly before it.
- **Functions' text, scripts and pictures are not read** by the id walk (it visits strings in element data that are whole ids); whether that misses real cases is not measured.
- **Modpacks and ejected Java projects** get no advice at all.
- **The developer side is manual.** A new target is made by copying a folder, running two sync scripts, reading diffs by eye and writing `removed-ids.ts`, `migrate.ts` and `CHANGES.md` by hand. ADR 0037's amendment shows the cost: the `default_block` change was found by CI three weeks after the target was added. Today's case: Mojang's manifest lists `26.4-pre-1` (2026-11-24, read 2026-11-25) while the target is still at snapshot 7, three snapshots behind.

The accuracy of what the user is told can be no better than the data the target carries, so the developer side and the user side are one decision.

## Decision

**D1. What "automatic" means.** Four things, and one limit.

1. The app notices by itself that a newer Minecraft version is ready for the open mod and has already worked out what the move would do.
2. One action moves the mod: every change a machine can make safely is made, as one undo step.
3. The app says, from data and not from guesses, what changed in Minecraft that touches this mod, what it changed for the user, and what the user must change by hand, each item with **Show me**.
4. MSM itself gets a new version's facts from a tool that diffs the two versions, so items 1 to 3 are true.

The limit: the app never moves a mod without a click, never on open and never in the background. A project is the user's work; a move is offered, prepared and explained, then pressed.

**D2. Every target carries a change record against the target before it.** A target gains `previous` (the id of the target it follows) and `changes: TargetChangeSet`, in `packages/targets` and nowhere else, exposed through `TargetFacts` (plugin API: the next free minor when the brief runs). A change set has two parts:

- **Generated** (`mc-<v>/src/changes/generated.json`), written only by `tools/diff-targets` (D11) from the vendored data of both targets: registries added, removed and moved; members added and removed in each registry; fields added, removed and retyped in each data format (the mcdoc tree resolved once for each version through its `since` and `until` gates); command tree changes (root commands, sub-commands, argument parsers); block state properties and defaults; pack formats, data version, data and resource folder names. A test recomputes it from the vendored files, as `removed-ids.test.ts` does today, so it cannot drift.
- **Curated** (`mc-<v>/src/changes/curated.ts`), written by a person: which removed id is renamed to which, which field moved where, the plain sentence for a change that needs one, what to check in game, and the changes that are not in any data file (behaviour, loader, Java). Every curated step that rewrites data names the generated change it answers, and a test proves it against the mcdoc of the newer target (the `sameShape` rule of ADR 0037 D3, kept).

Each change has an id, an area (ids, formats, commands, block states, packs, what players need, Java, new things), what happened, whether a migration step does it (`auto`), needs the user (`manual`) or is only news (`none`), and its source. A change with no curated sentence gets one from a template for its kind; ids and paths show under More options ([ADR 0130](0130-one-mode-more-options.md)).

**D3. One migration engine, fed by the change set.** The walkers move out of `mc-26.4/src/migrate.ts` into a small shared package under `packages/targets/` (general, with no version fact in it), and each target's `migrateFrom` becomes that engine over the target's own change set. Step types: rename an id, drop a field, rename or move a field, set a field a version newly requires when one right value exists, rename a block state property or value, rename a command word in a function's text. Rules:

- A step runs only when its result is proved the same shape; otherwise it is reported with a hint (ADR 0037 D3, unchanged).
- One `update` change per element, with the element's whole new data (unchanged), and now also the list of what was done inside it: the path, the value before and after, and the change's id. The contract of `Target.migrateFrom` stays; the new fields are optional additions.
- **Chains.** Moving across more than one version runs each target's migration in order on an in-memory copy and merges the reports; it is still one undo step in the project.
- **Moving back.** A step declares its inverse when it has an exact one (a rename). A dropped field has none; D7 puts its value back from the saved report.
- What the walk reads beyond element data (functions' text, Rules, scripts, the `msm:components` passthrough, asset paths) is decided by the spike's measurements; whatever is not rewritten is at least searched and reported.

**D4. The upgrade report is computed by a dry run, before anything changes.** The app makes an in-memory copy of the project, runs the migration chain on it, loads the newer target's schema context, validates the copy with every validator and runs the exports' lowering on it, exactly as `tools/check-project` already does, then compares with the same pass on the project as it is. The report has six parts:

1. **What changed in Minecraft for this mod**: the change-set entries that match something in the project, each with the elements it touches.
2. **What MCSuperMods changes for you**: the migration's changes, by thing, with before and after.
3. **What you need to change**: what the migration found and could not do, plus every problem the copy has on the new version that the project does not have today (validation and export), each with its element and field.
4. **What your players need**: Minecraft version, pack formats, Fabric Loader and Fabric API, the runtime jar for that version, GeckoLib, whether the Java project export and other exports exist there; from the two targets' facts.
5. **New in this version**: additions the mod could use (new blocks, items, options, formats), counted, listed under More options.
6. **What to check in the game**: the curated checks that apply, and the standing ones (D12).

A seventh line says how much of Minecraft's change does not touch the mod at all. "Does not touch" is a statement about the data MSM holds; the report says so and never says "nothing else changed".

**D5. The app notices.** When a project is open and a newer target exists, the dry run of D4 runs once in the background (a worker, after first paint, cancelled by edits and rerun when idle). Then:

- the status bar's "For Minecraft 26.3" gains a small "26.4 is ready" mark that opens the report;
- Things to fix shows one note, never an error: "Minecraft 26.4 is ready for this mod: 3 things change by themselves, 1 needs you." with **See what changes** and **Not now** (remembered for that mod and that version);
- Home's Your mods shows "Made for Minecraft 26.3" on each card and "can move to 26.4" where a newer release exists (from the project file's target alone; no dry run for closed projects).

Only **release** targets are noticed by default. Snapshot and pre-release targets are offered in the dialog as today and noticed only when the setting **Tell me about test versions of Minecraft** is on (off by default). A new target reaches the user with an app update; the update's notes name it.

**D6. One action.** The dialog becomes the report: the six parts of D4, the button **Move my mod to Minecraft 26.4** and **Not now**. Pressing it:

- saves a copy of the project as it was (`.msm/upgrades/<from>-to-<to>-<date>/`, the three newest kept), because undo does not outlive the session;
- applies the target and every change as one undo step (as today);
- saves the report beside the copy, so **What changed when I moved** can be opened again later;
- puts part 3 into Things to fix under **After moving to Minecraft 26.4**. Each item carries its own check (the removed id is still at that path; the problem code is still reported for that field), so it goes away by itself when fixed, and has **Show me**, **Fix it** where one step fixes it, and **Ask the helper**.

The project file format does not change: only `targets` and element data move, as today.

**D7. Both directions.** **Check on other versions** (in the report and in More options of the export dialogs) shows one row per target MSM builds for: works as it is, works after a move (n changes), or n things would break, from the same dry run. Moving back to an older target uses the inverse steps and puts back, from the saved report, each value the move up dropped, where its element still exists; whatever cannot be put back is listed before the user presses. This closes the gap recorded in ADR 0037's amendment. A project stays on one target at a time ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md)); making one project export for two versions at once is not part of this decision.

**D8. Ejected Java projects are advised, never rewritten.** MSM does not own an ejected project's Java. For one, the app writes **upgrade notes** (a Markdown file the user saves into the Java project): the `gradle.properties` lines that change (from both targets' Fabric facts), the removed and renamed ids found in that folder's data and resource files (a read-only scan with file and line), the curated Java notes of the change set, and whether MSM can eject for the new version at all (`javaProject` is a target fact; 26.4 has none today). Where the user has not edited the Java by hand, the advice is to eject again from the moved project into a new folder.

**D9. Modpacks.** For a modpack project the report adds **Mods in this pack**: for each Modrinth mod, whether a build exists for the new version. The check uses the network (Modrinth, as **Update mods** already does) and so runs only when the user presses **Check my mods**. Mods with a build are re-pinned in the same undo step; mods without one are listed in part 3 with the choices (wait, remove, keep the pack on the old version). Managed instances ([ADR 0133](0133-instances-for-anything.md)) are per version already: the next Play makes the new version's instance and leaves the old one alone.

**D10. The runtime jar and the other per-version parts are stated, from facts.** Part 4 of the report is built only from the two targets' facts and from the dry run's export problems (`export.no-geckolib-target`, `export.no-java-project-target` and their kin), so a version on which a kind cannot be exported is said before the move, with the kinds it concerns. If the app holds no runtime jar for a target, the move is still offered for pack-only mods and refused, with the reason, for the Fabric mod jar.

**D11. The developer side: two tools and a checklist.**

- `tools/diff-targets <older> <newer>`: pure, offline, over two targets' vendored folders. Writes the generated change set (D2), a readable `CHANGES-draft.md`, and **candidates**: likely renames (one member removed and one added in the same registry with the same mcdoc shape or a near name), likely field moves, facts whose derived value changed. A candidate is never applied by a migration until a person confirms it in the curated file and the shape test passes.
- `tools/new-target`: makes `mc-<next>` from the newest target, or re-pins an existing one (`--repin <version>`): runs `sync-mcmeta`, `sync-mcdoc` and `sync-feature-order`, runs `diff-targets`, recomputes every fact that is derived from vendored data, drafts `engine-mod/versions/<mc>.properties` from Fabric's meta service (values marked "(verify at implementation)" until a person records them in `CHANGES.md`), and writes `VERIFY.md`: every hand-verified fact of the previous target with its date and source, to be re-read on the new version, and every test and golden to rerun.
- A list of **vanilla files that changed** between the two versions (paths and the kind of change only, from mcmeta's data and assets summaries; never file contents) becomes a target fact, so a mod that replaces or adds to one of Minecraft's own files is told "Minecraft changed this one too".
- **The proof:** run on 26.3 against `26.4-snapshot-7`, the differ must find again, unaided, everything ADR 0037, its amendment and `mc-26.4/CHANGES.md` "What changed from 26.3" found by hand (the removed-id table to the member, the moved `rule_test` registry, `default_block`, `LargeSpeleothemConfig.base_block`, the 26.4 key names). That is a test, kept.

**What stays manual, by design:** behaviour that changed in the game's code and not in its data; the runtime port (`engine-mod/src/mc/<mc>/` seams, Mixins, Fabric API changes), its GameTests and the parity fixtures; the Java project generator; Try it's and the terrain preview's agreement with the real game; GeckoLib and loader availability; every fact that was read with `javap` or measured on a server; the curated sentences and the confirmation of each rename. The tools list this work; they do not do it. No scheduled CI job watches for new versions (the user's rule: GitHub Actions sparingly): the main session runs `new-target --check` at each release cut.

**D12. What the user must check in the game is said, not implied.** Every report ends with a short list: start the game once on the new version with the mod; open or make a world (an old world is upgraded by Minecraft itself and cannot go back: the app's world backup of [ADR 0102](0102-world-backups-and-rename-warnings.md) is offered first); look at each thing named in part 2 and part 3; and each curated check that applies. The dry run proves that the files are valid for the new version, not that the game behaves the same; the report says that in one sentence.

**D13. Live view (the rule "Everything visible live", [ADR 0119](0119-live-worldgen-preview.md) D1).** This adds no kind. Its live views are:

- the report itself, which follows edits: the notice's counts before a move and the **After moving** list after it are recomputed as the project changes;
- **Before and after**: for each thing in part 2, its own live view drawn twice, from the project's lowered files on the old version and from the dry run's on the new one, side by side, with the lowered files' text difference under More options; worldgen things use the live world map's compare view with "before the move" in the place of vanilla.

Minecraft's own pictures and sounds in those views come from the user's installed jar of each version, as everywhere; where the newer jar is not installed the view uses its stand-ins and says so.

**D14. Old targets leave, their change sets stay.** When MSM stops building for a version, its target package shrinks to a migration-only record (id, version, change set; no vendored schemas), so a project made for it still opens to "This mod was made for Minecraft X, which this MCSuperMods no longer builds for" with the move offered through the chain of D3. How many versions are built for at once is the user's question 4 in the plan; nothing is dropped by this ADR.

**D15. Words.** "Move to Minecraft 26.4", "what changed", "what MCSuperMods changed for you", "what you need to change", "what your players need". Not "target", "migration" or "upgrade path" outside More options. "update", "upgrade", "new version", "port" and "26.4" find the action in search ([ADR 0124](0124-search-everything.md)). The AI helper reads the report through a tool and explains or fixes items; it never states a Minecraft change that is not in the report ([ADR 0125](0125-ai-helper-clarity.md)).

## Consequences

- Plugin API grows by one minor: `Target.previous`, `TargetFacts.changes`, optional detail on `MigrationChange`, the changed-files fact. Additive; plugins and the `migrateFrom` contract are unaffected. `packages/plugin-api/src/target.ts` and both `target.ts` files are single-owner files shared with Plans A and C; the waves are ordered around them.
- `packages/targets` gains a shared package with general code, which its guide forbade ("data only, plus small hooks"). The guide is reworded: version facts only in target packages, the migration engine beside them with no version fact in it, checked by `tools/check-deps`.
- The dry run loads a second schema context and validates and lowers a whole copy. Its time and memory on the largest example and on a 300-element project are measured by the spike; the budget is 5 s in a worker with nothing on the main thread, and the notice simply appears later on a slow machine. If the budget fails, the background run drops to migration only and the full run happens when the report is opened.
- The change sets add vendored-derived data to the asar (27.2 of 32 MB today); the spike measures it and the generated file is gzipped as the other target data is (ADR 0123).
- Accuracy is bounded by upstream: mcmeta and vanilla-mcdoc describe data, not behaviour, and vanilla-mcdoc can lag a snapshot. The report's wording (D4, D12) carries that limit, and a target whose mcdoc is behind says so in its curated file.
- The saved copy and report live in the project's hidden `.msm/` folder: local to the machine, not shared with a team, skipped by exports and by `tools/check-project`'s content rules but counted by its size cap. The three-copies limit keeps it small.
- The 26.4 release re-pin (ROADMAP, was reserve B163) becomes the first real run of the tools and the system's proof.
- DESIGN §9 gains the upgrade system at acceptance; `docs/guide/targets.md` is rewritten around "Move to Minecraft …".

## Status

**Proposed (2026-11-25).** Plan and briefs: [`docs/PLAN-version-upgrades.md`](../PLAN-version-upgrades.md) (B810 to B839; spike B810 first). Six questions for the user, with defaults, are in the plan's section 2; the spike and wave V1 do not wait for them.
