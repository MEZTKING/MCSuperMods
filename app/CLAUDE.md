# app/ — Electron desktop shell

Phase 1 code complete: the Resource Pack Studio (Tailwind + Radix shell, schema-driven forms, lazy Monaco raw JSON, live Problems panel, deepslate preview, client-jar asset extraction in main, export and install, Playwright e2e, Windows-only electron-builder packaging). Save is never blocked (ADR 0012); errors block export only.

## Purpose

`@msm/app`: the Electron desktop shell that hosts editors, Studio views and previews over the `@msm/core` IR.

## Contents

- `src/main/` — Node side: `PlatformAdapter` implementation (`platform/`: scoped fs with symlink containment, settings, Minecraft assets, thumbnails, targets), zod-validated IPC (`ipc.ts`), menu, e2e hooks.
- `src/preload/` — typed IPC bridge; `src/shared/` — IPC contract and channel names (`msm:v1:<domain>:<op>`).
- `src/renderer/src/` — React 19: `session/` (core-hosted project session, asset trash), `forms/`, `studios/`, `preview/` (deepslate, lazy), `components/`, `store/` (Zustand).
- `test/` — Vitest (happy-dom component tests); `e2e/` — Playwright for Electron; `scripts/` — smoke runners; `electron-builder.yml` — packaging.

## Conventions

- No business logic in the app: it lives in `@msm/core` and plugins.
- All OS access goes through the `PlatformAdapter` interface (keeps a Tauri port possible).
- IPC is typed and versioned; binary payloads are `Uint8Array`.
- Lazy-load Monaco and the 3D preview; budgets in `tools/check-size` (DESIGN §14).
- CSP: scripts `'self'` only; `style-src 'unsafe-inline'` for Monaco/Radix; `img-src data:` for thumbnails.
- Asset removal moves bytes to `.msm/trash/` so undo restores them; the trash empties on open/create.
- Releases are Windows only (NSIS x64, unsigned); the Linux `dir` build is for verification only.
- British English in UI text and docs; no emojis. Accessibility: keyboard navigation, labelled controls.

## Do / Don't

- Do keep Studio views thin over the IR; Raw JSON and Studio edit the same element.
- Don't import from `packages/plugins/*` internals; go only through the plugin registry.
- Don't touch Minecraft assets outside the extraction cache (`~/.msm/cache/assets/<version>/`, ADR 0011).

## Commands

- `pnpm dev`, `pnpm --filter @msm/app test` (from the repository root).
- `pnpm --filter @msm/app smoke | e2e | dist:dir | smoke:packaged | dist` (headless: `xvfb-run -a`).
- `node tools/check-size/index.ts` after `pnpm build` and `dist:dir`.
- Env: `MSM_HOME` (settings and cache root), `MSM_SMOKE=1`, `MSM_E2E_PROJECT_DIR`, `MSM_E2E_OUT_DIR`, `MSM_E2E_PICK_FILES`.

## Read next

- [8. Editors and UX](../docs/DESIGN.md#8-editors-and-ux), [13. Interop](../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [14. Tech Stack](../docs/DESIGN.md#14-tech-stack), [ADR 0013](../docs/adr/0013-phase1-toolchain-and-packaging.md)
- ROADMAP: Phase 1 — Resource Pack Studio, Phase 2 — Data Pack Studio (`../docs/ROADMAP.md`)
