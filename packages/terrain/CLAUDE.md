# packages/terrain — live world generation engine

`@msm/terrain` is MCSuperMods' preview engine for world generation: deepslate's worldgen code (MIT) fed from the project's lowered worldgen files laid over the vanilla files read from the user's own jar at runtime. Plan: [`docs/PLAN-live-worldgen.md`](../../docs/PLAN-live-worldgen.md); decision: [ADR 0119](../../docs/adr/0119-live-worldgen-preview.md); evidence: [`docs/reference/spikes/b574/README.md`](../../docs/reference/spikes/b574/README.md) (fixes F1 to F10). It is a preview: whatever it cannot draw is listed in `unsupported()`, never dropped silently.

## Status

B576 scaffolded it; B578 filled the engine (registries, biomes, terrain, surface, heights, the walker). B581 fills `extensions/` (missing types, the flat generator), B583 `features/`, B592 `presets.ts`.

## Contents

- `src/api.ts`: the public interface (the spike's "Interface for B576"); bodies call the files below. A change to it is reported to the orchestrator, not made.
- `src/prepass.ts`: fixes F1 to F5 as JSON rewrites. `src/registries.ts`: `WorldFiles` (project over vanilla), `fillRegistries` (one world at a time, F9).
- `src/parser.ts`: the density function front (extension types, `interpolated` as `CellInterpolated`, the F10 cell grid; `cache` as `PointCache`; `ColumnCache`).
- `src/rules.ts`: the rule front (whole tree, named rules resolved at parse time, biome tags, the ceiling depth bound).
- `src/world.ts`: `EngineWorld`; random states kept between edits, noise instances by id, seed and file (WS14). `src/fill.ts`: `NoiseBinder`, `optimise` (per-column cache), `ChunkFill` (aquifer per chunk), compiled bounds and `HeightSearch`.
- `src/columns.ts`: the surface pass (F6) and `buildColumns`. `src/sample.ts`: maps, cuts, values (layouts in its module comment). `src/unsupported.ts`: the walker (F7). `src/seed.ts`: `seedFromText`.
- Seams: `src/extensions/index.ts` (entries shaped as `DensityFunctionType`, `RuleType`, `ConditionType`; `flatGenerator` as `FlatGeneratorFn`), `src/features/index.ts`, `src/presets.ts`.
- Tests: hand-written fixtures (`test/fixture.ts`); `test/vanilla.test.ts` reads the Loom jars at test time and skips without them; `TERRAIN_SPEED=1` runs `test/speed.test.ts`.

## Rules

- Depends on `@msm/plugin-api` and `deepslate` only (`tools/check-deps/layers.json`). `TerrainTargetFacts` is the engine's own structural type; it does not import the target fact.
- Pure: no DOM, no Node APIs, deterministic for the same files and seed. Never sample on the renderer's main thread: the app imports this package only in `app/src/renderer/src/terrain/worker.ts`.
- deepslate's registries are static: one world at a time, refilled on every `createTerrainWorld` (F9).
- Clean room: never Mojang method bodies; vanilla files only at runtime from the user's jar, never committed, exported or sent anywhere. Test fixtures are written by hand.
- Adapting deepslate's MIT code inside this package is fine with the licence line kept; never patch `node_modules`.
- British English, no emojis, TypeScript strict.

## Commands

`pnpm --filter @msm/terrain test`; `pnpm typecheck`; `pnpm lint`.
