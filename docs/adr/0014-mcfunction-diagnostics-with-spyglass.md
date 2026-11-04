# ADR 0014: mcfunction diagnostics with Spyglass, offline, in the main process; JSON gate stays `validateJson`

## Context

Phase 2 ([ROADMAP](../ROADMAP.md)) needs an mcfunction editor with diagnostics and completion, and DESIGN promised Spyglass for it ([Schema System](../DESIGN.md#6-schema-system-mcdoc), [Tech Stack](../DESIGN.md#14-tech-stack)). [ADR 0009](0009-phase1-validation-gate.md) deferred the Spyglass JSON checker and left a research note: populate a `SymbolUtil` from the vendored export and never call `je.initialize`, which fetches version data and `@vanilla-mcdoc` from the network.

A throwaway spike on 2026-11-04 (scratchpad only, not in the repository) answered whether Spyglass can check mcfunction offline. Verified facts from that spike:

| Fact | Value (verified 2026-11-04) |
|---|---|
| Packages | `@spyglassmc/core` 0.4.57, `@spyglassmc/mcfunction` 0.2.60, `@spyglassmc/java-edition` 0.3.70 (pinning `json` 0.3.61, `mcdoc` 0.3.61, `nbt` 0.3.63, `locales` 0.3.30), `vscode-languageserver-textdocument` 1.0.16; the Spyglass line was last published 2026-10-13 |
| Data | misode/mcmeta `<version>-summary` tag: `commands/data.min.json` (185,424 bytes for 26.3) and `blocks/data.min.json` (153,157 bytes) exist; `fluids/data.min.json` does not (404), and `java-edition` ships `dependency.Fluids` instead; `registries/data.min.json` is already vendored by `tools/sync-mcmeta` |
| Timing | Initialisation 340–450 ms; parse 14 ms and check 4 ms for a 15-line file |
| Diagnostics | Parse and check errors have severity 3 (`bogus command here`: "Expected advancement, attribute, …" and "Trailing data"; `tp @s 1 2`: "Expected a float"); the `undeclaredSymbol` linter reports `Cannot find item "minecraft:not_an_item"` and `Cannot find function "msm_sample:missing"` at severity 2; a declared project function passes; `$say $(name)` and a `\` line continuation parse cleanly |
| Completion | After `give @s minecraft:sto`, 3,316 items |
| Gaps | Block-state property checks (`stone[wat=1]`) reported nothing (verify at implementation); `ErrorReporter.dump()` empties the reporter |
| Size (JavaScript only) | `core` 337 kB; `java-edition` 272 kB plus a 2.0 MB Unicode lookup table imported statically; `mcdoc` 213 kB; `nbt` 68 kB; `mcfunction` 22 kB; `json` 22 kB; `locales` 4 kB plus 140 kB of JSON; `@zip.js/zip.js` imported statically by `java-edition/lib/dependency/mcmeta/versions.js`; `@spyglassmc/core` depends on Node-only packages (`decompress`, `follow-redirects`, `whatwg-url`) |

The recipe that worked (Node 22, no network):

1. `new core.MetaRegistry()`, `new core.SymbolUtil({})`, `core.VanillaConfig`.
2. `je.mcf.initialize({ meta, config, logger: core.Logger.noop(), isDebugging: false }, commands, mcVersion)`.
3. `je.dependency.symbolRegistrar({ blocks, commands, fluids: je.dependency.Fluids, registries, checksum }, mcVersion)(symbols, {})`.
4. Project ids are declared with `symbols.query('spyglass://msm', 'function', 'ns:path').enter({ usage: { type: 'declaration' } })`.
5. `project` is a plain `ProjectData` object: `{ cacheRoot, config, ensureBindingStarted: async () => {}, externals: core.BrowserExternals, fs: undefined, isDebugging: false, logger, meta, profilers: core.ProfilerFactory.noop(), projectRoots: [], roots: [], symbols, ctx: {} }`.
6. Per document: `meta.getParserForLanguageId('mcfunction')(new core.Source(text), core.ParserContext.create(project, { doc }))`; the binder under `symbols.contributeAsAsync('binder', …)`; the checker under `contributeAsAsync('checker', …)`; the linters exactly as `Project.lint` runs them (`core.LinterConfigValue.destruct`, `meta.getLinter`, `core.LinterContext.create`, `core.traversePreOrder`, `core.StateProxy.create`).

`ReleaseVersion.cmp` places the current target after 1.20.5, so line continuation and macros are enabled.

The size rules out the renderer: its budget is 8 MB and it was 5.7 MB at planning, while the asar budget is 25 MB against 10.2 MB used ([ADR 0013](0013-phase1-toolchain-and-packaging.md)).

## Decision

**Service in `@msm/schemas`.** A subpath export `@msm/schemas/mcfunction` wraps the Spyglass packages behind MSM types (`McfunctionService`, `McfunctionProblem`, `McfunctionCompletion`, `createMcfunctionService`). No Spyglass type leaks past it, and the root `@msm/schemas` export never re-exports it. The service is fed the vendored command tree, block states and registries, the target's `mcVersion` and the project's ids. It never calls `je.initialize`, never fetches and never reads files. Calls are serialised per service because the symbol table is shared. Real-data tests live in the target packages, never in `@msm/schemas`, which must not depend on `@msm/targets`.

**Runs in the main process.** `app/src/main/platform/mcfunction.ts` creates one service per target lazily on first use (`import()`, so start-up time is unchanged) and exposes it over IPC as `msm:v1:mcfunction:check` and `msm:v1:mcfunction:complete`. This is consistent with [ADR 0007](0007-renderer-hosted-core-and-platform-adapter.md): main may import `@msm/schemas`, `@msm/plugin-api`, `@msm/targets` and `@msm/interop`, never `@msm/core` at runtime. A Biome override forbids `@spyglassmc/*` and `@msm/schemas/mcfunction` value imports under `app/src/renderer/**`.

**Severity mapping and codes.** Spyglass parse and check errors (severity 3) are `error`; `undeclaredSymbol` lint reports (severity 2) are `warning`; anything lower is `info`. Codes are `mcfunction.parse`, `mcfunction.check` and `mcfunction.lint.<rule>`. Spyglass's English messages pass through; MSM's own messages are British English.

**Live editing.** The renderer debounces as it does for schema problems (150 ms), sends the whole function source, and maps each problem to `elementId` plus `path: /lines/<n>` and a `range` within that line ([ADR 0017](0017-phase2-toolchain.md) adds `Problem.range`). The Problems panel, the form and Monaco markers share this shape.

**Export gate.** `runExport` passes every output file whose `language` is `mcfunction` to an injected `validateText` function: the app passes the IPC-backed checker, tests pass the Node service. Parse or check errors block the export; warnings pass. A `language` file with no validator yields an `export.language-unchecked` info; a validator that throws yields `export.text-validation-failed`.

**The JSON gate stays `validateJson`** ([ADR 0009](0009-phase1-validation-gate.md)). The Spyglass JSON checker is not adopted in Phase 2. The ADR 0009 research note is executed only for what the mcfunction checker needs: text components and item components inside commands, best effort and time-boxed. When the vendored mcdoc symbol export is supplied, the service populates the `SymbolUtil`'s `mcdoc` and `mcdoc/dispatcher` categories and registers `#[since]`/`#[until]` handling through `je.registerMcdocAttributes` for the target's `mcVersion` (verify at implementation). Adopting the Spyglass JSON checker is DESIGN [Open Question 13](../DESIGN.md#18-open-questions).

## Consequences

- Function diagnostics and completion need an IPC round trip; the debounce hides it, and the renderer bundle carries no Spyglass code.
- The main bundle grows by about 3.5 MB (the asar is expected at about 14 MB after Phase 2, within 25 MB). Bundling Spyglass's JSON import attributes and Node-only dependencies with electron-vite is verified at implementation; the fallback is in [ADR 0017](0017-phase2-toolchain.md).
- Spyglass internal APIs are used directly (`MetaRegistry`, `SymbolUtil`, linter plumbing); [risk 2](../DESIGN.md#17-risks-and-mitigations) applies, and the wrapper in `@msm/schemas/mcfunction` is the only code that changes on an upgrade.
- Two checkers coexist: `validateJson` for JSON files and Spyglass for mcfunction text. Their messages differ in style.
- Block-state property errors inside commands may go unreported until verified.

## Status

Accepted (2026-11-04). The mcdoc symbol loading for JSON and NBT inside commands is best effort; its outcome is recorded here at Phase 2 close. Narrows ADR 0009's Phase 2 deliverable (Spyglass JSON checker) to mcfunction only.
