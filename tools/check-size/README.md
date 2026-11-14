# check-size

Size budgets for the desktop app. Run after `pnpm build` and `pnpm --filter @msm/app dist:dir`:

```sh
node tools/check-size/index.ts [--root <repo-root>]
```

It prints the renderer output total with its largest files, the main-process output, the vendored target data total, the size of `app.asar` and the total of the unpacked app, then fails (exit 1) when a budget is broken or an input is missing. CI runs it on Linux after the packaged smoke test.

## Budgets

Thresholds are the `BUDGETS` constant in `index.ts` (binary units: 1 MB = 1024 × 1024 bytes).

| Budget | Threshold | Why |
|---|---|---|
| `app.asar` in `app/dist/<platform>-unpacked/resources/` | ≤ 32 MB | Everything MSM ships besides Electron itself: main (12.3 MB with two targets: about 6.8 MB of code, including the lazy 3.7 MB scripting engine, plus the vendored data of every built-in target, about 2.8 MB each as compact JSON, so about 5.5 MB for two: mcdoc symbols 1.6 MB, mcmeta 1.2 MB), preload, and the renderer (about 14.4 MB). Raised from 25 MB in Phase 7 for the second target (ADR 0037); 31.7 MB after containers and machines, then 26.7 MB (27,997,478 bytes, from 33,213,535) once the main build compacts the vendored JSON (ADR 0079 D1; the sources stay pretty-printed). The next step, if it nears the budget again, is storing the vendored files gzipped in the asar under its own ADR (ADR 0079 D4); moving them to `extraResources` was rejected, as it ships the same bytes. |
| Renderer output, `app/out/renderer/` in total | ≤ 18 MB | Keeps Monaco and the deepslate preview lazy and stops accidental bundling. Raised from 16 MB on 2026-11-14 (ADR 0091 D5 route b, B407: 15.1 MiB measured, Monaco about 11 MiB of it, all Studios already lazy and small). About 5.6 MB at Phase 1, of which Monaco is most; raised from 8 MB in Phase 6 for the lazy Monaco TypeScript worker of the Script Studio, about 7 MB on its own (ADR 0031 D6). |
| Monaco TypeScript worker | a separate chunk | A renderer file whose name contains `ts.worker` must exist: the worker loads only with the script editor, never with the main bundle. |
| Any `*.json` in `app/out/renderer/` | ≤ 100 kB each | Vendored target data (mcdoc symbols, registries) is read by main, not bundled into the renderer. |
| `app/out/main/vendor/` | exists whenever `app/out/main` does | A main build that lost its vendored target data must not pass as "small" (ADR 0079 D3). |
| Any `*.json` in `app/out/main/vendor/` | no line feed byte | `bundleVendoredData` compacts every vendored JSON file; compact `JSON.stringify` output never contains 0x0A (line breaks in strings are escaped), so a regression to copying the indented sources fails at once, naming the file (ADR 0079 D3). |
| `LICENSE` in each `app/out/main/vendor/<target>/vanilla-mcdoc/` | present | vanilla-mcdoc is MIT, whose notice must ship with copies of the data; `bundleVendoredData` copies the vendored `LICENSE` beside `symbols.json`. |

## Reported only

- **Unpacked app total.** About 284 MB on Linux at Phase 1, of which the Electron binary is about 224 MB. MSM does not control that, so the Phase 1 plan's "unpacked app < 150 MB" cannot pass and is not enforced.
- **Largest renderer files**, to spot regressions before they hit the budget.
- **Main-process output**: the size of `app/out/main/index.js`, the `app/out/main` total and its five largest files. From Phase 2 the main process bundles the Spyglass mcfunction service (ADR 0014) and from Phase 6 the lazy TypeScript transpiler chunk (ADR 0031), so this is watched, but it counts against the asar budget only.
- **Vendored target data**: the `app/out/main/vendor` total (about 5.5 MB for two targets, compact JSON, ADR 0079); it counts against the asar budget.
- **TypeScript worker chunk**: the file name and size of the Monaco TypeScript worker.

## Installer budget

The 150 MB budget applies to the Windows NSIS installer (`app/dist/*.exe`). It is checked in `.github/workflows/release.yml`, the only workflow that builds the installer.
