# packages/plugin-api — Public plugin API

`API_VERSION` 1.4.0, package version 1.4.0 (1.4.0, ADR 0049: `AudioStarterParameter` (`audio`, Ogg Vorbis `data:` URL or `null`); 1.3.0, ADR 0046: `FabricFacts.apiModrinth?: ModrinthFileFacts` for modpack exports; for app 1.1.0). 1.2.0 shipped with app 0.7.0 (tarball `msm-plugin-api-1.2.0.tgz` on the release; CHANGELOG dated 2026-11-06). 1.2.0 (ADR 0044): `ImageStarterParameter` (`image`, PNG `data:` URL or `null`). 1.1.0 (ADRs 0042, 0043): `TargetFacts.items?: ItemFacts` (`armorMaterials`), `ProjectStarter.creator?` (`group`, `blurb`), `SetStarterParameter` (`set`), `ElementMeta.creator?` (`flowId`, `setId`, `values`, `generatedId`); 1.0.0 also gained `ElementKind.defaultDataFor?` and `WorldgenFacts.noiseSettingsDefaultBlock?` (ADR 0036 D8). All additive: `^1.0.0` plugins load unchanged. Phase 7 (B152): `API_VERSION` 1.0.0 (ADR 0036): semver policy, `MaybePromise` returns on `lower`/`data`/`build`/`validate`, `TargetFacts` (plugin-facing, with `channel`) versus `Target` (hooks), `target` on template and bundle contexts, `supports?`, starter `parameters` and `BundleContext.values`, `MigrationChange.data`/`kind`, and a `tsup` build plus `pnpm pack` tarball. Before that, 0.8.0: `FabricFacts.gradle` (required), `Target.javaProject?: JavaProjectGenerator` (`JavaProjectInput`, `DefinitionInput`, `GeneratedFile`) and the documented `OutputFile.language` value `typescript` (ADR 0034) on top of 0.7.0: `Target.geckolib?: GeckolibFacts` (version, mod id, dependency, file name, URL, SHA-512, Modrinth version id; ADR 0030) on top of 0.6.0: `OutputFile.merge` (`tag`, `object`), `Exporter.options` (`ExporterOption`, boolean only) with `ExporterInput.options`, and `Target.fabric: FabricFacts` (incl. `minecraftDependency`) (ADR 0027) on top of 0.5.0: `ElementKind.registry`, `ProjectValidator` (`PluginContributions.validators`), `Target.dataVersion`, `Target.worldgen` (`featureSteps`; optional `biomeAttributes`, added within 0.5.0 without a bump) and the `structure`, `dimension`, `worldgen` data folders (ADR 0022) on top of the library contribution points `elementTemplates`, `projectStarters`, `examples` (`src/library.ts`; ADR 0020) on top of the Phase 2 surface (`OutputFile.language`, `Problem.range`, `Target.folders.data`; ADR 0017), IR types, `definePlugin` and shared path validation. Plugins declaring `^0.7.0` or older no longer load.

## Purpose

`@msm/plugin-api` defines the public TypeScript interfaces every plugin uses, built-in or third-party. Built-ins get no private hooks: whatever a built-in can do, a third-party plugin can do through this API. It also declares the shared IR types (`Json`, `ResourceLocation`, `Project`, `Namespace`, `Element`, `Asset`, `OutputFile`, `Problem`) because the interfaces need them; behaviour stays in `@msm/core` (ADR 0008).

## Contents

- `src/json.ts`, `src/model.ts`: JSON and IR types.
- `src/output.ts`, `src/problems.ts`: `OutputFile` (optional `schema` for the validation gate, `language` for text checks such as `mcfunction`, `merge` for files several elements contribute to), `OutputSink`, `Problem` (optional `file`, and `range` in UTF-16 offsets within `path`'s string or `file`), `ProblemReporter`.
- `src/target.ts`: `Target` (incl. `folders.resource: Record<ResourceFolderKey, string>`, `folders.data: Record<DataFolderKey, string>`, `dataVersion`, `fabric?: FabricFacts`, `worldgen: WorldgenFacts` with `featureSteps` and optional `biomeAttributes: BiomeAttributeFacts` (colour attributes, `skyColour`, `naturalMobSpawns`)), `PackFormat` (`{ major, minor }`), `MigrationReport`.
- `src/contributions.ts`: `ElementKind` (`defaultData`, `hiddenPaths`, `previewKind`, `registry`), `EditorContribution`, `Exporter` (`options?: ExporterOption[]`; `ExporterInput.meta`, `ExporterInput.options`), `Importer`, `Command`, `ProjectValidator` (`ValidationInput`, `ValidationRegistry`).
- `src/library.ts`: `TemplateContext`, `ElementTemplate`, `ContentBundle`, `BundleContext`, `ProjectStarter`, `ExampleProject` (host-interpreted; `Uint8Array` for asset bytes).
- `src/paths.ts`: `isProjectRelativePath`, `assertProjectRelativePath` (shared by core and app main).
- `src/plugin.ts`, `src/version.ts`, `src/async.ts`: `Plugin`, `definePlugin`, `API_VERSION`, `MaybePromise`.
- `tsup.config.ts`, `tsconfig.build.json`, `README.md`: the publishable build (`dist/`); `exports` stays on `src/` for the workspace, `publishConfig` points the tarball at `dist/`.
- `CHANGELOG.md`: every API change, with migration notes for breaking ones.

## Conventions

- Zero internal dependencies: no imports from other `@msm/*` packages (Biome rule plus `tools/check-deps`).
- Semver `apiVersion`; plugins declare a compatible range, which `@msm/core` evaluates.
- Every breaking change is a major bump plus a migration note in `CHANGELOG.md`.
- Interfaces only; no implementations except tiny helpers such as `definePlugin`.
- Exhaustive JSDoc on every exported symbol, because third-party authors read it.
- JSDoc examples are version-neutral (`mc-<version>`): check-deps flags Minecraft version literals, even in comments.
- Consumed from source in the monorepo; `pnpm --filter @msm/plugin-api build` and `pack:tarball` produce the published form.

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
