# packages/core — Core project model (IR)

Phase 0 code exists: model, serialisation, load/save, migrations, kind registry, command stack.

## Purpose

`@msm/core` owns the project model's behaviour: it loads, saves and migrates projects, runs the command stack and registers element kinds, and later drives the lowering pipeline. The IR types themselves are declared in `@msm/plugin-api` and re-exported here unchanged (ADR 0008). It knows nothing about specific Minecraft versions or element kinds; plugins and targets supply those.

## Contents

- `src/model/`: re-exported IR types plus `ResourceLocation` helpers.
- `src/serialise/`: deterministic JSON (`stableStringify`, `parseJson`).
- `src/fs/`: injected `ProjectFileSystem` interface, in-memory implementation, path checks.
- `src/io/`: layout, load, save, append-only migrators for `msm.project.json` and `content/<ns>/<kind-folder>/<path>.json`.
- `src/commands/`: command stack (Immer patches converted to RFC 6902 / RFC 6901 pointers, undo/redo).
- `src/registry/`: element kind registry and `registerPlugin` (semver `apiVersion` check).
- `src/problems/`: problem codes.
- Later: `src/refs/` (reference index, renames), `src/lowering/` (pipeline driver).
- `test/fixtures/`: golden projects; a nested `biome.json` keeps Biome off them.

## Conventions

- Pure TypeScript (strict). No DOM, no Node `fs`: file access is injected so core runs in tests and in the renderer (ADR 0007).
- Deterministic serialisation: sorted keys, 2-space indent, trailing newline. JSON only.
- Format v1 drops unknown fields on load; elements of unregistered kinds round-trip via `_unknown/<kind ns>/<kind path>`.
- Load skips invalid element files and save deletes `content/**/*.json` it did not write; callers must not save after error-severity load problems (DESIGN Open Questions).
- Every public symbol is exported from `src/index.ts`.
- Depends only on `@msm/plugin-api` today; the layer map also allows `@msm/schemas` when lowering needs it.

## Do / Don't

- Do keep `formatVersion` migrators append-only; never edit a shipped migrator.
- Do treat renames as explicit refactors that rewrite references via schema knowledge.
- Do declare new shared IR types in `@msm/plugin-api`, not here.
- Don't know about Minecraft versions, pack formats or specific kinds (check-deps flags version literals).
- Don't depend on `packages/plugins`, `packages/exporters` or `packages/targets`.

## Commands

- `pnpm --filter @msm/core test` (includes the byte-for-byte round-trip golden tests)
- `pnpm typecheck` and `pnpm lint` from the repository root

## Read next

- [DESIGN §4 Core Project Model (IR)](../../docs/DESIGN.md#4-core-project-model-ir)
- [DESIGN §5 Project File Format](../../docs/DESIGN.md#5-project-file-format)
- [DESIGN §16 Testing Strategy](../../docs/DESIGN.md#16-testing-strategy)
- [ADR 0008](../../docs/adr/0008-ir-types-in-plugin-api.md), [ROADMAP](../../docs/ROADMAP.md)
