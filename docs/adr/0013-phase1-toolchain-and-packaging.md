# ADR 0013: Phase 1 toolchain and packaging

## Context

Phase 1 ([ROADMAP](../ROADMAP.md)) adds the first public plugin, exporter, interop code, a real UI and release builds. This needs a new plugin-api surface, pinned UI and packaging dependencies, a way for tests to use the real target without version literals outside `packages/targets`, and answers to DESIGN Open Questions 4 and 11. Versions below were read from the npm registry on 2026-11-04.

## Decision

**`@msm/plugin-api` 0.2.0.** Additive, with one required field on `Target`:

- `OutputFile.schema?: string`: an mcdoc type path (`::java::assets::model::Model`) or dispatcher reference (`resource:model`) for the validation gate ([ADR 0009](0009-phase1-validation-gate.md)); omitted for binary files.
- `ElementKind.defaultData?: Json`; `ElementKind.hiddenPaths?: string[]` (fields the form hides because lowering owns them, such as pack formats); `ElementKind.previewKind?: string` (a host-interpreted hint: `model`, `block_definition`, `item_definition`).
- `Problem.file?: string`: a project-relative or output-relative path, for load and export problems.
- `ExporterInput.meta: { msmVersion: string; plugins: string[] }`, written to `msm.export.json`.
- `Target.folders.resource: Record<ResourceFolderKey, string>`: the vanilla folder names under `assets/<ns>/` (`model`, `block_definition`, `item_definition`, `lang`, `sounds_file`, `textures`, `atlases`, `font`). It is required, so lowering never hard-codes folder names.
- `paths.ts`: `isProjectRelativePath` and `assertProjectRelativePath`, moved from core (which re-exports them). This is the shared path-validation module for core and app; main imports it from the dependency-free `@msm/plugin-api`, so [ADR 0007](0007-renderer-hosted-core-and-platform-adapter.md)'s "main never imports core at runtime" still holds.
- `API_VERSION = '0.2.0'`; built-in plugins declare `^0.2.0`. The plugin-api `CHANGELOG.md` carries the migration note.

**UI, preview, zip and test pins** (pnpm catalog):

| Concern | Pin |
|---|---|
| Styling | `tailwindcss` and `@tailwindcss/vite` 4.3.4 (peer `vite ^8` confirmed) |
| Primitives and icons | `radix-ui` 1.8.1 (single-package distribution, React 19 peer confirmed); `lucide-react` 1.68.0 |
| Code editor | `monaco-editor` 0.57.0 used directly with Vite `?worker` imports, lazy-loaded |
| Preview | `deepslate` 0.27.2, `gl-matrix` 3.4.4 ([ADR 0010](0010-preview-with-deepslate.md)) |
| Zip | `fflate` 0.8.3 in renderer, main, interop and exporters |
| Component tests | `happy-dom` 21.0.4; `@testing-library/react` 16.3.3, `/dom` 10.4.2, `/user-event` 14.6.8 |
| End to end | `playwright` 1.64.1 (`_electron`) |
| Packaging | `electron-builder` 26.18.0 |

Not adopted in Phase 1: `three` 0.187.0, `@spyglassmc/*` (Phase 2), `yazl`/`yauzl`, `jsdom` (version 30 needs Node 22.22 or later and a `canvas` peer), `@monaco-editor/react` (its loader fetches Monaco from a CDN by default).

**Deterministic zips.** `@msm/exporters` writes zips with fflate, entries sorted by path, compression level 6, `os: 0`, and a fixed timestamp built with the local-time constructor `new Date(2000, 0, 1)`. fflate converts `mtime` with local-time getters, so this makes the stored DOS time identical in every timezone. `msm.export.json` has no timestamps.

**Packaging and release.** `app/electron-builder.yml`: `appId: dev.mcsupermods.app`, `productName: MCSuperMods`, `asar: true`, `npmRebuild: false`, `files: ["out/**", "package.json"]`; targets Linux `AppImage` and `dir`, Windows `nsis` (x64), macOS `dmg`. macOS and Windows builds are unsigned and macOS notarisation is disabled until the user supplies credentials. electron-vite bundles main, preload and renderer, so every app runtime dependency moves to `devDependencies` and electron-builder collects no `node_modules`; the pnpm symlink layout is irrelevant. The release workflow runs on `v*` tags and `workflow_dispatch` and uploads to GitHub Releases of `MEZTKING/MCSuperMods`. No tag is pushed until the licence is decided (DESIGN [Open Question 10](../DESIGN.md#18-open-questions); MIT proposed). Locally only `dist:dir` on Linux plus a packaged smoke run is verified.

**`@msm/targets` aggregator.** A new package in `packages/targets/all/`, inside the version-literal-exempt tree, exports `builtInTargets: readonly TargetBundle[]` and `targetById(id)`. Tests iterate `builtInTargets` and derive fixture directories from `target.id`, so golden tests use the real target without writing a version literal. Vendored data reaches the renderer through main (`platform.targets.readVendored`), because the sandboxed renderer cannot `fetch` `file://` URLs.

**Layer map.** `@msm/plugin-*`, `@msm/exporters` and `@msm/interop` may depend on `@msm/targets`, and `@msm/targets` may depend on `@msm/target-*`. A Biome `noRestrictedImports` override forbids `@msm/targets` and `@msm/target-*` under `packages/plugins/*/src/**` and `packages/exporters/src/**`, so the allowance is for tests only and shipped plugin and exporter code still uses only `@msm/plugin-api` and `@msm/schemas`.

**Node and pnpm.** Node stays 22 and pnpm 10.28 through Phase 1. The move to Node 24 and pnpm 12 is deferred to Phase 2, when CI runners default to Node 24.

## Consequences

- `Target.folders` being required means every target package changes in the same release as plugin-api 0.2.0; there is one target today.
- Release builds exist, but no public release is published until the licence is chosen.
- Auto-update stays deferred; when it arrives, GitHub Releases is the natural provider (DESIGN [Open Question 4](../DESIGN.md#18-open-questions) remains open).
- The test-only allowance is enforced by Biome rather than by the layer map alone; check-deps and Biome must both pass.
- Resolves the Phase 1 part of DESIGN Open Question 11 by deferring it to Phase 2.

## Status

Accepted (2026-11-04).
