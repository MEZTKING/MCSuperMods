# ADR 0018: In-app auto-update

## Context

DESIGN [Open Question 4](../DESIGN.md#18-open-questions) was decided on 2026-11-04: the user chose the MIT licence and a public `MEZTKING/MCSuperMods` repository, so release builds can publish to its GitHub Releases and the app can update itself with `electron-updater` and the GitHub provider. [ADR 0013](0013-phase1-toolchain-and-packaging.md) left a commented `publish:` block in `app/electron-builder.yml` for this, and `electron-updater` 6.8.11 is already an app development dependency. Releases are Windows only (an unsigned NSIS x64 installer); unsigned builds update normally, and only the first install shows a SmartScreen warning.

## Decision

**Updater in main.** `app/src/main/updater.ts` wraps electron-updater's `autoUpdater` behind a small interface (`AutoUpdaterLike`) so the rules are unit-tested with a fake. electron-vite bundles electron-updater into a separate main chunk that is loaded with a dynamic `import()` on the first check, so runs where the updater is inactive never load it. The packaged app still collects no `node_modules` (ADR 0013); the chunk loads from `app.asar`.

**When it runs.** Only when `app.isPackaged`, the platform is `win32` and the run is not a smoke or end-to-end run (`MSM_SMOKE`, any non-empty `MSM_E2E_*`). Otherwise every status is `disabled` with a reason (`not-packaged`, `unsupported-platform`, `test-run`), and main logs `MSM updates: inactive (<reason>)` once.

**Behaviour.**

- A start-up check runs 5 seconds after the window has loaded, when the setting `updates.autoCheck` in `<msmHome>/settings.json` is on (default on; anything but an explicit `false` counts as on). Settings > Updates has the toggle "Check for updates automatically".
- Help > Check for Updates… and the command palette's "Check for updates" always check, and report the result in the status toast ("MCSuperMods is up to date.", the error, or why updates are off).
- `autoDownload` is on; `autoInstallOnAppQuit` is off. A banner above the toolbar shows download progress and then "Restart to update"; it is dismissible, and a finished download shows it again. Background errors (for example, offline) are logged and do not show in the banner.
- Installing happens only when the user chooses Restart to update. Main closes every window through the existing close handler, so unsaved changes get the usual "Discard changes" prompt; once every window has closed, `window-all-closed` runs `quitAndInstall(true, true)` (silent install, then restart). If the user cancels the prompt, the request stands and the update installs when the window is next closed; the banner says so.
- Errors never throw out of the updater; each is logged and becomes an `error` status.

**IPC.** `msm:v1:updates:check` (resolves to the status after the check), `msm:v1:updates:install` and the event `msm:v1:updates:status`, zod-validated; `PlatformAdapter.updates` has `check()`, `install()` and `onStatus(listener)`, which returns an unsubscribe function. The status union is `idle | checking | available{version} | not-available | downloading{percent} | downloaded{version} | error{message} | disabled{reason}`. `settings.set` now takes a partial update (`AppSettingsPatch`). `MENU_COMMANDS` gains `checkForUpdates`.

**Publishing.** `electron-builder.yml` sets `win.publish` to `{ provider: github, owner: MEZTKING, repo: MCSuperMods, releaseType: draft }` (Linux `dir` has `publish: null`), so NSIS builds write `latest.yml` and a `.blockmap` and the app carries `resources/app-update.yml`. `pnpm dist` keeps `--publish never`. The release workflow runs electron-builder with `--publish always` and `GH_TOKEN` set to the workflow's `GITHUB_TOKEN` on `v*` tags, which uploads the installer, blockmap and `latest.yml` to a draft release; manual runs build with `--publish never` and keep the files as a workflow artefact. The maintainer publishes the draft by hand; electron-updater sees only published releases. The 150 MB installer check stays.

## Consequences

- Users of the installed Windows app get updates without visiting GitHub; nothing installs without their say-so.
- A release needs the `app/package.json` version bumped to match the tag (`v<version>`) before tagging, because electron-builder names the draft release and `latest.yml` after that version.
- Pre-releases and update channels are not supported; every published release is offered to everyone.
- A renderer reload loses the banner until the next status event (main still knows the state and a manual check reports it).
- Code signing remains open; when signing arrives, electron-updater's signature verification of the installer can be turned on.

## Status

Accepted (2026-11-04). Resolves the implementation part of DESIGN Open Question 4. Implemented in Phase 2 as written (`app/src/main/updater.ts`; electron-updater as a 527 kB lazy main chunk). It becomes active for users once the maintainer publishes the first release (README "Releasing").
