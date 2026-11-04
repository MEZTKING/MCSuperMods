# ADR 0017: Phase 2 toolchain

## Context

Phase 2 adds Spyglass to the main process ([ADR 0014](0014-mcfunction-diagnostics-with-spyglass.md)), data pack kinds and exporters ([ADR 0015](0015-data-pack-element-model.md)) and a reference index ([ADR 0016](0016-reference-index-and-rename.md)). These need new pins, a plugin-api release, bundling rules for main and new menu commands. [ADR 0013](0013-phase1-toolchain-and-packaging.md) kept Node 22 and pnpm 10.28 through Phase 1 and deferred the move to DESIGN [Open Question 11](../DESIGN.md#18-open-questions).

Verified on 2026-11-04 from the npm registry and the Node.js release schedule:

| Fact | Value |
|---|---|
| Node 24.22.2 | Active LTS ("Krypton"), LTS since 2025-10-28 |
| Node 22 | Maintenance LTS since 2025-10-21 |
| Node 26 | Becomes LTS 2026-10-28 |
| pnpm | 12.16.1 current |
| `@types/node` | 24.19.2 |
| Spyglass | `@spyglassmc/core` 0.4.57, `@spyglassmc/mcfunction` 0.2.60, `@spyglassmc/java-edition` 0.3.70, `@spyglassmc/mcdoc` 0.3.61; `vscode-languageserver-textdocument` 1.0.16 |

## Decision

**Node 24 and pnpm 12 now.** The main session adopts them at the start of Phase 2 (2026-11-04); the development container already runs Node 24. `.nvmrc` is `24.22.2`, root `engines.node` is `>=24.0.0 <27`, `packageManager` is `pnpm@12.16.1`, the catalog pins `@types/node` 24.19.2, and the lockfile is regenerated once, by the first-wave brief that owns it. Reasons: Node 24 has been the active LTS for a year, Node 22 is in maintenance, and every CI and packaging step runs headless, so a regression shows in the same wave. Rollback is the reverse of three lines plus the lockfile. Whether `pnpm/action-setup@v4` supports pnpm 12 is verified at implementation. Electron still bundles its own Node.

**Spyglass pins** (pnpm catalog): `@spyglassmc/core` 0.4.57, `@spyglassmc/mcfunction` 0.2.60, `@spyglassmc/java-edition` 0.3.70, `@spyglassmc/mcdoc` 0.3.61 (direct, for mcdoc symbol loading inside commands), `vscode-languageserver-textdocument` 1.0.16. `@spyglassmc/json`, `nbt` and `locales` arrive transitively, pinned by `java-edition`. They are dependencies of `@msm/schemas` only, reached through the `@msm/schemas/mcfunction` subpath.

**Workspace edges** added in the first wave, so no later brief touches the lockfile: `@msm/core` → `@msm/schemas` (the reference index uses `collectReferences`); `@msm/app` and `@msm/exporters` → `@msm/plugin-datapack` as dev dependencies. The layer map gives `@msm/exporters` a test allowance for `@msm/plugin-datapack`, enforced by the Biome override that already covers `@msm/plugin-resourcepack`.

**Main-process bundling.** electron-vite bundles main with `externalizeDeps: false`; Spyglass's `import … with { type: 'json' }` attributes and its Node-only transitive dependencies must bundle (verify at implementation). If the bundler refuses them, a small Vite plugin in `electron.vite.config.ts` stubs `decompress`, `follow-redirects` and `@zip.js/zip.js` for main; they are reached only by downloaders MSM never calls. The service is loaded with a dynamic `import()` on first use.

**Size budgets unchanged**: `app.asar` at most 25 MB (about 14 MB expected after Phase 2), renderer at most 8 MB, no renderer JSON file over 100 kB, Windows installer at most 150 MB. `tools/check-size` also reports the size of `out/main/index.js` and of `out/main`, without a budget.

**Vendored data.** `tools/sync-mcmeta` also vendors the command tree and block states from the `<mcmetaRef>-summary` tag as `vendor/mcmeta/commands.json` and `blocks.json`; `TargetBundle.vendored` and `VENDORED_KEYS` gain `mcmetaCommands` and `mcmetaBlocks`.

**`@msm/plugin-api` 0.3.0.** Additive except one required field:

- `OutputFile.language?: string`: a text language id the export gate may check, such as `mcfunction`; omitted for JSON and binary files.
- `Problem.range?: { start: number; end: number }`: UTF-16 offsets within the string at `path`, or within `file` for text outputs.
- `DataFolderKey = 'recipe' | 'loot_table' | 'advancement' | 'predicate' | 'item_modifier' | 'function' | 'tags' | 'enchantment' | 'damage_type' | 'dimension_type' | 'chat_type' | 'jukebox_song' | 'banner_pattern' | 'painting_variant' | 'trim_material' | 'trim_pattern' | 'dialog'` and a required `Target.folders.data: Record<DataFolderKey, string>`. The expected values equal the key names (singular folders since 1.21; `tags` is the parent folder and tag kinds append `/<registry>`); they are checked at implementation against the `@spyglassmc/java-edition` 0.3.70 URI binder and recorded in the target's `CHANGES.md`.
- `API_VERSION = '0.3.0'`; built-in plugins declare `^0.3.0`; plugins declaring `^0.2.0` no longer load. The plugin-api `CHANGELOG.md` carries the migration note.

**Menu commands.** `MENU_COMMANDS` becomes `new, open, save, undo, redo, importAssets, exportResourcePack, exportDataPack, exportCombined, installResourcePack, installDataPack, settings, commandPalette`. The command palette opens with `CmdOrCtrl+Shift+P`; Rename Element is F2.

**Excluded from Phase 2.** Auto-update and release tagging wait on the user's licence and repository-visibility answers (DESIGN Open Questions [4 and 10](../DESIGN.md#18-open-questions)). Releases stay Windows only. The release workflow changes only in the Node version it reads from `.nvmrc`.

## Consequences

- Contributors need Node 24 and pnpm 12; Node 22 is no longer supported for development.
- Every target package changes in the same release as plugin-api 0.3.0, because `folders.data` is required; there is one target today.
- The main bundle carries Spyglass (about 3.5 MB); start-up is unaffected because it loads on first use.
- Resolves DESIGN Open Question 11 and amends ADR 0013's Node and pnpm decision.

## Status

Accepted (2026-11-04).
