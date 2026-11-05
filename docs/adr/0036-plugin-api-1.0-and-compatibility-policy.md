# ADR 0036: Plugin API 1.0.0 and the compatibility policy

## Context

`@msm/plugin-api` is at 0.8.0 ([ADR 0034](0034-plugin-api-0.8.md)); every 0.x minor has been breaking for caret ranges, and `@msm/core` already refuses a plugin whose `apiVersion` range excludes `API_VERSION` (`registerPlugin`, `PluginCompatibilityError`). Phase 7 opens the API to third parties ([ADR 0035](0035-plugin-sandbox-and-capability-manifest.md)), adds a second target with migration ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md)) and wizards ([ADR 0040](0040-wizards-as-parameterised-starters.md)), and must publish the package so external plugins can compile against it ([ADR 0004](0004-phase0-toolchain.md) deferred "a tsup build" to Phase 7). Checked 2026-11-05: `tsup` 9.0.0 and `esbuild` 0.28.2 are current on npm; `semver` 7.8.6 is already in the catalog; the library tests run every starter and example for every target in `builtInTargets`, and templates, starters and examples receive no target today (`TemplateContext`, `BundleContext`).

## Decision

**D1. Version 1.0.0 and the policy.** `API_VERSION` is `1.0.0`. From 1.0.0 the package follows semver as plugin authors expect: 1.x releases only add optional fields and new contribution points; a change that removes or narrows anything is 2.0.0 with a migration note; a deprecated member stays for at least one minor release and is marked `@deprecated` with its replacement. Built-in plugins declare `^1.0.0` and `tools/new-plugin` scaffolds `^1.0.0`. The host (`registerPlugin`) keeps the semver check and reports `Plugin <id> requires plugin API <range>, but this build provides <version>`; for external plugins the manifest's `apiVersion` is checked before any plugin code runs ([ADR 0035](0035-plugin-sandbox-and-capability-manifest.md) D2). `CHANGELOG.md` gains the 1.0.0 entry with every change below and the migration notes from 0.8.0.

**D2. `MaybePromise` on the four synchronous contribution functions.** `ElementKind.lower`, `ElementTemplate.data`, `ProjectStarter.build`, `ExampleProject.build` and `ProjectValidator.validate` return `T | Promise<T>` (type `MaybePromise<T>` exported from the package). Built-ins keep returning values; sandboxed plugins return Promises through the proxy. `@msm/core` adds `lowerProjectAsync` (awaits every `lower`) next to the synchronous `lowerProject`, which reports a Promise result as `lowering.async-not-supported`; the app's session uses the async driver.

**D3. `TargetFacts` and `Target`.** The data fields of a target move to `TargetFacts` (`id`, `mcVersion`, `channel`, `java`, `packFormats`, `mcdocRef`, `mcmetaRef`, `folders`, `dataVersion`, `worldgen`, `fabric?`, `geckolib?`); `Target extends TargetFacts` adds the hooks `migrateFrom?` and `javaProject?`. Every plugin-facing function (`lower`, `validate`, exporters, templates) receives a `TargetFacts`; hosts and exporters keep `Target`. New: `TargetFacts.channel: 'release' | 'snapshot'` (snapshot targets are shown with a badge and are never the default for new projects).

**D4. Targets reach the library.** `TemplateContext.target: TargetFacts` and `BundleContext.target: TargetFacts`, so a template or bundle can read facts (`target.worldgen`, `target.geckolib`). Optional `supports?(target: TargetFacts): boolean` on `ElementTemplate`, `ProjectStarter` and `ExampleProject`: the host hides entries that return `false` for the project's target, and the library tests validate an entry only for the targets it supports (an entry without `supports` must validate for every built-in target). This is the version-neutral way to keep content that needs a fact some target lacks (for example the Custom mob starter on a target without GeckoLib), since version literals are forbidden outside `packages/targets`.

**D5. Starter parameters (wizards).** `ProjectStarter.parameters?: StarterParameter[]` and `BundleContext.values: Readonly<Record<string, Json>>` (every declared parameter present, defaults filled in by the host):

```ts
type StarterParameter =
  | { id; label; description?; type: 'string'; default: string; pattern?: string; maxLength?: number }
  | { id; label; description?; type: 'number'; default: number; min?: number; max?: number; step?: number }
  | { id; label; description?; type: 'boolean'; default: boolean }
  | { id; label; description?; type: 'colour'; default: string }          // #rrggbb
  | { id; label; description?; type: 'choice'; default: string; choices: { value: string; label: string }[] };
```

An optional `group?: string` on each parameter names the wizard step it is shown in ([ADR 0040](0040-wizards-as-parameterised-starters.md)). `build(context)` must be pure in `values` as it is in `namespace`.

**D6. Migration data.** `MigrationChange` gains `data?: Json` (the element's new data; absent means the change is informational) and `kind?: 'update' | 'remove'`; `MigrationReport` is otherwise unchanged. `Target.migrateFrom(previous, project)` stays pure: it returns the report and never mutates `project`; the host applies the changes as one undo step ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md) D4).

**D7. Publishing.** The package gets a `tsup` build (`dist/index.js` ESM, `dist/index.cjs`, `dist/index.d.ts`), `exports` pointing at `dist/` for consumers outside the workspace while workspace packages keep importing `src/` through TypeScript project references, `files`, `repository`, `homepage` and `publishConfig.access: public`. `pnpm --filter @msm/plugin-api pack` produces `msm-plugin-api-<version>.tgz`; the release workflow attaches it to every release, and external plugins install it from that URL or from npm once the user supplies an npm token (a user decision, recorded in HANDOFF; not needed for 1.0). The published version equals the app version at 1.0.0 and is bumped with the API thereafter, independently of the app.

## Consequences

- Plugins declaring `^0.8.0` stop loading; the built-ins move in B152. There are no third-party plugins yet.
- Hosts that build `TemplateContext` or `BundleContext` (the app, the library tests, the `examples/` mirror) must pass `target` and `values`; the mirror is generated with every parameter at its default, so the goldens of the existing starters do not move.
- Type-level narrowing (`TargetFacts` in plugin signatures) is source compatible for every built-in: a `Target` is a `TargetFacts`.
- `lowerProject` stays for tests and tools; the async driver is the one the app runs.

## Status

Proposed (2026-11-05). Implemented by B152 (package, core driver, built-in ranges), used by B153, B154, B156 and B160; accepted at Phase 7 close.
