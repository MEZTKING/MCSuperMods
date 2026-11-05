# check-size

Size budgets for the desktop app. Run after `pnpm build` and `pnpm --filter @msm/app dist:dir`:

```sh
node tools/check-size/index.ts [--root <repo-root>]
```

It prints the renderer output total with its largest files, the main-process output, the size of `app.asar` and the total of the unpacked app, then fails (exit 1) when a budget is broken or an input is missing. CI runs it on Linux after the packaged smoke test.

## Budgets

Thresholds are the `BUDGETS` constant in `index.ts` (binary units: 1 MB = 1024 × 1024 bytes).

| Budget | Threshold | Why |
|---|---|---|
| `app.asar` in `app/dist/<platform>-unpacked/resources/` | ≤ 32 MB | Everything MSM ships besides Electron itself: main (16.3 MB with two targets: about 5.7 MB of code, including the lazy 3.7 MB scripting engine, plus the vendored data of every built-in target, about 5.3 MB each, so about 11 MB for two: mcdoc symbols 3.4 MB, mcmeta 1.9 MB), preload, and the renderer (about 13 MB). Raised from 25 MB in Phase 7 for the second target (ADR 0037); 29.3 MB with two targets (B153). The next step, if it keeps growing, is moving the vendored data out of the asar into `extraResources` (reserve B166). |
| Renderer output, `app/out/renderer/` in total | ≤ 16 MB | Keeps Monaco and the deepslate preview lazy and stops accidental bundling. About 5.6 MB at Phase 1, of which Monaco is most; raised from 8 MB in Phase 6 for the lazy Monaco TypeScript worker of the Script Studio, about 7 MB on its own (ADR 0031 D6). |
| Monaco TypeScript worker | a separate chunk | A renderer file whose name contains `ts.worker` must exist: the worker loads only with the script editor, never with the main bundle. |
| Any `*.json` in `app/out/renderer/` | ≤ 100 kB each | Vendored target data (mcdoc symbols, registries) is read by main, not bundled into the renderer. |

## Reported only

- **Unpacked app total.** About 284 MB on Linux at Phase 1, of which the Electron binary is about 224 MB. MSM does not control that, so the Phase 1 plan's "unpacked app < 150 MB" cannot pass and is not enforced.
- **Largest renderer files**, to spot regressions before they hit the budget.
- **Main-process output**: the size of `app/out/main/index.js`, the `app/out/main` total and its five largest files. From Phase 2 the main process bundles the Spyglass mcfunction service (ADR 0014) and from Phase 6 the lazy TypeScript transpiler chunk (ADR 0031), so this is watched, but it counts against the asar budget only.
- **TypeScript worker chunk**: the file name and size of the Monaco TypeScript worker.

## Installer budget

The 150 MB budget applies to the Windows NSIS installer (`app/dist/*.exe`). It is checked in `.github/workflows/release.yml`, the only workflow that builds the installer.
