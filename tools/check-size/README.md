# check-size

Size budgets for the desktop app. Run after `pnpm build` and `pnpm --filter @msm/app dist:dir`:

```sh
node tools/check-size/index.ts [--root <repo-root>]
```

It prints the renderer output total with its largest files, the size of `app.asar` and the total of the unpacked app, then fails (exit 1) when a budget is broken or an input is missing. CI runs it on Linux after the packaged smoke test.

## Budgets

Thresholds are the `BUDGETS` constant in `index.ts` (binary units: 1 MB = 1024 × 1024 bytes).

| Budget | Threshold | Why |
|---|---|---|
| `app.asar` in `app/dist/<platform>-unpacked/resources/` | ≤ 25 MB | Everything MSM ships besides Electron itself: main, preload, renderer and their bundled dependencies. About 10 MB at Phase 1. |
| Renderer output, `app/out/renderer/` in total | ≤ 8 MB | Keeps Monaco and the deepslate preview lazy and stops accidental bundling. About 5.6 MB at Phase 1, of which Monaco is most. |
| Any `*.json` in `app/out/renderer/` | ≤ 100 kB each | Vendored target data (mcdoc symbols, registries) is read by main, not bundled into the renderer. |

## Reported only

- **Unpacked app total.** About 284 MB on Linux at Phase 1, of which the Electron binary is about 224 MB. MSM does not control that, so the Phase 1 plan's "unpacked app < 150 MB" cannot pass and is not enforced.
- **Largest renderer files**, to spot regressions before they hit the budget.

## Installer budget

The 150 MB budget applies to the Windows NSIS installer (`app/dist/*.exe`). It is checked in `.github/workflows/release.yml`, the only workflow that builds the installer.
