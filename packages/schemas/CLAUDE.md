# packages/schemas — Schema system (mcdoc)

Phase 2 code complete: `SchemaNode` normalisation (generics, tuples, primitive arrays, key types, attribute tags, mcdoc `indexed` types and generic dispatchers), `validateJson`, `collectReferences`, the registry index, the built-in `msm:function` extension and the offline Spyglass mcfunction service (ADRs 0009, 0014).

## Purpose

`@msm/schemas` turns vanilla-mcdoc (and later MSM mcdoc extensions) into MSM's own `SchemaNode` model that editors consume, and is the only package that talks to Spyglass. JSON is validated by our own `validateJson`; Spyglass checks mcfunction only, behind the `@msm/schemas/mcfunction` subpath (ADR 0014). The vendored symbol export, command tree, block states and registries are injected by the caller (ADR 0005).

## Contents

- `src/symbols/`, `src/version/`: raw export types, `parseVanillaMcdocSymbols`, `since`/`until` checks.
- `src/form/schema-node.ts`: the `SchemaNode` model; strings under `#[id(path=...)]` carry `idPath` (registry id `ns:<idPath>name`, value written unprefixed).
- `src/form/normalise.ts`, `index-builder.ts`: `createSchemaIndex(symbols, { mcVersion })`; `indexed` types and generic dispatchers become dispatchers; `resolveSchemaRef` handles `resource:<kind>`, `tag:<registry>` (instantiated `Tag<E>` accepting `#` refs) and extensions.
- `src/form/extensions.ts`: `BUILT_IN_EXTENSIONS` (`msm:function`: `{ lines: string[] }`) until MSM mcdoc arrives in Phase 4.
- `src/validate/`: `validateJson` (`schema.*` codes), `describeSchemaNode`, `collectReferences` (same walker; `{ path, registry, id, written?, key? }`).
- `src/registry/`: `createRegistryIndex` over mcmeta registries plus project ids (unknown ids are warnings; `#x` checks `tag/<registry>`).
- `src/mcfunction/`: `createMcfunctionService` (`service.ts`), mcdoc symbol loading (`mcdoc-symbols.ts`), MSM block-state checks (`block-states.ts`). Never re-exported from the root entry.

## Conventions

- Spyglass types never leak past this package; export only our own model. Runtime deps: `@spyglassmc/core`, `mcfunction`, `java-edition`, `mcdoc`, `json` 0.3.61, `nbt` 0.3.63 (catalog pins, ADR 0017).
- The mcfunction service is offline: never `je.initialize`, never fetch or read files; `ctx` is `{ loadedVersion, errorSource }`; call `AstNode.setParents` before completing.
- Never read files or name a Minecraft version; data and `mcVersion` come from the target by injection. Real-data tests live in the target packages.
- Version gating is mandatory: filter types, fields, members and dispatcher entries by `since`/`until`.
- A map-like struct (`[string]: T`) is a field with key `'*'`, always optional.
- Dispatcher keys are unprefixed; `minecraft:`-prefixed keys and ids are accepted too. Static keywords are `%unknown` / `%fallback`. A registered id with no dispatcher member adds no fields.
- Unknown fields under dispatcher spreads are reported unless a spread cannot be resolved to fields (DESIGN §9).
- Depends only on `@msm/plugin-api` and the Spyglass packages. JSDoc examples stay version-neutral (check-deps).

## Do / Don't

- Do write a conformance test for every MSM mcdoc file once they exist.
- Do keep the Spyglass surface small; only `src/mcfunction/` changes on a Spyglass upgrade.
- Don't hand-write JSON Schema duplicates of mcdoc definitions.
- Don't edit vendored data; `tools/sync-mcdoc` and `tools/sync-mcmeta` regenerate it in `packages/targets`.

## Commands

- `pnpm --filter @msm/schemas test`
- `pnpm --filter @msm/target-mc-26.3 test` (real 26.3 export, schema coverage and the mcfunction service over real data)

## Read next

- [DESIGN §6 Schema System (mcdoc)](../../docs/DESIGN.md#6-schema-system-mcdoc), [§9 Validation gate](../../docs/DESIGN.md#9-targets-and-exporters)
- [ADR 0005](../../docs/adr/0005-vanilla-mcdoc-pinning-and-loading.md), [ADR 0014](../../docs/adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0016](../../docs/adr/0016-reference-index-and-rename.md), [ROADMAP](../../docs/ROADMAP.md)
