# packages/core — Core project model (IR)

No code yet; this directory is planned for Phase 0. This file describes intent and conventions.

## Purpose

`@msm/core` owns the project model. It holds the IR types (`Project` → `Namespace[]` → `Element[]` + `Asset[]`), loads, saves and migrates projects, runs the command stack and drives the lowering pipeline. It knows nothing about specific Minecraft versions or element kinds; plugins and targets supply those.

## Contents (planned)

- `src/model/`: IR types (`Project`, `Element`, `Asset`, `ResourceLocation`).
- `src/io/`: project load/save/migrate for `msm.project.json` and `content/<namespace>/<kind-folder>/<path>.json`.
- `src/commands/`: command stack (Immer, RFC 6902 JSON patches, undo/redo).
- `src/registry/`: element kind registry, filled by plugins.
- `src/refs/`: reference index and explicit rename refactors.
- `src/lowering/`: pipeline driver (collect → lower against target → validate → hand `OutputFile[]` to exporters).
- `src/problems/`: problems model shared by validation and the app.
- `test/fixtures/`: golden files.

## Conventions

- Pure TypeScript (strict). No DOM, no Node `fs`: file access is injected through an interface so core runs in tests and in the renderer.
- Deterministic serialisation: sorted keys, 2-space indent, trailing newline. JSON only.
- Every public type is exported from `src/index.ts`.
- Golden-file tests live under `test/fixtures/`.
- Depends only on `@msm/plugin-api` and `@msm/schemas`.

## Do / Don't

- Do keep `formatVersion` migrators append-only; never edit a shipped migrator.
- Do treat renames as explicit refactors that rewrite references via schema knowledge.
- Don't know about Minecraft versions, pack formats or specific kinds.
- Don't depend on `packages/plugins`, `packages/exporters` or `packages/targets`.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/core test`
- `pnpm --filter @msm/core build`

## Read next

- [DESIGN §4 Core Project Model (IR)](../../docs/DESIGN.md#4-core-project-model-ir)
- [DESIGN §5 Project File Format](../../docs/DESIGN.md#5-project-file-format)
- [DESIGN §16 Testing Strategy](../../docs/DESIGN.md#16-testing-strategy)
- [ROADMAP, Phase 0](../../docs/ROADMAP.md)
