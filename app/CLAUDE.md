# app/ — Electron desktop shell

Phase 2 code complete: Resource Pack Studio plus Data Pack Studio (Recipe Studio, Tag editor, Function editor with live Spyglass problems and completion, command palette, references and F2 rename, data/combined export, world install), animated texture preview and in-app auto-update (ADR 0018). Save is never blocked (ADR 0012); errors block export only.

## Purpose

`@msm/app`: the Electron desktop shell that hosts editors, Studio views and previews over the `@msm/core` IR.

## Contents

- `src/main/` — Node side: `PlatformAdapter` implementation (`platform/`: scoped fs with symlink containment, settings incl. `updates.autoCheck`, Minecraft assets, worlds and data pack install, export folder writes, thumbnails, targets, `mcfunction.ts` broker over `@msm/schemas/mcfunction` with mcdoc symbols, loaded lazily), zod-validated IPC (`ipc.ts`), menu, `updater.ts` (electron-updater behind `AutoUpdaterLike`, lazy chunk), e2e hooks.
- `src/preload/` — typed IPC bridge; `src/shared/` — IPC contract, channel names (`msm:v1:<domain>:<op>`), `MENU_COMMANDS`, `VENDORED_KEYS`.
- `src/renderer/src/` — React 19: `session/` (core-hosted project session, mcfunction problems, references), `forms/`, `studios/` (RecipeStudio, TagStudio, FunctionEditor, templates), `components/` (CommandPalette, WorldPickerDialog, RenameElementDialog, UsagesDialog, UpdateBanner, `function-editor/`, `json-editor/`), `commands/`, `preview/` (deepslate, lazy), `store/` (Zustand).
- `test/` — Vitest (happy-dom); `e2e/` — Playwright specs `smoke`, `golden-path`, `datapack-path`; `scripts/` — smoke runners; `electron-builder.yml` — packaging and GitHub publish (draft).

## Conventions

- No business logic in the app: it lives in `@msm/core` and plugins.
- All OS access goes through the `PlatformAdapter` interface (keeps a Tauri port possible).
- IPC is typed and versioned; binary payloads are `Uint8Array`.
- Spyglass runs only in main; Biome forbids `@spyglassmc/*` and `@msm/schemas/mcfunction` in the renderer.
- Both Monaco editors bind through `bindControlledModel` (`json-editor/controlled-model.ts`): ignore the editor's own echoes, apply external changes with `pushEditOperations`.
- Lazy-load Monaco and the 3D preview; budgets in `tools/check-size` (DESIGN §14).
- CSP: scripts `'self'` only; `style-src 'unsafe-inline'` for Monaco/Radix; `img-src data:` for thumbnails.
- Asset removal moves bytes to `.msm/trash/` so undo restores them; the trash empties on open/create.
- Releases are Windows only (NSIS x64, unsigned); the updater is active only when packaged on Windows outside test runs.
- British English in UI text and docs; no emojis. Accessibility: keyboard navigation, labelled controls.

## Do / Don't

- Do keep Studio views thin over the IR; Raw JSON and Studio edit the same element.
- Don't import from `packages/plugins/*` internals; go only through the plugin registry.
- Don't hard-code version facts (recipe categories, ids); read them from the schema.
- Don't touch Minecraft assets outside the extraction cache (`~/.msm/cache/assets/<version>/`, ADR 0011).
- Known gaps (ROADMAP Phase 2 follow-ups): go to definition from the Monaco caret, column-level problem navigation, per-pack export gating, F2 in Monaco on Windows.

## Commands

- `pnpm dev`, `pnpm --filter @msm/app test` (from the repository root).
- `pnpm --filter @msm/app smoke | e2e | dist:dir | smoke:packaged | dist` (headless: `xvfb-run -a`).
- `node tools/check-size/index.ts` after `pnpm build` and `dist:dir`.
- Env: `MSM_HOME` (settings and cache root), `MSM_SMOKE=1`, `MSM_E2E_PROJECT_DIR`, `MSM_E2E_OUT_DIR`, `MSM_E2E_PICK_FILES` (any `MSM_E2E_*` disables the updater).

## Read next

- [8. Editors and UX](../docs/DESIGN.md#8-editors-and-ux), [13. Interop](../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [14. Tech Stack](../docs/DESIGN.md#14-tech-stack), [ADR 0014](../docs/adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0018](../docs/adr/0018-auto-update.md)
- ROADMAP: Phase 2 — Data Pack Studio and its follow-ups (`../docs/ROADMAP.md`)
