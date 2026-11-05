# app/ — Electron desktop shell

Phase 2 code complete: Resource Pack Studio plus Data Pack Studio (Recipe Studio, Tag editor, Function editor with live Spyglass problems and completion, command palette, references and F2 rename, data/combined export, world install), animated texture preview and in-app auto-update (ADR 0018). Launcher add-on (ADR 0019): packs install into the selected game location (official folder, Prism/MultiMC/PolyMC or CurseForge instance) and preview assets come from any launcher's jar store. Library add-on (ADR 0020): New project dialog with starters, Help > Examples gallery (open as new project or copy in one undo step), grouped template picker with filter, read-only Notes callout from `meta.notes`. Phase 3 (ADRs 0021–0023): File > Import Structure… and More Exports (.nbt, .schem), plugin validators in the debounced pass, sidebar "Worldgen" and "Structures" groups, Structure and Template Pool Studios (`studios/structures/`, connections), Biome and Placed Feature Studios (`studios/worldgen/`, colour pickers, steps from `target.worldgen`), structure 3D preview and climate map; user guide pages `docs/guide/structures.md`, `worldgen.md`. Phase 4 (ADRs 0025–0027): Block and Item Studios (`studios/blocks-items/`), File > "Export Fabric Mod Jar…" (`ExportFabricJarDialog`, option "Separate runtime (for modpacks)"), `msm:block`/`msm:item` ids in the registry index (block items too); guide `docs/guide/blocks-and-items.md`. Save is never blocked (ADR 0012); errors block export only.

## Purpose

`@msm/app`: the Electron desktop shell that hosts editors, Studio views and previews over the `@msm/core` IR.

## Contents

- `src/main/` — Node side: `PlatformAdapter` implementation (`platform/`: scoped fs with symlink containment, settings incl. `updates.autoCheck`, `launchers` (manual Prism/MultiMC/CurseForge roots) and `installTarget` (`GameLocationRef` or `null` = official), `locations.ts` resolver (discovery via `@msm/interop`, selected location, `targetMissing` fallback, version-mismatch warnings), Minecraft assets, worlds and pack install into the selected `gameDir`, export folder writes, `runtime-jar.ts` (the `msm_runtime` jar: packaged `resources/runtime/msm_runtime.jar`, from source the newest `engine-mod/build/libs/` jar), thumbnails, targets, `mcfunction.ts` broker over `@msm/schemas/mcfunction` with mcdoc symbols, loaded lazily), zod-validated IPC (`ipc.ts`), menu, `updater.ts` (electron-updater behind `AutoUpdaterLike`, lazy chunk), e2e hooks.
- `src/preload/` — typed IPC bridge; `src/shared/` — IPC contract, channel names (`msm:v1:<domain>:<op>`, incl. `minecraft:listLocations`, `exports:runtimeJar`), `MENU_COMMANDS`, `VENDORED_KEYS`.
- `src/renderer/src/` — React 19: `session/` (core-hosted project session: `library` from plugin contributions, `newProject({ starter | bundle })`, `addBundle`; mcfunction problems, references), `forms/`, `studios/` (RecipeStudio, TagStudio, FunctionEditor, `templates.ts`: host logic only, merging plugin templates and the generic `kind:<id>` fallback), `components/` (NewProjectDialog, ExamplesDialog, NewElementDialog, CommandPalette, SettingsDialog "Game locations", Toolbar install target and "Change target" submenu, `install-target.ts`, WorldPickerDialog, RenameElementDialog, UsagesDialog, UpdateBanner, `function-editor/`, `json-editor/`), `commands/`, `session/importers.ts` (plugin importers by extension; structures via `importStructureFile` with the target data version), `session/validator-problems.ts` (plugin validators, block export), `studios/blocks-items/` (BlockStudio, ItemStudio, EventsEditor), `components/ExportFabricJarDialog.tsx` (generic exporter options), `studios/studio-registry.ts` (new Studios go in `studios/<area>/studios.tsx`, never in `ElementForm.tsx`; `structures/` reaches host actions through `StructureStudioHostContext`), `preview/` (deepslate, lazy; `structure` 3D mode, 2D `climate_map`), `store/` (Zustand).
- `test/` — Vitest (happy-dom); `e2e/` — Playwright specs `smoke`, `golden-path`, `datapack-path`, `launchers-path`, `library-path`, `recent-path`, `worldgen-path`; `scripts/` — smoke runners, `stage-runtime.mjs` (copies the runtime jar to `build/runtime/msm_runtime.jar` for `dist`/`dist:dir`); `electron-builder.yml` — packaging (`extraResources` `runtime/msm_runtime.jar`) and GitHub publish (draft).

## Conventions

- No business logic in the app: it lives in `@msm/core` and plugins.
- All OS access goes through the `PlatformAdapter` interface (keeps a Tauri port possible).
- IPC is typed and versioned; binary payloads are `Uint8Array`.
- Spyglass runs only in main; Biome forbids `@spyglassmc/*` and `@msm/schemas/mcfunction` in the renderer.
- Both Monaco editors bind through `bindControlledModel` (`json-editor/controlled-model.ts`): ignore the editor's own echoes, apply external changes with `pushEditOperations`.
- Lazy-load Monaco and the 3D preview; budgets in `tools/check-size` (DESIGN §14).
- CSP: scripts `'self'` only; `style-src 'unsafe-inline'` for Monaco/Radix; `img-src data:` for thumbnails.
- Game locations: installs write only inside the selected `gameDir` (real-path containment: game dir in instance, instance in instances root); `location.game-dir-missing` blocks install, version mismatch only warns. Launcher path and file-format facts stay in `@msm/interop` `launchers/`.
- Asset removal moves bytes to `.msm/trash/` so undo restores them; the trash empties on open/create.
- Releases are Windows only (NSIS x64, unsigned); the updater is active only when packaged on Windows outside test runs.
- British English in UI text and docs; no emojis. Accessibility: keyboard navigation, labelled controls.

## Do / Don't

- Do keep Studio views thin over the IR; Raw JSON and Studio edit the same element.
- Don't import from `packages/plugins/*` internals; go only through the plugin registry.
- Don't add template, starter or example content here: it belongs in the plugins (ADR 0020).
- Don't hard-code version facts (recipe categories, ids); read them from the schema.
- Don't touch Minecraft assets outside the extraction cache (`~/.msm/cache/assets/<version>/`, ADR 0011).
- Known gaps: F2 in Monaco on Windows (unchecked); no noise-sampled worldgen preview; structure blocks are not editable in-app; only the first random palette is read.
- UI labels named in `docs/guide/` must match the code; update the guide when one changes.

## Commands

- `pnpm dev`, `pnpm --filter @msm/app test` (from the repository root).
- `pnpm --filter @msm/app smoke | e2e | dist:dir | smoke:packaged | dist` (headless: `xvfb-run -a`).
- `node tools/check-size/index.ts` after `pnpm build` and `dist:dir`.
- Env: `MSM_HOME` (settings and cache root), `MSM_SMOKE=1`, `MSM_E2E_PROJECT_DIR`, `MSM_E2E_OUT_DIR`, `MSM_E2E_PICK_FILES` (any `MSM_E2E_*` disables the updater).

## Read next

- [8. Editors and UX](../docs/DESIGN.md#8-editors-and-ux), [13. Interop](../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [14. Tech Stack](../docs/DESIGN.md#14-tech-stack), [ADR 0014](../docs/adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0018](../docs/adr/0018-auto-update.md), [ADR 0019](../docs/adr/0019-game-locations-launcher-instances.md), [ADR 0020](../docs/adr/0020-templates-starters-examples.md)
- ROADMAP: Phase 2 — Data Pack Studio and its follow-ups (`../docs/ROADMAP.md`)
