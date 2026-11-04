# app/ — Electron desktop shell

Phase 0 shell implemented (project new/open/save, element list, raw JSON, undo/redo, headless smoke via `pnpm --filter @msm/app smoke`). Phase 1 adds the Resource Pack Studio: Tailwind + Radix UI, schema-driven forms, Monaco raw JSON, live Problems panel, deepslate preview, client-jar asset extraction in main, export and install, Playwright e2e and electron-builder packaging. Save is never blocked from Phase 1 (ADR 0012); errors block export only.

## Purpose

`@msm/app`: the Electron desktop shell that hosts editors, Studio views and previews over the `@msm/core` IR.

## Contents (planned)

- `main/` — Node side: filesystem, process spawning (Java/Gradle), zip, the `PlatformAdapter` implementation.
- `preload/` — typed IPC bridge between main and renderer.
- `renderer/` — React 19 + TypeScript strict; Zustand for UI state; Radix primitives + Tailwind; Monaco Editor (lazy); deepslate preview (ADR 0010); Studio views; schema-driven forms.

## Conventions

- No business logic in the app: it lives in `@msm/core` and plugins.
- All OS access goes through the `PlatformAdapter` interface (keeps a Tauri port possible).
- IPC is typed and versioned.
- Lazy-load Monaco and the 3D preview to respect the bundle budget.
- Accessibility basics: full keyboard navigation, labelled controls.
- British English in UI text and docs; no emojis.
- Every session: append an entry to `docs/DEVLOG.md` (`## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next).

## Do / Don't

- Do keep Studio views thin over the IR; Raw JSON and Studio edit the same element.
- Don't import from `packages/plugins/*` internals; go only through the plugin registry.
- Don't touch Minecraft assets outside the extraction cache (`~/.msm/cache/assets/<version>/`, ADR 0011).

## Commands (planned)

- `pnpm dev` — run the app with HMR (electron-vite).
- `pnpm build:app` — package with electron-builder.
- `pnpm test:e2e` — Playwright-for-Electron smoke tests.

## Read next

- [8. Editors and UX](../docs/DESIGN.md#8-editors-and-ux)
- [13. Interop](../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [14. Tech Stack](../docs/DESIGN.md#14-tech-stack)
- ROADMAP: Phase 0 — Foundations, Phase 1 — Resource Pack Studio (`../docs/ROADMAP.md`)
