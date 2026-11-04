# tools

Development scripts for the MSM monorepo (`@msm/tools`). Every script is TypeScript run directly by Node (>= 22.18 strips types), so each uses only erasable syntax, `node:` imports and explicit `.ts` import extensions. Tests run with `pnpm --filter @msm/tools test`.

| Folder | Command | Purpose |
|---|---|---|
| `check-deps/` | `node tools/check-deps/index.ts` | Enforces the package layer map (`layers.json`) and rejects Minecraft version literals outside `packages/targets`. Part of `pnpm lint`. |
| `check-size/` | `node tools/check-size/index.ts` | Size budgets for `app.asar` and the renderer output, run in CI after `dist:dir`; see its README. |
| `new-plugin/` | `node tools/new-plugin/index.ts <name>` | Scaffolds `packages/plugins/<name>` as `@msm/plugin-<name>`; see its README. |
| `sync-mcdoc/` | `node tools/sync-mcdoc/index.ts --ref <sha> --out <dir>` | Vendors the vanilla-mcdoc symbol export for a target; see its README. |
| `sync-mcmeta/` | `node tools/sync-mcmeta/index.ts --version <version> --out <dir>` | Vendors mcmeta version and registry data for a target; see its README. |
| `shared/` | (library) | Download, strict JSON and atomic-write helpers shared by the sync scripts. |

## Layer map

`check-deps/layers.json` lists, per package name or glob, the internal `@msm/*` packages it may depend on. An exact key wins over a glob, so `@msm/targets` (the aggregator in `packages/targets/all`) is not governed by `@msm/target-*`. Plugins, exporters and interop may depend on `@msm/targets` for tests only; Biome overrides in the root `biome.json` forbid importing it from plugin and exporter `src/`.
