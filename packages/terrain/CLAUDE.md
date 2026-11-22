# packages/terrain — live world generation engine

`@msm/terrain` is MCSuperMods' preview engine for world generation: deepslate's worldgen code (MIT) fed from the project's lowered worldgen files laid over the vanilla files read from the user's own jar at runtime. Plan: [`docs/PLAN-live-worldgen.md`](../../docs/PLAN-live-worldgen.md); decision: [ADR 0119](../../docs/adr/0119-live-worldgen-preview.md); evidence: [`docs/reference/spikes/b574/README.md`](../../docs/reference/spikes/b574/README.md) (fixes F1 to F10). It is a preview: whatever it cannot draw is listed in `unsupported()`, never dropped silently.

## Status

B576 scaffolded it; B578 filled the engine (registries, biomes, terrain, surface, heights, the walker); B581 filled `extensions/` (the missing types, corrections to deepslate, the flat generator) and the parity tests. B583 fills `features/`, B592 `presets.ts`.

## Contents

- `src/api.ts`: the public interface (the spike's "Interface for B576"); bodies call the files below. A change to it is reported to the orchestrator, not made.
- `src/prepass.ts`: fixes F1 to F5 as JSON rewrites. `src/registries.ts`: `WorldFiles` (project over vanilla), `fillRegistries` (one world at a time, F9).
- `src/parser.ts`: the density function front (extension types, `interpolated` as `CellInterpolated`, the F10 cell grid; `cache` as `PointCache`; `ColumnCache`).
- `src/rules.ts`: the rule front (whole tree, named rules resolved at parse time, biome tags, the ceiling depth bound).
- `src/world.ts`: `EngineWorld`; random states kept between edits, noise instances by id, seed and file (WS14). `src/fill.ts`: `NoiseBinder`, `optimise` (per-column cache), `ChunkFill` (aquifer per chunk), compiled bounds and `HeightSearch`.
- `src/columns.ts`: the surface pass (F6) and `buildColumns`. `src/sample.ts`: maps, cuts, values (layouts in its module comment). `src/unsupported.ts`: the walker (F7). `src/seed.ts`: `seedFromText`.
- Seams: `src/extensions/index.ts` (entries shaped as `DensityFunctionType`, `RuleType`, `ConditionType`; `flatGenerator` as `FlatGeneratorFn`), `src/features/index.ts`, `src/presets.ts`.
- `src/extensions/` (B581), one file per type, each saying how it was learned (the data format's fields and the parity fixture's real worlds): `upscale.ts` (every mode but the pre-pass's linear one), `domain-warp.ts` (offsets moved by whole blocks), `corrections.ts` (`floor`/`round`/`ceil`/`truncate` with `multiple` 1 by default, `slice` on its axis), `hole.ts`, `steep.ts`, `temperature.ts`, `bandlands.ts` and `ore-vein.ts` (both about right), `flat.ts`; and three corrections to deepslate installed when the index is first imported (prototype replacements in our code, never `node_modules`): `positional-random.ts` (the x term of a position's seed wraps at 32 bits), `surface-depth.ts` (a whole-number surface depth), `aquifer.ts` (the surface samples' x). A type drawn only about right has `approximate` words; the walker still lists it. A rule's density fields are named by `densityFields` so the walker walks them.
- Tests: hand-written fixtures (`test/fixture.ts`); `test/extensions.test.ts` (each type); `test/parity.test.ts` plays `fixtures/worldgen-parity/expectations.json` at ADR 0119 D13's floors (`TERRAIN_PARITY=1` prints every dimension's scores; `test/parity-fixture.ts` scores); `test/vanilla.test.ts` reads the Loom jars at test time and skips without them; `test/vanilla-parity.test.ts` is D13's vanilla step (with `MSM_WORLDGEN_VANILLA`, from the parity build's `worldgenVanilla` task; skipped otherwise); `TERRAIN_SPEED=1` runs `test/speed.test.ts`.

## Rules

- Depends on `@msm/plugin-api` and `deepslate` only (`tools/check-deps/layers.json`). `TerrainTargetFacts` is the engine's own structural type; it does not import the target fact.
- Pure: no DOM, no Node APIs, deterministic for the same files and seed. Never sample on the renderer's main thread: the app imports this package only in `app/src/renderer/src/terrain/worker.ts`.
- deepslate's registries are static: one world at a time, refilled on every `createTerrainWorld` (F9).
- Clean room: never Mojang method bodies; vanilla files only at runtime from the user's jar, never committed, exported or sent anywhere. Test fixtures are written by hand.
- Adapting deepslate's MIT code inside this package is fine with the licence line kept; never patch `node_modules`.
- British English, no emojis, TypeScript strict.

## Commands

`pnpm --filter @msm/terrain test`; `pnpm typecheck`; `pnpm lint`.
