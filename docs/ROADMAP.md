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
| 3 | Structures & Worldgen (v0.3) | `.nbt`/`.schem` import + 3D preview, jigsaw pools, structure sets, configured/placed features, biomes, noise settings forms, dimension types | Custom biome with a custom jigsaw structure generates in a 26.3 world | 5–7 wk |
| 4 | Engine Mod + Blocks/Items (v0.4) | `msm_runtime` mod, `msm/` definition loader, components/events v1, Block & Item Studios, Fabric content-jar exporter, managed test instance launch from app | A custom block with custom behaviour works in-game from one exported jar | 8–10 wk |
| 5 | Entities, Models, Animation (v0.5) | `msm:entity` + AI goal components, GeckoLib integration, Blockbench `.bbmodel` + animation import, spawn rules/eggs | A Blockbench-animated custom mob spawns, moves, attacks | 8–10 wk |
| 6 | Scripting & Eject (v0.6) | Rhino scripting, TS typings, Monaco script editor, export-as-Java-project | Script-driven behaviour runs; ejected project builds with Gradle and matches runtime behaviour | 6–8 wk |
| 7 | 1.0 | Third-party plugin loading, templates/wizards, second target (26.4 or whatever is current), docs site, auto-update | Two targets supported; external plugin works; release | 6–8 wk |

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
- [ ] First tagged release `v0.1.0` (blocked on the licence, DESIGN [Open Question 10](DESIGN.md#18-open-questions)).
- [ ] Signed Windows release (needs signing credentials from the user).

### Exit criteria

A user makes and installs a working texture plus custom model pack without touching JSON.

Status: code complete on 2026-11-04. The automated proxy passes (the golden-path e2e never opens the Raw JSON tab and the exported zip passes the schema gate); the in-game check and the first tagged release are pending.

### Estimate

4–6 weeks.

### Depends on

Phase 0.

## Phase 2 — Data Pack Studio (v0.2)

### Scope

Bring every common data pack file into the editor with validation and autocomplete, plus a first-class mcfunction editor. Design references: [Schema System (mcdoc)](DESIGN.md#6-schema-system-mcdoc), [Editors and UX](DESIGN.md#8-editors-and-ux), [Targets and Exporters](DESIGN.md#9-targets-and-exporters).

### Deliverables

- [ ] `@msm/plugin-datapack`: element kinds for recipes, loot tables, advancements, tags, predicates, item modifiers and functions ([ADR 0015](adr/0015-data-pack-element-model.md)).
- [ ] Generic schema-form kinds: enchantment, damage type, dimension type, chat type, jukebox song, banner pattern, painting variant, trim material, trim pattern and dialog.
- [ ] Loot tables and advancements: schema form plus templates (a bespoke Loot Table Studio is deferred to a later phase).
- [ ] Recipe Studio: curated crafting-grid view over the recipe element.
- [ ] Registry-backed autocomplete from mcmeta data held in `@msm/schemas`.
- [ ] mcfunction editor in Monaco with Spyglass diagnostics and completion, offline in the main process ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)).
- [ ] Reference index in `@msm/core` with rename refactor across elements and function text ([ADR 0016](adr/0016-reference-index-and-rename.md)).
- [ ] Command palette.
- [ ] `vanilla-packs` exporter: data pack `.zip` and combined export (both zips into a folder the user picks).
- [ ] "Install to world datapacks folder" action with a world picker.
- [ ] Golden tests for every new kind.
- [ ] Sample data pack (`fixtures/sample-datapack/`) with SHA-256 exporter goldens and a documented in-game check.
- [ ] Data pack golden-path e2e (recipe grid, function editor, data export, reopen).
- [ ] Spyglass mcdoc symbols for JSON and NBT inside commands, best effort ([ADR 0009](adr/0009-phase1-validation-gate.md) research note, narrowed by [ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)); `validateJson` stays the JSON gate and adopting the Spyglass JSON checker is DESIGN [Open Question 13](DESIGN.md#18-open-questions).
- [ ] Animated textures: extract and export `.png.mcmeta` animation metadata, and animate the preview ([ADR 0011](adr/0011-client-jar-asset-extraction.md)).
- [ ] Application menu commands for export, install, asset import and settings.
- [ ] Toolchain move to Node 24 and pnpm 12, moved into the first Phase 2 wave (DESIGN [Open Question 11](DESIGN.md#18-open-questions), resolved by [ADR 0017](adr/0017-phase2-toolchain.md)).
- [ ] Auto-update with `electron-updater` and the GitHub provider, if the user approves (DESIGN [Open Question 4](DESIGN.md#18-open-questions)). Excluded from Phase 2 work: waits on the user's licence and repository-visibility answers, as does release tagging; releases stay Windows only.

### Exit criteria

Parity with the Misode generators for the listed kinds; a data pack containing functions loads in 26.3 without errors.

### Estimate

4–6 weeks.

### Depends on

Phase 1 (form generator, export pipeline, validation gate).

## Phase 3 — Structures & Worldgen (v0.3)

### Scope

Import and preview structures, then author the worldgen chain that places them: jigsaw pools, structure sets, features, biomes, noise settings and dimension types. Design references: [Interop (Blockbench, NBT, Minecraft Installation)](DESIGN.md#13-interop-blockbench-nbt-minecraft-installation), [Editors and UX](DESIGN.md#8-editors-and-ux).

### Deliverables

- [ ] `@msm/interop` `nbt/`: read and write structure `.nbt` and Sponge `.schem` via prismarine-nbt.
- [ ] `@msm/plugin-structures`: structure, template pool, structure set and processor list kinds.
- [ ] 3D structure preview using deepslate.
- [ ] `@msm/plugin-worldgen`: configured and placed features, biomes, noise settings and dimension type kinds.
- [ ] Biome Studio: curated form with colour pickers and spawn lists.
- [ ] Jigsaw pool editor showing connections between pieces.
- [ ] Sample project with a custom biome and jigsaw structure used as a golden fixture.

### Exit criteria

A custom biome containing a custom jigsaw structure generates in a 26.3 world.

### Estimate

5–7 weeks.

### Depends on

Phase 2 (data pack export, tags, reference index).

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
- [ ] Templates and wizards (custom ore, custom sword, custom mob).
- [ ] Documentation site (user guide under `docs/guide/`).
- [ ] Auto-update (planned: `electron-updater` with the GitHub provider; moves to Phase 2 if the user approves, DESIGN [Open Question 4](DESIGN.md#18-open-questions)).
- [ ] Licence finalised and contribution guidelines published.

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

## Milestone Log

| Date | Milestone | Notes |
|---|---|---|
| 2026-11-04 | Phase 0 — Foundations complete | Monorepo, plugin-api 0.1.0, schemas, core, target mc-26.3, Electron shell, ADRs 0001–0008. 203 tests; headless smoke passes. Untagged: licence pending. |
| 2026-11-04 | Phase 1 code complete — pending in-game check and licence | plugin-api 0.2.0, `@msm/plugin-resourcepack` (six kinds), `validateJson`, `@msm/exporters` `vanilla-packs`, `@msm/interop` client-jar extraction, `@msm/targets`, Resource Pack Studio with forms, Monaco, deepslate preview, export and install; golden-path e2e and packaged smoke in CI; ADRs 0009–0013. Sizes: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB. Releases are Windows only. Untagged: licence pending. Manual in-game verification pending. |
