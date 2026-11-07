# MCSuperMods Roadmap

This is the phased delivery plan for MCSuperMods (MSM). The orchestrator updates the checklists and the [Milestone Log](#milestone-log) at each milestone. Architecture and rationale live in [DESIGN.md](DESIGN.md); this file only says what ships and when.

## Principles

- **Ship small.** Every phase ends in a tagged, installable release that a real user can do something useful with.
- **MVP is resource packs.** Phase 1 (v0.1) is a Resource Pack Studio only. Data packs, worldgen and the engine mod follow once the core, schema and export pipeline are proven on the simplest content layer.
- **Each phase is usable on its own.** No phase depends on a later one to deliver value; unfinished features stay behind a flag rather than shipping half-built.
- **N / N-1 version policy.** We support the current Minecraft Java release (26.3) and the previous one (26.2). Snapshots are best-effort. Version facts live only in `packages/targets` (see [Targets and Exporters](DESIGN.md#9-targets-and-exporters)).
- **Estimates are focused solo-dev weeks with AI assistance.** Double them for part-time work. They are planning aids, not commitments.
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
- [ ] User decisions (defaults stand unless vetoed): deepslate's NBT module instead of `prismarine-nbt`; structure templates stored as JSON elements; the noise-sampled worldgen preview deferred to reserve brief B84 (DESIGN [Open Question 15](DESIGN.md#18-open-questions)); `minecraft:dimension_type` stays in the data pack plugin; the three registries new in 26.3 (`block_state_provider`, `material_condition`, `material_rule`) ship as schema-form kinds.

Reserve, unscheduled: B84, a noise-sampled biome and terrain map from vanilla worldgen data extracted from the user's client jar, only if the user asks for it after the in-game check ([ADR 0023](adr/0023-structure-and-climate-previews.md)).

### Phase 3 follow-ups

Known gaps of the v0.3 design; none blocks the Phase 3 exit criterion.

- [ ] Noise-sampled biome and terrain preview (reserve brief B84; DESIGN [Open Question 15](DESIGN.md#18-open-questions)).
- [ ] Editing structure blocks inside the app (v0.3 edits size, palette entries and jigsaws; blocks are edited in-game with a structure block and re-imported).
- [ ] Random palettes beyond the first (an imported template with several `palettes` keeps only the first).
- [x] Real ore starter: the Custom ore starter is a real `msm:block` ruby ore since Phase 4 (B98; [ADR 0020](adr/0020-templates-starters-examples.md)).
- [ ] Go to definition from the Biome Studio's "Used in" list and the other Studio id lists (today only form fields, the textarea editor and Monaco have it).
- [ ] Gallery entries for the worldgen starters: `custom_biome`, `jigsaw_structure` and `worldgen_pack` are in the New project dialog and under `examples/starters/`, but not in Help → Examples….
- [ ] Full-cube culling in the structure view: deepslate draws every face of neighbouring blocks, so large templates render slowly.
- [ ] `#[id(tags="implicit")]` support in `@msm/schemas`, so the ore vein template can use a block tag rule instead of `block_match`.

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
3. Both plugins' validators report zero errors, and no unplaced structure, unreachable biome or unselectable preset, on the fixture; a copy with one placed feature moved to another step reports `worldgen.feature-order`.
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
- [ ] Client render check in CI (reserve brief B123): a Fabric client GameTest or `runClient` under `xvfb` that spawns the sample mob and screenshots it; the session container has no OpenGL or Vulkan backend, so it needs another runner.
- [ ] GeckoLib items and armour (animated item models), and mobs without a GeckoLib model (a vanilla-model fallback) if users ask.
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
- [ ] Persistent script data (reserve brief B144): per-entity `entity.data` in NBT and a per-script `msm.storage` saved with the world; needs an ADR 0032 amendment and a world-save GameTest.
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
- Vendored target data outside the asar (was B166): `extraResources` per target package, read from `process.resourcesPath` when packaged; brings the asar budget back to 25 MB. Only when the asar nears its 32 MB budget or the user asks.
- Dimensions a beginner can enter (user idea, 2026-11-06, left for later): a "Dimension" Creator flow (biomes, sky, terrain style) with a travel item built from a function, or a real custom portal block (new runtime code, GameTests and parity tests).
- Plugin exporters in File > More Exports (the palette and options are done); the 26.3 mcdoc re-pin to the 26.4 ref for one shared tree; a plugin marketplace (an idea).

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
- **More gear and content types** (deferred from [ADR 0044](adr/0044-gear-weapons-and-consumables.md) D8): trident-style throwables and custom projectile entities (need a projectile entity and renderer), custom status effects (a code registry needing a script tick hook), armour trim patterns (per-layer textures), banner patterns, a glider flow.
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
