# MCSuperMods Roadmap

This is the phased delivery plan for MCSuperMods (MSM). The orchestrator updates the checklists and the [Milestone Log](#milestone-log) at each milestone. Architecture and rationale live in [DESIGN.md](DESIGN.md); this file only says what ships and when.

## Principles

- **Ship small.** Every phase ends in a tagged, installable release that a real user can do something useful with.
- **MVP is resource packs.** Phase 1 (v0.1) is a Resource Pack Studio only. Data packs, worldgen and the engine mod follow once the core, schema and export pipeline are proven on the simplest content layer.
- **Each phase is usable on its own.** No phase depends on a later one to deliver value; unfinished features stay behind a flag rather than shipping half-built.
- **N / N-1 version policy.** We support the current Minecraft Java release (26.3) and the previous one (26.2). Snapshots are best-effort. Version facts live only in `packages/targets` (see [Targets and Exporters](DESIGN.md#9-targets-and-exporters)).
- **Estimates are focused solo-dev weeks with AI assistance.** Double them for part-time work. They are planning aids, not commitments.
- **Everything visible live (user, 2026-11-22: "Everything should be visible live").** Every kind that makes something a player can see or hear has a live view in the app (the preview panel, its Studio or Try it) that follows edits by itself; a kind without one is a gap in `docs/LIVE-VIEW-AUDIT.md` with the batch that closes it, and every brief that adds a kind, Studio or flow names its live view ([ADR 0119](adr/0119-live-worldgen-preview.md) D1).
- **Risky things first.** Where a phase carries a known architectural risk, it starts with a time-boxed spike that can change the plan (see [Risks and Mitigations](DESIGN.md#17-risks-and-mitigations)).

## Phase Overview

| Phase | Name | Scope | Exit criteria | Est. |
|---|---|---|---|---|
| 0 | Foundations | Monorepo, `@msm/core` IR + project load/save + command stack, `@msm/schemas` loading vanilla-mcdoc for 26.3, `@msm/plugin-api`, Electron shell opens/saves a project, CI green | New empty project round-trips; schema loads; unit tests + Biome in CI | 2–3 wk |
| 1 | **MVP: Resource Pack Studio** (v0.1) | Textures import, block/item models + blockstates via schema forms, lang files, sounds, pack.mcmeta; deepslate 3D preview; vanilla `.zip` export; "Install to resourcepacks folder" | A user makes and installs a working texture + custom model pack without touching JSON | 4–6 wk |
| 2 | Data Pack Studio (v0.2) | Recipes, loot tables, advancements, tags, predicates, item modifiers, mcfunction editor with Spyglass diagnostics; data pack export; combined pack export | Misode-generator parity on those kinds; a datapack with functions loads in 26.3 without errors | 4–6 wk |
| 3 | Structures & Worldgen (v0.3) | `.nbt`/`.schem` import and export, structure templates as JSON with 3D preview, jigsaw pools with connections, structures and structure sets, configured and placed features, biomes, dimensions, world presets, noise settings and the other worldgen kinds as forms, worldgen tags, project validators, climate map, plugin-api 0.5.0 | Custom biome with a custom jigsaw structure generates in a 26.3 world (CI proxy: sample-worldgen chain walk, validators and e2e) | 5–7 wk |
| 4 | Engine Mod + Blocks/Items (v0.4) | `msm_runtime` mod, `msm/` definition loader, components/events v1, Block & Item Studios, Fabric content-jar exporter, Test in Minecraft (managed Prism instance) | A custom block with custom behaviour works in-game from one exported jar | 8–10 wk |
| 5 | Entities, Models, Animation (v0.5) | `msm:entity` + AI goal components, GeckoLib integration, Blockbench `.bbmodel` + animation import, spawn rules/eggs | A Blockbench-animated custom mob spawns, moves, attacks | 8–10 wk |
| 6 | Scripting & Eject (v0.6) | Rhino scripting (TypeScript transpiled to ES5), TS typings, Monaco script editor, export-as-Java-project with parity GameTests | Script-driven behaviour runs; ejected project builds with Gradle and matches runtime behaviour | 6–8 wk |
| 7 | 1.0 | Third-party plugin loading, templates/wizards, second target (26.4 or whatever is current), docs site (auto-update moved to Phase 2); add-ons pulled ahead of 1.0 at the user's request and shipped with the Phase 7 work done by then in v0.7.0 (2026-11-06): the AI helper, armour and custom tool materials, gear, weapons and consumables, the Creator | Two targets supported; external plugin works; release | 6–8 wk, plus 3–4 wk for the v0.7 add-ons |

Total: roughly 43–58 focused weeks.

## Phase 0 — Foundations

### Scope

Stand up the monorepo and the three foundation packages, prove that a project can be created, saved and reloaded losslessly, and get CI green from the first commit. Design references: [Core Project Model (IR)](DESIGN.md#4-core-project-model-ir), [Project File Format](DESIGN.md#5-project-file-format), [Schema System (mcdoc)](DESIGN.md#6-schema-system-mcdoc), [Repository Layout](DESIGN.md#15-repository-layout), [Tech Stack](DESIGN.md#14-tech-stack).

### Deliverables

- [x] Root tooling: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `tsconfig.base.json` with strict TypeScript and project references.
- [x] Dependency-direction check (`plugin-api` ← `schemas` ← `core` ← everything else) enforced in CI.
- [x] `@msm/plugin-api`: first cut of `Plugin`, `definePlugin`, `ElementKind`, `Target`, `Exporter`, `OutputFile` interfaces with `apiVersion` 0.x.
- [x] `@msm/core`: `Project` / `Namespace` / `Element` / `Asset` types, element kind registry, deterministic JSON serialiser (sorted keys, 2 spaces, trailing newline).
- [x] `@msm/core`: project load/save with `formatVersion` and an empty migrator chain; filesystem injected via an interface.
- [x] `@msm/core`: Immer-based command stack producing RFC 6902 patches, with undo/redo tests.
- [x] `@msm/schemas`: Spyglass adapter loading `vanilla-mcdoc` for 26.3 and exposing our own `SchemaNode` model.
- [x] `@msm/target-mc-26.3`: first target package with pack formats, mcdoc ref and mcmeta ref (verify at implementation).
- [x] `tools/sync-mcdoc` and `tools/sync-mcmeta` scripts.
- [x] `@msm/app`: Electron shell (electron-vite, React 19) that creates, opens and saves a project through `PlatformAdapter`.
- [x] CI: install, Biome, typecheck, Vitest on every push.
- [x] First ADRs in `docs/adr/` (Electron over Tauri, hybrid architecture, Rhino for scripting).

### Exit criteria

A new empty project round-trips byte-for-byte through save and load; the 26.3 vanilla schemas load in a test; unit tests and Biome pass in CI.

### Estimate

2–3 weeks.

### Depends on

Nothing. Approved DESIGN.md v1.

## Phase 1 — MVP: Resource Pack Studio (v0.1)

### Scope

The first public release. A beginner imports textures, edits block and item models through schema-driven forms, previews them in 3D, and exports a working resource pack straight into their Minecraft install. Design references: [Editors and UX](DESIGN.md#8-editors-and-ux), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Interop (Blockbench, NBT, Minecraft Installation)](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation).

### Deliverables

- [x] `@msm/plugin-resourcepack`: element kinds for block models, item models, blockstates, lang files, sounds and `pack.mcmeta`.
- [x] Schema-driven form generator in `@msm/app` covering string, enum, number, boolean, struct, list, union, reference and dispatcher nodes.
- [x] Raw JSON tab (Monaco + schema diagnostics) on every element, editing the same IR as the form.
- [x] Schema validation in `@msm/schemas` (`validateJson` over the version-gated `SchemaNode` model; Spyglass checker deferred to Phase 2, [ADR 0009](adr/0009-phase1-validation-gate.md)).
- [x] Problems panel fed by live schema validation; errors block export, never save.
- [x] DESIGN Q9 fix: save deletes only files it loaded and is never blocked ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)).
- [x] Texture import (PNG) into `assets/<namespace>/` with thumbnails cached in `.msm/`.
- [x] `@msm/interop` `minecraft-install/`: locate `.minecraft`, extract preview assets from the user's client jar into `~/.msm/cache/assets/<version>/` (never redistributed; [ADR 0011](adr/0011-client-jar-asset-extraction.md)).
- [x] 3D preview panel using deepslate for block and item models ([ADR 0010](adr/0010-preview-with-deepslate.md)).
- [x] `@msm/exporters` `vanilla-packs`: resource pack `.zip` and folder output, deterministic, with schema validation gate and `msm.export.json` manifest.
- [x] "Install to resourcepacks folder" action.
- [x] `@msm/plugin-api` 0.2.0 ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).
- [x] `@msm/targets` aggregator (`packages/targets/all/`), so tests use real targets without version literals ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).
- [x] `tools/new-plugin` scaffold; `@msm/plugin-resourcepack` follows its layout.
- [x] Golden-file tests for every lowering function under `packages/plugins/resourcepack/test/fixtures/mc-26.3/expected/`, plus a SHA-256 golden over the sample project's exported zip.
- [x] Playwright-for-Electron golden-path e2e: new project → block model → texture → export zip → reopen, through forms only; built and packaged smoke runs in CI.
- [x] Sample project `fixtures/sample-resourcepack` for the in-game check.
- [x] Size budgets tracked in CI (`tools/check-size`; installer budget in the release workflow).
- [x] Release workflow for Windows only: unsigned NSIS x64 installer via electron-builder, attached to a draft GitHub Release on `v*` tags (macOS not planned; Linux `dir` build for verification only; [ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).
- [ ] In-game verification by the user: install the sample pack in Minecraft Java 26.3 and confirm a held stick shows the ruby.
- [ ] First tagged release `v0.1.0`. The licence is settled (MIT, DESIGN [Open Question 10](DESIGN.md#18-open-questions)); it waits on the user's publishing steps in the README "Releasing" section.
- [ ] Signed Windows release (needs signing credentials from the user).

### Exit criteria

A user makes and installs a working texture plus custom model pack without touching JSON.

Status: code complete on 2026-11-04. The automated proxy passes (the golden-path e2e never opens the Raw JSON tab and the exported zip passes the schema gate); the in-game check and the first tagged release are pending with the user.

### Estimate

4–6 weeks.

### Depends on

Phase 0.

## Phase 2 — Data Pack Studio (v0.2)

### Scope

Bring every common data pack file into the editor with validation and autocomplete, plus a first-class mcfunction editor. Design references: [Schema System (mcdoc)](DESIGN.md#6-schema-system-mcdoc), [Editors and UX](DESIGN.md#8-editors-and-ux), [Targets and Exporters](DESIGN.md#9-targets-and-exporters).

### Deliverables

- [x] `@msm/plugin-datapack`: element kinds for recipes, loot tables, advancements, tags, predicates, item modifiers and functions ([ADR 0015](adr/0015-data-pack-element-model.md)).
- [x] Generic schema-form kinds: enchantment, damage type, dimension type, chat type, jukebox song, banner pattern, painting variant, trim material, trim pattern and dialog.
- [x] Loot tables and advancements: schema form plus templates (a bespoke Loot Table Studio is deferred to a later phase).
- [x] Recipe Studio: curated crafting-grid view over the recipe element.
- [x] Registry-backed autocomplete from mcmeta data held in `@msm/schemas`.
- [x] mcfunction editor in Monaco with Spyglass diagnostics and completion, offline in the main process ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)).
- [x] Reference index in `@msm/core` with rename refactor across elements and function text ([ADR 0016](adr/0016-reference-index-and-rename.md)).
- [x] Command palette.
- [x] `vanilla-packs` exporter: data pack `.zip` and combined export (both zips into a folder the user picks).
- [x] "Install to world datapacks folder" action with a world picker.
- [x] Golden tests for every new kind.
- [x] Sample data pack (`fixtures/sample-datapack/`) with SHA-256 exporter goldens and a documented in-game check.
- [x] Data pack golden-path e2e (recipe grid, function editor, data export, reopen).
- [x] Spyglass mcdoc symbols for JSON and NBT inside commands, best effort ([ADR 0009](adr/0009-phase1-validation-gate.md) research note, narrowed by [ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)); `validateJson` stays the JSON gate and adopting the Spyglass JSON checker is DESIGN [Open Question 13](DESIGN.md#18-open-questions).
- [x] Animated textures: extract and export `.png.mcmeta` animation metadata, and animate the preview ([ADR 0011](adr/0011-client-jar-asset-extraction.md)).
- [x] Application menu commands for export, install, asset import and settings.
- [x] Toolchain move to Node 24 and pnpm 12, moved into the first Phase 2 wave (DESIGN [Open Question 11](DESIGN.md#18-open-questions), resolved by [ADR 0017](adr/0017-phase2-toolchain.md)).
- [x] Auto-update with `electron-updater` and the GitHub provider ([ADR 0018](adr/0018-auto-update.md)): start-up check (setting "Check for updates automatically"), Help > Check for Updates, background download, "Restart to update" through the close guard; the release workflow uploads to a draft release. Active once the first release is published.
- [ ] In-game verification by the user: install `fixtures/sample-datapack` into a 26.3 world and run the checks in README "Try the data pack" (no `Failed to load` or `Couldn't parse` lines in `latest.log`).
- [ ] First tagged release (`v0.1.0` or later), waiting on the user's publishing steps in the README "Releasing" section; releases stay Windows only.
- [ ] Signed Windows release (needs signing credentials from the user).

### Exit criteria

Parity with the Misode generators for the listed kinds; a data pack containing functions loads in 26.3 without errors.

Status: code complete on 2026-11-04. The automated proxy passes (the data pack e2e writes a function, a load tag and a grid recipe, renames through the command palette, exports and installs into a fake world, and every function in the sample data pack has zero mcfunction problems); the in-game check and the first tagged release are pending with the user. Remaining work is listed under [Phase 2 follow-ups](#phase-2-follow-ups).

### Estimate

4–6 weeks.

### Depends on

Phase 1 (form generator, export pipeline, validation gate).

## Phase 3 — Structures & Worldgen (v0.3)

### Scope

Import, preview and export structures, then author the worldgen chain that places them: jigsaw pools, structures, structure sets, features, biomes, dimensions, world presets, noise settings and the other worldgen registries, with cross-element validators that catch what a single file cannot show. Design references: [Core Project Model (IR)](DESIGN.md#4-core-project-model-ir), [Plugin System](DESIGN.md#7-plugin-system), [Editors and UX](DESIGN.md#8-editors-and-ux), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Interop (Blockbench, NBT, Minecraft Installation)](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation); decisions in [ADR 0021](adr/0021-structure-templates-and-nbt.md) (structure templates as JSON, deepslate NBT codec), [ADR 0022](adr/0022-worldgen-element-model-and-validators.md) (worldgen kinds, plugin-api 0.5.0, validators, exit-criterion proxy) and [ADR 0023](adr/0023-structure-and-climate-previews.md) (structure and climate previews). Release version 0.3.0; the user pushes the tag.

### Deliverables

Wave 1 (contract, decisions, carry-overs):

- [x] B70: `@msm/plugin-api` 0.5.0 (`ProjectValidator`, `ElementKind.registry`, `Target.dataVersion`, `Target.worldgen.featureSteps`, data folders `structure`, `dimension`, `worldgen`); `mc-26.3` target facts; `msm:structure_template` schema extension; `@msm/plugin-structures` and `@msm/plugin-worldgen` scaffolds with `deepslate`; built-in ranges `^0.5.0`; the app's registry index reads `ElementKind.registry`.
- [x] B71: ADRs 0021–0023, DESIGN (sections 4, 6, 7, 8, 9, 13, 14, 15, 16, 18) and this Phase 3 plan.
- [x] B72: Phase 2 carry-overs: CI action majors, no "resourcepack files left out" row for data-only exports, per-pack export gating, the cooking recipe result field, the music disc notes path, problem navigation to the column and go to definition from the Monaco caret.

Wave 2 (the two engines and the tags):

- [x] B73: `@msm/plugin-structures`: deepslate NBT codec, Sponge `.schem` Version 2 and 3 read and Version 3 write, five kinds (structure template, template pool, structure, structure set, processor list), lowering to gzip `.nbt` with binary goldens, `.nbt` and `.schem` importers and exporters, `structures.*` validators, 9 templates.
- [x] B74: `@msm/plugin-worldgen`: fourteen kinds (biome, configured feature, placed feature, dimension, world preset; noise settings, density function, noise, carver, flat level generator preset, multi-noise parameter list, block state provider, material condition, material rule), `worldgen.*` validators (feature order, biome reachability, preset selectable, preset overworld, unused placed features), 21 templates (the plan said 17; the D9 list adds up to 21).
- [x] B75: worldgen tag kinds (`tag/worldgen/biome`, `structure`, `world_preset`) and 3 templates in `@msm/plugin-datapack`; `@msm/interop` `nbt/level-dat.ts`; world names in the world picker.

Wave 3 (content, host plumbing, previews):

- [x] B76: library starters `custom_biome`, `jigsaw_structure` and `worldgen_pack` ("Custom biome with a jigsaw structure"), 22 examples (3 tag examples came with the CI fix after B75), the `examples/` mirror, `fixtures/sample-worldgen/` with its in-game check, the SHA-256 golden and the chain walk.
- [x] B77: host plumbing: generic importer runner (`session.importFiles`, one undo step), project validators in the problem list, plugin exporters, File > Import Structure…, Export Structures (.nbt)… and Export Structures as Sponge Schematics (.schem)…, Worldgen and Structures groups in the sidebar, the per-area studio registry.
- [x] B78: previews: structure 3D mode and the 2D climate map ([ADR 0023](adr/0023-structure-and-climate-previews.md)).

Wave 4 (studios and guide):

- [x] B79: Structure Studio and Template Pool Studio with the Connections panel.
- [x] B80: Biome Studio (colour pickers, feature steps, spawners) and Placed Feature Studio; the form editor honours `typeArgument` dispatchers.
- [x] B81: user guide pages `docs/guide/structures.md` and `docs/guide/worldgen.md`, README "Try the worldgen sample" and known limitations, scoped CLAUDE.md files.

Wave 5 (end to end and close):

- [x] B82: e2e `worldgen-path.spec.ts` (starter, pool connections, `.nbt` import, export, feature-order error gating, undo, `.schem` export, reopen).
- [x] B83: close: ROADMAP ticks, Milestone Log, ADR statuses (0021–0023 accepted and implemented), version 0.3.0, `minimumReleaseAgeExclude` cleanup, user guide counts; full verification and the `main` fast-forward by the main session.
- [ ] User check: in-game on Windows with 26.3, the steps in `fixtures/sample-worldgen/README.md` (see [Exit criteria](#exit-criteria-3)).
- [ ] User decisions (defaults stand unless vetoed): deepslate's NBT module instead of `prismarine-nbt`; structure templates stored as JSON elements; the noise-sampled worldgen preview deferred to reserve brief B84 (DESIGN [Open Question 15](DESIGN.md#18-open-questions); the user asked for it on 2026-11-22, see [ADR 0119](adr/0119-live-worldgen-preview.md)); `minecraft:dimension_type` stays in the data pack plugin; the three registries new in 26.3 (`block_state_provider`, `material_condition`, `material_rule`) ship as schema-form kinds.

Reserve brief B84 (a noise-sampled biome and terrain map) is replaced: the user asked for it on 2026-11-22, and it is now the plan [`PLAN-live-worldgen.md`](PLAN-live-worldgen.md) (B574–B595, [ADR 0119](adr/0119-live-worldgen-preview.md)); see "Add-on after 1.0 — Live world generation" below.

### Phase 3 follow-ups

Known gaps of the v0.3 design; none blocks the Phase 3 exit criterion.

- [ ] Noise-sampled biome and terrain preview: planned as [`PLAN-live-worldgen.md`](PLAN-live-worldgen.md) (B574–B595, [ADR 0119](adr/0119-live-worldgen-preview.md); DESIGN [Open Question 15](DESIGN.md#18-open-questions) answered 2026-11-22).
- [ ] Editing structure blocks inside the app (v0.3 edits size, palette entries and jigsaws; blocks are edited in-game with a structure block and re-imported).
- [ ] Random palettes beyond the first (an imported template with several `palettes` keeps only the first).
- [x] Real ore starter: the Custom ore starter is a real `msm:block` ruby ore since Phase 4 (B98; [ADR 0020](adr/0020-templates-starters-examples.md)).
- [ ] Go to definition from the Biome Studio's "Used in" list and the other Studio id lists (today only form fields, the textarea editor and Monaco have it).
- [ ] Gallery entries for the worldgen starters: `custom_biome`, `jigsaw_structure` and `worldgen_pack` are in the New project dialog and under `examples/starters/`, but not in Help → Examples….
- [ ] Full-cube culling in the structure view: deepslate draws every face of neighbouring blocks, so large templates render slowly.
- [x] `#[id(tags="implicit")]` support in `@msm/schemas`, so the ore vein template can use a block tag rule instead of `block_match` (2026-11-14, worldgen accuracy audit; the Custom ore starter still uses `block_match`: COVERAGE-AUDIT W-D5).

### Phase 2 follow-ups

Carried over from Phase 2 (known gaps recorded in DEVLOG); none blocks the v0.2 exit criteria. Items are ticked when the brief that closes them lands; the Phase 3 plan places them as noted. Also placed: the GitHub Actions major bumps for the Node 20 runner deprecation (B72), the data-only export info row, the cooking recipe result field and the music disc notes path (B72; listed in the 2026-11-04 DEVLOG), and the form editor's `typeArgument` dispatchers (B80).

- [x] Go to definition from the caret inside the Monaco function editor (F12, Ctrl+Click). Done in B72.
- [x] Problem navigation to the column within a function line. Done in B72.
- [x] Per-layer export gating: an error in one pack no longer disables exporting the other. Done in B72.
- [ ] Check on Windows whether F2 inside Monaco also fires Monaco's own rename alongside the Rename Element menu command. Needs the user's Windows machine; stays open.
- [ ] HD textures in the deepslate preview: the atlas crops every texture to its first 16×16 tile. Stays open.
- [ ] Bespoke Loot Table Studio (v0.2 ships the schema form plus templates; [ADR 0015](adr/0015-data-pack-element-model.md)). Stays open.
- [x] World names from `level.dat` in the world picker ([ADR 0015](adr/0015-data-pack-element-model.md)). Done in B75 ([ADR 0021](adr/0021-structure-templates-and-nbt.md)).
- [x] Remove the pnpm `minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml` once those versions are older than the release-age rule (one day). B83 removed `electron@45.2.2`; `electron-to-chromium@1.5.475` and `lucide-react@1.68.0` were removed on 2026-11-05; `pnpm install --frozen-lockfile` passes without them.

### Phase 2 add-on — Launcher support

Requested on 2026-11-04: preview-asset extraction and pack install for users who play through the CurseForge app or Prism Launcher (first-class, auto-detected), with MultiMC and PolyMC through a manually added folder; Windows first. Design in [Minecraft installation](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation) and [ADR 0019](adr/0019-game-locations-launcher-instances.md). Does not block Phase 3.

- [x] B50: `@msm/interop` `launchers/`: Prism/MultiMC and CurseForge instance readers, discovery and client-jar search across launcher stores.
- [x] B51: shared IPC contract, preload and settings store (`launchers`, `installTarget`, `minecraft:listLocations`).
- [x] B52: renderer components: Settings "Game locations", toolbar install target and submenu, world picker location name.
- [x] B53: ADR 0019 and DESIGN Minecraft installation.
- [x] B54: main process: location resolver, installs into the selected instance, extraction from launcher stores.
- [x] B55: renderer wiring and session (`listLocations`, `setInstallTarget`, warnings, command palette entry).
- [x] B56: end-to-end test installing and extracting through fake Prism and CurseForge instances.
- [x] B57: README "Using Prism Launcher or the CurseForge app", scoped guides, ROADMAP ticks and ADR status.
- [ ] User check: confirm the CurseForge `Install/versions/` jar path, `baseModLoader: null` for vanilla instances and the Prism jar path on a real Windows machine, then run the in-game checks through the chosen instance.

### Phase 2 add-on — Templates and samples library

Requested on 2026-11-04, ahead of Phase 3: a template for every element kind, New Project starters and an examples gallery, all validated and exported per target in CI. Design in [Plugin System](DESIGN.md#7-plugin-system), [Editors and UX](DESIGN.md#8-editors-and-ux) and [ADR 0020](adr/0020-templates-starters-examples.md): `@msm/plugin-api` 0.4.0 adds `elementTemplates`, `projectStarters` and `examples`; templates move into the resource-pack and data-pack plugins (66 in total); a new built-in `@msm/plugin-library` carries 8 starters and 34 examples, mirrored under `examples/`. Does not block Phase 3.

- [x] B60: library contract and host plumbing: plugin-api 0.4.0 (`library.ts`), built-in ranges `^0.4.0`, `@msm/plugin-library` scaffold with the placeholder PNG generator, session `library`, `newProject({ starter })` and `addBundle`.
- [x] B61: ADR 0020 and the design record (DESIGN Plugin System, Editors and UX, Repository Layout, Testing Strategy; this section).
- [x] B62: resource pack templates (14) in `@msm/plugin-resourcepack`, validated per target.
- [x] B63: data pack templates (52) in `@msm/plugin-datapack`, validated per target, functions through the mcfunction checker.
- [x] B64: library content: 8 starters, 34 examples, the `examples/` mirror golden and the cross-plugin CI test in `@msm/exporters`.
- [x] B65: app UI: New project dialog, Examples gallery, grouped and filterable template picker, Notes callout, menu and palette entries.
- [x] B66: end-to-end test of the library path (Custom ore starter, export both packs, copy an example, open an example as a new project).
- [x] B67: user guide (`docs/guide/`), README "Templates and examples", scoped guides, ROADMAP ticks and ADR status.
- [ ] User decisions (defaults stand unless vetoed): Custom ore is an emerald-ore reskin ("Ruby Ore") until Phase 4; the music disc uses the vanilla `minecraft:records/cat` sound until the user imports their own `.ogg`; examples are mirrored on disk under `examples/`.
- [ ] User check: in-game on Windows with the current target, the Custom ore starter (emerald ore shows as ruby ore, "Ruby" item name, ruby block recipe, advancement toast) and the music disc (`/function <namespace>:give_disc`, the disc plays in a jukebox).

### Exit criteria

A custom biome containing a custom jigsaw structure generates in a 26.3 world.

CI cannot run the game, so an automated proxy proves the content first ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)):

1. Every new template, starter and example validates per target with zero errors and zero unknown ids, and its lowered files validate; the `examples/` mirror stays a golden.
2. `fixtures/sample-worldgen/` (the "Custom biome with a jigsaw structure" starter saved as a project) exports a data pack with zero problems and a pinned SHA-256; its structure `.nbt` files parse back with the same block counts; a chain walk over the zip resolves world preset → dimensions → dimension types and biomes → placed and configured features, and structure set → structure → biome tag → biomes, structure → start pool → pools and fallbacks → structure templates → jigsaw pools and targets, against the zip and the vendored vanilla registries.
3. Both plugins' validators report zero errors, and no unplaced structure, unreachable biome or unselectable preset, on the fixture; a copy with one placed feature moved to another step reports `worldgen.feature-order` (since 2026-11-13 a copy with two shared placed features in opposite order within one step, since a different step is legal and only the warning `worldgen.feature-step-differs`; ADR 0022).
4. The `worldgen-path` e2e spec drives the UI from the starter through import, export, a feature-order error that disables export, and undo.

The user then checks in-game on Windows (steps in `fixtures/sample-worldgen/README.md`): the data pack installed into an existing world and the world reopened, `/locate structure` finds the structure in a forest; a new world with the pack and the custom World Type shows the custom biome in F3 and `/locate biome` succeeds; `latest.log` has no `Failed to load`, `Couldn't parse` or "Feature order cycle" lines.

### Estimate

5–7 weeks.

### Depends on

Phase 2 (data pack export, tags, reference index) and the templates and samples library add-on (contribution points for templates, starters and examples).

## Phase 4 — Engine Mod + Blocks/Items (v0.4)

### Scope

Introduce the `msm_runtime` Fabric mod and the content jar, so projects can add new blocks and items with behaviour that vanilla packs cannot express. The phase opens with a one-week registry-freeze spike before any editor work. Design references: [Engine Mod (Runtime)](DESIGN.md#10-engine-mod-runtime), [Behaviour Model (Components and Events)](DESIGN.md#11-behaviour-model-components-and-events), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Interop](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation); decisions in [ADR 0024](adr/0024-runtime-registration-spike.md) (spike and toolchain), [ADR 0025](adr/0025-msm-definition-format-v1.md) (definition format v1, MSM mcdoc, the blocks and items plugin), [ADR 0026](adr/0026-fabric-content-jar.md) (content jar, runtime distribution, Test in Minecraft, headless check) and [ADR 0027](adr/0027-plugin-api-0.6.md) (plugin API 0.6.0). Release version 0.4.0.

Status: code complete on 2026-11-05 (briefs B90–B102); in-game check pending (`fixtures/sample-mod/README.md`, plus Test in Minecraft on Windows with Prism Launcher).

### Deliverables

- [x] **Week 1 — registry-freeze spike:** a throwaway `msm_runtime` that scans `msm/` in all mod containers at init, registers one block and one item from JSON, and runs one event. Result recorded as an ADR; if dynamic registration hits limits, re-plan around code generation (Tier 2). Done in B90: dynamic registration works ([ADR 0024](adr/0024-runtime-registration-spike.md)).
- [x] `engine-mod/`: Gradle 9.8.2 (Kotlin DSL), Java 25, Fabric Loom `net.fabricmc.fabric-loom` 1.19.3 (non-remapping), Fabric Loader 0.20.1 and Fabric API 0.165.2+26.3.
- [x] `msm_runtime` loader: init-time scan of `msm/**/*.json`, driver classes `MsmBlock` and `MsmItem`.
- [x] MSM mcdoc schemas for components and events v1 in `packages/schemas/mcdoc/msm/`, shared by app and runtime.
- [x] Components v1: light, hardness, drops via loot, `on_interact`, `on_step`, redstone, food, tool tier, durability, use actions.
- [x] Actions v1: `run_function`, `spawn_particle`, `set_block_state`, `give_item`, `play_sound`, `trigger_event`.
- [x] `@msm/plugin-blocks-items`: `msm:block` and `msm:item` kinds lowering to vanilla files plus `msm/` definitions.
- [x] Block Studio and Item Studio views (B97; "Has a block item" keeps the earlier item settings within a session, B102).
- [x] Real Custom ore starter on `msm:block` and `msm:item`, replacing the emerald-ore reskin in `@msm/plugin-library` ([ADR 0020](adr/0020-templates-starters-examples.md)); five Phase 4 examples and the `examples/blocks-items/` mirror (B98).
- [x] `@msm/exporters` `fabric-content-jar`: `assets/`, `data/`, `msm/`, `fabric.mod.json`, with `msm_runtime` nested by default and a "separate runtime" option (B95); app File > "Export Fabric Mod Jar…" and the runtime jar shipped as `runtime/msm_runtime.jar` (B96).
- [x] Managed Fabric test instance launched from the app ("Test in Minecraft"): `@msm/interop` `fabric/` (readiness, managed Prism instance `MCSuperMods Test (<mc>)`, `mods/` install tracked in `.msm-installed.json`, Fabric API download with SHA-512 cache, launcher lookup), File and Export menu entries, palette, `TestInMinecraftDialog` (B100, B102).
- [x] JUnit tests for definition parsing; Fabric GameTest for behaviour; kitchen-sink sample exported and loaded on a headless server in CI. JUnit (46) and GameTests (18) run in `./gradlew build` (B93); CI job `engine-mod` with `tools/run-fabric-server` and `fixtures/sample-mod/` (B99).
- [x] e2e `blocks-items-path` (eighth spec) and the guide page `docs/guide/blocks-and-items.md` (B101); atomic writes for every install into a game folder (B102).
- [x] B102: close: ROADMAP ticks, Milestone Log, ADRs 0024–0027 accepted, version 0.4.0 (app and `msm_runtime`, kept equal by a test), docs and scoped CLAUDE.md status lines.
- [ ] User check: in-game on Windows with 26.3, the steps in `fixtures/sample-mod/README.md`, and Test in Minecraft with Prism Launcher (see [Exit criteria](#exit-criteria-4)).

### Phase 4 follow-ups

Known gaps of the v0.4 design; none blocks the Phase 4 exit criterion.

- [ ] Move the Studio form parts shared by structures, worldgen and blocks-items (pickers, sections, the go-to host) into `studios/shared/`.
- [ ] 3D block preview in the Block Studio.
- [ ] Settings control for the launcher program (today `launcherPrograms` is set only through "Choose launcher program…" in the Test in Minecraft dialog).
- [ ] Real-launcher Windows check of Test in Minecraft (Prism picking up a just-created instance, `--launch` from the installed program).
- [ ] `msm_runtime` as its own release asset for modpack makers who use "Separate runtime and GeckoLib (for modpacks)" (the label since Phase 5).
- [ ] Prism and MultiMC program paths on macOS and Linux (Flatpak wrapper, Scoop on Windows) checked on real machines.

### Exit criteria

A custom block with custom behaviour works in-game from one exported jar.

CI cannot run the client, so an automated proxy proves the content first ([ADR 0026](adr/0026-fabric-content-jar.md) D6): the kitchen-sink `fixtures/sample-mod/` exports with zero problems and a pinned SHA-256, its `msm/` definitions validate against the MSM mcdoc, and a headless 26.3 Fabric dedicated server with Fabric API and the content jar (real runtime nested) logs the expected registrations with no runtime errors or warnings; the JUnit conformance tests and 18 GameTests pass in `./gradlew build`; the `blocks-items-path` e2e spec drives the Block and Item Studios through export gating and the jar export. The user then checks in-game on Windows (steps in `fixtures/sample-mod/README.md`).

### Estimate

8–10 weeks, including the one-week spike.

### Depends on

Phase 2 (mcfunction export, loot tables). Phase 3 is not required.

## Phase 5 — Entities, Models, Animation (v0.5)

### Scope

Custom mobs: entity definitions with AI goal components, Blockbench model and animation import, and GeckoLib rendering. Design references: [Behaviour Model (Components and Events)](DESIGN.md#11-behaviour-model-components-and-events), [Interop (Blockbench, NBT, Minecraft Installation)](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation), [Engine Mod (Runtime)](DESIGN.md#10-engine-mod-runtime), [Editors and UX](DESIGN.md#8-editors-and-ux); decisions in [ADR 0028](adr/0028-entity-definition-format-v1.md) (entity definition format v1, the entities plugin, `MsmEntity`), [ADR 0029](adr/0029-model-animation-pipeline.md) (GeckoLib, Blockbench import, geo and animation kinds, preview) and [ADR 0030](adr/0030-plugin-api-0.7.md) (plugin API 0.7.0). Release version 0.5.0.

Status: code complete on 2026-11-05 (briefs B110–B122); in-game check pending (`fixtures/sample-mob/README.md`).

### Deliverables

- [x] Entity and GeckoLib spike (B110): registration through Fabric's `createMob`, natural spawns reaching 26.3's `natural_mob_spawns` attribute, GeckoLib 5.5.7 from the Modrinth Maven on the non-remapping Loom, GeckoLib's resource keys, the headless server with GeckoLib ([ADR 0028](adr/0028-entity-definition-format-v1.md) and [ADR 0029](adr/0029-model-animation-pipeline.md) Status).
- [x] `msm_runtime`: `MsmEntity` driver class and entity registration at init, spawn eggs, natural spawns, the GeckoLib bridge behind `isModLoaded` and the `client` entrypoint (B113).
- [x] Entity components: `msm:health`, `msm:movement`, `msm:attack`, `msm:ai_goals` (`wander`, `look_at_player`, `look_around`, `melee_attack`, `flee`, `follow`), `msm:on_hurt`, `msm:on_death`, `msm:on_interact`, action `play_animation`; MSM mcdoc and the shared conformance corpus (B112, B113).
- [x] `msm:animated_model` component isolating GeckoLib 5.5.7 (the 26.3 build; facts in the target, B111; runtime bridge, B113).
- [x] `@msm/interop` `blockbench/`: `.bbmodel` (4.x and 5.x layouts) to GeckoLib geo and animation JSON with a format version check, `.geo.json` and `.animation.json` pass-through, registered by the app as a host importer (B116, B118). Java block and item `.bbmodel` conversion moved to the follow-ups.
- [x] `@msm/plugin-entities`: `msm:entity` kind, spawn rules and spawn eggs, eight validators (ten codes), three templates (B115; `entities.melee-without-attack` at B122).
- [x] `@msm/plugin-models-anim`: `msm:geo_model` and `msm:animation` kinds, four validators (five codes), three templates (B114), with preview playback in the app's own WebGL renderer (B117).
- [x] Entity Studio view, File > "Import Blockbench Model…", sidebar groups, GeckoLib download in main (B118).
- [x] Content-jar exporter nests GeckoLib only when the project has entities, with "Separate runtime and GeckoLib (for modpacks)" (B111); plugin API 0.7.0 with `GeckolibFacts` (B111).
- [x] GameTest coverage for spawning, movement and attack: 38 GameTests (registration, attributes, eggs, each goal, each trigger, `play_animation`, natural spawns) and 78 JUnit tests in `./gradlew build`, also with `-PwithoutGeckolib` (B113).
- [x] Custom mob starter (the Ruby Golem) and five entity examples with the `examples/entities/` and `examples/starters/custom_mob/` mirrors (B119).
- [x] `fixtures/sample-mob/` with a SHA-256 golden and the CI headless server check with the runtime and GeckoLib nested (B120).
- [x] e2e `entities-path` (ninth spec) and the guide page `docs/guide/entities-and-models.md` (B121).
- [x] B122: close: ROADMAP ticks, Milestone Log, ADRs 0028–0030 accepted, version 0.5.0 (app and `msm_runtime`), docs and scoped CLAUDE.md status lines.
- [ ] User check: in-game on Windows with 26.3, the steps in `fixtures/sample-mob/README.md` (see [Exit criteria](#exit-criteria-5)).

### Phase 5 follow-ups

Known gaps of the v0.5 design; none blocks the Phase 5 exit criterion.

- [ ] Molang subset in the preview (`query.anim_time`, `query.life_time`, arithmetic, `math.sin`/`math.cos`), so Blockbench's common idle expressions play (reserve brief B124).
- [ ] `catmullrom` interpolation in the preview (plays as linear today).
- [ ] Client render check in CI (reserve brief B123): a Fabric client GameTest that spawns the sample mob and screenshots it. The route exists since the particles batch (B356, [ADR 0081](adr/0081-particle-studio-flows-and-tests.md) D6): Fabric's client GameTests run headless under Xvfb with Mesa EGL (`SDL_VIDEO_FORCE_EGL=1 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew runClientGameTest`; GLX does not work), and CI runs `MsmParticleClientGameTest` on both versions with screenshots as an artefact. What remains is the mob test itself.
- [ ] GeckoLib items and armour (animated item models) if users ask. (Mobs without GeckoLib: done with the runtime's built-in vanilla renderer, [ADR 0072](adr/0072-vanilla-model-renderer.md).)
- [ ] Java block and item `.bbmodel` import into `minecraft:block_model` / `minecraft:item_model` elements (Blockbench exports these itself today).
- [ ] A 3D spawn egg and item preview in the Entity Studio.
- [ ] GeckoLib shipped inside the installer, for offline first exports, if users ask (MIT permits it).
- [ ] Toolbar Export menu entry for Blockbench import (menu and palette only today).

### Exit criteria

A Blockbench-animated custom mob spawns, moves and attacks.

CI cannot draw the client, so an automated proxy proves the content first: the GameTests in `./gradlew build` spawn every goal type's mob, walk it, make it attack a player and a listed mob type, flee and follow, fire each trigger and check natural spawns in the listed biomes; `fixtures/sample-mob/` exports with zero problems and a pinned SHA-256, and a headless 26.3 Fabric server with Fabric API and the jar (real runtime and GeckoLib 5.5.7 nested) logs `registered 1 entity type(s)` with no runtime or GeckoLib warning or error; the `entities-path` e2e spec imports a Blockbench model, drives the Entity Studio and the animated preview through export gating and the jar export. The user then checks in-game on Windows (steps in `fixtures/sample-mob/README.md`), which also covers rendering and animation.

### Estimate

8–10 weeks.

### Depends on

Phase 4.

## Phase 6 — Scripting & Eject (v0.6)

### Scope

Open the two power-user escape hatches: Tier 1 TypeScript scripts run by Rhino inside the runtime, and Tier 2 export as a standalone Fabric Java project. Design references: [Scripting and Escape Hatches](DESIGN.md#12-scripting-and-escape-hatches), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Engine Mod (Runtime)](DESIGN.md#10-engine-mod-runtime); decisions in [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) (Rhino 1.9.2 nested, TypeScript to ES5 instead of esbuild, sandbox, lifecycle, validation gate, budgets), [ADR 0032](adr/0032-script-api-v1-and-typings.md) (script API v1, typings, `msm:script`, `run_script`), [ADR 0033](adr/0033-java-project-eject-v1.md) (`java-project` eject v1, parity GameTests) and [ADR 0034](adr/0034-plugin-api-0.8.md) (plugin API 0.8.0). Release version 0.6.0.

Status: code complete on 2026-11-05 (briefs B130–B141); in-game check pending (`fixtures/sample-script/README.md`, and the ejected projects' READMEs).

### Deliverables

- [x] Scripting spike (B130): Rhino 1.9.2 nested through Loom `include`, `ServiceLoader` from the nested jar, the sandbox and time budget, per-call cost (`server.tick` stays); eject and parity spike (B131): a hand-built ejected project with GeckoLib nested, `engine-mod/parity/`, `tools/run-fabric-server --gametest` on a production server (ADR 0031 and ADR 0033 Status).
- [x] `msm_runtime` `scripting/`: Rhino (ES6 language level, interpreted) embedded, script lifecycle (load, `/reload`, stop), error reporting and the `loaded S script(s); E error(s)` line (B133).
- [x] Runtime script API v1: `msm.log`, `msm.events.on` over nine events, `msm.actions.define` with the `run_script` action, `msm.schedule`, `World`, `Entity`, `Player`, `Pos`, relative `require`; `ScriptApiContractTest` and 22 script GameTests (B133); MSM mcdoc `run_script` and `msm:script` (B135).
- [x] Generated `.d.ts` typings from `script-api-v1.json` (golden), shipped with the app and written to `.msm/` (B132, B137a; `require` declared at B141).
- [x] `@msm/plugin-scripting`: `msm:script` kind, three validators, four templates (B134). Transpilation is TypeScript `transpileModule` to ES5 CommonJS in the main process, not esbuild to ES2015, because Rhino cannot parse classes, `for...of`, call spread or `async` and esbuild cannot lower them ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)); the content-jar exporter writes the `.js` (B136, B137a).
- [x] Monaco script editor with typings and diagnostics: Script Studio, sidebar group "Scripts", `run_script` in the Events editor, live `typescript.*` problems, the export gate (B137a, B137b); the suggest controller registered, so completion lists show in every Monaco editor (B140).
- [x] `@msm/exporters` `java-project`: one-way, deterministic Gradle project with Java generated by the target (`Target.javaProject`, the 26.3 generator) and a README, no dependency on `msm_runtime`; scripts left out with a warning (B136); Export Java project dialog and File > "Export Java Project…" (B137a, B137b); plugin API 0.8.0 (B132).
- [x] CI check that the ejected kitchen-sink projects (`fixtures/sample-mod`, `fixtures/sample-mob`) build with Gradle (B139).
- [x] Behaviour-parity GameTests (11 sample-mod and 7 sample-mob tests) run against both the content jar (runtime nested) and the ejected build, four runs in CI (B139).
- [x] `fixtures/sample-script/` (one script per event, a handler, a `require`d module) with a SHA-256 golden and the CI headless server check (B139).
- [x] Scripted ore starter and three script examples, with the `examples/scripts/` and `examples/starters/scripted_ore/` mirrors (B138).
- [x] e2e `scripting-path` and `eject-path` (eleven specs), guide pages `docs/guide/scripting.md` and `eject.md`, README (B140).
- [x] B141: close: `require` typed, the version rule for script jars, ADRs 0031–0034 accepted (ADR 0003 partly superseded), version 0.6.0 (app and `msm_runtime`), docs and scoped CLAUDE.md status lines.
- [ ] User check: in-game on Windows with 26.3, the steps in `fixtures/sample-script/README.md`, and an ejected project built and run (see [Exit criteria](#exit-criteria-6)).

### Phase 6 follow-ups

Known gaps of the v0.6 design; none blocks the Phase 6 exit criterion.

- [ ] Scripts in the eject (reserve brief B142): copy the runtime's `scripting/` sources into the ejected project, nest Rhino and ship the transpiled `.js`; needs an ADR 0033 D1 amendment.
- [ ] Parity for more fixtures (reserve brief B143): more actions and components in the parity GameTests (scripts cannot have parity without the runtime).
- [ ] Persistent script data (reserve brief B144): moved to the add-on "Adding to vanilla content, triggers and saved data (planned)" (ADR 0062).
- [ ] Re-probe Rhino 2.0 when it is released (classes, `for...of`, `async`); keep a TypeScript 6.x copy for the transpiler if the repository moves to TypeScript 7.
- [ ] Client-side script events (rendering, keys, HUD); v1 runs on the server only.
- [ ] Typed `require`: the typings return `any` for a required module; a module-aware check across a project's scripts would type it.
- [ ] A Biome rule forbidding `typescript` imports in the renderer, to guard the bundle.
- [ ] `app.asar` is about 24 MB of its 25 MB budget: trim or raise the budget with an ADR before Phase 7 adds weight.

### Exit criteria

Script-driven behaviour runs in-game; the ejected project builds with Gradle and matches runtime behaviour.

CI cannot play the game, so an automated proxy proves the content first: 22 script GameTests in `./gradlew build` (sandbox, time budget, each of the nine events, cancelling, `require`, `schedule`, `run_script`, reload); `fixtures/sample-script/` exports with zero problems and a pinned SHA-256, and a headless 26.3 Fabric server with the jar (runtime nested) logs `loaded 11 script(s); 0 error(s)` and every script's own log line; CI exports `fixtures/sample-mod` and `fixtures/sample-mob` as Java projects and builds each with `./gradlew build`; the parity GameTests pass four times (each sample's content jar with the runtime, and its ejected jar with no runtime); the `scripting-path` and `eject-path` e2e specs drive the Script Studio (completion, problems, the ES5 script in the jar) and the Java project export. The user then checks in-game on Windows (steps in `fixtures/sample-script/README.md`).

### Estimate

6–8 weeks.

### Depends on

Phases 4 and 5.

## Phase 7 — 1.0

### Scope

Open the platform and harden it for release: third-party plugins, a second Minecraft target, templates, a documentation site and auto-update. Design references: [Plugin System](DESIGN.md#7-plugin-system), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Open Questions](DESIGN.md#18-open-questions).

### Deliverables

Briefs B150–B162 (the working plan was closed at 1.0; history in DEVLOG). B150–B160 shipped in v0.7.0; B161 and B162 are in 1.0.0.

- [x] Third-party plugin loading from `~/.msm/plugins/` in a sandboxed context with a capability manifest: B150 (spike), B154 (renderer on `msm-app://`, worker host, Settings "Plugins"; [ADR 0035](adr/0035-plugin-sandbox-and-capability-manifest.md)). The end-to-end check through the UI (`plugins-path`) is B161.
- [x] `@msm/plugin-api` 1.0 with `apiVersion` compatibility checks: B152 ([ADR 0036](adr/0036-plugin-api-1.0-and-compatibility-policy.md)); 1.1.0 and 1.2.0 followed with the add-ons; the tarball ships with each release (B160).
- [x] `tools/new-plugin` scaffold and a sample external plugin: B157 (`--external`, `fixtures/sample-plugin/`).
- [x] Second target package (26.4 or whatever is current) with migration hooks and an "upgrade project target" command: B151 (spike), B152, B153 (`mc-26.4` pinned to `26.4-snapshot-7`, migration), B159 (per-version runtime builds, CI matrix), B160 (Upgrade project target, target choice, status bar, per-target runtime jars, release workflow; [ADR 0037](adr/0037-second-target-mc-26.4-and-target-upgrade.md), [ADR 0038](adr/0038-per-version-runtime-builds.md)). The release re-pin is reserve B163.
- [x] Templates and wizards (custom ore, custom sword, custom mob): B156 (starter parameters, the multi-step New project dialog, the Custom sword starter; [ADR 0040](adr/0040-wizards-as-parameterised-starters.md)), on top of the library of earlier phases.
- [x] Documentation site (user guide under `docs/guide/`): B152, B158 (VitePress, `docs.yml`; [ADR 0039](adr/0039-documentation-site.md)). Live once the repository owner sets Pages to "GitHub Actions"; the plugins and targets pages are B161.
- [x] Auto-update: delivered in Phase 2 with `electron-updater` and the GitHub provider ([ADR 0018](adr/0018-auto-update.md)); every six hours and with What's new since 0.6.1 (B145).
- [x] Contribution guidelines published (the licence was settled as MIT on 2026-11-04): B158 (`CONTRIBUTING.md`, pull request template).
- [x] e2e `plugins-path` and `targets-path`, guide pages `plugins.md` and `targets.md`, README and CI updates (B161); a Windows CI job for the sample plugin build and plugin exporters in the Export menu (after B161).
- [x] Release 1.0.0 close: versions, ROADMAP and DESIGN close, HANDOFF (B162). The 1.0.0 release build waits for the user's go-ahead.

### Follow-ups after 1.0

- 26.4 release re-pin (was reserve B163): when `piston-meta` lists 26.4 as a release, re-run `sync-mcmeta --version 26.4` and `sync-mcdoc` at the then-current `generated` ref; set `mcVersion: '26.4'`, `channel: 'release'`, `mcmetaRef: '26.4'`, `minecraftDependency` `~26.4`, Fabric API's `+26.4` release build, GeckoLib facts once a 26.4 build is on Modrinth (the mob starter then reappears through `supports`), `engine-mod/versions/26.4.properties`, the removed-id test and the goldens; `defaultTargetId` then becomes 26.4 by itself.
- npm publishing of `@msm/plugin-api` (was B164): with an `NPM_TOKEN` secret from the user, `publish-release.yml` adds `npm publish --provenance --access public` of the tarball.
- External schema-form editors (was B165): a `formModels` contribution (field order, labels, hidden paths, previews) so a plugin can shape the generic form without React.
- Vendored target data gzipped in the asar (ADR 0079 D4): only if `app.asar` comes within 1 MB of its 32 MB budget.
- [x] Dimensions a beginner can enter (user idea, 2026-11-06): the "Dimension" Creator flow with a key item or a travel function ([ADR 0051](adr/0051-dimension-creator-flow.md), 2026-11-07). Open: a real custom portal block (new runtime code, GameTests and parity tests).
- [x] Plugin exporters in File > More Exports (2026-11-07; the palette and options were done before). Open: the 26.3 mcdoc re-pin to the 26.4 ref for one shared tree; a plugin marketplace (an idea).

### Phase 7 add-on — AI helper (v0.7.0)

Pulled ahead of the remaining Phase 7 work by the user on 2026-11-05 ("add that first"); it was a post-1.0 idea. Design: [Editors and UX](DESIGN.md#8-editors-and-ux) "AI helper", [ADR 0041](adr/0041-ai-helper.md) (accepted); briefs B170–B175 (the working plan was closed with the release; history in DEVLOG). Shipped in v0.7.0.

- [x] `@msm/ai`: protocol, tool catalogue, agent loop over a `ModelClient` seam, budgets, scripted client, SDK adapter (B170; SDK 1.1.0).
- [x] Main: `safeStorage` key store, `AppSettings.ai`, the AI service and `msm:v1:ai:*` IPC, View > AI Helper (B171).
- [x] Renderer: tool executor, the pending changeset, `session.checkProject`, `session.applyChangeset` as one undo step (B172).
- [x] UI: the "AI helper" dock tab, chat and build modes, plan and checkpoint decisions, changeset review with Apply, run limits, usage and cost, Settings "AI helper", "Explain this problem", "Ask about this element" (B173).
- [x] Tests: scripted build scenario exporting with zero problems, e2e `ai-path` (B174); lowering conflicts in `checkProject` and Creator stamps from `add_starter` (B192).
- [x] Guide page `ai-helper.md`, CHANGELOG, release 0.7.0 (B175).

### Phase 7 add-on — Armour, custom tool materials and the Creator (v0.7.0)

User request of 2026-11-05: beginners should see in real time what they make, with almost no coding, including whole gear sets, and still be able to adjust anything by hand. Design: [ADR 0042](adr/0042-armour-and-custom-tool-materials.md) (format), [ADR 0043](adr/0043-creator-guided-flows.md) (Creator), [ADR 0045](adr/0045-undoable-asset-writes.md) (undoable asset writes), all accepted; briefs B180–B185 and B193 (the working plan was closed with the release). Shipped in v0.7.0.

- [x] `msm:armor` component, custom `ToolMaterial` tiers and attack overrides in the definition format, the `minecraft:equipment` kind, validators, target facts (B180).
- [x] Runtime support with GameTests on 26.3 and 26.4 (B181); eject generator, `fixtures/sample-mod` helmet and custom-tier pickaxe, parity tests (B182).
- [x] Library: placeholder silhouettes and armour layers, flows Gear set, Simple block, Food, Scripted behaviour; `creator` on Custom ore and Custom mob; the `set` parameter (B183).
- [x] Creator dialog with a live preview (items, blocks, recipes, armour, stats, elements), Create as one undo step, Edit in Creator with the kept-edits rule (B184).
- [x] Scenario test, e2e `creator-path`, guide `creator.md`, armour in `blocks-and-items.md` (B185).
- [x] Update in the Creator restores replaced texture bytes with the same Undo; `addBundle` merges shared language files and tags (B193); "Edit in Creator" with nothing changed plans no change (B175).
- Follow-up: blocks that *require* a custom tier (`min_tier` as a tag); a stored generator version in `meta.creator` if generator fixes make old sets look edited.

### Phase 7 add-on — Gear, weapons and consumables (planned v0.8.0, shipped in v0.7.0)

The user's follow-up of 2026-11-05 ("armour was only an example; add others that fit"). Chosen by value for beginners against cost after checking MSM and the 26.3 game: [ADR 0044](adr/0044-gear-weapons-and-consumables.md) (accepted); briefs B186–B191. The main session folded the planned 0.8.0 into the combined 0.7.0 release.

- [x] Format: `msm:components` (vanilla component passthrough validated by the target's mcdoc), `msm:consumable` with effects, `msm:ranged_weapon` (bow, crossbow), `msm:shield`, `msm:death_protection`, tool types `spear` and `mace`, armour slots `horse` and `wolf`, action `apply_effect`, the `image` parameter type (B186).
- [x] Runtime: the passthrough decoder, `MsmBowItem`, `MsmCrossbowItem`, `MsmMaceItem`, spears, horse and wolf armour, GameTests (B187); eject, sample mod, parity (B188).
- [x] Flows: Weapon, Consumable, Totem, Enchantment, Painting, Music disc item; Gear set pieces spear, mace, bow, crossbow, shield, horse and wolf armour, and `trim_material` (B189); Creator previews and the image field (B190); tests and guide (B191); painting variant tags (B192); release with 0.7.0 (B175).
- Deferred to post-1.0 with reasons in ADR 0044 D8: trident-style throwables and custom projectiles, custom status effects, armour trim patterns, banner patterns, gliders.

### Add-on after 1.0 — Modpacks (planned v1.1.0)

User request of 2026-11-06: "modpack support, so everything you make can be organised", meaning both collections of projects and real modpacks. Design: [ADR 0046](adr/0046-modpacks.md) (accepted), DESIGN [Targets and Exporters](DESIGN.md#9-targets-and-exporters) "Modpacks".

- [x] `msm.modpack.json` model in `@msm/core` (`parseModpack`, `serialiseModpack`); `FabricFacts.apiModrinth` (plugin API 1.3.0) verified for 26.3 and the 26.4 snapshot; `createMrpack` in `@msm/exporters`; Modrinth lookups and extra-mod installs in `@msm/interop`.
- [x] Main: remembered modpacks in settings, the modpack service (create, add existing, forget, read, write, add project, member snapshots, Modrinth lookup), `testInMinecraft.runModpack` with the download cache.
- [x] Renderer: scratch-session member builds (`session.createScratch`, `loadSnapshot`, `buildContentJar`), the Modpacks dialog (File → Modpacks…, palette), Export modpack (.mrpack)…, Test modpack in Minecraft.
- [x] e2e `modpacks-path` (palette, New modpack… in its own folder through `MSM_E2E_MODPACK_DIR`, Add open project written as `../project`, rename, a build through the member snapshot).
- [ ] The user imports an exported `.mrpack` into Prism and the Modrinth app (verify `hashes.sha1` and `fileSize` there) and tests a modpack in game.
- [x] **Update mods** re-pins every Modrinth mod for the modpack's Minecraft version (after a version change or for newer releases).
- Follow-ups: CurseForge export; server packs.

### Add-on after 1.0 — Custom status effects and throwables (prepared as v1.4.0, shipped in 1.5.1)

User request of 2026-11-13 ("add custom status effects and throwables"), taking up two items deferred by [ADR 0044](adr/0044-gear-weapons-and-consumables.md) D8. Design: [ADR 0055](adr/0055-custom-status-effects.md) (status effects) and [ADR 0056](adr/0056-throwables.md) (throwables), both accepted (2026-11-13); the working plan is deleted (history in the DEVLOG). Defaults the user may veto: the thrown item is drawn as its item picture; `return` is a boomerang without a return flight; no brewing; the names `msm:effect`, `msm:throwable`, `msm_runtime:thrown_item`; release as 1.4.0.

- [x] B200 Format: `Effect` definition and element, `Throwable` component, actions `damage` and `heal`, schema refs, corpus.
- [x] B201 Script API: `hasEffect`, `effectLevel`, `removeEffect`, `ActionEvent.other`.
- [x] B202 Plugin API 1.6.0 (`JavaProjectInput.effects`) and target notes.
- [x] B203 Runtime: `MsmMobEffect`, `MsmThrowableItem`, `MsmThrownItem`, renderer, actions, GameTests on 26.3 and 26.4.
- [x] B204 Plugin `blocks-items`: effect kind, lowering, validators, templates.
- [x] B205 App Studios: Effect Studio, Throwable section, Hurt and Heal actions.
- [x] B206 Exporters: effect routing in `java-project`, content jar check.
- [x] B207 Java eject (26.3 generator): `ModEffects`, effect classes, `ThrownItemEntity`, client entrypoint rule.
- [x] B208 Library: Status effect and Throwable flows, patterns, examples.
- [x] B209 AI helper: system prompt paragraph and "poison dart" scenario.
- [x] B210 Samples and parity: sample mod and script additions, parity GameTests, goldens.
- [x] B211 Creator group "Magic", previews, e2e and guide.
- [ ] The user checks in game: effect icon and tinted particles, the thrown item in flight, the hold-to-throw animation, a dispenser, picking a dropped knife up, the Creator results.
- Follow-ups kept in Post-1.0 Ideas: 3D thrown models, return flight, custom arrows, instant effects, brewing.

### Add-on after 1.0 — Runtime fixes and sounds

Takes up suspects S1, S4, S5, S6, S7 (and S10 in passing) and backlog item B1 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md). Design: [ADR 0057](adr/0057-project-sound-events-and-mob-sounds.md) (project sound events and mob sounds), [ADR 0058](adr/0058-event-actors-entity-commands-and-cancel-resync.md) (event actors, entity-scoped commands, cancel resync) and [ADR 0059](adr/0059-block-shapes-and-see-through-blocks.md) (block shapes), all accepted (2026-11-14); the working plan is deleted (history in the DEVLOG). Part A (B212–B223) and Part B (B224–B228, block shapes) landed together. Defaults that need the user's veto: bare sound strings in vanilla data stay an error in the app; entity and thrown-item events keep their function source; fixed shapes and see-through only (no rotation, stairs, real slabs, doors, fences or crops); no Creator questions for sounds or shapes yet.

- [x] B212 Format A: entity `sounds`, doc comments on the five sound fields, corpus.
- [x] B213 Script API contract: `at` on the `World` calls, `Entity.runCommand` and `Entity.runFunction`, corrected doc strings.
- [x] B214 Plugin API 1.7.0 (`JavaProjectInput.soundEvents`) and target notes.
- [x] B215 Runtime: sound registration, mob sounds, step entity.
- [x] B216 Runtime: script commands and cancel resync.
- [x] B217 App: kind-aware sound ids and sound pickers.
- [x] B218 Exporters: collect sound event keys for `java-project`.
- [x] B219 Plugin `entities`: `sounds` through lowering, template.
- [x] B220 Java eject (26.3 generator): `ModSounds`, mob sounds, step and source rules.
- [x] B221 AI helper and library texts.
- [x] B222 Samples and parity, including `SampleScriptParityTest`.
- [x] B223 e2e, guide and changelog.
- [x] B224 Format B and plugin `blocks-items`: `msm:shape`, presets, validators, templates.
- [x] B225 Runtime shapes.
- [x] B226 App Block Studio: Shape section.
- [x] B227 Java eject shapes.
- [x] B228 Shapes: sample, parity, e2e, guide.
- [ ] The user checks in game: project sounds (Play sound action, drink, armour equip, thrown item, script), mob sounds, a mob bounced by a jump pad, cancelled placements showing no ghost block, cut-out and translucent textures on a see-through block on 26.3 and 26.4, outline and collision of a half block and a plant.

### Add-on after 1.0 — Adding to vanilla content, triggers and saved data

Takes up backlog items B3, B4 and B6 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) and the data half of B9 (trades). Design: [ADR 0060](adr/0060-adding-to-vanilla-content.md) (adding to vanilla content), [ADR 0061](adr/0061-more-triggers.md) (more triggers) and [ADR 0062](adr/0062-persistent-script-data.md) (persistent script data), all accepted 2026-11-14; the working plan is deleted and its history is in the DEVLOG. Parts B and C may ship one release after Part A. Defaults that need the user's veto: additions never override a world data pack; a new villager trade is a candidate, not a guarantee; Custom ore generates by default; 5-tick minimum trigger interval and 2,000 firings per server tick; script data limits of 16 KiB per entity and 1 MiB per world; the names `msm:biome_addition` and `msm:loot_addition`, "World addition" and "Extra drops".

- [x] B229 Plugin API 1.8.0 and target facts (trade folders, compost providers).
- [x] B230 Plugin `datapack`: trade kinds, tag registry, templates.
- [x] B231 Creator flow "Villager trade" (group `worlds`), example, sample data pack trade.
- [x] B232 Format: addition definitions, `BlockItem.components`, `fuel` and `compost`, ten trigger components, corpus.
- [x] B233 Script API contract: `DataStore`.
- [x] B234 Runtime: biome and loot additions, block item components.
- [x] B235 Runtime: triggers and the tick limiter.
- [x] B144 Runtime: persistent script data.
- [x] B236 Plugin `blocks-items`: addition kinds, `fuel` and `compost` lowering, validators, templates.
- [x] B237 Exporters: `java-project` routing for the addition folders.
- [x] B238 Java eject (26.3 generator): `ModWorldgen`, `ModLoot`, trigger overrides.
- [x] B239 App Studios: World addition, Extra drops, Triggers, Fuel and compost.
- [x] B240 Library and AI helper: ore generation, "Extra drop" flow, examples, prompt.
- [x] B241 Samples and parity, including the two-run script data check.
- [x] B242 e2e, guide and changelog.
- [ ] B243 (reserve, not started) real-generation check on the headless server: generate real chunks on a dedicated server and count the ore, instead of the GameTests' direct feature placement.
- [ ] The user checks in game: ore in a new world only, the extra drop, furnace and composter, the villager trade, each trigger in play, script data across quit, death and portal.
- Deferred and kept in the audit backlog: flammability, strip and oxidise pairs, values on vanilla items, removing vanilla features, new professions, custom compost chances, `on_crafted`, no-code conditions on stored data.
- Follow-ups: implicit tag ids in the schema validator (then the ore targets use the replaceable tags instead of `block_match` on stone and deepslate); `on_attack` against a player runs `run_function` as the victim (decide whether the attacking mob should be the actor); effect and thrown-item events could use the holder or thrower as the actor; the real chunk-generation check (B243, reserve).

### Add-on after 1.0 — Potions, data kinds and Script API 1.1

Takes up backlog items B10, B11 and B5 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md). Design: [ADR 0063](adr/0063-potions-and-brewing.md) (potions and brewing), [ADR 0064](adr/0064-data-kinds-sweep.md) (data kinds sweep) and [ADR 0065](adr/0065-script-api-1-1.md) (Script API 1.1), all accepted 2026-11-14 with their findings; the working plan is deleted and its history is in the DEVLOG. [ADR 0066](adr/0066-vanilla-pack-safety.md) (vanilla pack safety, Proposed) grew out of finding P8 and is in progress. Defaults that need the user's veto: the kind name `msm:potion`, the `long_` and `strong_` ids, default reagents, the flow names "Potion", "Mob skin" and "Goat horn", the 5-tick `player.tick` minimum, 32 boss bars per namespace and the 128-block raycast limit.

- [x] B244 Format: potion definition and element, corpus.
- [x] B245 Plugin API 1.9.0 and target facts (potion, data folders).
- [x] B246 Script API contract and plugin `scripting`.
- [x] B247 Runtime: potions.
- [x] B248 Runtime: Script API 1.1.
- [x] B249 Plugin `blocks-items`: potion kind.
- [x] B250 Plugins `datapack` and `resourcepack`: kinds sweep.
- [x] B251 Exporters: `java-project` potion routing, `potion-needs-jar`.
- [x] B252 Java eject (26.3 generator): `ModPotions`.
- [x] B253 App: Potion Studio and potion ids.
- [x] B254 Library: flows and examples.
- [x] B255 Samples, parity and CI.
- [x] B256 AI helper texts.
- [x] B257 e2e, guide and changelog.
- [ ] The user checks in game: potion names, colours and creative tab entries; brewing in a real stand; splash, lingering and tipped arrow; the wolf skin in its biome and as a baby; the goat horn sound; titles, action bar and boss bar; XP, hunger and game mode changing without a relog; a killing blow firing `entity.damaged` once.
- Deferred (ADR 0063 D12, ADR 0064 D4, ADR 0065 D11): brewing items that are not potions, brewing stand fuel, a Recipe Studio brewing layout, `custom_effects` potions for vanilla packs; `sulfur_cube_archetype`, test environments and instances, the 26.4-only `block_sound_set`; `block.place`, changing the damage amount, `msm.commands.register`, a custom creative tab, dropped items and projectiles in `entitiesNear`, client-side scripting.
- Follow-ups: re-sync the vendored mcdoc and add `wolf_sound_variant` and `trial_spawner` back (ADR 0064 finding); a test for boss bar removal on server stop; move the vanilla pack safety rule into `@msm/exporters` with CI covering mod projects (done in 381cddf; ADR 0066 accepted 2026-11-14).

### Add-on after 1.0 — Block types, crops, saplings and trees

Takes up backlog items B2 and B12 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) (and closes limitation L5). Design: [ADR 0067](adr/0067-block-types-and-states.md) (block types and states), [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md) (crops, saplings, trees and leaves) and [ADR 0069](adr/0069-block-family-flows.md) (block family flows), all accepted 2026-11-14 with their findings; [ADR 0066](adr/0066-vanilla-pack-safety.md) (vanilla pack safety) accepted the same day. The working plan is deleted and its history is in the DEVLOG. Defaults that need the user's veto: the `type` field design, the stairs base `minecraft:stone`, the flow names "Wood set", "Stone set", "Crop" and "Tree", the Wood set's default members, untinted leaves by default, "Villagers plant it" on by default.

- [x] B258 Format: 17 block types, per-type fields, `item.id`, `msm:flammable`, `msm:strippable`, editor textures and models, crop and leaves loot presets.
- [x] B259 Plugin API 1.10.0 (`BlockFacts`) and target block facts.
- [x] B260 Runtime: block behaviour driver extracted from `MsmBlock`.
- [x] B261 Runtime: Codecs for types, `item.id` and the two components.
- [x] B262 Lowering: building block types.
- [x] B263 Runtime: slab, stairs, wall, fence, fence gate, pane; rotation types; flammability and stripping.
- [x] B264 Lowering: plants and the crop and leaves loot presets.
- [x] B265 Validators: 18 block type codes.
- [x] B266 Templates: 17 block type templates.
- [x] B267 Runtime: doors, trapdoors, buttons, pressure plates and weighted plates.
- [x] B268 App: Block Studio Type picker, Textures and Models sections.
- [x] B269 Exporters and registry views: `blockItemId`.
- [x] B270 Worldgen: "Tree for a sapling" and the Tree Studio.
- [x] B271 Runtime: crops, saplings, leaves and the client leaf tint.
- [x] B272 App: plant sections, 3D preview of generated models, Creator set row.
- [x] B273 Library: Wood set and Stone set flows (B273a: generated model ids in the registry view).
- [x] B274 Java eject: building and redstone types.
- [x] B275 Library: Crop and Tree flows, six examples.
- [x] B276 Java eject: crops, saplings and leaves.
- [x] B277 e2e: families path.
- [x] B278 Sample mod, 15 parity tests and CI.
- [x] B279 AI helper prompt, summaries and placeholder patterns.
- [x] B280 Guide page "Block types and plants", changelog, status lines.
- [x] B281 Close: ADRs, DESIGN, coverage audit, HANDOFF.
- [ ] The user checks in game (`fixtures/sample-mod/README.md`, "Block types and plants"): each maple member and its placement, stripping, doors and trapdoors by hand and by redstone, buttons and plates, fences, walls and gates connecting, slabs stacking, stairs shapes; the ruby berries growing, bone meal, harvest and replant by a villager; the maple sapling growing its tree; leaf decay and the leaf tint; a Creator Wood set, Stone set, Crop and Tree in a new world.
- Deferred (ADR 0067 D11, ADR 0068 D9): signs and hanging signs, boats and chest boats, own door, trapdoor, button and plate sounds, copper weathering and waxing, stems with attached fruit, berry bushes, double plants, cocoa and nether wart, flower pots, ladders, torches, lanterns, chains, waterlogging for plain and facing blocks, new trunk and foliage placer shapes, tint rules beyond the vanilla four and a constant.
- Follow-ups: the dock preview (`PreviewPanel.modelFieldSubject`) ignores typed blocks; no general "Item id" field outside crops; separate block and item names for crops; a field to turn off the leaves item tint and a `textures.item`; the AI helper's `create_texture` has no accent colour; replace the deprecated `makeMockServerPlayerInLevel` in the GameTests; the 26.4 flammability reflection (access widener if it breaks).

### Add-on after 1.0 — Mob expansion

Takes up backlog item B7 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) (and closes limitations L7, L8 and L9 for mobs). Design: [ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md) (mob bases, movement modes, ranged attacks), [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) (taming, breeding, riding, variants, boss bars), [ADR 0072](adr/0072-vanilla-model-renderer.md) (the runtime's own renderer: GeckoLib optional, mobs on 26.4) and [ADR 0073](adr/0073-mob-flows-templates-and-presets.md) (flows, templates, preset models), all accepted 2026-11-14 with their findings (ADR 0070 keeps the fact table and the limits M1–M17). The working plan is deleted and its history is in the DEVLOG. Defaults that need the user's veto: the field name `base` and absent meaning `mob`, the component names, the skeleton-like ranged defaults, a wolf's taming chance and follow distances, babies at half size growing up in 20 minutes, a saddle needed by default, purple progress boss bars, `renderer: auto`, the flow names, a Boss only from its spawn egg, the preset shapes.

- [x] B282 Format: bases, movement modes, ranged attacks, taming, breeding, riding, variants, boss bars, renderer, four goals, two spawn rules (68 corpus cases).
- [x] B283 Plugin API 1.11.0 (`EntityFacts`: projectile items, saddle tag) on both targets.
- [x] B284 Runtime: `MobDriver`, feature modules and three mob bodies.
- [x] B285 Geo reader, baker and the cross-language vertex golden.
- [x] B286 Runtime: Codecs, bases, renderer rule, tempt, panic and leap goals, animal and water spawn rules.
- [x] B287 Entities plugin: saddle tag lowering and 13 mob validator codes.
- [x] B288 Exporters: GeckoLib nested only for mobs that need it; mobs export for 26.4.
- [x] B289 Library: preset models (quadruped, bird, fish, flyer, biped, cube creature) with state animations and skins.
- [x] B290 Runtime: fly, swim and amphibious movement.
- [x] B291 Runtime: ranged attacks.
- [x] B292 Runtime: taming and breeding.
- [x] B293 Runtime: riding.
- [x] B294 Runtime: variants and boss bars.
- [x] B295 Runtime client: the built-in vanilla renderer.
- [x] B296 Runtime: GeckoLib states, variants, saddle bone and baby scale.
- [x] B297 App: Entity Studio Kind of mob and sections, renderer picker, preview variant and baby.
- [x] B298 Entities plugin: seven mob templates.
- [x] B299 Library: Pet, Farm animal, Mount, Flying mob, Water mob and Boss flows, Custom mob archer and variants, six examples.
- [x] B300 Java eject part 1: bases, movement, ranged attacks, goals, variants, boss bars.
- [x] B301 Java eject part 2: taming, breeding, riding, GeckoLib states.
- [x] B302 Sample creatures fixture and goldens for both targets.
- [x] B303 e2e: mobs path.
- [x] B304 AI helper prompt and summaries.
- [x] B305 Sample READMEs and in-game checklists.
- [x] B306 Sample creatures parity tests (12) and CI on every version.
- [x] B307 Guide page "Mob behaviours", changelog, status lines.
- [x] B308 Close: ADRs, DESIGN, coverage audit, HANDOFF.
- [x] Tame-before-breed fix (vanilla wolf and cat rule; 5 GameTests).
- [ ] The user checks in game (`fixtures/sample-creatures/README.md` on 26.3 and 26.4, `fixtures/sample-mob/README.md` notes on 26.4 and the two renderers): taming, sitting and following; breeding and babies; riding, steering, jumping and flying mounts; saddles; the glider and archer shooting; fish swimming and drying out; variants; the boss bar; drawing, animations and wing and leg signs in both renderers; a Creator mob of each flow.
- Deferred (ADR 0070 D9, ADR 0071 D10): brain-driven mobs (allay, axolotl, frog, camel, sniffer, warden, piglin behaviours), phantom, ghast, vex and bat flight, held weapons and the crossbow pose, fish buckets, mount inventories and armour, item-on-a-stick steering, breeding between types, variants that change the model, boss phases and own boss music.
- Follow-ups: one GeckoLib-free `MobStates` helper shared by both renderers; head look in the built-in renderer; `NoAI` boss bar forwarding; `/ride` firing `on_mount` (an `addPassenger` hook); mount fall damage reduction; a `canMate` override in the bodies; a registrar load-time error for unknown projectiles; a cap on ridden `speed`; the preview's baby toggle re-fitting the camera; Creator previews passing variant and baby; flows offering project items; the Fabric jar name per target; an `MSM_E2E_*` stub-jar hook; `fixtures/geo-parity` as a Gradle test input; the unused `hasGeckolib` gate and `steps.facts.outputs.geckolib` in `ci.yml`.

### Add-on after 1.0 — Containers and machines

Takes up backlog item B8 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) (rows "Block entities", "Menus and screens" and custom recipe types). Design: [ADR 0074](adr/0074-containers-and-block-entities.md) (`msm:container`, block entities, vanilla menus, hoppers, comparators, keep contents), [ADR 0075](adr/0075-machines-and-machine-recipes.md) (`msm:machine`, one recipe type per machine, power, experience) and [ADR 0076](adr/0076-container-and-machine-flows-studio-and-script-api.md) (Inventory section, Creator flows, templates, examples, Script API 1.2, AI helper, tests), all accepted 2026-11-14 with their findings (ADR 0074 keeps the fact table F1–F22 and the limits C1–C18). The working plan is deleted and its history is in the DEVLOG. Defaults that need the user's veto: components rather than a block type, a 3-row chest by default, hoppers and comparators on, barrel sounds, keep contents only with 27 slots, block entity and recipe type ids equal to the block id, the holder's put-in and take-out rule, `power: fuel`, speed 1, 200 ticks, light 13, the furnace's hopper faces, experience paid on taking, recipe file names from the result, the section name "Inventory", the flow names "Storage crate" and "Machine", the eight template names, `World.getContainer`.

- [x] B309 GameTest and parity stubs.
- [x] B310 Format: `msm:container`, `msm:machine`, element `recipes`, state texture and model slots, `::msm::recipe::MachineRecipe` (corpus `container-`, `machine-`, `machine-recipe/`).
- [x] B311 Plugin API 1.12.0 (`BlockFacts.containerSounds`, `BlockFacts.machineRecipeTypes`) on both targets.
- [x] B312 Runtime: subclassable `MsmBlock`, `open` and `lit` properties, block entity hook.
- [x] B313 Exporters: machine recipes and keep-contents loot left out of vanilla packs; F22 confirmed on both targets.
- [x] B314 Runtime: containers (19 GameTests; Fabric item transfer verified).
- [x] B315 Blocks-items plugin: lowering, blockstates with `open` and `lit`, machine recipes, keep-contents loot, 11 validator codes.
- [x] B316 Runtime: machines and per-machine recipe types (27 GameTests, one manual-only).
- [x] B317 Runtime: Script API 1.2 (`World.getContainer`, `Container`), with the machine case (B317b).
- [x] B318 App: Block Studio Inventory section, state texture and model slots.
- [x] B319 Blocks-items templates (eight) and the warning `machine-recipes-without-machine`.
- [x] B320 Library: Storage crate and Machine flows, three examples.
- [x] B321 Java eject: containers, machines, recipe types.
- [x] B322 AI helper knowledge.
- [x] B323 Sample machines fixture and goldens for both targets.
- [x] B324 e2e: machines path.
- [x] B325 Sample machines parity tests (19) and CI on every version.
- [x] B326 Sample machines README and in-game checklist.
- [x] B327 Guide page "Containers and machines", changelog, status lines.
- [x] B328 Close: ADRs, DESIGN, coverage audit, HANDOFF.
- [ ] The user checks in game (`fixtures/sample-machines/README.md` on 26.3 and 26.4): each screen's title and layout, the open and lit pictures, sounds, the holder, keep contents in creative, the loot crate, each machine working with fuel, smelting and redstone, shift-click and fuel placement (limit C10), the recipe book button (C11), experience on taking, `/reload` with a machine working, a modpack with client and server jars; a Creator Storage crate and Machine.
- Deferred (ADR 0074 D10, ADR 0075 D12): screens and GUI textures of our own, drawn held items and lid animations (backlog B15), double chests, per-player storage, containers on family types, several inputs or outputs, byproducts, fluids, energy, machine recipes in the recipe book or recipe viewers, custom fuel rules, times above 32767 ticks.
- Follow-ups: the `machine-recipe` corpus listed as a test input in `engine-mod/build.gradle.kts`; `library.test.ts`'s `mcfunctionIds` copy knowing project structures (then the loot crate example can use a function); one runtime version in the Script API 1.1 and 1.2 docs (done: every unreleased member says "Since runtime 1.5.1"); the `Failed to write NBT String ... 70000 bytes` message when the GameTest server saves the player at shutdown (a script data test's oversized string); `app.asar` at 31.5 of 32 MB: done (ADR 0079, B329; 26.7 MB after compacting the vendored JSON).

### Add-on after 1.0 — Custom portal blocks

Takes up backlog item B13 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) (the portal half of the row "Dimension, dimension type"; dimension type editing stays out, ADR 0077 D10). Design: [ADR 0077](adr/0077-custom-portal-blocks.md) (the `portal` block type, the frame rule, lighting by an igniter or the `light_portal` action, the portal block, our own level index instead of POI types, travel, versions, lowering, validators, eject) and [ADR 0078](adr/0078-portal-flows-studio-and-tests.md) (Portal section, Portal flow and the Dimension flow's portal answer, templates, example, AI helper, tests, guide), both accepted 2026-11-14 with their findings (ADR 0077 keeps the fact table F1–F20 and the limits P1–P18). [ADR 0079](adr/0079-compact-vendored-target-data-in-the-asar.md) (compact vendored target data) ran in this batch as the reserve brief B329. The working plan is deleted and its history is in the DEVLOG. Defaults that need the user's veto: a block type rather than a component or kind, one element holding frame, igniter and destination, flint and steel with its use rule, `minecraft:overworld` as the way back, the scale from the dimension types unless set, linked exit portals with the Nether's search radius rule, vanilla's delay and cooldown, the overlay on, the vanilla portal looks and sounds, light 11, unbreakable, no item and no loot, the flint and steel sound when an item lights a frame (none for the action), corners not needed, the names `light_portal` and `on_travel`, the `#minecraft:portals` entry, our own index, the section name "Portal", the flow name "Portal" and its defaults, the Dimension flow's third answer, the three template names, the example, a new fixture.

- [x] B330 GameTest and parity stubs; dimension probe (F20: no level from a GameTest data pack dimension).
- [x] B331 Format: block type `portal`, `light_portal` action, texture slot `portal` (corpus `portal-`).
- [x] B332 Plugin API 1.13.0 (`BlockFacts.portal`) on both targets.
- [x] B333 Runtime: frame detector, level index (`msm_runtime:portals`), exit builder (12 GameTests, 7 JUnit).
- [x] B334 Runtime: portal block type, Codecs, lighting and looks (16 GameTests).
- [x] B335 Blocks-items plugin: lowering, ten validator codes, three templates, vanilla pack test (F17 resolved).
- [x] B336 Runtime: travel and linking (9 GameTests).
- [x] B336b Runtime: surface arrival never lands on lava (2 GameTests).
- [x] B337 App: Block Studio Portal section and "Light a portal".
- [x] B338 Library: Portal flow, the Dimension flow's portal answer, the Two-way sky portal example, two patterns.
- [x] B329 Reserve: vendored target data compacted in the asar (ADR 0079; 31.7 to 26.7 MB).
- [x] B339 Java eject: portals.
- [x] B340 AI helper knowledge.
- [x] B341 Sample portals fixture, goldens for both targets and README.
- [x] B342 e2e: portals path.
- [x] B343 Sample portals parity tests (13) and CI on every version.
- [x] B344 Guide page "Portals", changelog, status lines.
- [x] B345 Close: ADRs, DESIGN, coverage audit, HANDOFF.
- [ ] The user checks in game (`fixtures/sample-portals/README.md` on 26.3 and 26.4): lighting each portal, the overlay and wobble (none on `drift_portal`), the entry whoosh, the ambient sound and particles (the dust colour), the trip into `sky_realm` and the built exit, the trip back to the same portal, 8:1 in the Nether, surface arrival, the `on_travel` line, a ridden mount and thrown items through a portal, a modpack with client and server jars, the limits P2, P3 and P6; a Creator Portal and a Dimension flow with the portal answer.
- Deferred (ADR 0077 D10): floor portals, an overlay or entry sound of our own (backlog B15), particle colours other than dust (B14), lighting by fire from other sources, POI types, editing dimension types, chains of more than two dimensions, a script method for portals, mob spawning from portals.
- Follow-ups: an `on_travel` line on `ember_portal` so parity can check the event on the Nether trip; trips into a project dimension are checked only on dedicated servers (limit P8); surface arrival stands on water and never on lava (other fluids of other mods are not considered); a general third-party notices file (ADR 0079 findings).

### Add-on after 1.0 — Custom particles

Takes up backlog item B14 of [`COVERAGE-AUDIT.md`](COVERAGE-AUDIT.md) (rows "Particle definitions (`particles/*.json`)" and "Particle types", limits L3, L13 and L16). Design: [ADR 0080](adr/0080-custom-particle-types.md) (the kind `msm:particle` as option-less types, pictures, registration, the client particle and provider, options objects, `motion` and `force`, `msm:ambient_particles`, versions, plugin API 1.14.0, lowering, validators, vanilla pack safety, eject) and [ADR 0081](adr/0081-particle-studio-flows-and-tests.md) (Particle Studio, editing where particles are used, the Particle flow, templates, examples, tests including the headless client route, guide and AI helper), both accepted 2026-11-14 with their findings (ADR 0080 keeps the fact table F1–F23 and the limits K1–K16). The working plan is deleted and its history is in the DEVLOG. Defaults that need the user's veto: a new kind with option-less types and behaviour fixed per type; the field names and defaults (`lifetime` 20, `size` 0.2, `friction` 0.98, `gravity` 0, collision on, `animation` `age`, `frame_ticks` 2, `translucent` derived, `always_show` off); frames as separate PNGs; the `minecraft:particle` resource pack kind; registration before effects; options objects decoded at first use and checked at server start; the names `motion` and `force` and the `count` cap of 1000; the component name `msm:ambient_particles`, its defaults and `states`; project descriptions and pictures kept in vanilla resource packs; the Studio name "Particle Studio", its groups and labels; frame files `<id>_<n>.png` and 8 by 8 new pictures; the "Kind" choices of "Spawn particle"; the flow name "Particle", its card and defaults (Spark, `#ffd060`, Medium, 20 ticks, Floats up, glowing, fading, shown around a new block); the template names; the examples; a new fixture; client GameTest screenshots kept but not compared.

- [x] B346 GameTest and parity stubs; vanilla server probe (an unknown particle in a dimension type, timeline, biome or enchantment fails the whole pack).
- [x] B347 Format: `msm:particle`, `spawn_particle` options objects, `motion`, `force`, `msm:ambient_particles` (corpus `particle-`, `action-particle-`, `ambient-particles-`).
- [x] B348 Plugin API 1.14.0 (`TargetFacts.particles`) on both targets.
- [x] B349 Runtime: client particle, `ParticleLook` and the particle look golden (15 JUnit).
- [x] B350 Runtime: kind, Codecs, registration, client providers, `/particle` (11 GameTests).
- [x] B351 Plugins: kind, lowering, six validator codes, four templates, the `minecraft:particle` resource pack kind and its template, vanilla pack safety (`dimension_type` and `timeline` fatal).
- [x] B352 Runtime: options objects, `motion`, `force`, Script API 1.3, `msm:ambient_particles` (18 GameTests).
- [x] B353 App: Particle Studio, Ambient particles section, "Spawn particle" kinds.
- [x] B354 Library: Particle flow, three examples, four patterns.
- [x] B355 Java eject: particles.
- [x] B356 Client GameTest route: headless client through Mesa EGL, `MsmParticleClientGameTest` on both versions.
- [x] B357 e2e: particles path (and the save fix for held-back editor typing found through the portals-path flake).
- [x] B358 Sample particles fixture, goldens for both targets and README.
- [x] B359 Sample particles parity tests (12) and CI, client GameTests in CI.
- [x] B360 Guide page "Particles", changelog, status lines, AI helper.
- [x] B361 Close: ADRs, DESIGN, coverage audit, HANDOFF.
- [ ] The user checks in game (`fixtures/sample-particles/README.md` on 26.3 and 26.4): each particle's look, animation, colour and fade, glow in the dark, collision; the spark lamp's and ember vent's ambient particles; the spark wand burst and the dust wand ring; the petal charm and `force` from far away; the glimmer effect's bubbles; Particles: Minimal; a resource pack retexturing flame; a Creator Particle exported and loaded.
- Deferred (ADR 0080 D12): particle types with options of our own (per-spawn colour or size on a project type), trails, ribbons, 3D or item-shaped particles, particles attached to entities, client-side held-item or throwable trails (backlog B15), client-side particles from scripts, sounds or events fired by particles, light cast by particles, editing vanilla particle behaviour, particles in vanilla packs.
- Follow-ups: an app validator for `{Name, Properties}` block states and the full options check against `::java::util::particle::Particle`; Problems checking spawn particle options in mob events; the eject's effect `particle` and leaves `falling_particle` reusing `readParticleSpec`; B352's doc-comment wording for `spread`, `speed`, `motion` and the ambient fields in the `.mcdoc` files (with `build-msm-mcdoc`); exports and Test in Minecraft flushing held-back editor typing; a shared test helper for the sample goldens.

### Add-on after 1.0 — Rules, Very easy mode and one-click Play (1.5.1)

User request of 2026-11-14: "Make an easy to use, very easy to use mode ... anyone can build anything. Also make it easy to test, make an easier option to test whatever you build in game", clarified the same day as "something where coding isn't necessary". Design: [ADR 0082](adr/0082-rules-no-code-behaviour.md) (Rules: sentence cards, the kind `msm:rules`, compilation at lowering time through project expanders, the catalogue, Script API 1.4, plugin API 1.15.0), [ADR 0083](adr/0083-very-easy-mode.md) (a third mode with Home, My things and Things to fix) and [ADR 0084](adr/0084-one-click-play-and-reload.md) (Play, the test world, runtime dev mode, Reload, Restart), all accepted 2026-11-14 with their findings (ADR 0082 keeps the batch's fact table F1–F24 and limits R1–R22). Shipped in the 1.5.1 draft, together with Try it slice 1 ([ADR 0085](adr/0085-try-it-in-app-test-area.md), B385–B391 and B393–B395; its later slices and close are in "Try it, the in-app test area" below).

- [x] B362 Scaffold `@msm/plugin-rules`, lockfile, GameTest and parity stubs.
- [x] B363 Format: `rules.mcdoc` (43 triggers, 36 steps, 16 conditions, 9 values; 362 types).
- [x] B364 Plugin API 1.15.0: `projectExpanders` and `TargetFacts.dev` on both targets.
- [x] B365 Rules catalogue and compiler (116 goldens).
- [x] B366 Interop: dev session files, `options.txt`, change sorting, setup function.
- [x] B367 Core: project expanders (`expandProject`, origins, three `core.expansion-*` codes).
- [x] B368 Rules plugin: kind, expander, lowering, validator, six templates.
- [x] B369 Runtime dev mode, server side (5 GameTests, 6 JUnit).
- [x] B370 Script API 1.4: weather, day time, `explode`, `dropItem`, `breakBlock`, `Entity.remove` (6 GameTests).
- [x] B371 App session: the expanded project in every path; `rules.needs-jar`, `rules.not-in-eject`.
- [x] B372 Rule book Studio and ThingPicker.
- [x] B373 Main: Play and Reload service, IPC and bridge.
- [x] B374 Runtime client dev hooks and the client GameTest `MsmDevClientGameTest` (13 JUnit).
- [x] B375 Rules in the Block, Item, Mob and Effect Studios; "From rules" and "Turn into rules".
- [x] B376 Play controls, Restart needed dialog, Prism setup panel.
- [x] B377 Library: two rule examples; the library test expands every project.
- [x] B378 Very easy mode: Home, My things, Things to fix, name-only New, Share my mod.
- [x] B379 e2e `rules-path`, `very-easy-path`, `play-path` (stub launcher), `modes-path` with three modes; the Reload `pack.mcmeta` fix.
- [x] B380 Sample rules fixture, goldens for both targets and README.
- [x] B381 Sample rules parity tests (8) and CI on both versions, dev mode off on a dedicated server.
- [x] B382 AI helper: the Rules paragraph and the catalogue pin.
- [x] B383 Guide pages "Rules", "Very easy mode", "Playing and testing", changelog, status lines.
- [x] B384 Close: ADRs, DESIGN, HANDOFF, status lines; plan retired.
- [ ] The user checks on Windows (`fixtures/sample-rules/README.md` on 26.3 and 26.4): Play from MSM with Prism Launcher (first launch, the test world, the chests and hotbar), Reload of a data change, a script rule and an event change, the chat lines, Restart needed and Restart (the jar unlock), New test world, the resource reload on screen; the sample rules (chime block, lucky block with sneaking, rally horn, Sentinel, stone rubies, welcome, no rain in the day); a Very easy first run from a fresh install; limits R7 and F19–F21.
- Deferred (ADR 0082 R10, ADR 0084): triggers for crafting, picking up, eating, sleeping, advancements (keys and the HUD arrived with ADRs 0088 and 0089, 2026-11-15); Play through MultiMC, the official launcher or CurseForge; dev mode on servers; Reload of new things (the registry freeze).
- Follow-ups: "Copy as my own script" (ADR 0082 D7 d); the AI's `kind_schema` for `msm:rules` (`MAX_LIST` 40 against 43 triggers) and its `validateElementData` on expanded data; `elementId` on lowered files from core (Play derives it from the path) and exported-file schema problems mapped to elements; schema problems at the chips of the Rules section in subject Studios; a `before` check on book edits from the section; "Turn into rules" for `spawn_particle` with `motion` or `force` and `launch` with `add`; "What this becomes" recompiling only when shown; field-level Very easy lists (ids, offsets, ticks as seconds); "Change folder" remembered; the status bar's "Undo: Edit <ns>:rules" and a book's problems named by id; exporter test timeouts (`sample-mod`, `sample-portals` at 5 s); `sample-java.ts` `exportJavaProject` taking `expand`.

### Add-on after 1.0 — Vehicles and the client side

User requests of 2026-11-14: "would it be possible to make things like tanks", then "keep going, add the vehicles too", under the rule "anything that can be made in vanilla java should be possible through this app"; with coverage audit backlog B15 (client side for power users). Design: [ADR 0088](adr/0088-client-channel-and-key-binds.md) (the runtime's first networking channel, `msm:key_bind`, the security model of client input), [ADR 0089](adr/0089-hud-elements.md) (`msm:hud`: text, bars and icons from synced values), [ADR 0090](adr/0090-vehicles.md) (`msm:vehicle` on vanilla's `VehicleEntity`: ground, water, amphibious, air and hover modes, seats, fuel, health and repair, storage, paint, weapons with a fire key, a turret that follows the view, the runtime's own renderer) and [ADR 0091](adr/0091-vehicle-flows-studios-try-it-and-tests.md) (Studios, the Car, Tank, Plane and Boat flows, the Very easy tile "Make a vehicle", Try it, tests), all accepted with findings at close B432 (2026-11-15); ADR 0090 keeps the batch's fact table (V1–V24, R1–R3), the spike's answers S1–S12 and the limits V1–V17. Unreleased. Deferred to the next client batch with reasons in ADR 0088 D11: custom screens and block entity renderers (C3, C9), a portal overlay of our own (P2), particle trails (ADR 0080 D12), scripts and client code in the eject (B142), the server-side R10 triggers.

- [x] Wave 0: B406 spike (go for the driver-moved model on both versions; vanilla key dumps in `docs/reference/vanilla-keys/`), B407 renderer budget (route b: 18 MB), B408 scaffold and stubs.
- [x] Wave 1: B409 format (120 corpus cases), B410 plugin API 1.16.0 and target facts (`controls`, `vehicles`).
- [x] Wave 2: B411 channel and key binds, B412 vehicles core (physics golden of 10 cases), B413 controls plugin (16 codes, six templates), B414 `msm:vehicle` kind (15 codes, eight templates), B415 exporters.
- [x] Wave 3: B416 HUD (layout golden), B417 weapons and turret, B418 vehicle client, B419 Vehicle Studio, B420 Key bind and HUD Studios; B420a HUD and explode actions in the events editor.
- [x] Wave 4: B421 Script API 1.5 and the horn, B422 Creator flows and the Very easy tile, B423 library examples.
- [x] Wave 5: B424 Rules cards (and B424a pickers), B425 sample vehicles fixture.
- [x] Wave 6: B426 parity (15) and CI, B427 e2e `vehicles-path` and `controls-path`, B428 and B429 Try it (landed in this batch).
- [x] Wave 7: B430 AI helper, B431 guide, B432 close. Reserve B433 (server-moved vehicles) not needed.
- [ ] The user checks in game (`fixtures/sample-vehicles/README.md` on 26.3 and 26.4, singleplayer and a dedicated server with two players).
- Follow-ups (ADRs 0088–0091 findings): the release on focus loss and vanilla's flood limit for custom payloads, unmeasured; the HUD layer under toasts; the HUD validator re-run when a function changes; `fixtures/hud-layout` as a Gradle test input; a start-up check of vehicle event ids; `Entity.health`, `maxHealth` and `kill()` on vehicles; the instant horn on the presser's client and a horn parity check; the drop rule after an explosion or fire; a sim-parity scenario for vehicles; pictures on the vehicle flow cards; a vehicle recipe for "Surprise me"; `encodePng` compression; a unit test for the starter model across two vehicles; "Turn into rules" for `on_fire` and `on_tick`; `kindSchemaSummary` depth limit; doc comments (`VehicleWeapons`, `VehicleDriver`, `KeyBindStudio.tsx`, `muzzle.offset` in `vehicle.mcdoc`).

### Add-on after 1.0 — Vanilla parity 2 (done, awaiting the in-game checks)

The user's rule of 2026-11-14, "anything that can be made in vanilla java should be possible through this app", applied to the gaps the research report (`popular-mods.md` section 3: ranks 4, 5, 7, 11, 13, 15, 16) and the coverage audit (sections 1.3, 3 and 4.2) left after the vehicles plan. Design (ADRs 0094–0097 accepted with findings at close B468, 2026-11-15; ADRs 0098–0100 accepted with findings and ADR 0101 in full at close B485, 2026-11-21): [ADR 0094](adr/0094-remaining-vanilla-block-types-waterlogging-and-weathering.md) (twenty block types: bed, cake, berry bush, tall plant, ladder, torch, lantern, chain, sign, hanging sign, potted plant, candle, sea pickle, vine, carpet, layers, rod, stem, cocoa, scaffolding; crop soil; `msm:waterloggable`; weathering and waxing), [ADR 0095](adr/0095-item-inventories.md) (bags and bundles), [ADR 0096](adr/0096-commands-creative-tabs-and-script-and-rules-gaps.md) (`msm:command`, `msm:creative_tab`, the runtime's first two Mixins for `block.place` and explosions, Script API 1.6, Rules facing, placing, explosion, command and riding cards), [ADR 0097](adr/0097-vanilla-feature-order-as-a-target-fact.md) (vanilla's feature order as a target fact: W-D1 to W-D4; Fabric's `addFeature` skips same-step duplicates), [ADR 0098](adr/0098-traders-professions-mount-storage-and-shoulder-pets.md) (trader mobs, villager professions and job sites, mount storage, shoulder pets), [ADR 0099](adr/0099-custom-fluids.md) (fluids, behind a version seam), [ADR 0100](adr/0100-dimension-types-and-skies.md) (dimension type and sky editing) and [ADR 0101](adr/0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) (Studios, flows, templates, Try it, tests). The working plan (briefs B440–B487; B434–B439 left free) was deleted at B485: the facts F1–F36 and limits Q1–Q31 are in [ADR 0101](adr/0101-vanilla-parity-2-flows-studios-try-it-and-tests.md), the spike answers S1–S14 in the findings of ADRs 0094–0096, 0098 and 0099, the history in the DEVLOG. The user has still to see the vetoable defaults listed in each ADR's Status.

Batch 1, Vanilla blocks and everyday parity:

- [x] Wave 0: B440 spike (go on signs with their own look, scaffolding and the Mixin route; S1–S10 answered), B441 scaffold and stubs, B442 worldgen feature order (W-D1 to W-D4).
- [x] Wave 1: B443 format (473 exported types, 192 corpus cases), B444 plugin API 1.17.0 and target facts (`bedRules`, `dyeColours`, `stemTags`, `modelTemplates`, `defaultTorchParticle`, `commands`).
- [x] Wave 2: B445 runtime plants and food types, B446 runtime furniture, lights, signs and stems, B447 and B448 lowering.
- [x] Wave 3: B449 waterlogging, weathering and waxing, B450 item inventories and bundles, B451 plugin components, B452 Block Studio, B453 Item Studio inventory.
- [x] Wave 4: B454 commands and creative tabs, B455 Mixins and Script API 1.6, B456 command and creative tab kinds.
- [x] Wave 5: B457 exporters and eject (and B457a), B458 Rules (and B458a pickers), B459 Creator flows, B460 Command and Creative tab Studios and Very easy picks, B461 templates and examples.
- [x] Wave 6: B462 `fixtures/sample-vanilla-blocks` (and B462a, B462b), B463 Try it.
- [x] Wave 7: B464 parity, CI and client GameTests (and B464a), B465 e2e.
- [x] Wave 8: B466 AI helper, B467 guide (and B467a), B468 close of batch 1.
- [ ] The user checks in game (`fixtures/sample-vanilla-blocks/README.md` on 26.3 and 26.4, singleplayer and a dedicated server).

Batch 2, Villagers, fluids and skies:

- [x] Wave 9: B469 spike (traders, professions, storage, shoulders: go; professions on 26.4 by reflection; shoulder pets perch, ADR 0098 amended), B470 spike (fluids: go; one 26.4 Mixin, ADR 0099 amended; reserves B486 and B487 not needed), B471 Dimension Type Studio and flow answer (merged 2026-11-15; the user has still to see ADRs 0098–0100's vetoable defaults).
- [x] Wave 10: B472 scaffold and stubs (version-only Mixins through `MsmMixinPlugin` and the `MixinVersions` seam), B473 format (509 exported types, 85 corpus files) and plugin API 1.18.0 facts (`tradeSounds`, `vanillaJobSites`, `vanillaTradeSets`, `fluidModel`, `fluidTags`).
- [x] Wave 11: B474 traders and professions (every mob body a `Merchant`), B475 fluids (the 26.4 `EntityFluidMixin` with three injections), B476 entities plugin (`msm:villager_profession`), B477 fluid kind (`msm:fluid`), B478 exporters (mod-only ids, eject warnings).
- [x] Wave 12: B479 mount storage and perching shoulder pets, B480 Trader, Storage and Shoulder sections, Profession and Fluid Studios and the Very easy tile "Make a trader", B481 Wandering merchant, Village job and Fluid flows, the Mount and Pet answers and three examples.
- [x] Wave 13: B482 `fixtures/sample-villagers-and-fluids` (parity 15 of 15 on both content jars), B483 e2e `trader-path` and `fluid-path` and Try it (merchant mock-up, fluids without flow, the sky).
- [x] Wave 14: B484 AI helper (the scenario "a merchant who sells copper") and guide (`villagers-and-traders.md`, `fluids.md`), B485 close. Reserves B486 and B487 were not needed.
- [ ] The user checks in game (`fixtures/sample-villagers-and-fluids/README.md` on 26.3 and 26.4, singleplayer and a dedicated server): the pedlar's trades and levels, the glassblower job and its apron on villagers and zombie villagers, a villager restocking at the bench, the pack mule's chest and the inventory key, the sugar glider perching (also while sleeping or gliding, and across a server stop), swimming, drowning and burning in brine and molten amber, buckets and dispensers, lakes of a project fluid, the Glow Moon's sky; the moon, nether-like and always-night dimension types.
- Follow-ups of vanilla parity 2 (both batches; ADRs 0094–0101 findings): Rules cannot read command arguments yet (a Rules value for them needs an ADR); `CommandEvent.name`'s Script API wording (an alias gives the command's own name); `is_riding`'s `mount` slot has no "a player" choice; `JavaProjectInput.commands` and `creativeTabs` are undeclared in the plugin API (user question); sim-parity scenarios for the twenty block types, weathering, `on_trade` and `on_entity_inside`; Try it's `knows item` misreads berry-style block items, the hanging sign's wall facing checked against the runtime, doors that age half by half, scaffolding above a broken one that does not fall, light levels said and not drawn; `textures/retexture.ts` calls a berry bush or pod "a crop"; a generated bundle model id clash check, `generated-model-clash` for `itemTextureFromData` ids and a `next`/`into` same-type check; the exporters' sample golden registry views do not list companions; a warning for a potted plant whose plant has `item: false`; a 24 by 26 placeholder for example sign pictures; the Elm wood set example's description (it makes signs now); an ejected candle's `on_interact` only on an empty hand and ejected command events logging under the mod id; the eject writes a bag only on close (parity reads the open menu); `templates-and-examples.md` lacks the Vehicles and Controls rows and its "Popular ideas" prose is stale; `launchers-path` flakiness in full e2e runs; a `needs_light` crop field for nether-wart-like crops (needs a decision); the Rule book's one-shot actions and other Studios' `applyChanges` buttons do not register a pending edit, so a Save right after them could race; a client GameTest of the perch position on a dedicated server; one menu helper for `VehicleStorage` and `MobStorage`; `acquirable_job_site` as an `EntityFacts` entry; villagers sleeping in and claiming project beds (no home POI yet; the `PoiTypes` seam could give one); `MsmRegistrar.checkEvents` public so fluid events get the block event checks; the mcdoc `light` comment of `msm:fluid` (lava-like defaults to 15); Very easy lists for the Profession and Fluid Studios; the library's picture helpers are not exported; dropping `compactPng` in `packages/exporters/test/sample-vehicles.golden.test.ts`; the loose script-name match in `packages/plugins/scripting/src/validators-commands.ts` `nothingToRun`; batch 2 in the eject (Q28); limits Q5 (pots of other materials), Q7 (weathering on more types), Q8 (waterlogged containers), Q10 (more plant types), Q21 (gossip, reputation, demand prices, workstation restocking), Q25 (fluid mixing, cauldrons, bottles, pipes, boats, buoyancy, waterlogging by a project fluid, fluid pictures from resource packs) and Q27 (gravity, sky textures and weather per dimension) for a later batch.

### Add-on after 1.0 — Try it, the in-app test area (done, awaiting the user's checks)

The user's request of 2026-11-14: "Test inside the app — a built-in test view in MCSuperMods where you can walk around, place your blocks, see mobs and particles, without launching Minecraft at all", then "make the preview import a custom flat world maybe / or a small world to test using the owned minecraft files", and the go-ahead for slice 4 on 2026-11-21. Design: [ADR 0085](adr/0085-try-it-in-app-test-area.md) (the view, `@msm/sim`, the fidelity levels, "What happened", the parity scenarios; accepted with findings at close B403, 2026-11-21, with the fact table T1–T16 and limits L1–L24) and [ADR 0087](adr/0087-try-it-worlds.md) (grounds and reading an area of the user's own save; findings at B403). The working plan (B385–B405) was deleted at B403; history in the DEVLOG. Slices 1 and 2 shipped in the 1.5.1 draft; slices 3 and 4, the grounds and the other batches' Try it lines (B428, B429, B463, B483) are in the 1.5.2 draft. Surprise me ([ADR 0086](adr/0086-surprise-me-random-mod.md)), made beside this plan, was accepted with findings at the same close.

- [x] Slice 1, look and place: B385 measurements (go with conditions: chunk 8, own culling, a GL reset), B386 scaffold, B387 world and blocks, B388 player, B389 renderer, B390 the view and entry points, B391 clock, growth and tools, B392 e2e and guide page.
- [x] Slice 2, mobs and particles: B393 entities, B394 particles and portal looks, B395 mobs in the view.
- [x] Slice 3, things happen: B396 triggers and actions, B397 parity fixture and 63 runtime scenarios (65 GameTests), B398 "What happened", sounds, chips and mock-up screens, B399 the sim side of the parity test (127 tests) and the rules e2e; no sim bug found.
- [x] Grounds: B404 the world reader and its IPC, B405 Flat world, Quick world and From my world.
- [x] Slice 4, scripts and logic Rules: B400 the script worker and Script API shim (no `unsafe-eval`), B401 logic rule steps in the log.
- [x] B402 guide, changelog, status lines and AI helper knowledge; B403 close.
- [ ] The user checks on Windows (1.5.2 draft): Try it opens with `F6` and from the toolbar in every mode; the strip and Play in Minecraft; placing, breaking and using a door, slab and stairs; Grow and Power; a mob spawned and hit; a rule from `fixtures/sample-rules` in "What happened"; `fixtures/sample-script` in the worker; a logic rule's steps; a Quick world and From my world with a real 26.x save; whether WebGL works with a blocked GPU (limit L14, T9).
- Follow-ups (ADR 0085 and 0087 findings): the SwiftShader flags on Windows (T9, HANDOFF question 3); the geo renderer's `CULL_FACE` leak and opacity flags in the structure preview; per-element lowering (`elementId` on lowered files); Script API `key.*` and `vehicle.*` events in the worker; sim-parity scenarios for the twenty block types, weathering, `on_trade`, `on_entity_inside` and vehicles; redstone signals from plates and buttons and `msm:redstone` on Power; `while_held` and `while_worn`; `TriggerEngine` unsubscribing from `world.onChange`; mob chips above the mob; container sounds as captions; animated textures and pictures over 16 by 16; the 60-prop picker cap; the look reset after a Studio; a log line for opening a door; a batched mob shader; Try it's `knows item` for berry-style block items, the hanging sign's wall facing, doors ageing half by half, scaffolding not falling, light levels drawn; Turbo `inputs` for `@msm/sim#test`; the Nether, the End, custom dimensions and LZ4 chunks in From my world; `Data.spawn` on a real 26.x save; a re-measure on a hardware GPU; Surprise me's My things cards for sets without a block, item or mob, `applyChangeset` changing an element made earlier in the same change set, and recipes for the later batches' flows.

### Add-on after 1.0 — Minecraft-style art (done, awaiting the user's look)

The user's request of 2026-11-14 ("make the art much better ... rather than using your own art styles") and choice of 2026-11-21: option B of [ADR 0092](adr/0092-minecraft-style-art.md), an original vanilla-style generator; option A (recolouring the user's own textures) is not chosen. ADR 0092 is accepted with findings at the close (B502, 2026-11-22; the plan is deleted, its fact table A1–A16 and limits A1–A8 are in the ADR). Every picture MSM makes (Creator flows, Surprise me, starters, examples, the AI helper's textures, Try it's terrain without the client jar) is drawn by the same rules, and every picture field has **Draw…** beside **Make with AI**. Never Mojang pixels. Unreleased: the 1.5.2 draft (67cfedc) holds only B491–B493's library code; the rest goes into the next version.

- [x] Wave 0: B491 art module, recipe table and pixel rules (A's code removed, `artPng` with the placeholder fallback, `checkArtRules`, goldens, the contact sheet; hue shift 12).
- [x] Wave 1: B492 block recipes, B493 item recipes, B494 worn, mob, icon and particle pictures, B495 the Draw dialog and its buttons.
- [x] Wave 2: B496 Draw a skin in the Mob Studio, B497 switch the library to drawn art (349 PNGs changed once), B498 AI helper and AI pictures, B499 Try it drawn terrain.
- [x] Wave 3: B500 e2e `art-path`, B501 guide (`pictures.md`), changelog and status lines.
- [x] Wave 4: B502 close (the Creator's colour passed to Draw, the leftover "placeholder" wording in the guide and one library example).
- [ ] The user looks at the drawn pictures in game (a Creator Gear set, a Wood set, a mob, Surprise me) on 26.3 and 26.4, and at the vetoable defaults in ADR 0092's Status.
- Follow-ups (ADR 0092 findings): a Windows run of the art goldens (the CI's Windows job builds only the sample plugin); the effect icon's symbol per effect; Try it's Island frame rate on a quiet machine or a hardware GPU; a `frame` input on `create_texture` for particles; the trapdoor's see-through holes in game; the example "Worn armour look" drawing its layers with the 64 by 32 armour layer recipes; the fixtures whose goldens still draw with `placeholderPng` (limit A6); a painting recipe (A2), eyes and markings on vanilla mob variants (A3), 32 by 32 recipes (A7) and an animated portal surface (A8); ADR 0093 (AI pictures) still Proposed.

### Add-on after 1.0 — Vanilla parity 3 (done, awaiting the in-game checks)

The user's golden rule (2026-11-14: anything that can be made in vanilla Minecraft Java must be possible through MSM) applied to what the coverage audit and ADR 0101's limits still list after vanilla parity 2: limits Q5, Q7, Q8, Q10, Q21 and Q25, batch 2 in the Java eject (Q28), and the other open vanilla gaps that are not client-only rendering work. Q27 (gravity and sky textures per dimension) is dropped: vanilla has neither in data, and vanilla's own way (a function with `/attribute ... minecraft:gravity`) already works through MSM. Design: [ADR 0103](adr/0103-growing-plants-and-project-flower-pots.md) (growing and climbing plants, project flower pots), [ADR 0104](adr/0104-weathering-lightning-and-storage-2.md) (weathering on more types, lightning, waterlogged, double and per-player storage), [ADR 0105](adr/0105-block-sounds-set-types-and-vanilla-block-pairs.md) (own block sounds and set types, strip, flatten, till, age and burn pairs), [ADR 0106](adr/0106-data-kinds-sweep-2-and-data-only-flows.md) (the last data and resource pack kinds, four data-only flows), [ADR 0107](adr/0107-traders-2-villager-homes-and-villager-types.md) (reputation, demand, work sites, project beds as homes, villager types), [ADR 0108](adr/0108-fluids-2-mixing-cauldrons-and-bottles.md) (mixing, cauldrons, bottles), [ADR 0109](adr/0109-mobs-2-buckets-shoulders-flight-and-habits.md) (fish buckets, both shoulders, hovering and phasing, five habits), [ADR 0110](adr/0110-boats-for-project-woods.md) (boats), [ADR 0111](adr/0111-commands-rules-game-rules-and-stats-2.md) (command arguments in Rules, more argument types, the R10 triggers, dialogs, game rules, statistics, tab order, Script API 1.7) and [ADR 0112](adr/0112-vanilla-parity-3-flows-studios-eject-try-it-and-tests.md) (flows, Studios, the eject, Try it, tests). ADRs 0103–0106 are accepted with findings at the close of batch 1 (B523, 2026-11-22) and ADRs 0107–0112 at the close of batch 2 (B544, 2026-11-22). The working plan (briefs B503–B546) is deleted: its fact table H1–H16 and limits N1–N26 are in ADR 0112 with their outcome, the spike answers X1–X34 in the ADRs' findings, its rules for every brief in `HANDOFF.md`, its history in `DEVLOG.md`. Plugin API 1.19.0 and 1.20.0, Script API 1.7.

Batch 1, Plants, pots, sounds and storage (closed at B523, 2026-11-22; unreleased):

- [x] Wave 0: B503 spike (X1–X14), B504 data kinds sweep 2 and resource pack kinds, B505 scaffold and stubs.
- [x] Wave 1: B506 format, B507 plugin API 1.19.0 and target facts, B508 banner pattern, armour trim, glider and pot pattern flows.
- [x] Wave 2: B509 runtime growing plants, B510 runtime pots, weathering on more types and lightning, B511 and B512 lowering.
- [x] Wave 3: B513 runtime storage 2 (waterlogged, double, per-player, weathering containers), B514 runtime own sounds, set types and vanilla pairs, B515 plugin storage, sounds and pairs, B516 Block Studio 2.
- [x] Wave 4: B517 exporters and eject, B518 flows, templates and examples, B519 Try it.
- [x] Wave 5: B520 `fixtures/sample-plants-and-storage`, parity, CI and client GameTests, B521 e2e `plants-path` and `storage-2-path`.
- [x] Wave 6: B522 AI helper, guide and changelog, B523 close of batch 1.
- [ ] The user checks in game (`fixtures/sample-plants-and-storage/README.md` on 26.3 and 26.4, singleplayer and a dedicated server), and looks at the vetoable defaults in the Status sections of ADRs 0103–0106.
- Batch 1 follow-ups (ADRs 0103–0106 and 0112 findings): reserve B546 (`age` rules for vanilla blocks on 26.4 by a version-only Mixin; not run, kept for after batch 2's Mixins); the eject of `msm:vanilla_block_rules` (B527); `wolf_sound_variant` after a vanilla-mcdoc sync with `step_sound`; the cactus flower (not seen in the spike); a wide-leaf tilt parity case and a level-event check for waxing and scraping; e2e for Desert plants, dripleaf and multiface, storage on 26.4 and the Wood set's door sounds; a `pot_textures` field for a potted plant in a project pot; fluid events in dev overlays; two `art-worn` tests and the lightning GameTest on the flaky watch.

Batch 2, Villagers, mobs, fluids, commands and the eject (closed at B544, 2026-11-22; in the 1.5.3 test build but for eject 2c, B541 to B543 and the close):

- [x] Wave 7: B524 spike (villagers, mobs, boats: X15–X24, all go), B525 spike (fluids, commands, game rules, statistics, events: X25–X34, all go).
- [x] Wave 8: B526 scaffold and stubs, B527 format, plugin API 1.20.0 and facts.
- [x] Wave 9: B528 runtime villagers 2, B529 runtime fluids 2, B530 entities plugin, B531 blocks-items plugin fluids 2 and boats.
- [x] Wave 10: B532 runtime mobs 2, B533 runtime commands, game rules, statistics, events and Script API 1.7, B534 Rules, B535 scripting and tab kinds; then the `open_dialog` event action.
- [x] Wave 11: B536 runtime boats (X24 was a go), B537 the eject of professions, fluids, villager types, game rules, statistics, vanilla block rules, argument types and tab order, B538 Studios.
- [x] Wave 12: B539 flows, templates and examples, B540 Try it, B537b the eject of boats, the mob parts and bed homes; then eject 2c (traders and shoulder pets).
- [x] Wave 13: B541 `fixtures/sample-mobs-and-commands`, parity (also on the ejected jars), CI and client GameTests, with its fix-up after eject 2c; B542 e2e `villagers-2-path`, `mobs-2-path`, `commands-2-path`.
- [x] Wave 14: B543 AI helper, guide and changelog, B544 close of batch 2 (with the test pins and the `eject-path` check in a commit beside it). Reserve B545 (boats to the client batch) was not needed; reserve B546 (vanilla `age` rules on 26.4 by a Mixin) was not run and stays in reserve.
- [ ] The user checks in game (`fixtures/sample-mobs-and-commands/README.md` and the ejected `fixtures/sample-villagers-and-fluids` on 26.3 and 26.4, singleplayer and a dedicated server), and looks at the vetoable defaults in the Status sections of ADRs 0107–0112.
- Batch 2 follow-ups (ADRs 0107–0112 findings): **a bug to look into**, `runAfterDelay` called inside a `runAfterDelay` callback crashed the GameTest server once (B541; ADR 0112 findings have the evidence); the cauldron's contents drawn untinted (no block colour provider); a boolean game rule with `min` or `max` (the runtime and the eject refuse it, the app only warns); the eject's per-event warning naming the four new Mixin events; the Command Studio's hex colour label (typed without `#`); a day or night rule for work-site restocking; the habits and the dash in Try it; roosting and playing dead on GeckoLib renderers and in ejected mobs; a Studio editor for `bottle.effects`; dispensers on project cauldrons and bottles; fluid events in dev overlays; a shared helper for companion ids; "The command does nothing" while the command's rule book has errors, and the sentence words for a step after an If; the cave flitter parity test on the flaky watch; reserve B546.
- Left for the next client batch (not vanilla data or server work): custom screens and block entity renderers (C3, C9), more than three machine slots (C4), fog colours on 26.3, held weapons and the bow pose, variants that change the model, the portal overlay (P2), particle trails, client commands, scripts in the eject (B142). Left out as not in vanilla: pipes and tanks, other buoyancies, waterlogging by a project fluid, containers on slabs or doors, hopper access to mount storage and bags, cancelling vanilla commands. Left out as brain code (limit N15): the warden, the frog's tongue, the piglin's brain, sculk vibrations of our own.

### Add-on after 1.0 — Showcase with live clips (done, awaiting the user's look)

The user's request of 2026-11-22 ("you should show a showcase at the main page or new project on what is possible to make with a live clip of each, so new users may know where to start"). Design: [ADR 0118](adr/0118-showcase-with-live-clips.md), accepted with findings at the close (B572, 2026-11-22; the plan is deleted, its fact table W1–W18, limits U1–U13 and the answers Z1–Z13 are in the ADR). Ten cards headed **See what you can make** on Very easy's Home, in the New project dialog and in the Examples gallery's detail pane, each with a clip drawn live by Try it's renderer from a library example's lowered files, **Make this** (the matching Creator flow) and **See the example**. No video or picture is shipped; one clip moves at a time; reduced motion, the setting **Play showcase clips** and computers without WebGL get stills. App only: no plugin API, Script API, library or runtime change. Unreleased: the 1.5.3 test build holds B566–B568's code, which nothing the user sees uses; the cards come in the next build.

- [x] Wave 0: B565 measures in the real app (Z1–Z13; all three budgets go; reserve B573 not needed; evidence in `docs/reference/spikes/b565/`).
- [x] Wave 1: B566 clip format, player and example files (`app/src/renderer/src/showcase/`).
- [x] Wave 2: B567 the ten clips, B568 cards, gallery, stills and one live clip.
- [x] Wave 3: B569 Home, New project, Examples, Make this, the setting and the palette.
- [x] Wave 4: B570 e2e `showcase-path`, B571 guide (`showcase.md`).
- [x] Wave 5: B572 close.
- [ ] The user looks at the cards on Windows (Home in Very easy, New project, a hardware GPU and a PC with a blocked GPU) and at the vetoable defaults in ADR 0118's Status.
- Follow-ups (ADR 0118 findings): vanilla block states for clips (vanilla blocks draw as MSM's own pictures even with the game's pictures set up); the vehicle picker for the vehicle card's Make this in New project (it picks the Car flow); script state reset on a loop restart if live "What happened" lines become captions; more cards from the game modes plan (B557, B558) and the live world generation plan (B588), a stone set, a gear set and Surprise me itself; a `showcases` plugin contribution only if a plugin asks.

### Add-on after 1.0 — Live world generation (planned; next, the spike B574 has reported)

The user's request of 2026-11-22 ("Can we make custom world generations if not make it an option. Everything should be visible live"). Custom world generation exists as data; this add-on makes it visible live and an offer for beginners. Design: [ADR 0119](adr/0119-live-worldgen-preview.md) (Proposed); working plan [`PLAN-live-worldgen.md`](PLAN-live-worldgen.md) (B574–B595; fact table WF1–WF22, spike questions WS1–WS18, limits WL1–WL14). Recommended before the game modes plan ([`PLAN-game-modes.md`](PLAN-game-modes.md)), whose void and sky island worlds then get a real map and ground.

- [x] Wave 0: B574 spike (deepslate against real worlds on both targets, speed in a worker, what it lacks, the jar paths: a go with ten fixes, evidence in `docs/reference/spikes/b574/`; ADR 0119 still to be amended with its answers), B575 the live view audit (`docs/LIVE-VIEW-AUDIT.md`).
- [ ] Wave 1: B576 scaffold and stubs (`@msm/terrain`), B577 jar reading (cache schema 4) and IPC.
- [ ] Wave 2: B578 engine (registries, biomes, terrain, surface), B579 `fixtures/worldgen-parity` and measured expectations, B580 worker and client.
- [ ] Wave 3: B581 engine (missing types, the parity test), B582 the map in the preview panel, B583 engine (features and biome additions).
- [ ] Wave 4: B584 Try it ground "My world generation", B585 value maps, Compare with vanilla, Scatter and structure markers, B586 flows (Islands, Tall mountains, One biome everywhere, Caves only, Empty sky with a start island), examples and the tile Make a world.
- [ ] Wave 5: B587 live maps in the Creator and the worldgen Studios, B588 showcase clips, B589 e2e `worldgen-live-path`, B590 AI helper, guide and changelog.
- [ ] Wave 6: B591 close. Reserves B592 (the vanilla biome list from the runtime's dev mode), B593 (carvers), B594 (a bigger Try it area), B595 (structures in the ground) only on the spike's word.
- [ ] The user looks at the vetoable defaults in ADR 0119's Status.
- Follow-up batches of the rule "Everything visible live": planned in the add-on "Live views 2 to 4" below ([`PLAN-live-views.md`](PLAN-live-views.md)): Live views 2: data (loot rolls, the advancement tree, tag members, predicates on a sample, enchantment table, dialogs); Live views 3: looks (paintings, banners, trims, pot patterns, mob variants, fonts, potions and effects, creative tabs, shaders, sounds); Live views 4: assembled structures (jigsaw assembly, structures in the generated ground).

### Add-on after 1.0 — Live views 2 to 4 (planned; after B591)

The rest of the user's rule "Everything should be visible live" (2026-11-22, [ADR 0119](adr/0119-live-worldgen-preview.md) D1): the 67 kinds of [`LIVE-VIEW-AUDIT.md`](LIVE-VIEW-AUDIT.md) that still have no live view and are not world generation's, the Creator's flows that show nothing of what they make, and the AI helper's proposals. Working plan [`PLAN-live-views.md`](PLAN-live-views.md) (draft; B600–B648, B596–B599 free), one ADR per batch, all Proposed: [ADR 0120](adr/0120-live-views-data.md) (data), [ADR 0121](adr/0121-live-views-looks-and-sounds.md) (looks and sounds), [ADR 0122](adr/0122-live-views-assembled-structures.md) (assembled structures). Recommended order: after live world generation's close; batch 2 beside the game modes plan's waves 0 and 1 and before its wave 2 (which then uses batch 2's loot, predicate and function code); batches 3 and 4 after the game modes plan closes.

- [ ] Batch 2, data (34 kinds; fact table 2F1–2F15, spike questions 2S1–2S15, limits 2L1–2L12). Wave 0: B600 spike (loot odds, tags, commands, dialogs and advancements against the real game; sizes). Wave 1: B601 scaffold (the `live_view` route and the registry), B602 the gzip size reserve (ADR 0079 D4), B603 jar data and IPC. Wave 2: B604 sim tags and predicates, B605 sim loot and item modifiers, B606 sim functions, B607 `fixtures/live-views` and measured expectations, B608 the frame, the situation picker and item slots. Wave 3: B609 Roll it, B610 Try it on (predicates, item modifiers, enchantments), B611 the advancement tree, dialogs and sample lines, B612 everything in a tag, B613 functions in Try it and the editor. Wave 4: B614 block transformers and vanilla block rules in Try it, B615 the Creator's Live tab and the AI helper's See it. Wave 5: B616 e2e, B617 AI words, guide, changelog. Wave 6: B618 close.
- [ ] Batch 3, looks and sounds (30 kinds; 3F1–3F12, 3S1–3S12, 3L1–3L12). B619 spike; B620 scaffold, B621 jar textures and vanilla sound files; B622 the sound player and Play everywhere, B623 stand-in bodies, B624 fonts, B625 potions, tabs, particle sprites and waypoint styles, B626 the day strip; B627 mob variants and villagers, B628 paintings, banners, trims and pots, B629 shaders and post effects, B630 songs, calls and My things; B631 e2e, B632 AI words, guide, changelog; B633 close.
- [ ] Batch 4, assembled structures (3 kinds; 4F1–4F8, 4S1–4S10, 4L1–4L9). B634 spike; B635 scaffold, B636 jar structure files; B637 assembly and B638 processors in `@msm/terrain`, B639 `fixtures/structures-parity`; B640 the assembly view, B641 the processor view and parity test, B642 structures in Try it and on generated land (takes over live worldgen's reserve B595); B643 e2e, B644 AI words, guide, changelog; B645 close.
- [ ] Reserves, only on a spike's word: B646 bodies from the user's own game (runtime dev mode), B647 more of the game's commands for functions in Try it, B648 terrain-matched pieces.
- [ ] The user looks at the vetoable defaults in the Status of ADRs 0120, 0121 and 0122.

### Exit criteria

Two targets supported; an external plugin works; 1.0 released.

### Estimate

6–8 weeks.

### Depends on

Phases 0–6.

## Post-1.0 Ideas

Not committed; each needs an ADR before work starts.

- **NeoForge target**: the hybrid architecture allows a second loader via a target and a runtime port.
- **Bedrock export research**: feasibility of lowering a subset of kinds to Bedrock add-ons.
- **Collaboration**: shared projects beyond git, such as live co-editing.
- **Marketplace**: discovery and install for third-party plugins and templates.
- **Pre-26.1 vanilla export**: 1.21.x pack export via a target plugin, using existing mcdoc schemas.
- **More gear and content types** (deferred from [ADR 0044](adr/0044-gear-weapons-and-consumables.md) D8): armour trim patterns (per-layer textures), banner patterns, a glider flow. Trident-style throwables and custom status effects moved to the add-on "Custom status effects and throwables" (ADRs 0055, 0056); what stays here from them: 3D thrown models, return flight, custom arrows and GeckoLib projectiles, instant effects (brewing arrived with [ADR 0063](adr/0063-potions-and-brewing.md)).
- **Block families and state-dependent shapes** (deferred from [ADR 0059](adr/0059-block-shapes-and-see-through-blocks.md) D5, coverage audit B2): done in the add-on "Block types, crops, saplings and trees" (ADRs 0067–0069). What stays here: signs, boats, own set-type sounds, copper weathering, stems, berry bushes, double plants, ladders, torches, lanterns, waterlogging for plain and facing blocks.
- **Whole game modes and maps (user, 2026-11-22: "eventually you should be able to make something like a custom skyblock etc and more with all these tools")**: after vanilla parity 3, a batch that puts the tools together into whole experiences, each made the vanilla way (data packs and the runtime, no hidden Java beyond what vanilla cannot do): a Skyblock maker (a void world preset or flat preset of air, a starting island structure placed at spawn, island chests, the generators players build from lava and water, extra trades and recipes for what the void lacks), one-block, island or sky worlds, lucky-block style blocks, custom adventure maps (structures, Rules, dialogs, game rules, statistics, advancements as goals), minigame kits (arenas, teams, scoreboards, timers). Each as a Creator flow with Very easy picks and a Try it ground. Draft plan `docs/PLAN-game-modes.md` (B547–B564, ADRs 0113–0117 Proposed, 2026-11-22), to start after vanilla parity 3 closes.
- **Live world generation and "Everything visible live" (user, 2026-11-22: "Can we make custom world generations if not make it an option. Everything should be visible live")**: custom world generation is already possible as data; the idea is to see it while editing and to offer it to beginners. A live biome and height map and a side cut in the preview panel for dimensions, world presets, noise settings, density functions and biomes; a Try it ground "My world generation" that makes the project's own land around the player and follows edits; seed and position controls and Compare with vanilla; a Home tile Make a world with five flows (islands, tall mountains, one biome, caves only, empty sky as the bridge to the game modes plan), each a Showcase clip candidate; and an audit of every kind that still has no live view. Engine: deepslate's worldgen module (MIT, already bundled); vanilla worldgen JSON only from the user's own client jar at runtime. Draft plan `docs/PLAN-live-worldgen.md` (B574–B595, [ADR 0119](adr/0119-live-worldgen-preview.md) Proposed), after B544 and B572; see the add-on section above. The rule itself stands under Principles.
- **Live views for everything else (from the user's rule of 2026-11-22, "Everything should be visible live")**: planned as the add-on "Live views 2 to 4" ([`PLAN-live-views.md`](PLAN-live-views.md), ADRs 0120–0122). Ideas it leaves open, each needing its own ADR: live views for third-party plugin kinds (the registry opened through the plugin API); an Advancement Studio that edits in the tree; other languages' text in previews; exact vanilla mob bodies for everyone (today only by reserve B646, from the user's own game); a full shader translation.
- **AI assistant (user request, 2026-11-04)**: moved ahead of 1.0 on 2026-11-05 as the "AI helper" add-on of Phase 7 ([ADR 0041](adr/0041-ai-helper.md)). Later ideas for it: persisted conversations with their own retention rules, a base URL setting for proxies, server-side compaction for very long build runs, a stored generator version in Creator metadata.

## Milestone Log

| Date | Milestone | Notes |
|---|---|---|
| 2026-11-04 | Phase 0 — Foundations complete | Monorepo, plugin-api 0.1.0, schemas, core, target mc-26.3, Electron shell, ADRs 0001–0008. 203 tests; headless smoke passes. Untagged: licence pending. |
| 2026-11-04 | Phase 1 code complete — pending in-game check and licence | plugin-api 0.2.0, `@msm/plugin-resourcepack` (six kinds), `validateJson`, `@msm/exporters` `vanilla-packs`, `@msm/interop` client-jar extraction, `@msm/targets`, Resource Pack Studio with forms, Monaco, deepslate preview, export and install; golden-path e2e and packaged smoke in CI; ADRs 0009–0013. Sizes: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB. Releases are Windows only. Untagged: licence pending. Manual in-game verification pending. |
| 2026-11-04 | Phase 2 code complete — pending in-game checks and first release | plugin-api 0.3.0, Node 24 and pnpm 12, `@msm/plugin-datapack` (14 kinds including eight tag kinds, plus ten schema-form kinds), `@msm/schemas/mcfunction` (offline Spyglass in main, with mcdoc symbols for JSON and NBT inside commands), reference index and one-step rename, data pack and combined export, install into a world, Recipe Studio, Tag editor, Function editor, command palette, animated texture preview, in-app auto-update; data pack golden-path e2e; ADRs 0014–0018. 1,037 tests (app 397, core 152, schemas 142, exporters 73, tools 60, datapack 57, plugin-api 44, mc-26.3 40, interop 32, resourcepack 28, targets aggregator 12). Sizes: `app.asar` 12.7 MB, renderer 5.7 MB, main `index.js` 266.2 kB (7.0 MB under `out/main`). Untagged: waiting on the user's first-release steps. Manual in-game checks (Phase 1 and Phase 2) pending. |
| 2026-11-04 | Phase 3 code complete — pending in-game check | v0.3.0. plugin-api 0.5.0 (`ProjectValidator`, `ElementKind.registry`, `Target.dataVersion`, `Target.worldgen`), `@msm/plugin-structures` (five kinds, deepslate NBT codec with our own SNBT printer, `.nbt` and Sponge `.schem` import and export) and `@msm/plugin-worldgen` (fourteen kinds), three worldgen tag kinds (52 kinds in all), ten project validators gating export, 99 templates, 11 starters and 56 examples, `fixtures/sample-worldgen/` with SHA-256 golden and chain walk, Structure, Template Pool, Biome and Placed Feature Studios, structure 3D preview and climate map, world names from `level.dat`, recent projects; e2e `worldgen-path` (seven specs); ADRs 0021–0023. Tests: 1,719 across 14 packages (app 626, core 154, exporters 170, schemas 152, datapack 131, worldgen 89, target 69, interop 65, tools 60, structures 56, plugin-api 51, resourcepack 48, library 36, targets 12); seven e2e specs in 26.9 s. Sizes: app.asar 13.2 MB (budget 25 MB), build output 7.2 MB, lazy worldgen preview chunk 158.8 kB. Untagged: the user pushes `v0.3.0`. Manual in-game checks (Phases 1–3) pending. |
| 2026-11-05 | Phase 4 code complete — pending in-game check | v0.4.0. plugin-api 0.6.0 (`OutputFile.merge`, exporter options, `Target.fabric`), MSM mcdoc v1 with a shared conformance corpus, `msm_runtime` v1 (Codecs, nine components, six actions; Loom 1.19.3, Loader 0.20.1, Fabric API 0.165.2+26.3; 46 JUnit tests and 18 GameTests in `./gradlew build`), `@msm/plugin-blocks-items` (`msm:block`, `msm:item`, `msm:mod`; 55 kinds in all), `fabric-content-jar` exporter with nested or separate runtime, Block and Item Studios, Export Fabric mod jar, Test in Minecraft (`@msm/interop` `fabric/`), real Custom ore starter, 106 templates, 11 starters and 61 examples, `fixtures/sample-mod/` with SHA-256 golden and the CI headless server check; e2e `blocks-items-path` (eight specs); ADRs 0024–0027. Tests: 15 packages, 1,978 passed (1 skipped) in the clean-worktree run, e2e 8/8 (38.1 s), 46 JUnit and 18 GameTests. Sizes: renderer 6.0 MB of 8.0 MB, app.asar 13.3 MB of 25 MB, main `index.js` 513.6 kB. Untagged: released through `release.yml` with the user's go-ahead. Manual in-game checks (Phases 1–4) pending. |
| 2026-11-05 | Phase 5 code complete — pending in-game check | v0.5.0. plugin-api 0.7.0 (`Target.geckolib: GeckolibFacts`), MSM mcdoc for entities, Bedrock geometry and animations with `play_animation`, `msm_runtime` 0.5 (`MsmEntity`, six goal types, spawn eggs, natural spawns, GeckoLib 5.5.7 bridge and client entrypoint; 78 JUnit tests and 38 GameTests in `./gradlew build`, also with `-PwithoutGeckolib`), `@msm/plugin-entities` (`msm:entity`) and `@msm/plugin-models-anim` (`msm:geo_model`, `msm:animation`; 58 kinds in all), Blockbench import in `@msm/interop` (4.x and 5.x) as a host importer, Entity Studio, own WebGL geo preview with playback, content jar nesting GeckoLib (downloaded once, SHA-512 checked), Custom mob starter, 112 templates, 12 starters and 66 examples, `fixtures/sample-mob/` with SHA-256 golden and the CI headless server check (runtime and GeckoLib nested); e2e `entities-path` (nine specs); ADRs 0028–0030. Tests: 17 packages, 2,245 passed (2 skipped) in the clean-worktree run, e2e 9/9 (46.3 s), 78 JUnit and 38 GameTests. Sizes: renderer 6.1 MB of 8.0 MB, app.asar 13.4 MB of 25 MB, main `index.js` 517.4 kB. Untagged: released through `release.yml` with the user's go-ahead. Manual in-game checks (Phases 1–5) pending. |
| 2026-11-05 | Phase 6 code complete — pending in-game check | v0.6.0. plugin-api 0.8.0 (`FabricFacts.gradle`, `Target.javaProject`, the `typescript` language), `msm_runtime` 0.6 (Rhino 1.9.2 nested, `scripting/` with script API v1: nine events, `msm.actions.define` and the `run_script` action, `msm.schedule`, relative `require`; sandbox and 2000 ms budget; 90 JUnit tests and 60 GameTests in `./gradlew build`, also with `-PwithoutGeckolib`), `@msm/plugin-scripting` (`msm:script`; 59 kinds in all) with the script API JSON and generated typings, TypeScript to ES5 transpilation and checking in main (ADR 0031 replaces esbuild), Script Studio with Monaco TypeScript, `java-project` eject with the 26.3 Java generator and the Export Java project dialog, Scripted ore starter, 116 templates, 13 starters and 69 examples, `fixtures/sample-script/` with SHA-256 golden and the CI headless server check, ejected `sample-mod` and `sample-mob` built in CI and the parity GameTests (11 + 7) passing on content and ejected jars; e2e `scripting-path` and `eject-path` (eleven specs); ADRs 0031–0034. Tests: 18 packages, 2,461 passed (5 skipped) in the clean-worktree run, e2e 11/11 (1.1 min), 90 JUnit and 60 GameTests, CI parity 4/4 runs. Sizes: renderer 12.9 MB of 16 MB, app.asar 23.9 MB of 25 MB, main 11.0 MB (`index.js` 616.3 kB, lazy `scripting-engine` 3.7 MB). Untagged: released through `release.yml` with the user's go-ahead. Manual in-game checks (Phases 1–6) pending. |
| 2026-11-06 | v0.7.0 — AI helper, the Creator, armour, gear, weapons and consumables, plus Phase 7 work so far | One combined release (the planned 0.8.0 folded in). plugin-api 1.2.0 (tarball attached to the release), `@msm/ai` with `@anthropic-ai/sdk` 1.1.0 (main only), AI helper (key in `safeStorage`, chat and build modes, changeset review, limits and cost), the Creator (twelve flows, live preview, kept-edits reopen, Update with undoable texture bytes), `msm:armor`, custom tool materials, `msm:consumable`, `msm:ranged_weapon`, `msm:shield`, `msm:death_protection`, `msm:components`, `apply_effect`, spears, maces, horse and wolf armour, starter wizards, third-party plugins in sandboxed workers under `msm-app://`, the second target `mc-26.4` (`26.4-snapshot-7`) with Upgrade project target and per-target runtime jars, the docs site; 61 kinds, 125 templates, 24 starters, 71 examples; ADRs 0035–0045 accepted. Tests: 21 turbo tasks, 3,902 passed (42 skipped); e2e 15 tests in 13 spec files (1.5 min; `ai-path` 8.6 and 6.4 s, `creator-path` 8.6 and 2.8 s); `./gradlew build` green for 26.3 and 26.4 (78 required GameTests); smoke, `stage-runtime --require` (two 0.7.0 runtime jars), `dist:dir`, `smoke:packaged` and the site build pass. Sizes: renderer 13.3 MB of 16 MB, app.asar 30.1 MB (31,595,724 bytes) of 32 MB, main 16.8 MB (`index.js` 767.6 kB), unpacked 307.3 MB. Untagged: released through `release.yml` with the user's go-ahead. Manual in-game checks (Phases 1–6 and 0.7.0) pending. |
| 2026-11-06 | Phase 7 — 1.0 code complete, release pending the user's go-ahead | v1.0.0 prepared (app and `mod_version` 1.0.0; plugin-api stays 1.2.0). Since 0.7.0: e2e `plugins-path` and `targets-path` (15 spec files, 19 tests), guide pages `plugins.md` and `targets.md`, the plugin-only data pack fix, the Windows CI job `windows-plugin` with the drive-letter fix for external plugin builds, plugin exporters under More exports. Exit criteria by CI proxy: two targets in `builtInTargets` with every per-target test green; runtime jars built and GameTested for both versions in the `engine-mod` matrix; server checks for both; the sample plugin loaded, used and refused in `plugins-path`; the docs site built on every push. 61 kinds, 125 templates, 24 starters, 71 examples (unchanged). Clean-worktree run (983388b and the What's New fix): 21 turbo tasks, 3,907 passed (42 skipped); e2e 15 spec files, 19 tests (1.7 min); smoke, `dist:dir`, `smoke:packaged` and check-size pass; the Gradle builds, server checks, parity runs and the Windows plugin build run in CI (no JDK in the session container). Sizes: renderer 13.3 MB of 16 MB, app.asar 30.1 MB of 32 MB, main 16.8 MB (`index.js` 767.6 kB), unpacked 303.6 MB. Not yet released: the user tests 0.7.0 or a 1.0.0 draft on Windows first. Manual in-game checks (Phases 1–6, 0.7.0) pending. |
| 2026-11-06 | v1.0.0 released; v1.1.0 prepared | 1.0.0 published after the user's Windows test (installer, blockmap, `latest.yml`, plugin API tarball). 1.1.0: modpacks (ADR 0046), Easy and Advanced mode, sidebar search and folding, New project with the AI helper, the live preview beside the form (items, blocks, armour with a parts list, recipes), texture painting (ADR 0047), bow and crossbow pull, external `supports`, plugin API 1.3.0. Release pending the user's Windows test. |
| 2026-11-07 | Pictures, screenshots and skins | ADR 0048: Picture to texture (paste, drop or choose; crop, scale, background, colours), player skins on the Custom mob (overlay layer, legacy layout, slim arms), screenshots for the AI helper; also New texture…, better placeholder art and an Easy-mode e2e. Prepared as v1.2.0 (app and `mod_version` 1.2.0); release pending the user's Windows test, after 1.1.0. |
| 2026-11-07 | v1.3.0 prepared | ADR 0049 (Music disc song files; plugin API 1.4.0 `audio` parameters), ADR 0050 (passthrough data pack warning, `ItemFacts.vanillaTools` in the Creator's Stats, optional `defense.body` for horse and wolf armour); app and `mod_version` 1.3.0. Release pending the user's Windows test, after 1.1.0 and 1.2.0. |
| 2026-11-13 | 1.4.0 prepared: custom status effects and throwables | ADRs 0055 (`msm:effect`, Effect Studio, `damage`/`heal` actions, script `hasEffect`/`effectLevel`/`removeEffect`/`ActionEvent.other`) and 0056 (`msm:throwable` item component, `msm_runtime:thrown_item`, dispensers), plugin API 1.6.0, the Creator groups Magic (Status effect) and Gear (Throwable), Java eject for both (`ModEffects`, `ThrownItemEntity`), AI helper knowledge, sample mod and script additions. Also in 1.4.0: Dimension flow, launch and real pushes, Wishlist, picture options, texture drag and drop, the feature-order fix (different steps are a warning), the Music disc `sound_id` fix and the eject `Actions.java` fix. 62 kinds, 129 templates (resourcepack 15, datapack 56, structures 9, worldgen 21, blocks-items 18, models-anim 3, entities 3, scripting 4), 27 starters, 73 examples. Tests (`turbo run test --force --continue`, 21 tasks): 20 tasks pass with 4,234 tests (45 skipped); `@msm/plugin-scripting` passed 44 of 48, the four failures coming from the plugin API 1.7.0 work in progress in the same worktree, not from 1.4.0; GameTests 97 runtime (78 plus 9 effect plus 10 throwable) and 28 sample-mod parity as reported by the runtime and parity briefs (CI is the check). Prepared, not built: the release build waits for the user's Windows test of the 1.1.0–1.3.0 drafts; in-game checks in `fixtures/sample-mod/README.md` (Effects and throwables). |
| 2026-11-14 | Runtime fixes and sounds | ADRs 0057 (project sound events registered from `sounds.json`, mob sounds, kind-aware sound ids), 0058 (step events carry the stepper, script commands as an entity or at a position, cancel resync) and 0059 (block shapes and see-through blocks: `msm:shape`, Block Studio Shape section, presets, Half block, Plant (cross) and Glass-like block templates, two warnings) accepted; plugin API 1.7.0 (`JavaProjectInput.soundEvents`) and 1.8.0 (villager trade folders, biome and loot additions, compost providers); also the Villager trade Creator flow and the `villager_trade` and `trade_set` kinds. 65 kinds, 136 templates (resourcepack 15, datapack 60, structures 9, worldgen 21, blocks-items 21, models-anim 3, entities 3, scripting 4), 28 starters, 76 examples. Tests (`turbo run test --force --concurrency=4`, 21 tasks, all successful): 4,417 passed (47 skipped); runtime 130 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and 231 JUnit; parity: sample mod 44, sample mob 8, sample script 3 (five CI parity runs), as reported by the runtime and parity briefs (CI is the check). In-game checks in `fixtures/sample-mod/README.md`, `fixtures/sample-script/README.md` and `fixtures/sample-datapack/README.md`. |
| 2026-11-14 | Adding to vanilla content, triggers and saved data | ADRs 0060 (biome and loot additions, fuel and compost, ore that generates by default, villager trades), 0061 (ten more triggers, tick limiter; mob events run `run_function` as the mob when no player is involved) and 0062 (persistent script data, `Entity.data` and `msm.storage`) accepted; plugin API 1.8.0; kinds `msm:biome_addition` and `msm:loot_addition`, World addition and Extra drops Studios, Triggers in the Events editor, Java eject for all of it, guide page `adding-to-vanilla.md`. 67 kinds, 141 templates (resourcepack 15, datapack 60, structures 9, worldgen 21, blocks-items 26, models-anim 3, entities 3, scripting 4), 29 starters, 82 examples. Tests (`node_modules/.bin/turbo run test --force --concurrency=4`, 21 tasks, all successful): 4,655 passed (48 skipped); runtime 165 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and 315 JUnit; parity: sample mod 59, sample mob 10, sample script 4; CI also runs a two-run restart of the sample script server and the vanilla data pack check (`tools/run-fabric-server/vanilla-datapack.ts`), as reported by the runtime and parity briefs (CI is the check). B243 (real chunk-generation check) stays in reserve. In-game checks in `fixtures/sample-mod/README.md`, `fixtures/sample-mob/README.md`, `fixtures/sample-script/README.md` and `fixtures/sample-datapack/README.md`. |
| 2026-11-14 | Potions, data kinds and Script API 1.1 | ADRs 0063 (`msm:potion` registered after effects and before blocks and items, brewing recipes as data, Potion Studio, Make a potion, Java eject `ModPotions`; vanilla packs leave potions out with `blocks-items.potion-needs-jar`, finding P8), 0064 (fifteen data kinds, eight tag kinds, `minecraft:atlas` and `minecraft:font`; `wolf_sound_variant` and `trial_spawner` dropped until the vendored mcdoc is re-synced) and 0065 (Script API 1.1: inventory, equipment, item components, XP, food, game mode, titles, boss bars, typed damage, raycast, cross-dimension teleport, six events; `entity.damaged` after armour and on killing blows) accepted; plugin API 1.9.0; Creator flows Potion, Mob skin and Goat horn; ADR 0066 (vanilla pack safety) proposed and in progress. 93 kinds, 151 templates (resourcepack 16, datapack 65, structures 9, worldgen 21, blocks-items 28, models-anim 3, entities 3, scripting 6), 32 starters, 112 examples (counted from the plugins' contributions). Runtime 193 GameTests per variant (the local 26.3 run reports "All 193 required tests passed"; the source has 192 `@GameTest` methods, the same offset of one as at earlier closes) and 334 JUnit; parity: sample mod 68 (44 plus 15 additions plus 9 potions), sample mob 10, sample script 15. Test totals of a clean-worktree run are for the main session; CI is the check. In-game checks in `fixtures/sample-mod/README.md`, `fixtures/sample-script/README.md` and `fixtures/sample-datapack/README.md`. |
| 2026-11-14 | Block types, crops, saplings and trees | ADRs 0067 (a `type` field on `msm:block` with 17 types: pillar, horizontal, directional, slab, stairs, wall, fence, fence gate, door, trapdoor, button, pressure plate, pane, crop, sapling, leaves; `msm:flammable` with a 26.4 reflection seam, `msm:strippable` through `UseBlockCallback`), 0068 (crops with stages and seeds under `item.id`, saplings growing project trees, leaves with decay and the runtime's first client block hook, the leaf tint; the Tree Studio) and 0069 (Creator flows Wood set, Stone set, Crop and Tree) accepted, and ADR 0066 (vanilla pack safety) accepted with CI loading every library project's vanilla data pack on both targets; plugin API 1.10.0 (`TargetFacts.blocks`); guide page `block-types-and-plants.md`. 93 kinds, 169 templates (resourcepack 16, datapack 65, structures 9, worldgen 22, blocks-items 45, models-anim 3, entities 3, scripting 6), 36 starters, 118 examples, 64 placeholder patterns. Runtime 239 GameTests per variant (238 `@GameTest` methods) and 414 JUnit; parity: sample mod 83 (44, additions 15, potions 9, block types 15), sample mob 10, sample script 15. Clean-worktree run (c015dcb): lint, typecheck, 21 of 21 test tasks (6,351 TypeScript tests), build, `dist:dir`, check-size (`app.asar` 31.6 of 32.0 MB) and e2e 41 of 41 green; runtime 361 GameTests per variant and 553 JUnit; parity sample machines 19 on the 26.3 content and ejected jars and the 26.4 content jar. In-game checks in `fixtures/sample-mod/README.md` ("Block types and plants"). |
| 2026-11-14 | Mob expansion | ADRs 0070 (a `base` field picking `PathfinderMob`, `TamableAnimal` or `Monster`; `fly`, `swim` and `amphibious` movement; `msm:ranged_attack` with the runtime's own ranged goal; tempt, panic and leap goals; animal and water spawn rules), 0071 (`msm:tameable`, `msm:breedable` with babies, `msm:rideable` with saddles, `msm:variants`, `msm:boss_bar`; tame before breed as wolves and cats), 0072 (the runtime's built-in vanilla renderer reading the project's geo and animation files, so mobs need no GeckoLib and work on 26.4; GeckoLib babies scaled by the runtime) and 0073 (preset models, six Creator flows Pet, Farm animal, Mount, Flying mob, Water mob and Boss, seven templates) accepted; plugin API 1.11.0 (`TargetFacts.entities`); Entity Studio Kind of mob and seven sections; guide page `mob-behaviours.md`; `fixtures/sample-creatures`. 94 kinds, 177 templates (resourcepack 16, datapack 66, structures 9, worldgen 22, blocks-items 45, models-anim 3, entities 10, scripting 6), 42 starters (30 Creator flows), 125 examples, 64 placeholder patterns. Runtime 309 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and 488 JUnit; parity: sample mod 83, sample mob 10 (now also on 26.4), sample script 15, sample creatures 12 (26.3 content, 26.3 ejected, 26.4 content). `app.asar` 31.3 of 32 MB. Test totals of the clean-worktree run are the main session's. In-game checks in `fixtures/sample-creatures/README.md` and `fixtures/sample-mob/README.md`. |
| 2026-11-14 | Containers and machines | ADRs 0074 (`msm:container` on `block`, `pillar`, `horizontal` and `directional`: chest rows, hopper, dispenser and holder layouts through vanilla menus, keep contents with the shulker box menu, hoppers, comparators, `open` state and sounds, loot tables; one block entity type per block), 0075 (`msm:machine`: the furnace's three slots, `fuel`, `redstone` or `always` power, one recipe type and serialiser per machine under its block id, vanilla cooking types, `lit`, experience, a server-side furnace menu subclass; machine recipes left out of vanilla packs, F22 confirmed) and 0076 (Block Studio Inventory section, Creator flows Storage crate and Machine, eight templates, three examples, Script API 1.2 `World.getContainer`, AI helper knowledge) accepted; plugin API 1.12.0 (`BlockFacts.containerSounds`, `machineRecipeTypes`); Java eject of all of it; guide page `containers-and-machines.md`; `fixtures/sample-machines`. 94 kinds, 185 templates (resourcepack 16, datapack 66, structures 9, worldgen 22, blocks-items 53, models-anim 3, entities 10, scripting 6), 44 starters (32 Creator flows), 128 examples, 64 placeholder patterns. Runtime 361 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4; one more manual-only) and 553 JUnit; parity: sample mod 83, sample mob 10, sample script 15, sample creatures 12, sample machines 19 (26.3 content, 26.3 ejected, 26.4 content). `app.asar` 31.5 of 32 MB. Test totals of the clean-worktree run are the main session's. In-game checks in `fixtures/sample-machines/README.md`. |
| 2026-11-14 | Custom portal blocks | ADRs 0077 (block type `portal`: a frame of a block or tag lit by an igniter or the `light_portal` action, `MsmPortalBlock` on vanilla's `Portal` interface with no client code, Mixin or seam, our own per-level index `msm_runtime:portals` instead of POI types, travel with scale, linked or built exits, surface arrival, cooldown and `on_travel`; Java eject) and 0078 (Block Studio Portal section, Creator flow Portal and the Dimension flow's portal answer, three templates, the Two-way sky portal example, AI helper knowledge, `fixtures/sample-portals`) accepted with findings (F20 false on every GameTest server, so trips into project dimensions are checked on dedicated servers only), and ADR 0079 (vendored target data compacted, B329) accepted; plugin API 1.13.0 (`BlockFacts.portal`); guide page `portals.md`. 94 kinds, 188 templates (resourcepack 16, datapack 66, structures 9, worldgen 22, blocks-items 56, models-anim 3, entities 10, scripting 6), 45 starters (33 Creator flows), 129 examples, 66 placeholder patterns. Runtime 400 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and 610 JUnit; parity: sample mod 83, sample mob 10, sample script 15, sample creatures 12, sample machines 19, sample portals 13 (26.3 content, 26.3 ejected, 26.4 content). `app.asar` 26.9 of 32 MB. Test totals of the clean-worktree run are the main session's. In-game checks in `fixtures/sample-portals/README.md`. |
| 2026-11-14 | Custom particles | ADRs 0080 (kind `msm:particle`: option-less `FabricParticleTypes.simple` types registered after sound events, frames in the particle atlas, `MsmParticle` and `MsmParticleProvider` on Fabric's `ParticleProviderRegistry` with no Mixin or seam, curves in the pure `ParticleLook`; `spawn_particle` options objects for vanilla dust, block and item particles, `motion`, `force` and a `count` cap of 1000; block component `msm:ambient_particles`; `dimension_type` and `timeline` fatal in vanilla data packs; Java eject) and 0081 (Particle Studio, Ambient particles section, "Spawn particle" kinds, Creator flow Particle, four templates and a resource pack retexture template, three examples, four placeholder patterns, AI helper knowledge, the headless client GameTest route, `fixtures/sample-particles`) accepted with findings; plugin API 1.14.0 (`TargetFacts.particles`; the code is at 1.15.0 with the Rules batch); Script API 1.3 (`World.spawnParticle` options, "Since runtime 1.5.1"); guide page `particles.md`. 96 kinds, 193 templates (resourcepack 17, datapack 66, structures 9, worldgen 22, blocks-items 60, models-anim 3, entities 10, scripting 6), 46 starters (34 Creator flows), 132 examples, 70 placeholder patterns, counted from the plugins' contributions at e9ce3c9 without the in-progress Rules plugin (1 kind, 6 templates). Runtime GameTests per variant 400 before the batch and 429 after it (26.3, 26.3 without GeckoLib, 26.4); 440 in the sources at close with the Rules batch's Script API 1.4 (6) and dev mode (5) tests; JUnit 610 to 685 (691 at close with the Rules batch's `DevFilesTest`); client GameTests on both versions in CI; parity: sample mod 83, sample mob 10, sample script 15, sample creatures 12, sample machines 19, sample portals 13, sample particles 12 (11 on the 26.3 content, 26.3 ejected and 26.4 content jars, plus 1 script test on the content jars). `app.asar` 26.9 of 32 MB after B354. Test totals of the clean-worktree run are the main session's. In-game checks in `fixtures/sample-particles/README.md`. |
| 2026-11-14 | Rules, Very easy mode and one-click Play (1.5.1 draft) | ADRs 0082 (Rules: the kind `msm:rules` with sentence cards of 43 triggers, 16 conditions, 36 steps and 9 values, logic nested 3 deep, counters; compiled at lowering time by the project expander `msm.rules.expand` into one event per subject and trigger, plain rules as format actions and the rest as one generated TypeScript script per book; Rule book Studio, ThingPicker, the Rules section in four Studios, "From rules" and "Turn into rules"; six templates, two examples, AI helper knowledge; plain rules ejected, rules with logic listed), 0083 (Very easy: a third mode for new installs with Home, 13 tiles, My things, Things to fix in plain words for 125 codes, name-only New, Share my mod) and 0084 (Play, the managed Prism instance, the `msm-dev/` files, the runtime's dev mode on the integrated server and its client hooks on Fabric events, the flat test world with chests, Reload in place, reopen or Restart needed with reasons, Restart in one click) accepted with findings; plugin API 1.15.0 (`projectExpanders`, `TargetFacts.dev`), Script API 1.4 ("Since runtime 1.5.1", as all of 1.1 to 1.4). 97 kinds, 199 templates (resourcepack 17, datapack 66, structures 9, worldgen 22, blocks-items 60, models-anim 3, entities 10, scripting 6, rules 6), 46 starters (34 Creator flows), 134 examples, 70 placeholder patterns, counted from the plugins' contributions at 2c0a7f2. Runtime 440 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4; the batch added 11: Script API 1.4 6, dev mode 5), 704 JUnit (691 plus `DevWorldSettingsTest` 5 and `DevClientFilesTest` 8, as reported; corpus cases are dynamic), client GameTests `MsmDevClientGameTest` on both versions; parity sample rules 8 (3 plain on the 26.3 content, 26.3 ejected and 26.4 content jars, 5 script on the content jars), with sample mod 83, sample mob 10, sample script 15, sample creatures 12, sample machines 19, sample portals 13, sample particles 12. e2e 27 spec files (26, plus `tryit-path` of Try it slice 1); B379's whole suite passed 48 tests in 6.4 minutes. `app.asar` 27.4 MB after B378 and 27.6 MB of 32 with Try it slice 1 (B390), renderer 15.0 of 16 MB. CI run 569 green on 0e14663 (all jobs, both engine-mod versions). Built as the 1.5.1 draft release with everything since 1.3.0 (the v1.5.0 tag on 47ad42c has no release: its build was cancelled for the Reload `pack.mcmeta` fix). In-game checks in `fixtures/sample-rules/README.md`. |
| 2026-11-15 | Vehicles and the client side | ADRs 0088 (the runtime's first networking channel `msm_runtime:key_v1` and `hud_v1`, `msm:key_bind` in vanilla's Controls screen, `InputGuard` at 20 packets a second with a burst of 40, runtime keys R, V, H and Left Alt), 0089 (`msm:hud`: text, bars and icons at ten anchors from script data, scores, the ridden vehicle, the player or actions; the vehicle dashboard; actions `show_hud`, `hide_hud`, `set_hud`), 0090 (`msm:vehicle` on `VehicleEntity`: five movement modes moved by the driver's client and checked by the server, fuel, health and repair, storage, paint, weapons through a shared `Projectiles`, a turret, the horn, the `explode` action, the runtime's own renderer) and 0091 (Vehicle, Key bind and HUD Studios, the Car, Tank, Plane and Boat flows, the Very easy tile "Make a vehicle", Try it vehicles, keys and HUD, tests) accepted with findings at close B432; plugin API 1.16.0 (`TargetFacts.controls`, `vehicles`); Script API 1.5 ("Since runtime 1.5.1"); guide pages `vehicles.md` and `keys-and-hud.md`; `fixtures/sample-vehicles`. The batch added 3 kinds, 14 templates (entities 8, controls 6), 4 starters (all Creator flows) and 4 examples. Counts from the merged runs, with vanilla parity 2 batch 1 merged beside it: runtime 663 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) as of B455 and about 1036 JUnit; client GameTests `MsmControlsClientGameTest` and `MsmVehicleClientGameTest` on both versions; parity sample vehicles 15 on both content jars (no ejected run); e2e 34 spec files, 59 of 59 tests passing in B427's full run (8.7 minutes); renderer 15.8 of 18 MB and `app.asar` 28.6 of 32 MB (B429). Contributions at 3d29dc4 (both batches): 102 kinds, 241 templates, 57 starters (45 Creator flows), 161 examples, 70 placeholder patterns. In-game checks in `fixtures/sample-vehicles/README.md`. |
| 2026-11-15 | Vanilla parity 2, batch 1: vanilla blocks and everyday parity | ADRs 0094 (twenty block types: bed, cake, berry bush, tall plant, ladder, torch, lantern, chain, sign, hanging sign, potted plant, candle, sea pickle, vine, carpet, layers, rod, stem, cocoa, scaffolding, 38 in all; companions `<path>_wall` and `<path>_attached`; signs with their own unregistered wood type and edit-screen pictures; `msm:waterloggable`; `msm:weathering` and `msm:waxable` through vanilla's own `changeOverTime`), 0095 (`msm:item_inventory` bags with the `BagGuard` against duplication, `msm:bundle`), 0096 (`msm:command`, `msm:creative_tab`, the runtime's first two Mixins `BlockItemPlaceMixin` and `ServerExplosionMixin`, Script API 1.6, Rules for placing, explosions, commands, riding and facing) and 0097 (vanilla's feature order as a target fact, `tools/sync-feature-order`, three worldgen warnings) accepted with findings at close B468, ADR 0101 for batch 1; plugin API 1.17.0; guide page `commands-and-tabs.md`; `fixtures/sample-vanilla-blocks`. The batch added 2 kinds (102 with vehicles' 3), 28 templates (blocks-items 25, scripting 3), 7 starters (all Creator flows) and 7 examples. Counts from the merged runs (B455 to B465; the close was not re-run): runtime 663 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4); client GameTest `MsmVanillaBlocksClientGameTest` on both versions; parity sample vanilla blocks 29 on both content jars (21 plus 8 for scripts and rules) and 21 on the 26.3 ejected jar; sim 539 tests (B463); e2e 34 spec files, 55 passed in B465's full run (`launchers-path` failed once and passes alone); renderer 15.5–15.6 of 18 MB and `app.asar` 28.2 of 32 MB at B452 and B460 (28.6 and 15.8 after the vehicles' B429). Contributions at 78adc90 (both batches): 102 kinds, 241 templates, 57 starters (45 Creator flows), 161 examples, 70 placeholder patterns. In-game checks in `fixtures/sample-vanilla-blocks/README.md`. |
| 2026-11-21 | Vanilla parity 2, batch 2: villagers, fluids and skies | ADRs 0098 (`msm:trader` on any mob base through vanilla's merchant menu, every mob body a `Merchant`, levels, restock twice a day, `on_trade`; `msm:villager_profession` with a project job site, its POI type under the profession's id through the `PoiTypes` seam, `PoiHelper` on 26.3 and reflection on 26.4; `msm:storage` with storage bodies only for mobs that have it; `msm:shoulder_riding` as a perch, one per player), 0099 (`msm:fluid` with its liquid block and bucket, two fluids on 26.3 and one on 26.4 behind the `MsmFluid` seam, the 26.4 `EntityFluidMixin` with three injections added by `MsmMixinPlugin`, pictures read from the mod's own block model), 0100 (the Dimension Type Studio, the Dimension flow's "Give it its own sky and rules", five dimension type validators) and 0101 in full (the Trader, Storage and Shoulder sections with the trade editor, the Profession and Fluid Studios, the Wandering merchant, Village job and Fluid flows, the Mount and Pet answers, the tile "Make a trader", Try it's merchant mock-up, fluids and sky) accepted with findings at close B485; plugin API 1.18.0; guide pages `villagers-and-traders.md` and `fluids.md`; `fixtures/sample-villagers-and-fluids`. The batch added 2 kinds (104), 8 templates (249), 3 starters (60, 48 Creator flows) and 3 examples (164). Counts from the merged runs (B474 to B484; the close did not re-run them): runtime 705 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and about 1093 JUnit; client GameTest `MsmFluidClientGameTest` on both versions; parity sample villagers 15 on both content jars (no eject); sim 552 tests; app 2404 tests; e2e 36 spec files (`trader-path`, `fluid-path` and `tryit-path` 8 passed); renderer 16.2 of 18 MB (B483), `app.asar` last measured 28.8 of 32 MB (B471). In-game checks in `fixtures/sample-villagers-and-fluids/README.md`. |
| 2026-11-21 | Try it, the in-app test area (and Surprise me) | ADRs 0085 (Try it: a 48 by 48 by 32 preview over `@msm/sim` from the lowered files; blocks, the player, mobs that wander, particles, portals, triggers and actions, "What happened", sounds and mock-up screens; scripts in a sandboxed `blob:` worker with a 2-second stop and no `unsafe-eval`, logic rule steps through instrumented generated scripts; the vehicles, keys, HUD, twenty block types, traders, fluids and sky lines of the other batches), 0087 (Grid, Flat world, Quick world and From my world, a read-only area of a 1.18+ Overworld save) and 0086 (Surprise me, Pick for me, Home's grouped tiles) accepted with findings at close B403; plan deleted, facts T1–T16 and limits L1–L24 in ADR 0085. `fixtures/sim-parity`: 63 scenarios, 65 GameTests, 127 sim tests on both targets, no sim bug found; sim 601 tests at the close; `tryit-path` 7 tests. Slices 1 and 2 in the 1.5.1 draft, the rest in the 1.5.2 draft; awaiting the user's checks on Windows. |
| 2026-11-22 | Minecraft-style art (ADR 0092 option B) | ADR 0092 accepted with findings at B502 (D6–D17; option A not chosen and its code removed): the generator in `@msm/plugin-library` `art/` with 80 recipes (32 blocks, 39 items, 4 worn layers, the effect icon, 4 particles), hue shift 12, `checkArtRules` and 92 goldens, box skins with five coats, even coats for vanilla variants; every flow, starter and example drawn (349 PNGs changed once, 13 pinned hashes); the Draw dialog on every picture field, Draw frames…, New texture from a drawn picture, Draw a skin; `create_texture` recipes and AI pictures on the same ramps (ADR 0093 D4 amended); Try it's drawn terrain; e2e `art-path` (37 spec files); guide page `pictures.md`. Tests at the close (B502's runs in its worktree): library 1919 (45 skipped), exporters 1643 (119 skipped), AI 100, app 2518 in 264 files. Sizes: `app.asar` 29.2 of 32 MB, renderer 16.3 of 18 MB. Unreleased (after the 1.5.2 draft); the user's look pending. |
| 2026-11-22 | Vanilla parity 3, batch 1 (plants, pots, sounds and storage) | ADRs 0103–0106 accepted with findings at B523, ADR 0112 for batch 1 (B503–B522): five block types (`growing_plant`, `column_plant`, `multiface`, `dripleaf`, `flower_pot`; 43 in all) with companions; weathering on 17 types and containers, lightning scraping project blocks with no Mixin; waterlogged containers and machines, double chests, per-player chests, ageing containers keeping contents; `block_sounds`, any vanilla sound type, own set types, `msm:flattenable`, `msm:tillable`, kind `msm:vanilla_block_rules`; seven data kinds and three resource pack kinds (115 kinds); plugin API 1.19.0; seven Creator flows; Try it's Lightning tool; `fixtures/sample-plants-and-storage` (parity 22 on both content jars, 20 on the 26.3 ejected jar); e2e `plants-path` and `storage-2-path` (39 spec files); guide page `sounds.md`. Totals at the close (B523, clean worktree at 4ede504): 12,754 tests in 24 packages (app 2560, library 2117, exporters 1801, blocks-items 1081, sim 655), 771 GameTests per variant, 1228 JUnit; `app.asar` 29.8 of 32 MB, renderer 16.7 of 18 MB. Unreleased; the in-game checks pending. |
| 2026-11-22 | Vanilla parity 3, batch 2 (villagers, mobs, fluids, commands and the eject) | ADRs 0107–0111 accepted with findings at B544 and ADR 0112 in full, with the plan's fact table H1–H16 and limits N1–N26 and their outcome (B524–B543, the `open_dialog` action, B537b, eject 2c; plan deleted): trader reputation, demand and work sites, project beds as villager homes, kind `msm:villager_type`; fluid mixing, cauldrons and bottles with no Mixin; fish buckets, both shoulders, `hover` and `phase` movement, six habit goals and the ridden dash; boats and chest boats as vanilla's own entity types and renderers; 44 command argument types, kinds `msm:game_rule` and `msm:stat`, hand-ordered tabs, the action `open_dialog`, six events through five read-only Mixins and Fabric's sleep events; Script API 1.7 ("Since runtime 1.5.3"), plugin API 1.20.0; Rules at 62 triggers, 47 steps, 21 conditions, 14 values; the Villager look, Game rule and Statistic Studios, the Bucket, Habits and Boat sections; flows Villager look and Game rule; the 26.3 eject of vanilla parity 2 batch 2 and of this batch (only key binds, HUD elements, vehicles and scripts stay out); guide page `boats.md`; `fixtures/sample-mobs-and-commands`. Counts from the merged runs (the close changed only docs and re-ran no suite): 118 kinds, 293 templates, 69 starters (57 Creator flows), 195 examples, 98 art recipes; runtime 842 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4), 1350 JUnit at B527; client GameTest `MsmMobs2ClientGameTest` on both versions; parity sample mobs and commands 31 on the content jars of both versions and 26 on the 26.3 ejected jar, sample villagers 15 of 15 and sample plants and storage 22 of 22 on their ejected jars; app 2610 tests (B538), exporters 1921; e2e 43 spec files with the Showcase's; `app.asar` 30.5 of 32 MB and renderer 17.2 of 18 MB after the Showcase's B569. In the 1.5.3 test build (built from a4b807f) but for eject 2c and B541 to B543. In-game checks in `fixtures/sample-mobs-and-commands/README.md`. |
| 2026-11-22 | Showcase with live clips (ADR 0118) | ADR 0118 accepted with findings at B572 (B565–B572; reserve B573 not run; plan deleted, facts W1–W18, limits U1–U13 and answers Z1–Z13 in the ADR): ten cards headed **See what you can make** on Very easy's Home (both states, folding once the mod has things), in the New project dialog and in the Examples detail pane, with the palette entry and the setting **Play showcase clips**; clips drawn live by Try it's renderer from the examples' lowered files through a typed clip format and a tick-stepped, silent `ClipPlayer` (`app/src/renderer/src/showcase/`), one live canvas at a time, drawn and taken stills, reduced motion and no-WebGL fallbacks; Make this into the Creator flow and See the example. App only (no plugin API, Script API, library or runtime change). Measured under SwiftShader on both targets: first frame 1.06 s on the first mount and 0.15–0.56 s after, 42–55 fps, no context warning and memory within 20 MB over 50 mounts. Twelve test files in `app/test/components/showcase/`, e2e `showcase-path` (43 spec files; the full run 76 tests in 14.2 min); guide page `showcase.md`. Sizes after B569: `app.asar` 30.5 of 32 MB, renderer 17.2 of 18 MB. Moved from the plan: vanilla block states are not passed to clips, the vehicle card's Make this in New project picks the Car flow, a card whose flow is not offered falls back to See the example, script state survives a loop restart. Unreleased; the user's look pending. |
