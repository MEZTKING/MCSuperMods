# B840 spike: can the wall hold the new surface, measured

Answers S1 to S13 and T1 to T3 of `docs/PLAN-app-plugins.md` (brief B840) for proposed [ADR 0137](../../../adr/0137-app-plugins-extension-points-permissions-and-the-catalogue.md), found on 2026-11-25 in a cloud container (Linux, 4 cores of an Intel Xeon at 2.1 GHz, 16 GB, no GPU, Node 24.22.2, Electron 45.2.2 with Chromium's own sandbox off because the container runs as root, as e2e does) from `8dc2f95`. Nothing here is built, linted or shipped; no code outside this folder was changed.

## What was run

- **A throwaway harness** (`spike-src/harness/`): an Electron main that has the app's shape (the privileged `msm-app` scheme serving a page with the app's CSP, `sandbox: true`, context isolation, a sandboxed preload) plus a second privileged scheme `msm-plugin://<id>/` with its own CSP header for S4. Its page holds a minimal React 19 kit renderer and starts plugin workers from `blob:` URLs with **the app's real bootstrap** (`worker-bootstrap.ts`, bundled from source) for S4 and S7, or with a copy of it that adds views, host calls and canvases (`spike-bootstrap.js`; same global stripping) for S1, S2, S5 and S10. Playwright drives it under `xvfb-run -a` (`drive.mjs`); typing is real key events through the DevTools protocol.
- **The real app**: `pnpm --filter @msm/app build` (`app/out/`) and `dist:dir` (`app/dist/linux-unpacked/`); `drive-app.mjs` ran the S7 probe under the real bootstrap and the S2 canvas probe inside the app's own window (its CSP, scheme, preload and `webPreferences`), with and without SwiftShader. Both builds were deleted afterwards.
- **Main-process scripts** run with Electron as main: the broker (`spike-src/broker/`, local HTTPS servers and a test certificate made with `openssl req`, not kept), hashing and signatures (`spike-src/sign/`; the 20 MB test package and the private key were not kept; the public key, `index.json` and its signature are), safe mode's marks (`spike-src/safemode/`).
- **Node scripts over the app's own code** (`scripts/`, run like `tools/check-project`): S9's late load, S13's files read back, T1 and T2 counts, T3 sizes.
- `results/` holds every measurement as written by the scripts. `spike-src/harness/src/bench.tsx` imports the worktree by a relative path (`../../../wt-B840/app/...`): the harness sat beside the worktree in the scratchpad; adjust the path to run it again.

Where a number has a slow-machine variant, it is with the renderer's main thread slowed four times (`Emulation.setCPUThrottlingRate`, rate 4), which stands in for a slow Windows laptop.

## The answers in one line each

| # | Answer |
|---|---|
| S1 | **Go, with host-held field values.** Key press to painted character at 500 nodes: p95 5.5 to 10 ms (median 3 to 4 ms) at normal speed and 20 to 23 ms at four times slower with a key every 30 ms; the plugin's answer (an echo text) paints at p95 22 to 24 ms and 38 to 42 ms. At 2,000 nodes: 7 to 8 ms, and 42 to 53 ms slowed. Values held in the worker lose keys under load (36 to 55 of 80 lost at four times slower) and must not be used. Path diffs carry 310 to 330 bytes a keystroke against 2.5 KB, 23.6 KB and 95.6 KB for whole trees of 50, 500 and 2,000 nodes. |
| S2 | **Yes.** In the `blob:` worker under the app's CSP, in the built app and the packaged app: `OffscreenCanvas` 2D always; WebGL2 exactly where the app's own WebGL works (SwiftShader here; no context without it). 512 by 512 at 30 frames a second: draw median 0.5 to 1.1 ms (p95 3 ms), frame interval 32.7 to 33.4 ms; as ImageBitmaps, posting 1.6 to 3 ms p95 in the worker, arrival p95 0.3 to 3.2 ms and 0.1 ms to show; a transferred canvas (`transferControlToOffscreen`) needs no message per frame and showed changing frames on screen. |
| S3 | A sandboxed `srcdoc` frame (`allow-scripts` only) is denied network, `localStorage`, IndexedDB, caches, cookies, top navigation, pop-ups, pointer lock and the parent's DOM, and Electron 45 put it **in a process of its own** (no UI-thread cost: page frame p95 17.7 ms with the frame busy 20 ms a frame; 50 to 57 ms to load). But **it cannot run plugin code** under the app's CSP: an inline script and a `blob:` worker are refused (the parent's `script-src 'self'` is inherited). Not needed: S1 and S2 pass. |
| S4 | An idle plugin worker with the bootstrap costs **2.35 MB** private memory (10, 20, 40 workers: +24, +48, +94 MB). A worker that fills its JS heap **takes the whole renderer down** (`render-process-gone`, `crashed`, exit code 5, at 4.4 GB), and the app has no handler for that outside smoke runs; a worker can hold **3 GB of ArrayBuffers in 1.9 s** with nothing stopping it. A hidden frame of `msm-plugin://p1/` gets its own process (15 MB private, 42 MB proportional), adds 0.2 ms p95 to a round trip (0.4 ms in all), and **the window survived** that frame's worker filling its heap; it needs `frame-src msm-plugin:` in the app's CSP (refused without it) and its `localStorage` removed. **Recommend: stay in the renderer, reserve B864** with these numbers, on the conditions under "Go and no-go". |
| S5 | Worker to host calls: a small call p95 0.1 ms; 1 MB of elements 11 ms median, 25 ms p95; the whole 5,000-element project (4.0 MB) 45 ms median, 81 ms p95, and the host's UI thread is blocked about 20 ms per send (one dropped frame); in pages of 100 elements 0.7 ms each and 63 ms for all 5,000, with no frame dropped; ids only 0.7 ms. Structured clone has no cap of its own (512 MB copied in 0.9 s): **ADR 0137's 256 KB a message is our limit, and it fits pages of 100**. |
| S6 | **Node's `https` with a `lookup` hook** checks every resolved address before connecting (a name resolving to 127.0.0.1 was refused and the server saw no connection), follows no redirect, sends no cookies, and stopped a 50 MB answer at 10.5 MB in 64 ms (+23 MB memory). Electron's `net` stops redirects (`redirect: 'manual'`) and the cap, but shows the address only after the request was sent (`onResponseStarted`) and `net.resolveHost` is a second lookup, so it **cannot refuse private addresses before connecting**. Node's is simpler to keep safe; it does not use the system proxy. |
| S7 | Under the real bootstrap and the app's CSP, still open: **`navigator.storageBuckets`** (a persistent IndexedDB and an OPFS file were made, shared by every plugin), **`navigator.locks`** (shared with the app's origin), **`Notification`** (permission `granted`; a desktop notification was shown), `import()` of the app's own `msm-app://app/` modules and JSON (an app chunk ran in the worker and stopped at `document`), timers that keep running after a call returns, `navigator.usb`, `hid`, `serial` and `gpu` objects, `FontFace` with `local()`, `performance.now()` at 100 µs. Refused by the CSP: `eval`, `new Function`, `import()` of `https:`, `data:`, `blob:` and `file:`, **WebAssembly** (no `'wasm-unsafe-eval'`), `FontFace` from `https:`. Removed by the bootstrap: the twelve listed globals and `postMessage`, also from the prototype chain. The full table is below. |
| S8 | SHA-256 of a 20 MB package in Electron's main: 26 to 54 ms from memory, 69 to 134 ms streamed. **Ed25519 verify works** with Node's `crypto` in Electron 45 (BoringSSL): 0.28 ms, a changed byte fails. The detached signature: `index.json.sig`, 88 bytes, base64 of the raw 64-byte signature over the exact bytes of `index.json`, made in an Action by `openssl pkeyutl -sign -rawin -inkey key.pem -in index.json` (OpenSSL 3.0) and checked here against the PEM public key. |
| S9 | **Possible without a restart, nothing irreversible.** Needs: `ElementKindRegistry` has no `unregister` (keep a stopped plugin's kinds registered and unavailable, as a failed plugin's are today); `ProjectSession` builds its plugin lists once in the constructor (`#plugins`, `#library`, `#kindPlugins`, `#importers`, `#validators`, `#exporters`, read-only fields), so it needs a method that rebuilds them (a whole session's constructor takes 1.2 to 2.7 ms); the schema context is cached per target and must be dropped (rebuilt with the plugin's symbols in 76 to 139 ms); `main.tsx` starts plugins before the session and `App` takes them as a prop (search), which must become state. Loading one plugin late: about 15 to 25 ms to start the worker (B150's measure in ADR 0035), 0.01 ms to register, 76 to 139 ms for the schema context and 122 to 261 ms to validate a 194-element project: **0.2 to 0.4 s**. |
| S10 | Watching a folder from main and restarting the worker: **save to repaint 13 to 91 ms (median 33 ms)**, of which restart, start, render and paint are 12 to 38 ms (median 29 ms) and `fs.watch` 0 to 26 ms; one event per save on Linux. Host-held field values and the open Studio survive (the field kept "Ann" and the new bundle's text showed it); the plugin's own memory does not unless it is handed over. |
| S11 | One small JSON file of marks in `<msmHome>`, written atomically by main (0.1 to 1.1 ms): `pending` at start; cleared as **usable when the renderer itself answers** 3 s after it loaded with plugins started, cleared without counting on a clean quit, counted on `render-process-gone` or `unresponsive`; a start that finds `pending` counts the last one as failed; two in a row start in safe mode. A timer in main alone counted a frozen renderer as usable (first run of "hang"). The false alarm left: being killed twice within the first 3 s. |
| S12 | Three Studios written as layouts by hand: Objective (13 parts) 23 % with today's layout format and **92 %** with seven additions; Potion (27 parts) 11 % and **81 %**; Block's own file (51 parts, its 12 section components judged from their headers) 24 % and **75 %**. The additions are listed under S12. The rest (previews, computed lists, one-step changes such as Type or From model) needs Tier 3 or a live view. |
| S13 | **No, not today**: `BundleLiveView` is keyed by kind only and says "This kind has no live view yet" for every plugin kind. But 64 of the registry's 78 kinds lower to one file that reads back to the same data, so a lowered-file index makes it work: the sample plugin's function and `load` tag, and an invented kind's loot table and function, are all shown by existing views. An invented model and texture kind is not: the model preview is outside the registry and textures are assets. |
| T1 | A theme of the eight tokens reaches 2,449 token class uses; it does not reach **590 colour uses in 96 files** (136 palette classes such as `bg-black/60`, 38 arbitrary `[#…]` classes, 303 hex literals, 113 `rgb()`/`hsl()`), of which 170 are in `components/` and `studios/` and the rest in Try it, live views, the Showcase and Surprise me (game looks), nor the 29 files that draw on a canvas or WebGL. |
| T2 | About **3,800 places** with user-visible English in 375 renderer files (1,196 JSX text nodes, 1,651 label-like props, 949 sentence-like object strings; a rough count, not unique sentences), plus the problem messages and labels in the packages. |
| T3 | A kit renderer for all 23 nodes on the app's parts is **4.7 KB raw, 1.8 KB gzipped** of its own (6.7 KB and 2.6 KB with `components/ui` bundled into it). The Studio field parts it reuses (`studios/*/parts`, `structures/pickers`, `worldgen/parts`) pull 876 modules and 2.8 MB when not shared, so the kit must use them from the chunk the Studios already share, or B851 moves the field parts into `components/ui`. First paint needs only a registry seam. |

## Go and no-go

- **D3, the kit: go.** Typing through the kit is well inside the 50 ms budget at 500 nodes when the host holds field values, even at four times slower; OffscreenCanvas works in the worker, so the fallback frame is not needed. Conditions: host-held values (never round-trip a field's value before painting it); trees after the first as path diffs; at most one view event in flight per field is not needed (coalescing did not improve the slowed 2,000-node case: field p95 42.7 to 46.5 ms) but a `List` or `Table` of many rows should draw only what is visible; 2,000 nodes stays the hard limit, with "This is slow" more likely above 1,000.
- **D7, staying in the renderer: go, with conditions.** One worker per plugin costs 2.35 MB, round trips are under a millisecond and a frozen plugin cannot touch the UI thread. The one weakness is memory: one plugin can crash the window. The conditions: main handles `render-process-gone` (today it does only in smoke runs, so the window would stay empty), reloads the window, counts it toward safe mode (S11), and names the plugins that were running; the bootstrap removes what S7 found open. **Reserve B864** stays, now sized: a hidden frame of `msm-plugin://<id>` (or one for all plugins) per S4, at the cost of one process and a `frame-src msm-plugin:` line in the CSP; run it if a plugin is reported to take the window down, or before plugins with `Canvas` and WebGL are listed.

## S1 in full: typing through the kit

A text field and an echo of it ("Hello, <value>") at the top of a tree of 53, 501 and 2,006 nodes (sections, headings, rows of text, toggle and button). 80 keys typed with real key events; delay from `keydown` to the end of the frame after the character is in the DOM (requestAnimationFrame, then a message). "whole": the worker sends the whole tree; "whole-share": the host reuses unchanged subtrees before React; "diff": the worker sends path patches. "host": the field's value is held by the host and painted at once; "worker": the field shows the worker's value. Field and echo columns are median / p95 in ms.

Normal speed, a key every 100 ms (`results/s1.json`):

| Nodes | Tree | Value held by | Field paint | Echo paint | Keys lost | Final value right | Bytes a key | Host apply p95 |
|---|---|---|---|---|---|---|---|---|
| 53 | whole | host | 2.6 / 3.3 | 12.1 / 20.1 | 0 | yes | 2,560 | 0.8 |
| 53 | whole | worker | 12.2 / 19.3 | 12.2 / 19.4 | 0 | yes | 2,556 | 0.8 |
| 53 | diff | host | 2.6 / 8.9 | 13.7 / 23.9 | 0 | yes | 314 | 0.9 |
| 501 | whole | host | 3.8 / 6.2 | 14.0 / 22.1 | 0 | yes | 23,607 | 2.2 |
| 501 | whole | worker | 13.2 / 22.4 | 13.2 / 22.4 | 0 | yes | 23,605 | 1.8 |
| 501 | whole-share | host | 3.8 / 5.5 | 14.7 / 22.0 | 0 | yes | 23,597 | 2.0 |
| 501 | diff | host | 3.1 / 10.0 | 15.0 / 23.2 | 0 | yes | 325 | 1.5 |
| 2,006 | whole | host | 5.0 / 6.8 | 15.5 / 23.1 | 0 | yes | 95,647 | 6.6 |
| 2,006 | whole | worker | 17.7 / 25.3 | 17.7 / 25.3 | 0 | yes | 95,652 | 6.5 |
| 2,006 | diff | host | 4.7 / 7.4 | 16.6 / 24.8 | 0 | yes | 328 | 4.9 |

Four times slower, a key every 30 ms (`results/s1-fast-throttle4.json`):

| Nodes | Tree | Value held by | Field paint | Echo paint | Keys lost | Final value right | Host apply p95 |
|---|---|---|---|---|---|---|---|
| 53 | whole | host | 9.9 / 17.5 | 22.7 / 31.5 | 0 | yes | 5.0 |
| 53 | whole | worker | 25.3 / 42.8 | 25.4 / 42.8 | 0 | yes | 4.3 |
| 501 | whole | host | 17.0 / 22.8 | 33.5 / 42.4 | 0 | yes | 10.4 |
| 501 | whole | worker | 35.4 / 49.6 | 35.4 / 49.6 | **55** | **no** | 11.9 |
| 501 | whole-share | host | 13.9 / 20.2 | 26.2 / 38.4 | 0 | yes | 7.9 |
| 501 | diff | host | 12.6 / 20.4 | 27.8 / 42.5 | 0 | yes | 7.3 |
| 501 | diff | worker | 32.3 / 44.1 | 32.4 / 44.1 | 0 | yes | 9.0 |
| 2,006 | whole | host | 40.3 / 52.6 | 96.1 / 119.5 | 0 | yes | 33.1 |
| 2,006 | whole | worker | 84.1 / 118.5 | 84.2 / 118.6 | **47** | **no** | 40.6 |
| 2,006 | whole-share | host | 23.3 / 42.2 | 46.0 / 92.5 | 0 | yes | 22.7 |
| 2,006 | whole-share | worker | 65.9 / 109.5 | 67.8 / 109.5 | **36** | **no** | 27.4 |
| 2,006 | diff | host | 22.0 / 45.2 | 58.7 / 101.8 | 0 | yes | 33.6 |

With at most one event in flight and newer changes replacing a queued one (`results/s1-coalesce-fast-throttle4.json`): 501 nodes diff 12.0 / 20.1 and echo 27.0 / 38.9; 2,006 nodes diff 23.5 / 42.7, whole 22.7 / 46.5. The plugin's own render took 0.1 to 0.3 ms and its diff 0.2 to 2.1 ms (p95) in every case: the time is the host's React work and frame timing.

Why the worker-held value loses keys: React puts a controlled input back to the old value until the new tree arrives, so the next key edits the old text. That is a property of the approach, not of the machine.

## S2 in full: canvases in the worker

| Where | Context | Shape | Draw median / p95 ms | Interval median ms | Frames shown | Page frame p95 ms |
|---|---|---|---|---|---|---|
| harness, no GPU | 2D | transferred canvas | 0.6 / 1.5 | 32.7 | on screen (two screenshots differ) | 19.1 |
| harness, no GPU | 2D | ImageBitmaps | 1.0 / 2.0 | 32.9 | 90 of 90 | 18.4 |
| harness, no GPU | WebGL2 | either | no context | | | |
| harness, SwiftShader | 2D | transferred | 0.5 / 1.5 | 32.8 | | 59.4 |
| harness, SwiftShader | 2D | ImageBitmaps | 0.7 / 3.1 | 33.1 | 90 of 90 | 48.5 |
| harness, SwiftShader | WebGL2 | transferred | 0.2 / 0.6 | 33.3 | | 43.5 |
| harness, SwiftShader | WebGL2 | ImageBitmaps | 0.1 / 1.1 | 33.4 | 90 of 90 | 80.5 |
| built app, no GPU | 2D | both | 0.6 and 1.1 | 32.8 and 33.3 | 30 of 30 bitmaps | |
| built app, SwiftShader | 2D and WebGL2 | both | 0.2 to 0.7 | 32.9 to 33.4 | 30 of 30 bitmaps | |
| packaged app, no GPU | 2D | both | 0.5 and 0.9 | 32.7 and 32.8 | 30 of 30 bitmaps | |
| packaged app, SwiftShader | 2D and WebGL2 | both | 0.3 to 0.5 | 32.7 to 33.4 | 30 of 30 bitmaps | |

The page's frames slow under SwiftShader because SwiftShader composites on the CPU of this container, with or without a worker drawing; on a real GPU this does not apply (not measured here). Bitmaps: worker post p95 1.6 ms (3.0 SwiftShader), arrival p95 0.3 ms (3.2), host `transferFromImageBitmap` p95 0.1 ms. WebGPU's `navigator.gpu` exists in the worker; `requestAdapter()` gave `null` here.

## S4 in full: memory and crashes

| Workers | RSS MB | Proportional MB | Private MB |
|---|---|---|---|
| 0 | 108.9 | 55.6 | 29.7 |
| 10 | 134.2 | 80.2 | 53.8 |
| 20 | 157.6 | 103.7 | 77.3 |
| 40 | 204.1 | 150.1 | 123.7 |
| after terminating all | 141.5 | 87.2 | 60.7 |

- JS heap filled from one worker (`results/s4-hog-heap.json`): the renderer process ended with `crashed`, exit code 5 (V8 out of memory), peak 4.4 GB; Playwright's page reported "Target crashed". In the app this is the window: `index.ts` listens to `render-process-gone` only in smoke runs (grep), so the user would see an empty window and lose unsaved edits.
- ArrayBuffers (`results/s4-hog-arraybuffer.json`): 3,072 MB in 1.85 s in one call, under the `lower` deadline, page alive.
- A frame of another origin (`results/s4-frame*.json`): `msm-plugin://p1/host.html` with its own CSP header (`default-src 'none'; script-src 'self'; worker-src blob:; connect-src 'none'`) is blocked by the app's present CSP (no `frame-src`); with `frame-src msm-plugin:` it loads in its own renderer process, its `fetch` is refused, its `localStorage` works (to be removed or partitioned). Page to frame round trip p95 0.2 ms; page to frame to worker 0.4 ms. When its worker filled the heap, the frame's process ended, the page answered `1 + 1`, `webContents.isCrashed()` was false; the host saw only silence (no event), so a deadline or heartbeat must notice.

## S6 in full: the broker

`results/s6.json` and `s6-node.json`; 127.0.0.2 stood in for a public address.

| Case | Node `https` + `lookup` | Electron `net` |
|---|---|---|
| Approved host | 200, 21 ms; no cookie, no authorisation header | 200 |
| Host not approved, an address literal (`127.0.0.1`, `2130706433`), `http:` | refused before any request | (not tried: the broker's own checks) |
| Approved name resolving to 127.0.0.1 | refused in `lookup`; the server saw **no connection** | the request reached the server; the address shows only at `onResponseStarted` |
| Redirect to another host | not followed; refused | `redirect: 'manual'` stops it (`redirect` event, aborted) |
| Redirect on the same approved host | not followed; the broker may send it as a new checked request | as above |
| 50 MB answer, 10 MB cap | stopped at 10.5 MB in 64 ms, +23 MB memory | stopped at 10.6 MB in 25 ms |
| No answer | socket timeout (1 s in the test) | (not tried) |
| System proxy | not used (`HTTPS_PROXY` was set and ignored) | used |

`net.resolveHost` exists in Electron 45 but resolving and then requesting are two lookups, which leaves the window a name that changes its answer needs. A broker behind a proxy cannot check addresses at all (the proxy resolves), so a proxy option would have to refuse or trust; that is a question for later, and the guide should say that plugins' internet does not go through a proxy.

## S7 in full: what a plugin can still reach

Under the real bootstrap and the app's CSP, the same in the harness, the built app and the packaged app (`results/s7-harness.json`, `results/app-*.json`).

| Global or call | Today | Where it leads | Change asked |
|---|---|---|---|
| `fetch`, `XMLHttpRequest`, `WebSocket`, `WebSocketStream`, `EventSource`, `WebTransport`, `importScripts`, `indexedDB`, `caches`, `BroadcastChannel`, `Worker`, `SharedWorker`, `postMessage` | removed (undefined, also on the prototype chain) | | none |
| `navigator.storage` | removed | | none |
| `navigator.storageBuckets` | **open**: opened a bucket's IndexedDB and made an OPFS file | persistent storage, shared by all plugins and the Try it script worker (same origin) | remove (and `StorageBucketManager`); add to the hostile fixture |
| `navigator.locks` | **open**: `query` and `request` work | state shared with the app's origin and every plugin (a channel between plugins; could hold a lock the app takes, though the app uses none today) | remove |
| `Notification` | **open**: permission `granted`, a notification was shown | desktop notifications in the app's name | remove; main sets permission handlers that refuse notifications and devices |
| `import()` of `msm-app://app/` | **open** (CSP `'self'`): an app chunk ran in the worker until it met `document`; JSON modules read | the app's own public files; no DOM or bridge | accept (as B154 did); say so in the ADR |
| `import()` of `https:`, `data:`, `blob:`, `file:` | refused by the CSP | | none |
| `eval`, `new Function` | refused by the CSP | | none |
| `WebAssembly.compile`, `new WebAssembly.Module` | refused by the CSP (no `'wasm-unsafe-eval'`) | plugins cannot use Wasm | decide and document (the kit docs) |
| timers (`setInterval`, `setTimeout`, worker `requestAnimationFrame`) | **open** after a call returns | CPU use outside every deadline | a heartbeat while idle; "This plugin is busy" |
| `navigator.usb`, `hid`, `serial` | present; `getDevices` answered 0 | | remove (defence in depth) |
| `navigator.gpu` | present; adapter `null` here | the GPU process | remove unless `Canvas` wants WebGPU |
| `OffscreenCanvas` (2D, WebGL2) | open | the canvas node needs it | keep |
| `FontFace` with `https:` | refused | | none |
| `FontFace` with `local()` | open | system font fingerprint | accept |
| `performance.now()` | 100 µs steps, `crossOriginIsolated` false; `SharedArrayBuffer` undefined | | none |
| `navigator.userAgent`, `hardwareConcurrency`, `deviceMemory`, `connection`, `onLine`, `language` | readable | fingerprint only | accept |
| `addEventListener('message')`, `MessageChannel`, `crypto.subtle`, `URL.createObjectURL` | open | the plugin's own worker only | none |
| `navigator.sendBeacon`, `RTCPeerConnection`, `ShadowRealm`, `cookieStore` | absent in a dedicated worker | | none |

## S12 in full: three Studios as layouts

Parts counted are the things a person sees and uses (a field, a toggle, a list, a note, a preview, a section of its own). "Today" is what ADR 0137 D2's `studioLayouts` lists: fields of the kind's schema with plain labels, a kit widget and a More options flag. "With additions" adds the seven below. Judged by reading `games/ObjectiveStudio.tsx`, `blocks-items/PotionStudio.tsx` and `blocks-items/BlockStudio.tsx` (its 12 section components judged from their file headers).

| Studio | Parts | Today | With additions | Needs code |
|---|---|---|---|---|
| Objective (`msm:objective`, 266 lines) | 13 | 3 (23 %) | 12 (92 %) | 1: the live view of the sidebar |
| Potion (`msm:potion`, 428 lines) | 27 | 3 (11 %) | 22 (81 %) | 5: bottle preview, item names, brewing chain, the longer and stronger toggles' defaults worked out from the data |
| Block (`msm:block`, own file 1,030 lines) | 51 | 12 (24 %) | 38 (75 %) | 13: Type change in one step, previews and outline, From model, texture layers and holes, textures, triggers, Rules, the item toggle that restores the earlier item |

The seven additions the layout format needs:

1. **Shown when**: a field or group shown only when another field has a value (or the kind's type is one of a list).
2. **Choices from somewhere**: the target's facts (scoreboard criteria, display slots, render types), the project's elements of a kind (statistics, creative tabs, effects), the element's own data (its events); with plain labels and "as the game writes it" for an unknown value.
3. **One of several shapes**: a choice that writes a whole object for a union (number formats, drops as itself, a table or none).
4. **A list**: add, remove, a least and most count and the new row's data.
5. **Shown differently from stored**: an offset (level = amplifier + 1), a unit with words (ticks with minutes and seconds), a toggle that leaves the default out, an empty field that removes its object.
6. **An optional part**: a toggle that adds an object from a template or removes it.
7. **Text with values in it**: `{id}` and field values in a note or a command line.

## S13 in full: live views from lowered files

`scripts/s13-from-files.ts`, `results/s13.json`. Each built-in kind in `LIVE_VIEWS` was lowered on the default target with its default data. 64 of 78 give one file whose path is `<data|assets>/<namespace>/<folder>/<path>.<json|mcfunction>` and whose contents equal the element's data (every vanilla data, tag and look kind; `minecraft:sounds` failed only because its default data is not valid). The 14 others are 13 of MSM's own kinds (`msm:*`, whose first file is MSM's own and which plugins cannot lower to) and `minecraft:sounds`.

| Kind | Files it lowers to | Shown by |
|---|---|---|
| `sample:greeting` (the sample plugin) | `data/<ns>/function/greet_<path>.mcfunction`, `data/minecraft/tags/function/load.json` | `minecraft:function`, `minecraft:tag/function` |
| invented: treasure | `data/<ns>/loot_table/<path>.json`, `data/<ns>/function/give_<path>.mcfunction` | `minecraft:loot_table` (Roll it), `minecraft:function` |
| invented: gadget | `assets/<ns>/models/item/<path>.json`, `assets/<ns>/items/<path>.json`, `assets/<ns>/textures/item/<path>.png` | nothing: no registry entry for models or item files; textures are assets |

What the registry needs: an index from a lowered file's folder and extension to a kind (`ElementKindRegistry.kindForFolder` is the start), a function that turns the file back into a stand-in element, entries for `assets/*/items` and `models` (the app's model preview exists outside the registry), a `readProject` that serves the lowered files (pictures included), and one view that lays the stand-ins side by side as the bundle view does.

## Requested changes to ADR 0137

1. **D3**: field values are held by the host: `TextField`, `NumberField`, `Slider`, `ColourField`, `Select` and `Toggle` paint the user's change at once and tell the plugin after; a tree from the plugin does not overwrite a field while it has focus. Trees after the first are sent as path patches. `Picture` is shown from a `data:` URL (the CSP's `img-src` has no `blob:`). `Canvas` uses a transferred `OffscreenCanvas`. Replace "If the spike measures that typing … is too slow, or that `OffscreenCanvas` cannot be used …" with the result: both pass; the fallback frame is not needed, and a `srcdoc` frame could not run plugin code under the app's CSP anyway (S3).
2. **D3, limits**: keep 2,000 nodes; add that `List` and `Table` draw only their visible rows, and that the host shows "This is slow" by measured paint time, not by count.
3. **D5 and D4 (`project:read`)**: a plugin reads the project as ids and pages of at most 100 elements, never the whole project in one message (S5: 4 MB in one message blocks the UI thread 20 ms).
4. **D6**: the broker is Node's `https` with a `lookup` that checks every answer (loopback, private, link-local, carrier-grade NAT `100.64.0.0/10`, multicast, unspecified, IPv4-mapped IPv6 and unique local IPv6), refuses address literals, and makes a redirect on the same approved host a new checked request; not Electron's `net`. Add: the system proxy is not used (a consequence to state).
5. **D7**: name the memory weakness as measured (one plugin can crash the window; 3 GB of ArrayBuffers in under 2 s) and the conditions of staying: main handles `render-process-gone` (reload, count toward safe mode, name the running plugins); a heartbeat while a plugin is idle, because timers run between calls. B864 stays a reserve with S4's design and cost.
6. **D8, safe mode**: "usable" is when the renderer itself answers after the wait, not a timer in main; a clean quit before it does not count; S11's file and rules.
7. **D8, hash pinning and the signature**: SHA-256 at install and when a file's size or time changed (20 MB in 26 to 134 ms); the signature format of S8 (`index.json.sig`, base64 of the raw Ed25519 signature; the public key's 32 bytes in the app).
8. **D8, "What a plugin can never do"**: add "show a desktop notification", "keep anything between runs except through `storage`" and "talk to another plugin". The bootstrap's list grows by `navigator.storageBuckets`, `navigator.locks`, `Notification`, `navigator.usb`, `hid`, `serial`, `gpu` (S7); main refuses notification and device permissions for the app's session. Say that `import()` of the app's own files stays possible and harmless, and decide WebAssembly (refused today by the CSP).
9. **D2, `studioLayouts`**: the seven additions of S12, or say which are left to Tier 3.
10. **D12**: `fromFiles` needs the lowered-file index of S13; models, item files and textures need their own entries before "free" holds for looks.
11. **D2, `themes`**: a theme reaches the eight tokens only; 170 colour uses in `components/` and `studios/` do not follow it today (T1); game looks in Try it, live views and the Showcase keep their own colours on purpose.
12. **D10**: B865 is large: about 3,800 places in 375 files plus the packages (T2).
13. **Consequences, size**: the kit is a few kilobytes of its own; the field parts it reuses must be shared, not copied (T3).

## Requested changes to the plan

- **B841**: `SandboxMethod` gains view events, path patches and worker-to-host calls with paging; the manifest's `experimental` list as in D13.
- **B842**: bootstrap removals and the hostile fixture's attacks from S7 (storage buckets, locks, notifications, devices, GPU, timers after a call, `import()` of app files as accepted); host-held field values; patches; the idle heartbeat; canvas transfer as a message the bootstrap handles (the plugin has no `postMessage`); start and stop without a restart per S9 (a `ProjectSession` method that rebuilds its plugin lists, the schema cache dropped, plugins as state in `App`).
- **B843**: the broker on `node:https` with the `lookup` check (`spike-src/broker/broker-spike.mjs` is a starting point, not code to copy); permission handlers; `render-process-gone` handling; safe mode's marks per S11; the signature format and hashing per S8.
- **B850**: the seven layout additions, and the three Studios of S12 as its test cases.
- **B851**: host-held values, patches, visible rows only for `List` and `Table`, `data:` pictures, the kit's field parts shared with the Studios or moved into `components/ui`.
- **B853**: the lowered-file index, stand-in elements, entries for models and item files, a reader over lowered files.
- **B848**: converts or lists the 170 chrome colours outside the tokens first.
- **B859**: hot reload restarts the worker (no module replacement needed: about 30 ms to repaint); debounce the watch by about 50 ms (Windows `fs.watch` may report one save several times; verify at implementation); an optional state handover for the plugin's own memory.
- **B862**: the hostile fixture covers S7's table; one e2e case for a plugin that fills its heap: the window comes back and the plugin is off.
- **Reserves**: B864 as above, with S4's numbers. **B867 (a frame for `Canvas`) is not needed**: drop it or keep it only as "a `msm-plugin://` frame", since a `srcdoc` frame cannot run plugin code. B865 sized by T2.

## Surprises

- Storage buckets give every plugin persistent IndexedDB and files despite the bootstrap removing `indexedDB`, `caches` and `navigator.storage`; the Try it script worker (`tryit/script-worker.ts`) strips the same list and so probably has the same gap (not measured here).
- Notifications are granted by default: the app sets no permission handlers.
- A worker's heap running out kills the whole renderer, and the app has no recovery outside smoke runs.
- Electron 45 isolates sandboxed `srcdoc` frames in a process of their own, so the old reason for rejecting the iframe (the UI thread, ADR 0035 D6) no longer holds; the CSP reason does.
- WebAssembly is refused in plugin workers by the CSP, which ADR 0035 did not mention.
