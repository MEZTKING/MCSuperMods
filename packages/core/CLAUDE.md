# packages/core — Core project model (IR)

Phase 2 code complete: model, serialisation, load/save with the `SaveManifest` (ADR 0012), migrations, kind registry, command stack with asset commands and coalesced value-level edits, the `lowerProject` driver, and the reference index with one-step `renameElement` (ADR 0016).

## Purpose

`@msm/core` owns the project model's behaviour: it loads, saves and migrates projects, runs the command stack and registers element kinds, and drives lowering (`lowerProject`). The IR types themselves are declared in `@msm/plugin-api` and re-exported here unchanged (ADR 0008). It knows nothing about specific Minecraft versions or element kinds; plugins and targets supply those.

## Contents

- `src/model/`: re-exported IR types plus `ResourceLocation` helpers.
- `src/serialise/`: deterministic JSON (`stableStringify`, `parseJson`).
- `src/fs/`: injected `ProjectFileSystem` interface, in-memory implementation, path checks.
- `src/io/`: layout, load (returns a `SaveManifest`), save (`createSaveManifest`; deletes only loaded files), append-only migrators for `msm.project.json` and `content/<ns>/<kind-folder>/<path>.json`.
- `src/commands/`: command stack (Immer patches as RFC 6902 / RFC 6901 pointers, undo/redo, `coalesce` keys within a time window); `commands.*` incl. `setElementValue`, `addAsset`, `removeAsset`, `renameElement(oldId, newId, references)` (id, string and key references, text ranges; one undo step).
- `src/registry/`: element kind registry and `registerPlugin` (semver `apiVersion` check).
- `src/problems/`: problem codes (incl. `refs.rename-conflict`).
- `src/lowering/`: `lowerProject` (unknown kind, thrown lowering and same-path conflicts become `lowering.*` error problems).
- `src/refs/`: `buildReferenceIndex(project, resolveSchema, textReferences?)` over `collectReferences` from `@msm/schemas` (`Reference` with `key?` for map keys, `range?` for text), `collectTextReferences` (exact id tokens in function lines, registry `''`), `normaliseReferenceId`.
- `test/fixtures/`: golden projects; the root `biome.json` excludes `**/test/fixtures`.

## Conventions

- Pure TypeScript (strict). No DOM, no Node `fs`: file access is injected so core runs in tests and in the renderer (ADR 0007).
- Deterministic serialisation: sorted keys, 2-space indent, trailing newline. JSON only.
- Format v1 drops unknown fields on load; elements of unregistered kinds round-trip via `_unknown/<kind ns>/<kind path>`.
- Load skips invalid element files (error problems with `Problem.file`); save deletes only files in the manifest and is never blocked (ADR 0012).
- Asset commands change only `Asset` records; byte moves (import, trash) belong to the app session.
- Every public symbol is exported from `src/index.ts`.
- Depends on `@msm/plugin-api` and `@msm/schemas` (the reference index uses `collectReferences`).
- A rename onto an existing id fails; the session reports `refs.rename-conflict` rather than throwing.

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
