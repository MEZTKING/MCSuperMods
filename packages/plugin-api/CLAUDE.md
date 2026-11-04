# packages/plugin-api — Public plugin API

`API_VERSION` 0.4.0: library contribution points `elementTemplates`, `projectStarters`, `examples` (`src/library.ts`; ADR 0020) on top of the Phase 2 surface (`OutputFile.language`, `Problem.range`, `Target.folders.data`; ADR 0017), IR types, `definePlugin` and shared path validation. Plugins declaring `^0.3.0` no longer load.

## Purpose

`@msm/plugin-api` defines the public TypeScript interfaces every plugin uses, built-in or third-party. Built-ins get no private hooks: whatever a built-in can do, a third-party plugin can do through this API. It also declares the shared IR types (`Json`, `ResourceLocation`, `Project`, `Namespace`, `Element`, `Asset`, `OutputFile`, `Problem`) because the interfaces need them; behaviour stays in `@msm/core` (ADR 0008).

## Contents

- `src/json.ts`, `src/model.ts`: JSON and IR types.
- `src/output.ts`, `src/problems.ts`: `OutputFile` (optional `schema` for the validation gate, `language` for text checks such as `mcfunction`), `OutputSink`, `Problem` (optional `file`, and `range` in UTF-16 offsets within `path`'s string or `file`), `ProblemReporter`.
- `src/target.ts`: `Target` (incl. `folders.resource: Record<ResourceFolderKey, string>` and `folders.data: Record<DataFolderKey, string>`), `PackFormat` (`{ major, minor }`), `MigrationReport`.
- `src/contributions.ts`: `ElementKind` (`defaultData`, `hiddenPaths`, `previewKind`), `EditorContribution`, `Exporter` (`ExporterInput.meta`), `Importer`, `Command`.
- `src/library.ts`: `TemplateContext`, `ElementTemplate`, `ContentBundle`, `BundleContext`, `ProjectStarter`, `ExampleProject` (host-interpreted; `Uint8Array` for asset bytes).
- `src/paths.ts`: `isProjectRelativePath`, `assertProjectRelativePath` (shared by core and app main).
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
- [ADR 0008](../../docs/adr/0008-ir-types-in-plugin-api.md), [ADR 0013](../../docs/adr/0013-phase1-toolchain-and-packaging.md), [ADR 0017](../../docs/adr/0017-phase2-toolchain.md), [ROADMAP, Phases 1 and 7](../../docs/ROADMAP.md)
