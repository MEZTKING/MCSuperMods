# Hostile plugin: what a plugin must not reach

A test plugin (plugin id `hostile.probe`, B870) that tries everything a third-party plugin must not reach from its sandboxed worker ([ADR 0035](../../docs/adr/0035-plugin-sandbox-and-capability-manifest.md), [ADR 0137](../../docs/adr/0137-app-plugins-extension-points-permissions-and-the-catalogue.md) D8) and writes what it reached to a file. It is plain files, not a package: `main.js` is a hand-written classic script, as the app runs a plugin's bundle, and there is nothing to build.

The end-to-end test `plugins-path` copies this folder into a fresh plugins folder, starts the app, runs the plugin's exporter "Hostile probe report into a folder…" and reads `hostile-report.json`:

| Field | What it holds | Expected |
|---|---|---|
| `reached` | Every global, `navigator` member or call that got through: the network, storage and worker globals, `postMessage`, `Notification`, `StorageBucketManager`, `LockManager`, `navigator.storage`, `storageBuckets`, `locks`, `usb`, `hid`, `serial`, `gpu` (by name, through the prototype, or defined again), and trying to open a storage bucket, take a lock, show a notification, list devices or ask for a GPU adapter | empty |
| `notifications` | The notification permission as the worker sees it (main's permission handlers) | `denied` |
| `wasm` | Compiling a WebAssembly module | `refused: …` (the CSP has no `'wasm-unsafe-eval'`) |
| `appImport` | `import()` of the app's own `msm-app://app/index.html` | `not refused by the CSP` (accepted: the app's public files, no DOM or bridge in a worker) |
| `otherImport` | `import()` of an `https:` file | `refused by the CSP` (the check of the check) |

The list is B840's spike, S7 (`docs/reference/spikes/b840/README.md`). Timers that keep running after a call returns are not probed: the idle heartbeat that watches them is B842's.
