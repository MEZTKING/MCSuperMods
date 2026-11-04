# packages/plugin-api — Public plugin API

Phase 0 code exists: `apiVersion` 0.1.0 interfaces, IR types and `definePlugin`.

## Purpose

`@msm/plugin-api` defines the public TypeScript interfaces every plugin uses, built-in or third-party. Built-ins get no private hooks: whatever a built-in can do, a third-party plugin can do through this API. It also declares the shared IR types (`Json`, `ResourceLocation`, `Project`, `Namespace`, `Element`, `Asset`, `OutputFile`, `Problem`) because the interfaces need them; behaviour stays in `@msm/core` (ADR 0008).

## Contents

- `src/json.ts`, `src/model.ts`: JSON and IR types.
- `src/output.ts`, `src/problems.ts`: `OutputFile`, `OutputSink`, `Problem`, `ProblemReporter`.
- `src/target.ts`: `Target`, `PackFormat` (`{ major, minor }`), `MigrationReport`.
- `src/contributions.ts`: `ElementKind`, `EditorContribution`, `Exporter`, `Importer`, `Command`.
- `src/plugin.ts`, `src/version.ts`: `Plugin`, `definePlugin`, `API_VERSION`.
- `CHANGELOG.md`: every API change, with migration notes for breaking ones.

## Conventions

- Zero internal dependencies: no imports from other `@msm/*` packages (Biome rule plus `tools/check-deps`).
- Semver `apiVersion`; plugins declare a compatible range, which `@msm/core` evaluates.
- Every breaking change is a major bump plus a migration note in `CHANGELOG.md`.
- Interfaces only; no implementations except tiny helpers such as `definePlugin`.
- Exhaustive JSDoc on every exported symbol, because third-party authors read it.
- JSDoc examples are version-neutral (`mc-<version>`): check-deps flags Minecraft version literals, even in comments.
- Consumed from source in the monorepo; a tsup build is added only for publishing (Phase 7, ADR 0004).

## Do / Don't

- Do design for sandboxing: no Node or DOM types in the API surface (third-party plugins run sandboxed from Phase 7).
- Do keep the `Target` type as the documented home of every target field.
- Don't add anything only a built-in needs.
- Don't import from `core`, `schemas` or any other internal package.

## Commands

- `pnpm --filter @msm/plugin-api test` (runtime and type-level tests)
- `pnpm typecheck` and `pnpm lint` from the repository root

## Read next

- [DESIGN §7 Plugin System](../../docs/DESIGN.md#7-plugin-system)
- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [ADR 0008](../../docs/adr/0008-ir-types-in-plugin-api.md), [ROADMAP, Phase 0 and Phase 7](../../docs/ROADMAP.md)
