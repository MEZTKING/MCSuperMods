# packages/schemas — Schema system (mcdoc)

Phase 1 code complete: symbol-export parsing, version gating, `SchemaNode` normalisation with generics, tuples, primitive arrays, map key types and attribute tags, `validateJson` and the registry index (ADR 0009).

## Purpose

`@msm/schemas` turns vanilla-mcdoc (and later MSM mcdoc extensions) into MSM's own `SchemaNode` model that editors consume. It is the only package that will talk to Spyglass. It has no Spyglass runtime dependency yet: it consumes the mcdoc-cli symbol export that the target package vendors and the caller injects (ADR 0005). Phase 1 validates with our own `validateJson` over `SchemaNode`; Spyglass packages arrive in Phase 2 (ADR 0009).

## Contents

- `src/symbols/`: raw export types and `parseVanillaMcdocSymbols` (shape validation).
- `src/version/`: game-version comparison and `since`/`until` range checks.
- `src/form/schema-node.ts`: the `SchemaNode` model (struct, list, tuple, string, number, boolean, enum, literal, union, reference, dispatcher, any, unsupported); lists carry `primitiveArray`, `'*'` fields a `keyType`, nodes attribute `tags`.
- `src/form/normalise.ts`, `src/form/index-builder.ts`: `createSchemaIndex(symbols, { mcVersion })`, lazy and memoised; `template`/`concrete` generics instantiated with type bindings.
- `src/validate/`: `validateJson(value, node, options) -> SchemaProblem[]` (`schema.*` codes), `describeSchemaNode`.
- `src/registry/`: `createRegistryIndex` over mcmeta registries plus project ids (unknown ids are warnings).
- Later: `mcdoc/msm/` (MSM extensions, Phase 4), Spyglass checker (Phase 2).

## Conventions

- Spyglass types never leak past this package; export only our own model.
- Never read files or name a Minecraft version; data and `mcVersion` come from the target by injection.
- Version gating is mandatory: one vanilla-mcdoc tree spans many versions; filter types, fields, members and dispatcher entries by `since`/`until`.
- A map-like struct (`[string]: T`) is a field with key `'*'`, always optional.
- Dispatcher keys are unprefixed; `dispatch()` and the validator also accept `minecraft:`-prefixed keys. Static keywords are stored as `%unknown` / `%fallback`.
- An enum discriminator value with no dispatcher member (item model `empty`) is valid and adds no fields.
- Depends only on `@msm/plugin-api`. JSDoc examples stay version-neutral (check-deps).

## Do / Don't

- Do write a conformance test for every MSM mcdoc file once they exist.
- Do keep the Spyglass surface small so a fallback mcdoc reader stays possible.
- Don't hand-write JSON Schema duplicates of mcdoc definitions.
- Don't edit vendored data; `tools/sync-mcdoc` regenerates it in `packages/targets`.

## Commands

- `pnpm --filter @msm/schemas test`
- `pnpm --filter @msm/target-mc-26.3 test` (loads the real 26.3 export through this package)

## Read next

- [DESIGN §6 Schema System (mcdoc)](../../docs/DESIGN.md#6-schema-system-mcdoc)
- [DESIGN §11 Behaviour Model (Components and Events)](../../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [ADR 0005](../../docs/adr/0005-vanilla-mcdoc-pinning-and-loading.md), [ROADMAP](../../docs/ROADMAP.md)
