# ADR 0035: Third-party plugin sandbox and capability manifest

## Context

[DESIGN §7](../DESIGN.md#7-plugin-system) promises that third-party plugins load from `~/.msm/plugins/` "in a sandboxed context with a capability manifest" and that anything a built-in can do a third-party plugin can do; [Open Question 5](../DESIGN.md#18-open-questions) left the mechanism open (`isolated-vm` versus an Electron utility process). Checked on 2026-11-05:

- The app runs its whole project session in the renderer ([ADR 0007](0007-renderer-hosted-core-and-platform-adapter.md)): `@msm/core`, the plugins and the exporters execute there, and every OS access goes through the preload bridge (`window.msm`, `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`). The renderer's CSP is `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`: no `worker-src`, so a `blob:` worker cannot be created today, and `connect-src` falls back to `'self'`.
- The plugin API surface ([ADR 0034](0034-plugin-api-0.8.md) and earlier) is plain data plus pure functions with no Node or DOM types, by design "so that sandboxed third-party plugins can contribute the same way built-ins do" (`library.ts`). Four contribution functions are synchronous today: `ElementKind.lower`, `ElementTemplate.data`, `ProjectStarter.build` and `ExampleProject.build`, `ProjectValidator.validate`; `Exporter.run` and `Importer.import` are async and receive host-supplied `OutputSink` and `ProblemReporter` objects.
- `EditorContribution.component` is a React component (`unknown` in the API) and `Command.run()` has no project access in the API; both are host-side concepts that cannot cross a process or worker boundary.
- Node's `vm` module is documented as not a security mechanism; `isolated-vm` is a native module that must be rebuilt for every Electron version; an Electron `utilityProcess` is a full Node process and would need its own sandbox; a sandboxed `<iframe>` shares the renderer's main thread, so an endless loop in a plugin would freeze the UI. A dedicated Web Worker has no DOM, no preload bridge, can be terminated at any time, and inherits the document's CSP when created from a `blob:` URL (so `fetch`, `WebSocket`, `importScripts` and dynamic `import()` are governed by the app's `connect-src` and `script-src`).
- The MSM home directory is `MSM_HOME` or `<home>/.msm` (`resolveMsmHome`); e2e runs set `MSM_HOME` to a temporary folder.

## Decision

**D1. One Web Worker per third-party plugin, in the renderer.** The main process scans `<msmHome>/plugins/<folder>/msm-plugin.json`, validates the manifest (zod), reads the plugin's `main` bundle and its schema export, and hands them to the renderer over IPC as text (limits: `main` at most 4 MB, each schema file at most 8 MB; `plugin.too-large` otherwise). The renderer concatenates the app's worker bootstrap and the plugin bundle into one `Blob` and starts `new Worker(URL.createObjectURL(blob))`. Nothing is evaluated from a string: the plugin bundle is the worker's top-level script, so the CSP needs no `'unsafe-eval'`. The CSP gains `worker-src 'self' blob:` and states `connect-src 'self'` and `script-src 'self'` explicitly, so inside the worker `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts` and `import()` are refused by the browser; the bootstrap additionally removes those globals and `indexedDB`, `caches` and `navigator.storage` from the worker scope before the plugin code runs (defence in depth, not the boundary). The spike (B150) proves each of these refusals; its findings go in the Status section.

**D2. The manifest `msm-plugin.json`.**

```jsonc
{
  "manifestVersion": 1,
  "id": "example.greetings",            // /^[a-z][a-z0-9.-]*$/, must not start with "msm."
  "name": "Greetings",
  "version": "1.0.0",                    // semver
  "apiVersion": "^1.0.0",                // checked against API_VERSION before any code runs
  "main": "dist/main.js",                // single-file bundle, relative, inside the plugin folder
  "schemas": ["dist/symbols.json"],      // optional: mcdoc symbol exports (mcdoc-cli format)
  "capabilities": ["elementKinds", "elementTemplates", "examples", "validators"],
  "description": "…", "author": "…", "licence": "MIT", "homepage": "https://…"
}
```

`capabilities` lists the contribution points the plugin uses: `elementKinds`, `elementTemplates`, `projectStarters`, `examples`, `validators`, `exporters`, `importers`. The host refuses a plugin whose bundle contributes a point it did not declare (`plugin.capability-missing`) and ignores `editors`, `commands` and `targets` from external plugins with a `plugin.capability-unsupported` warning (they are host-side or carry vendored data; a post-1.0 contribution point may add form-model editors). Element kind ids, exporter ids, importer ids, template, starter, example and validator ids of an external plugin must start with a namespace that is neither `minecraft` nor `msm` (`plugin.reserved-namespace`); a clash with a registered id is `plugin.refused` for the whole plugin, so the built-ins always win.

**D3. The proxy.** After the worker reports `ready` with a description of the plugin (`id`, `apiVersion`, every contribution with its data fields and the names of its functions), the host builds an ordinary `Plugin` object whose functions are stubs that send a request to the worker and resolve with the structured-clone result: `lower(element, target)`, `data(context)`, `build(context)`, `validate(input)` return Promises (the API makes these `MaybePromise` in 1.0, [ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md) D2); `Exporter.run` and `Importer.import` already are. Host objects a plugin receives are serialised: a `Target` as `TargetFacts` (the data fields without `migrateFrom` and `javaProject`), a `ValidationInput.registry` as a snapshot of ids per registry, cached in the worker by the host's content hash so a validation call carries only the key; `OutputSink.writeFile` and `ProblemReporter.report` calls flow back from the worker as messages and the host applies them to its own sink and reporter after checking paths with `assertProjectRelativePath`. Everything that crosses is JSON or `Uint8Array`; a function that returns anything else is `plugin.bad-result`.

**D4. Budgets and failure.** Every request has a deadline: `lower` and `data` 2 s, `validate` and `build` 5 s, `import` 30 s, `run` (exporter) 120 s. On a deadline the host terminates the worker, marks the plugin `failed` with `plugin.timeout` (an uncaught error in the worker is `plugin.crashed`), keeps its kinds registered so the project's elements still round-trip, and reports `plugin.unavailable` error problems for the elements of its kinds (which block export) until the app restarts. Plugins load at start-up; Settings has a Plugins section listing every plugin folder found with its state (`loaded`, `refused` with the reason, `failed` with the reason), the "Open plugins folder" button and the note that changes take effect after a restart.

**D5. Threat model.** The sandbox protects the user's machine and other projects from plugin code: no file system, no Node, no IPC bridge, no DOM, no network, no persistent storage, and bounded CPU per call. The outer wall is Chromium's renderer sandbox (`sandbox: true`), which the worker shares with the renderer; escaping it needs a Chromium bug. Not protected: a plugin may produce malicious *content* (a data pack with harmful functions), exactly as any mod or pack the user installs, and the export validation gate checks only shape; a plugin may exhaust memory and crash the renderer (the app reloads); the budgets limit, but do not prevent, CPU use inside them. The user guide says that plugins are code from third parties and should be installed only from trusted sources.

**D6. Rejected alternatives.** `isolated-vm`: a native module rebuilt per Electron version, plus a second copy of the API surface in main. `utilityProcess`: full Node by default, so the sandbox would have to be built on top of it. Sandboxed `<iframe srcdoc>`: an opaque origin with its own `<meta>` CSP would work, but runs on the UI thread. Node `vm`: not a boundary. The fallback, if B150 finds that a `blob:` worker cannot be constrained as described, is the sandboxed `srcdoc` iframe with the same message protocol; D2–D5 stay as they are.

## Consequences

- Plugin authors ship one bundle (esbuild output from the `tools/new-plugin --external` scaffold) plus a prebuilt mcdoc symbol export; the app contains no mcdoc compiler.
- The plugin API's four synchronous functions become `MaybePromise` and `@msm/core` gains an async lowering driver ([ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md)); built-ins keep returning values synchronously.
- External plugins have no custom editors in 1.0: their kinds get the schema-driven form from their symbol export, which is why `schemas` is part of the manifest.
- The CSP change is the only relaxation: `worker-src blob:`. It does not affect what the main document may load.
- Resolves [DESIGN Open Question 5](../DESIGN.md#18-open-questions).

## Status

Proposed (2026-11-05). The spike B150 records here: whether a `blob:` worker inherits the document CSP in Electron 45 (fetch, WebSocket, importScripts, dynamic import all refused), whether `fetch('file:///…')` is refused, the cost of one `lower` round trip and of the registry snapshot, and whether the worker can be terminated inside an endless loop. Implemented by B154; sample plugin and scaffold by B157; accepted at Phase 7 close.
