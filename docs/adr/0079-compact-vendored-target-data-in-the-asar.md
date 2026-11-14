# ADR 0079: Compact vendored target data in the asar

## Context

`app.asar` is 31.7 MB of its 32 MB budget (`tools/check-size`), above the 31.8 MB stop line that ADRs 0076 and 0078 set for library briefs only by a whisker, and the next batches (B13 portals, B14 particles, B15 client side) add renderer code and library content. Every earlier plan reserved one remedy for this moment: "vendored target data outside the asar" (B166 in the ROADMAP follow-ups, reserve brief B329 in the containers plan, HANDOFF follow-ups), that is, `extraResources` files read from `process.resourcesPath` when packaged. That remedy needs its own ADR first; this is it.

What the budget protects. The `app.asar` row of `tools/check-size/README.md` says it bounds "everything MSM ships besides Electron itself"; DESIGN §14 "Bundle budget" ties it to the 150 MB installer budget and to keeping heavy parts lazy, and [ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md) raised it from 25 MB to 32 MB precisely so that a second target's vendored data would fit. The budget is therefore a ceiling on MSM's own payload, not on one container format. A fix that only moves bytes from `app.asar` to `resources/` shrinks the number without shrinking what ships.

How vendored data reaches the app today. Each target's `src/vendored.ts` names its files with `new URL('../vendor/…', import.meta.url)`. In the main build, the `bundleVendoredData` plugin in `app/electron.vite.config.ts` copies each named file byte for byte into `out/main/vendor/<target folder>/…` and rewrites the URL; in the renderer build, `dropVendoredDataFromRenderer` turns the URLs into inert `msm-vendored:` URLs. Main reads a file only when asked (`app/src/main/platform/targets.ts` `readVendored`, behind the `targets:readVendored` IPC channel and the lazy mcfunction broker), and the renderer memoises per target (`session/schema-context.ts`, `project-session.ts`). So the data is already loaded on demand, per target, through IPC, and is not duplicated between main and renderer. The source files are pretty-printed by `tools/sync-mcdoc` and `tools/sync-mcmeta` (for reviewable diffs), and the build copies the indentation into the asar.

### Measurements (2026-11-14, Linux `dist:dir` of the current tree)

`app.asar` is 33,213,535 bytes (31.7 MB; 51 files, 13.8 kB header). Contents by part:

| Part | Bytes | MB |
|---|---:|---:|
| `out/renderer/assets` | 15,074,707 | 14.4 |
| `out/main/vendor` (two targets' vendored data) | 10,950,168 | 10.4 |
| `out/main/scripting-engine-*.js` (lazy, minified `typescript`) | 3,847,238 | 3.7 |
| `out/main/index.js` (unminified on purpose) | 1,310,605 | 1.2 |
| `out/main/mcfunction-*.js` (lazy Spyglass) | 1,112,982 | 1.1 |
| `out/main/main-*.js` | 527,379 | 0.5 |
| `out/main/ai-client-*.js` (lazy, minified) | 354,659 | 0.3 |
| `out/preload`, `index.html`, `package.json` | 21,965 | 0.0 |

The vendored files as bundled, compacted (`JSON.stringify(JSON.parse(…))`) and gzipped at level 9:

| File | As bundled | Compact | Gzip -9 |
|---|---:|---:|---:|
| mc-26.3 `vanilla-mcdoc/symbols.json` | 3,515,193 | 1,627,141 | 211,054 |
| mc-26.4 `vanilla-mcdoc/symbols.json` | 3,516,401 | 1,627,465 | 211,092 |
| mc-26.3 `mcmeta/registries.json` | 1,052,538 | 885,121 | 145,123 |
| mc-26.4 `mcmeta/registries.json` | 1,081,819 | 909,758 | 148,415 |
| mc-26.3 `mcmeta/commands.json` | 583,449 | 185,285 | 16,513 |
| mc-26.4 `mcmeta/commands.json` | 583,885 | 185,392 | 16,548 |
| mc-26.3 `mcmeta/blocks.json` | 303,902 | 153,156 | 13,375 |
| mc-26.4 `mcmeta/blocks.json` | 312,097 | 157,367 | 13,623 |
| both `mcmeta/version.json` | 884 | 768 | 513 |
| **Total** | **10,950,168** | **5,731,453** | **776,256** |

Other findings:

- 47.7% of the vendored bytes (5,218,715) are indentation and line breaks.
- No copy of the vendored data is in the renderer output (a distinctive mcdoc description string occurs only in `out/main/vendor/*/vanilla-mcdoc/symbols.json`) or inlined into any main chunk.
- Parsing the compact mcdoc symbols takes 14.2 ms against 19.0 ms for the indented file (best of 5, Node 24, this machine); registries 2.1 ms against 2.2 ms. Compacting makes the first schema load slightly faster, never slower.
- The unminified main chunks (`index.js`, `mcfunction-*`, `main-*`, 2.95 MB together) are unminified by choice, for readable stack traces (`MINIFIED_CHUNK_PREFIXES` in the config).
- The support policy (ADR 0037 D1) keeps two targets at a time, so the vendored data does not grow with each Minecraft version; it changes size only when a re-pin changes the schemas.

## Decision

- **D1 Compact the vendored JSON at bundle time.** `bundleVendoredData` in `app/electron.vite.config.ts` emits every vendored `.json` file as `JSON.stringify(JSON.parse(text))` (UTF-8, no indentation, key order kept), and fails the build with the file's path when a file does not parse. Any non-JSON file is still copied byte for byte. The sources under `packages/targets/*/vendor/` stay pretty-printed and are still written only by the sync tools; development runs (`pnpm dev`, which reads the sources) and every package test are unchanged. Consumers already parse the bytes (`readVendoredJson`, the mcfunction broker, `schema-context.ts`), so they see identical values. This takes `app.asar` from 33,213,535 to about 27,994,800 bytes (about 26.7 MB), a win of 5.0 MB, more than twice the 2 MB asked for, and shrinks the installed app and its read time by the same amount.
- **D2 The data stays in the asar.** No `extraResources` for vendored data, no `process.resourcesPath` branch: the packaged and source layouts stay the same, and the budget keeps counting everything MSM ships.
- **D3 The budget stays at 32 MB, and a new check keeps the win.** `tools/check-size` keeps `asarBytes: 32 MB` (the number ADR 0037 chose for two targets; the headroom now pays for B13 to B15 without another raise), and gains:
  - an enforced rule: every `*.json` under `app/out/main/vendor/` contains no line feed byte (0x0A); compact `JSON.stringify` output never does, since line breaks inside strings are escaped, so a regression to copying indented files fails CI at once;
  - an enforced rule: `app/out/main/vendor/` exists when `app/out/main` does (a build that lost its vendored data must not pass as "small");
  - a reported line: the `app/out/main/vendor` total.
  The 31.8 MB stop line in ADRs 0076 and 0078 is retired with this ADR; app and library briefs keep reporting the `app.asar` number from `check-size`.
- **D4 Reserve, not now: gzip.** If the asar again comes within 1 MB of its budget, the next step is to store the vendored files gzipped (`.json.gz`, decoded in `targets.ts` `readVendored` with `zlib.gunzipSync`, about 0.8 MB for both targets, a further 4.9 MB), under its own ADR. It is not done now because the NSIS installer already compresses the asar with LZMA (so it would barely change the download), it adds a decode step and a second file name per key, and D1 alone gives more than the headroom asked for.

## Alternatives considered

- **Vendored data as `extraResources` outside the asar (the reserved B166/B329).** Moves 10.4 MB out of `app.asar` but ships exactly the same bytes, so it games the budget: either the budget silently stops covering a fifth of MSM's payload, or `check-size` must add `resources/vendor` back in and nothing is won. It also adds a packaged-versus-source path split (as `runtime-jar.ts` has for the runtime jars), a second place for electron-builder to forget files, and a packaged-only failure mode. Rejected; it remains possible later together with D1 if a non-size reason appears (for example sharing the data with an external tool).
- **Lazy-load per target.** Already the case: main reads a target's files only on that target's first schema or mcfunction use, and the renderer memoises per target. Nothing to win.
- **Drop duplicate copies between main and renderer.** Checked: there are none (`dropVendoredDataFromRenderer` already prevents them, and `check-size` already fails any renderer JSON over 100 kB).
- **Minify the remaining main chunks.** About 1.5 MB more, but loses readable stack traces in user crash reports, which ADR 0031 D6 chose to keep. Rejected.
- **Strip mcdoc descriptions (`desc`) from the symbols.** Smaller still, but the descriptions feed form hints and hover text, and editing vendored data by hand breaks the "sync tools only" rule. Rejected.
- **Raise the budget.** Not needed: D1 frees 5 MB honestly. Raising the budget would have been the honest answer only if no real bytes could be removed.

## Consequences

- `app.asar` drops to about 26.7 MB of 32 MB (about 5.3 MB of headroom), the installed app shrinks by 5.0 MB, and first schema loads parse slightly faster. The Windows installer shrinks only a little, since LZMA already compressed the whitespace.
- The bytes in `out/main/vendor/` no longer equal the source files byte for byte; they equal them as parsed JSON. Nothing compares the bytes (checked: no test, script or workflow reads `out/main/vendor`).
- `tools/check-size` gains two enforced rules and one reported line; CI's existing `node tools/check-size/index.ts` step in `.github/workflows/ci.yml` enforces them with no workflow change.
- The ROADMAP follow-up "Vendored target data outside the asar (was B166)" is replaced by D4's gzip reserve, and the HANDOFF and ADR 0076/0078 references to B329 as the pending remedy are closed by this ADR's brief.
- Finding, out of scope here: the app ships vanilla-mcdoc's `symbols.json` but not its `LICENSE` (`vendored.ts` names only the data files, so `bundleVendoredData` never emits it). Check the licence's notice requirement and, if needed, add a third-party notices file in a separate brief.

## Brief B329: compact vendored target data (one Opus executor, medium effort)

**Purpose.** Implement D1 and D3: compact the vendored JSON in the main build, guard it in `tools/check-size`, and update the docs that describe the asar.

**Owner files (touch nothing else).**

- `app/electron.vite.config.ts`
- `tools/check-size/index.ts`, `tools/check-size/check-size.test.ts`, `tools/check-size/README.md`
- `docs/DESIGN.md` (§14 "Bundle budget" paragraph only)
- `docs/ROADMAP.md` (the follow-up line "Vendored target data outside the asar (was B166)" and the containers follow-up mentioning "reserve brief B329")
- `docs/HANDOFF.md` (the lines naming `app.asar` at 31.5 of 32 MB and B329 as pending)
- `packages/targets/CLAUDE.md` (the sentence "The app's main build bundles every target's vendored data into `out/main/vendor/`": add "compacted, ADR 0079")
- `docs/DEVLOG.md` (append one entry)

Not in scope: anything under `packages/targets/*/vendor/` or `src/` (the sources stay pretty-printed), the sync tools, `app/src/**`, `electron-builder.yml`, CI workflows, the ADR's status (the orchestrator sets it after review), gzip (D4), the LICENSE finding.

**Steps.**

1. In `bundleVendoredData` (`app/electron.vite.config.ts`), read the file once; when `file` ends with `.json`, decode it with `new TextDecoder('utf-8', { fatal: true })`, `JSON.parse` it inside a `try`, and emit `JSON.stringify(parsed)` as the asset `source`; on a parse error throw `new Error(\`Vendored file ${path} is not valid JSON: ${message}\`)` so the build fails. Other files keep the byte-for-byte copy. Update the plugin's doc comment to say the JSON is compacted (ADR 0079) and that sources stay pretty-printed. Keep `apply: 'build'`.
2. In `tools/check-size/index.ts`:
   - add `vendorFiles: FileSize[] | null` (files under `app/out/main/vendor`, `null` when the folder is missing) and `looseVendorJson: string[]` (paths, relative to `app/out/main/vendor`, of `*.json` files whose bytes contain 0x0A; empty when none or when the folder is missing) to `Measurements`, filled in `measure` (read each JSON file's bytes with `readFileSync` and test `includes(0x0a)`);
   - in `checkBudgets`: when `mainFiles !== null` and `vendorFiles === null`, push `app/out/main/vendor not found: the main build lost the vendored target data (ADR 0079).`; for each path in `looseVendorJson`, push `Vendored JSON out/main/vendor/<path> is not compact (has line breaks): bundleVendoredData must compact it (ADR 0079).`;
   - in `report`, after the main output lines, add `Vendored target data: <total> in app/out/main/vendor (compact JSON, ADR 0079)`;
   - update the header comment's enforced list (items 5 and 6) and the asar item's rationale (ADR 0037, ADR 0079).
3. In `tools/check-size/check-size.test.ts`: extend the `passing` fixture with `vendorFiles` and `looseVendorJson: []`; add tests that (a) a loose vendored JSON path is a violation naming the file, (b) a missing vendor folder with main present is a violation, (c) `vendorFiles: null` with `mainFiles: null` adds no vendor violation (the existing "main missing" behaviour stays), (d) `measure` on a temporary tree finds a compact file clean and an indented file loose, (e) `report` prints the vendored total. Keep every existing test passing.
4. `tools/check-size/README.md`: rewrite the `app.asar` row's "Why" with the new numbers (main about 11 MB with two targets' compact vendored data of about 2.9 MB each; vendored data compacted at build, ADR 0079; the extraResources step replaced by the gzip reserve) and add rows for the two new enforced rules; add the vendored total to "Reported only".
5. Docs: in DESIGN §14 "Bundle budget" append one sentence: from ADR 0079 the main build compacts the vendored JSON (about 5.0 MB less in `app.asar`, which is 26.7 MB after B329 (use the measured number)), and `check-size` fails indented vendored JSON or a missing vendor folder. In the ROADMAP, replace the B166 follow-up with "Vendored target data gzipped in the asar (ADR 0079 D4): only if `app.asar` comes within 1 MB of its 32 MB budget" and change the containers follow-up's B329 clause to "done (ADR 0079, B329)"; in HANDOFF, replace the 31.5 MB / B329-pending lines with the measured number and "B329 done (ADR 0079)"; update the `packages/targets/CLAUDE.md` sentence.
6. Append a DEVLOG entry `## 2026-11-14 — executor — B329 compact vendored target data` (What / Decisions / Next) with the before and after `app.asar` bytes and the deep-equality result from the exit criteria.

**Tests and commands (from the repository root; headless steps under `xvfb-run -a`).**

```sh
pnpm lint
pnpm typecheck
pnpm --filter @msm/tools test
pnpm --filter @msm/app test
pnpm build
xvfb-run -a pnpm --filter @msm/app smoke
xvfb-run -a pnpm --filter @msm/app dist:dir
xvfb-run -a pnpm --filter @msm/app smoke:packaged
node tools/check-size/index.ts
xvfb-run -a pnpm --filter @msm/app e2e
```

One-off equivalence check after `pnpm build` (record the result in the DEVLOG; do not commit it as a file):

```sh
node -e "const fs=require('fs'),p=require('path'),a=require('assert');for(const t of fs.readdirSync('app/out/main/vendor'))for(const d of fs.readdirSync(p.join('app/out/main/vendor',t)))for(const f of fs.readdirSync(p.join('app/out/main/vendor',t,d))){const o=fs.readFileSync(p.join('app/out/main/vendor',t,d,f),'utf8');a.deepStrictEqual(JSON.parse(o),JSON.parse(fs.readFileSync(p.join('packages/targets',t,'vendor',d,f),'utf8')));a.ok(!o.includes('\n'));console.log('ok',t,d,f)}"
```

**Exit criteria.**

- `node tools/check-size/index.ts` passes and prints `app.asar` at or below 27.5 MB (expected about 26.7 MB, 27,994,800 bytes give or take a few kB from code drift); the report shows the vendored total at about 5.5 MB.
- The equivalence check prints `ok` for all ten files (five keys on two targets) and fails on none.
- Temporarily copying one indented source file over its `out/main/vendor` counterpart makes `check-size` exit 1 naming that file (verify by hand, then rebuild).
- `smoke`, `smoke:packaged` and the full `e2e` suite pass (they load schemas, registries and the mcfunction service from the bundled data on both targets; `targets-path` upgrades to 26.4).
- `pnpm lint`, `pnpm typecheck`, `@msm/tools` and `@msm/app` tests pass; no file outside the owner list changed; `app/out` and `app/dist` deleted at the end.

## Status

Accepted (2026-11-14).

## Findings from implementation

- B329 (2026-11-14): `app.asar` went from 33,213,535 bytes (31.7 MB) to 27,997,478 bytes (26.7 MB), saving 5,216,057 bytes; vendored data is 5.5 MB compact. All ten vendored JSON files deep-equal their sources. Smoke, packaged smoke and e2e (41 of 41) pass.
- The LICENSE finding above is resolved in the same brief: `bundleVendoredData` copies a `LICENSE` lying beside vendored files, so vanilla-mcdoc's MIT licence ships at `out/main/vendor/<target>/vanilla-mcdoc/LICENSE`, and `check-size` fails a `vanilla-mcdoc` folder without it. mcmeta has no vendored licence file, so no rule covers it; a general third-party notices file remains a follow-up.
- `check-size` enforces: a vendor folder exists when `out/main` does; no vendored `*.json` contains a line feed; vanilla-mcdoc ships its licence.
- After the portal batch (ADRs 0077, 0078; measured 2026-11-14 at b605da4 with `pnpm build`, `dist:dir` and `check-size`): `app.asar` 28,182,916 bytes (26.9 MB), 185,438 bytes more than right after B329 (the portal briefs after B329); vendored data 5.5 MB.
