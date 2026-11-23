# ADR 0123: Gzipped vendored target data, deepslate tree-shaking and a 19 MB renderer budget

## Context

After B582 (the live world map) `app.asar` was 31.03 MB of its 32 MB budget and the renderer output 17.56 MB of 18 MB, above the stop lines the plans set for app briefs (31 MB and 17.5 MB: the live world generation plan, since closed into [ADR 0119](0119-live-worldgen-preview.md), and [`docs/PLAN-live-views.md`](../PLAN-live-views.md)), so no further app brief could start. Live world generation and the live views still have renderer and main code to land.

Both budgets had a reserve on record:

- **`app.asar`:** [ADR 0079](0079-compact-vendored-target-data-in-the-asar.md) D4 kept back storing the vendored target data gzipped (`.json.gz`, decoded in `readVendored`), "under its own ADR", for the moment the asar came within 1 MB of its budget again. `docs/PLAN-live-views.md` scheduled it as B602.
- **Renderer:** [ADR 0091](0091-vehicle-flows-studios-try-it-and-tests.md) D5 raised the budget from 16 to 18 MB (route b) because `tools/check-size` sums every renderer file and Monaco, all lazy, is about 11 MB of it. `docs/PLAN-live-views.md` (ADR 0120 D10) already foresaw a move to 19 MB (stop line 18.5 MB) if 1 MB of savings could not be found first.

This ADR is that "own ADR" for the gzip, and records the renderer search and the budget move.

### Measurements (2026-11-22, Linux `pnpm build` and `dist:dir` at 9c2483b, then with this ADR)

| | Before | After | Change |
|---|---:|---:|---:|
| `app.asar` | 32,585,540 B (31.08 MB) | 27,296,177 B (26.03 MB) | -5,289,363 B |
| `app/out/main/vendor` | 5,733,611 B (compact JSON and two `LICENSE` files) | 622,144 B (`.json.gz` and two `LICENSE` files) | -5,111,467 B |
| Renderer output (`app/out/renderer`) | 18,463,969 B (17.61 MB) | 18,284,869 B (17.44 MB) | -179,100 B |
| Terrain worker chunk (`assets/worker-*.js`) | 339,344 B | 193,693 B | -145,651 B |
| The preview chunks that carry deepslate (before: `worldgen`, `asset-source`, `climate`; after: `asset-source`, `climate`, `Vector`) | 168,341 B | 139,484 B | -28,857 B |
| The first-paint `index` chunk (deepslate's NBT code) | 2,892,612 B | 2,888,113 B | -4,499 B |

(1 MB = 1024 × 1024 bytes, as `tools/check-size` prints.)

The vendored files, compacted and gzipped at level 9: mcdoc symbols 156,110 and 156,121 bytes (from 1.63 MB each), registries 133,739 and 136,834, block states 10,417 and 10,686, the command trees 7,819 and 7,821, `version.json` 222 and 241. Gunzipping the 26.3 symbols takes 4.3 ms and the registries 2.8 ms (best of 5, Node 24, this machine), against 14 ms to parse the symbols (ADR 0079), and runs on zlib's thread pool, not on the main process's event loop.

How the renderer is made up (sizes before minification from the build's own chunk listing, a one-off run deleted afterwards): Monaco about 7.1 MB outside its workers (the TypeScript worker is 6.6 MB more on its own), the library's starters and examples 0.92 MB, **the 26.3 target's Java project generator 1.14 MB** (`packages/targets/mc-26.3/src/java-project/`, mostly Java template strings), React DOM 0.54 MB, the msm mcdoc 0.45 MB, deepslate 0.46 MB, the renderer's own code the rest. Checked and found clean: no source maps, no locale files, no renderer JSON over 100 kB, no copy of the vendored data, Monaco loaded feature by feature (`monaco-setup.ts`), every Studio lazy.

## Decision

### D1 Store the vendored JSON gzipped (ADR 0079 D4)

`bundleVendoredData` in `app/electron.vite.config.ts` compacts every vendored `.json` file as before (ADR 0079 D1), gzips it at level 9 (`zlib.gzipSync`; the header carries no modification time) and emits it as `vendor/<target folder>/<file>.json.gz`; the rewritten `new URL(…)` names the `.gz` file. Non-JSON files (vanilla-mcdoc's `LICENSE`) are copied as they are. The sources under `packages/targets/*/vendor/` stay pretty-printed and are still written only by the sync tools; development runs and package tests read them unchanged.

`app/src/main/platform/targets.ts` decodes: `decodeVendored(url, bytes)` gunzips when the URL's path ends in `.gz` and returns the bytes as they are otherwise, so `readVendored` hands its callers (the `targets:readVendored` IPC channel, the mcfunction broker) the same JSON bytes in the built app and in development. A `.gz` file that does not gunzip fails with its path. It uses zlib's asynchronous `gunzip` rather than ADR 0079 D4's `gunzipSync`, so a first schema load does not block the main process. Nothing else reads `out/main/vendor` (checked, as in ADR 0079).

### D2 `check-size` checks the new form

`tools/check-size` keeps its rules for the vendor folder (it exists when `out/main` does; vanilla-mcdoc's `LICENSE` beside its data) and replaces the compact-JSON rule:

- a plain `*.json` file under `app/out/main/vendor` fails (the vendored JSON must be gzipped), naming the file;
- every `*.json.gz` file must gunzip and its JSON must contain no line feed (compact, ADR 0079 D3); one that does not fails, naming the file;
- the reported vendored total says "compact JSON, gzipped".

The `app.asar` budget stays at 32 MB.

### D3 deepslate is tree-shaken in the renderer and its workers

deepslate 0.27.2 declares no `sideEffects` in its `package.json`, so the bundler kept every deepslate module reachable from an import; and three of its modules (`RandomState`, `Mesh`, `SpecialModel`) import the package root, so the terrain worker carried deepslate's renderers and the preview chunks its world generation. The renderer build and the worker build now set `treeshake.moduleSideEffects` rules (`DEEPSLATE_SIDE_EFFECTS` in `app/electron.vite.config.ts`): deepslate's modules are side-effect free except `lib/nbt/tags/`, whose classes register themselves with `NbtTag` when loaded. Every other top-level statement in deepslate is a declaration, a namespace or a registry made in a static field; those registries (`WorldgenRegistries`, `Structure`, the structure registries) are kept whenever the code that reads them imports them, the only way deepslate's own code reaches them (`RandomState` looks up `worldgen/noise`, which `@msm/terrain` imports through `WorldgenRegistries`). Other packages keep their own `sideEffects` declarations; the main build is unchanged.

The terrain worker cannot share deepslate with the main thread: a module worker is its own realm and loads its own copy. What it carries is now only what the engine uses.

### D4 The renderer budget moves from 18 to 19 MB (amends ADR 0091 D5)

D3 saved 0.17 MB, which leaves the renderer at 17.44 MB, above 17.0 MB. The one large saving left is the 26.3 Java project generator (1.14 MB before minification) in the first-paint bundle; it is reached through `target.javaProject.generate`, which the plugin API declares synchronous (`JavaProjectGenerator`, ADR 0034), so moving it out of the renderer means either an asynchronous generator in the plugin API or the eject running in main: an architecture change for its own ADR, not a size fix. The library's starters and examples are already a lazy chunk, and moving data to main over IPC only moves bytes into the asar.

So, as ADR 0091 D5 allows with a recorded reason and as `docs/PLAN-live-views.md` (ADR 0120 D10) foresaw, `tools/check-size` raises `rendererBytes` to **19 MB**. The stop line for app briefs becomes **18.5 MB** (it was 17.5 MB); the `app.asar` stop line stays 31 MB. This is the recommended option of the user's earlier standing choice ("take the recommended option") and is recorded as a **vetoable default**: if the user vetoes it, the budget returns to 18 MB and the generator move above becomes the next brief.

## Alternatives considered

- **Vendored data as `extraResources`.** Rejected again for ADR 0079's reasons: it ships the same bytes and only hides them from the budget.
- **`gunzipSync` as ADR 0079 D4 wrote it.** Works, but blocks the main process for a few milliseconds per file on first use; the asynchronous call costs nothing more.
- **Brotli instead of gzip.** Somewhat smaller, but the 0.6 MB left is not the tight budget any more, and gzip's level 9 output is what D4 measured and planned for.
- **A separate deepslate entry per subpath.** deepslate's subpath exports (`deepslate/worldgen`, `deepslate/render`) re-export the core, and its own modules import the root; only side-effect rules fix the reach.
- **Trimming Monaco further.** Monaco already loads feature by feature; the remaining contributions back the JSON and script editors' behaviour, so cutting them changes what the editors do.
- **Moving the Java generator out of the renderer now.** The largest saving, but a plugin API change (see D4); recorded as a follow-up.
- **Keeping 18 MB and stopping app work.** Blocks live world generation and the live views on a budget whose bulk is lazy Monaco code that no user downloads separately.

## Consequences

- `app.asar` drops by 5.29 MB to 26.03 MB of 32 MB; the installed app shrinks by the same, and the Windows installer only a little (NSIS already compressed the JSON with LZMA).
- The bytes in `out/main/vendor/` are gzip of the compact JSON; `readVendored` returns the same parsed values as before (checked: all ten files gunzip to JSON deep-equal to their sources, with no line feed).
- The renderer drops by 0.17 MB to 17.44 MB and has a 19 MB budget, 18.5 MB stop line: 1.06 MB of room before the stop line, 1.56 MB before the budget.
- `tools/check-size` fails plain or non-compact vendored JSON. Its README, DESIGN §14, `app/CLAUDE.md`, `docs/HANDOFF.md` and the two plans name the new numbers and stop lines; `docs/PLAN-live-views.md`'s B602 is done ahead by this ADR.
- Follow-up (needs an ADR): load the 26.3 Java project generator lazily (an asynchronous `JavaProjectGenerator.generate`, or the eject in main), about 1 MB of the renderer's first-paint bundle. Done by [ADR 0126](0126-java-project-generator-loaded-on-first-use.md) (2026-11-23: `Target.loadJavaProject`, plugin API 1.24.0; first paint 0.93 MB smaller, the budgeted renderer total unchanged because `tools/check-size` counts the lazy chunk).

## Status

Accepted (2026-11-22). D4 is a vetoable default (the user's standing "take the recommended option").

## Findings from implementation

- 2026-11-22 (size brief on branch `size1`): measured as in the table above. Checks run: `pnpm lint`, `pnpm typecheck`, the targets, tools and app tests, `pnpm build`, `dist:dir`, `check-size` (within budget), e2e `smoke`, `worldgen-path`, `tryit-path`, `datapack-path` and `targets-path` (the last two read the gzipped data through the mcfunction broker and the schema loader on both targets), `smoke:packaged`. A one-off test (deleted) ran the built terrain worker chunk in Node over the terrain package's hand-written hills with a two-biome `multi_noise` source, glowstone and oak features, and compared its biomes, heights, side cut, values and feature columns with the source engine: equal.
- `turbo` restoring a cached app build over an existing `app/out` leaves the earlier build's files beside the new ones (seen as plain and gzipped vendored files side by side, and two sets of renderer chunks, until `app/out` was deleted). `check-size` caught it; measure from an empty `app/out`.

- Amended 2026-11-23 by [ADR 0126](0126-java-project-generator-loaded-on-first-use.md) D4: the renderer total budget is 21 MB (stop line 20.5 MB) and the first-paint set has its own 6 MB budget (stop line 5.5 MB); this ADR's 19 MB and 18.5 MB are superseded (a vetoable default).
