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
| `app.asar` in `app/dist/<platform>-unpacked/resources/` | ≤ 32 MB | Everything MSM ships besides Electron itself: main (12.3 MB with two targets: about 6.8 MB of code, including the lazy 3.7 MB scripting engine, plus the vendored data of every built-in target, about 2.8 MB each as compact JSON, so about 5.5 MB for two: mcdoc symbols 1.6 MB, mcmeta 1.2 MB), preload, and the renderer (about 14.4 MB). Raised from 25 MB in Phase 7 for the second target (ADR 0037); 31.7 MB after containers and machines, then 26.7 MB (27,997,478 bytes, from 33,213,535) once the main build compacts the vendored JSON (ADR 0079 D1; the sources stay pretty-printed). 31.1 MB (32,585,540 bytes) after B582, then 26.0 MB (27,296,177 bytes) once the main build stores the vendored JSON gzipped as `*.json.gz` (ADR 0123 D1, the reserve of ADR 0079 D4; about 0.6 MB for two targets, decoded in `app/src/main/platform/targets.ts`). Moving the data to `extraResources` was rejected, as it ships the same bytes. |
| Renderer first paint, `index.html` plus every file it names (entry script, `modulepreload` chunks, CSS) | ≤ 6 MB (stop line for app briefs 5.5 MB) | What start-up feels; lazy chunks, named only by dynamic imports, are not in it. 4.53 MB (4,750,839 bytes, 48 files) after ADR 0126. Added by the amendment of ADR 0126 D4 (a vetoable default). |
| Renderer output, `app/out/renderer/` in total | ≤ 21 MB (stop line for app briefs 20.5 MB) | Keeps Monaco and the deepslate preview lazy and stops accidental bundling; lazy chunks cost disk only, which the asar budget covers. Raised from 19 MB on 2026-11-23 (amendment of ADR 0126 D4; 18.48 MB, 19,375,524 bytes, at that point). Raised from 18 MB on 2026-11-22 (ADR 0123 D4, amending ADR 0091 D5; a vetoable default): 17.6 MB after B582, 17.4 MB once deepslate is tree-shaken in the renderer and its workers (ADR 0123 D3); the one large saving left, the 26.3 Java project generator (about 1 MB), needs a plugin API change. Raised from 16 MB on 2026-11-14 (ADR 0091 D5 route b, B407: 15.1 MiB measured, Monaco about 11 MiB of it, all Studios already lazy and small). About 5.6 MB at Phase 1, of which Monaco is most; raised from 8 MB in Phase 6 for the lazy Monaco TypeScript worker of the Script Studio, about 7 MB on its own (ADR 0031 D6). |
| Monaco TypeScript worker | a separate chunk | A renderer file whose name contains `ts.worker` must exist: the worker loads only with the script editor, never with the main bundle. |
| Any `*.json` in `app/out/renderer/` | ≤ 100 kB each | Vendored target data (mcdoc symbols, registries) is read by main, not bundled into the renderer. |
| `app/out/main/vendor/` | exists whenever `app/out/main` does | A main build that lost its vendored target data must not pass as "small" (ADR 0079 D3). |
| Any `*.json` in `app/out/main/vendor/` | none | `bundleVendoredData` stores every vendored JSON file gzipped as `*.json.gz`; a plain one fails, naming the file (ADR 0123 D2). |
| Any `*.json.gz` in `app/out/main/vendor/` | gunzips, no line feed byte | The JSON inside is compact; compact `JSON.stringify` output never contains 0x0A (line breaks in strings are escaped), so a regression to the indented sources, or a file that is not gzip, fails at once, naming the file (ADR 0079 D3, ADR 0123 D2). |
| `LICENSE` in each `app/out/main/vendor/<target>/vanilla-mcdoc/` | present | vanilla-mcdoc is MIT, whose notice must ship with copies of the data; `bundleVendoredData` copies the vendored `LICENSE` beside `symbols.json`. |

## Reported only

- **Unpacked app total.** About 284 MB on Linux at Phase 1, of which the Electron binary is about 224 MB. MSM does not control that, so the Phase 1 plan's "unpacked app < 150 MB" cannot pass and is not enforced.
- **Largest renderer files and the first-paint count**, to spot regressions before they hit the budget.
- **Main-process output**: the size of `app/out/main/index.js`, the `app/out/main` total and its five largest files. From Phase 2 the main process bundles the Spyglass mcfunction service (ADR 0014) and from Phase 6 the lazy TypeScript transpiler chunk (ADR 0031), so this is watched, but it counts against the asar budget only.
- **Vendored target data**: the `app/out/main/vendor` total (about 0.6 MB for two targets, compact JSON gzipped, ADRs 0079 and 0123; 5.5 MB before the gzip); it counts against the asar budget.
- **TypeScript worker chunk**: the file name and size of the Monaco TypeScript worker.

## Installer budget

The 150 MB budget applies to the Windows NSIS installer (`app/dist/*.exe`). It is checked in `.github/workflows/release.yml`, the only workflow that builds the installer.
