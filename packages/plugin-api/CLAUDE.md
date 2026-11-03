# packages/plugin-api — Public plugin API

No code yet; this directory is planned for Phase 0. This file describes intent and conventions.

## Purpose

`@msm/plugin-api` defines the public TypeScript interfaces every plugin uses, built-in or third-party. Built-ins get no private hooks: whatever a built-in can do, a third-party plugin can do through this API.

## Contents (planned)

- `src/plugin.ts`: `Plugin`, `definePlugin({ id, apiVersion, contributes })`.
- `src/contributions.ts`: `ElementKind`, `EditorContribution`, `Exporter`, `Target`, `Importer`, `Command`.
- `src/output.ts`: `OutputFile`.
- `src/problems.ts`: `ProblemReporter`.
- `CHANGELOG.md`: every API change, with migration notes for breaking ones.

## Conventions

- Zero internal dependencies: this package imports nothing from other `@msm/*` packages.
- Semver `apiVersion`; plugins declare a compatible range.
- Every breaking change is a major bump plus a migration note in `CHANGELOG.md`.
- Interfaces only; no implementations except tiny helpers such as `definePlugin`.
- Exhaustive JSDoc on every exported symbol, because third-party authors read it.
- TypeScript strict.

## Do / Don't

- Do design for sandboxing: no Node or DOM types in the API surface (third-party plugins run sandboxed from Phase 7).
- Do keep the `Target` type as the documented home of every target field.
- Don't add anything only a built-in needs.
- Don't import from `core`, `schemas` or any other internal package.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/plugin-api build`
- `pnpm --filter @msm/plugin-api test` (type-level tests)

## Read next

- [DESIGN §7 Plugin System](../../docs/DESIGN.md#7-plugin-system)
- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [ROADMAP, Phase 0 and Phase 7](../../docs/ROADMAP.md)
