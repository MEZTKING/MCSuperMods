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
| 4 | Engine Mod + Blocks/Items (v0.4) | `msm_runtime` mod, `msm/` definition loader, components/events v1, Block & Item Studios, Fabric content-jar exporter, managed test instance launch from app | A custom block with custom behaviour works in-game from one exported jar | 8–10 wk |
| 5 | Entities, Models, Animation (v0.5) | `msm:entity` + AI goal components, GeckoLib integration, Blockbench `.bbmodel` + animation import, spawn rules/eggs | A Blockbench-animated custom mob spawns, moves, attacks | 8–10 wk |
| 6 | Scripting & Eject (v0.6) | Rhino scripting, TS typings, Monaco script editor, export-as-Java-project | Script-driven behaviour runs; ejected project builds with Gradle and matches runtime behaviour | 6–8 wk |
| 7 | 1.0 | Third-party plugin loading, templates/wizards, second target (26.4 or whatever is current), docs site (auto-update moved to Phase 2) | Two targets supported; external plugin works; release | 6–8 wk |

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
- [ ] Real ore starter: the Custom ore starter stays an emerald-ore reskin until Phase 4 adds `msm:block` ([ADR 0020](adr/0020-templates-starters-examples.md)).
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
- [ ] Remove the pnpm `minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml` once those versions are older than the release-age rule (one day). B83 removed `electron@45.2.2`; `electron-to-chromium@1.5.475` (eligible after 2026-11-04 23:03 UTC) and `lucide-react@1.68.0` (after 2026-11-05 06:11 UTC) remain; remove them and check `pnpm install --frozen-lockfile` in a later session.

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

Introduce the `msm_runtime` Fabric mod and the content jar, so projects can add new blocks and items with behaviour that vanilla packs cannot express. The phase opens with a one-week registry-freeze spike before any editor work. Design references: [Engine Mod (Runtime)](DESIGN.md#10-engine-mod-runtime), [Behaviour Model (Components and Events)](DESIGN.md#11-behaviour-model-components-and-events), [Targets and Exporters](DESIGN.md#9-targets-and-exporters).

### Deliverables

- [ ] **Week 1 — registry-freeze spike:** a throwaway `msm_runtime` that scans `msm/` in all mod containers at init, registers one block and one item from JSON, and runs one event. Result recorded as an ADR; if dynamic registration hits limits, re-plan around code generation (Tier 2).
- [ ] `engine-mod/`: Gradle (Kotlin DSL), Java 25, Fabric Loom 26.1+ non-remapping variant (verify at implementation), Fabric Loader + Fabric API for 26.3.
- [ ] `msm_runtime` loader: init-time scan of `msm/**/*.json`, driver classes `MsmBlock` and `MsmItem`.
- [ ] MSM mcdoc schemas for components and events v1 in `packages/schemas/mcdoc/msm/`, shared by app and runtime.
- [ ] Components v1: light, hardness, drops via loot, `on_interact`, `on_step`, redstone, food, tool tier, durability, use actions.
- [ ] Actions v1: `run_function`, `spawn_particle`, `set_block_state`, `give_item`, `play_sound`, `trigger_event`.
- [ ] `@msm/plugin-blocks-items`: `msm:block` and `msm:item` kinds lowering to vanilla files plus `msm/` definitions.
- [ ] Block Studio and Item Studio views.
- [ ] Real Custom ore starter on `msm:block` and `msm:item`, replacing the emerald-ore reskin in `@msm/plugin-library` ([ADR 0020](adr/0020-templates-starters-examples.md)).
- [ ] `@msm/exporters` `fabric-content-jar`: `assets/`, `data/`, `msm/`, `fabric.mod.json`, with `msm_runtime` nested by default and a "separate runtime" option.
- [ ] Managed Fabric test instance launched from the app ("Test in Minecraft").
- [ ] JUnit tests for definition parsing; Fabric GameTest for behaviour; kitchen-sink sample exported and loaded on a headless server in CI.

### Exit criteria

A custom block with custom behaviour works in-game from one exported jar.

### Estimate

8–10 weeks, including the one-week spike.

### Depends on

Phase 2 (mcfunction export, loot tables). Phase 3 is not required.

## Phase 5 — Entities, Models, Animation (v0.5)

### Scope

Custom mobs: entity definitions with AI goal components, Blockbench model and animation import, and GeckoLib rendering. Design references: [Behaviour Model (Components and Events)](DESIGN.md#11-behaviour-model-components-and-events), [Interop (Blockbench, NBT, Minecraft Installation)](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation), [Engine Mod (Runtime)](DESIGN.md#10-engine-mod-runtime).

### Deliverables

- [ ] `msm_runtime`: `MsmEntity` driver class and entity registration at init.
- [ ] Entity components: health, movement, AI goals subset, attack, animations.
- [ ] `msm:animated_model` component isolating GeckoLib 5.5+ (26.3 build: verify at implementation).
- [ ] `@msm/interop` `blockbench/`: `.bbmodel` import to Java block/item models and to GeckoLib geo + animation JSON, with format version check.
- [ ] `@msm/plugin-entities`: `msm:entity` kind, spawn rules and spawn eggs.
- [ ] `@msm/plugin-models-anim`: model and animation asset kinds with preview playback.
- [ ] Entity Studio view.
- [ ] Content-jar exporter nests GeckoLib only when the project uses animated entities.
- [ ] GameTest coverage for spawning, movement and attack.

### Exit criteria

A Blockbench-animated custom mob spawns, moves and attacks.

### Estimate

8–10 weeks.

### Depends on

Phase 4.

## Phase 6 — Scripting & Eject (v0.6)

### Scope

Open the two power-user escape hatches: Tier 1 TypeScript scripts run by Rhino inside the runtime, and Tier 2 export as a standalone Fabric Java project. Design references: [Scripting and Escape Hatches](DESIGN.md#12-scripting-and-escape-hatches), [Targets and Exporters](DESIGN.md#9-targets-and-exporters).

### Deliverables

- [ ] `msm_runtime` `scripting/`: Rhino (ES6 mode) embedded, script lifecycle and error reporting.
- [ ] Runtime script API v1 (`msm.events.on(...)` and friends).
- [ ] Generated `.d.ts` typings shipped with the app and written to `.msm/`.
- [ ] `@msm/plugin-scripting`: `msm:script` kind, esbuild transpilation to the ES2015 subset Rhino handles.
- [ ] Monaco script editor with typings and diagnostics.
- [ ] `@msm/exporters` `java-project`: one-way, deterministic Gradle project with generated Java and a README, no dependency on `msm_runtime`.
- [ ] CI check that the ejected kitchen-sink project builds with Gradle.
- [ ] Behaviour-parity GameTests run against both the runtime jar and the ejected build.

### Exit criteria

Script-driven behaviour runs in-game; the ejected project builds with Gradle and matches runtime behaviour.

### Estimate

6–8 weeks.

### Depends on

Phases 4 and 5.

## Phase 7 — 1.0

### Scope

Open the platform and harden it for release: third-party plugins, a second Minecraft target, templates, a documentation site and auto-update. Design references: [Plugin System](DESIGN.md#7-plugin-system), [Targets and Exporters](DESIGN.md#9-targets-and-exporters), [Open Questions](DESIGN.md#18-open-questions).

### Deliverables

- [ ] Third-party plugin loading from `~/.msm/plugins/` in a sandboxed context with a capability manifest.
- [ ] `@msm/plugin-api` 1.0 with `apiVersion` compatibility checks.
- [ ] `tools/new-plugin` scaffold and a sample external plugin.
- [ ] Second target package (26.4 or whatever is current) with migration hooks and an "upgrade project target" command.
- [ ] Templates and wizards (custom ore, custom sword, custom mob). The Phase 2 add-on delivered the template, starter and examples library ([ADR 0020](adr/0020-templates-starters-examples.md)); what remains is the wizards, the real `msm:block` ore starter replacing the emerald-ore reskin (Phase 4), and the custom sword and custom mob starters once Phases 4 and 5 provide their kinds.
- [ ] Documentation site (user guide under `docs/guide/`).
- [x] Auto-update: delivered in Phase 2 with `electron-updater` and the GitHub provider ([ADR 0018](adr/0018-auto-update.md)).
- [ ] Contribution guidelines published (the licence was settled as MIT on 2026-11-04).

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
- **AI assistant (user request, 2026-11-04)**: optional help from a large language model, starting with the Claude API using the user's own API key. Candidate uses: drafting elements from a description ("a ruby ore that drops 1–3 rubies"), explaining and fixing validation or mcfunction problems, writing and commenting functions, and suggesting recipes, loot tables and advancements. Design constraints: every change goes through the command stack as one undoable step and passes `validateJson` and the mcfunction checker before it is applied; the user reviews a diff first; the key is stored with Electron `safeStorage` and calls run in the main process; the feature is off by default and the app stays fully usable without it; the model id is chosen at implementation from the then-current Claude models (verify at implementation). Needs an ADR (privacy, cost display, offline behaviour, tool-use design) before work starts; may be pulled ahead of 1.0 if the user asks.

## Milestone Log

| Date | Milestone | Notes |
|---|---|---|
| 2026-11-04 | Phase 0 — Foundations complete | Monorepo, plugin-api 0.1.0, schemas, core, target mc-26.3, Electron shell, ADRs 0001–0008. 203 tests; headless smoke passes. Untagged: licence pending. |
| 2026-11-04 | Phase 1 code complete — pending in-game check and licence | plugin-api 0.2.0, `@msm/plugin-resourcepack` (six kinds), `validateJson`, `@msm/exporters` `vanilla-packs`, `@msm/interop` client-jar extraction, `@msm/targets`, Resource Pack Studio with forms, Monaco, deepslate preview, export and install; golden-path e2e and packaged smoke in CI; ADRs 0009–0013. Sizes: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB. Releases are Windows only. Untagged: licence pending. Manual in-game verification pending. |
| 2026-11-04 | Phase 2 code complete — pending in-game checks and first release | plugin-api 0.3.0, Node 24 and pnpm 12, `@msm/plugin-datapack` (14 kinds including eight tag kinds, plus ten schema-form kinds), `@msm/schemas/mcfunction` (offline Spyglass in main, with mcdoc symbols for JSON and NBT inside commands), reference index and one-step rename, data pack and combined export, install into a world, Recipe Studio, Tag editor, Function editor, command palette, animated texture preview, in-app auto-update; data pack golden-path e2e; ADRs 0014–0018. 1,037 tests (app 397, core 152, schemas 142, exporters 73, tools 60, datapack 57, plugin-api 44, mc-26.3 40, interop 32, resourcepack 28, targets aggregator 12). Sizes: `app.asar` 12.7 MB, renderer 5.7 MB, main `index.js` 266.2 kB (7.0 MB under `out/main`). Untagged: waiting on the user's first-release steps. Manual in-game checks (Phase 1 and Phase 2) pending. |
| 2026-11-04 | Phase 3 code complete — pending in-game check | v0.3.0. plugin-api 0.5.0 (`ProjectValidator`, `ElementKind.registry`, `Target.dataVersion`, `Target.worldgen`), `@msm/plugin-structures` (five kinds, deepslate NBT codec with our own SNBT printer, `.nbt` and Sponge `.schem` import and export) and `@msm/plugin-worldgen` (fourteen kinds), three worldgen tag kinds (52 kinds in all), ten project validators gating export, 99 templates, 11 starters and 56 examples, `fixtures/sample-worldgen/` with SHA-256 golden and chain walk, Structure, Template Pool, Biome and Placed Feature Studios, structure 3D preview and climate map, world names from `level.dat`, recent projects; e2e `worldgen-path` (seven specs); ADRs 0021–0023. Tests: (filled at close). Sizes: (filled at close). Untagged: the user pushes `v0.3.0`. Manual in-game checks (Phases 1–3) pending. |
