# ADR 0008: Shared IR types live in @msm/plugin-api; behaviour stays in @msm/core

## Context

DESIGN placed the IR types in `@msm/core` ([Core Project Model](../DESIGN.md#4-core-project-model-ir)). But public plugin interfaces need them: `ElementKind.lower(element, target)` takes an `Element`, and `Target.migrateFrom(previous, project)` takes a `Project`. `@msm/plugin-api` must have no internal dependencies ([Dependency direction](../DESIGN.md#15-repository-layout)), so it cannot import them from core.

## Decision

- The shared IR **types** (`Json`, `ResourceLocation`, `Project`, `Namespace`, `Element`, `ElementMeta`, `Asset`, `OutputFile`, `Problem`) are declared in `@msm/plugin-api`.
- `@msm/core` re-exports them unchanged and owns all **behaviour**: serialisation, load and save, migrators, commands, the element kind registry and plugin registration.
- The `Target` type in `@msm/plugin-api` is the documented home of every target field. It differs from the first DESIGN sketch: `packFormats` holds `{ major, minor }` objects, `mcdocRef` (a vanilla-mcdoc commit sha, ADR 0005) replaces `mcdocTag`, and `fabric` and `geckolib` are optional until Phases 4 and 5. DESIGN [Targets](../DESIGN.md#9-targets-and-exporters) is updated to match.
- `@msm/core` depends only on `@msm/plugin-api` in Phase 0. The layer map still allows it to depend on `@msm/schemas` when lowering and validation need it.

## Consequences

- Plugins and targets type-check against the API package alone, which matters for third-party plugins from Phase 7.
- Every change to an IR type is an API change, versioned through `apiVersion` and recorded in the plugin-api `CHANGELOG.md`.
- Code inside the monorepo imports IR types from `@msm/core` or `@msm/plugin-api`; both resolve to the same declarations.

## Status

Accepted (2026-11-04).
