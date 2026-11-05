# tools

Development scripts for the MSM monorepo (`@msm/tools`). Every script is TypeScript run directly by Node (>= 22.18 strips types), so each uses only erasable syntax, `node:` imports and explicit `.ts` import extensions. Tests run with `pnpm --filter @msm/tools test`.

| Folder | Command | Purpose |
|---|---|---|
| `build-msm-mcdoc/` | `node tools/build-msm-mcdoc/index.ts [--check]` | Exports the MSM mcdoc in `packages/schemas/mcdoc/msm/` to its checked-in `symbols.json`; `--check` fails when it is stale. See its README. |
| `check-deps/` | `node tools/check-deps/index.ts` | Enforces the package layer map (`layers.json`) and rejects Minecraft version literals outside `packages/targets`. Part of `pnpm lint`. |
| `check-size/` | `node tools/check-size/index.ts` | Size budgets for `app.asar` and the renderer output, run in CI after `dist:dir`; see its README. |
| `new-plugin/` | `node tools/new-plugin/index.ts <name>` | Scaffolds `packages/plugins/<name>` as `@msm/plugin-<name>`; see its README. |
| `run-fabric-server/` | `node tools/run-fabric-server/index.ts --jar <jar> --facts <file>` | Starts a headless Fabric dedicated server with a content jar and checks the `msm_runtime` registration log (ADR 0026 D6); with `expectEntities` it also checks the `registered K entity type(s)` line, with `expectScripts` the `loaded S script(s); 0 error(s)` line, and `--separate-geckolib` downloads GeckoLib (SHA-512 checked) for a jar without it nested. `--gametest <jar>` runs a GameTest mod (the parity tests in `engine-mod/parity/`) on a production GameTest server and checks its report, `--gametest-filter <selector>` picks its tests; `--no-runtime` checks a jar without `msm_runtime` (ejected projects). CI runs it on `fixtures/sample-mod`, `fixtures/sample-mob` and `fixtures/sample-script`, and runs the parity tests on both samples' content and ejected jars. See its README. |
| `sync-mcdoc/` | `node tools/sync-mcdoc/index.ts --ref <sha> --out <dir>` | Vendors the vanilla-mcdoc symbol export for a target; see its README. |
| `sync-mcmeta/` | `node tools/sync-mcmeta/index.ts --version <version> --out <dir>` | Vendors mcmeta version and registry data for a target; see its README. |
| `shared/` | (library) | Download, strict JSON and atomic-write helpers shared by the sync scripts. |

## Layer map

`check-deps/layers.json` lists, per package name or glob, the internal `@msm/*` packages it may depend on. An exact key wins over a glob, so `@msm/targets` (the aggregator in `packages/targets/all`) is not governed by `@msm/target-*`. Plugins, exporters and interop may depend on `@msm/targets` for tests only; Biome overrides in the root `biome.json` forbid importing it from plugin and exporter `src/`.
