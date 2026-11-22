# packages/terrain — live world generation engine

`@msm/terrain` is MCSuperMods' preview engine for world generation: deepslate's worldgen code (MIT) fed from the project's lowered worldgen files laid over the vanilla files read from the user's own jar at runtime. Plan: [`docs/PLAN-live-worldgen.md`](../../docs/PLAN-live-worldgen.md); decision: [ADR 0119](../../docs/adr/0119-live-worldgen-preview.md); evidence: [`docs/reference/spikes/b574/README.md`](../../docs/reference/spikes/b574/README.md) (fixes F1 to F10). It is a preview: whatever it cannot draw is listed in `unsupported()`, never dropped silently.

## Status

B576 (scaffold): every file is a stub; `src/api.ts` bodies throw "not yet". B578 fills the engine, B581 the missing types and the flat generator, B583 the features.

## Contents

- `src/api.ts`: the public interface, copied from the spike's "Interface for B576". A change to it is reported to the orchestrator, not made.
- `src/extensions/index.ts`: seam for density function, rule and condition types deepslate lacks, and `flatGenerator`.
- `src/features/index.ts`: seam `placeFeatures` (trees, plants, ores).
- `src/presets.ts`: seam `resolvePreset` (multi-noise presets).
- Later files (B578): `prepass.ts`, `registries.ts`, `parser.ts`, `rules.ts`, `world.ts`, `sample.ts`, `fill.ts`, `columns.ts`, `unsupported.ts`, `seed.ts`.

## Rules

- Depends on `@msm/plugin-api` and `deepslate` only (`tools/check-deps/layers.json`). `TerrainTargetFacts` is the engine's own structural type; it does not import the target fact.
- Pure: no DOM, no Node APIs, deterministic for the same files and seed. Never sample on the renderer's main thread: the app imports this package only in `app/src/renderer/src/terrain/worker.ts`.
- deepslate's registries are static: one world at a time, refilled on every `createTerrainWorld` (F9).
- Clean room: never Mojang method bodies; vanilla files only at runtime from the user's jar, never committed, exported or sent anywhere. Test fixtures are written by hand.
- Adapting deepslate's MIT code inside this package is fine with the licence line kept; never patch `node_modules`.
- British English, no emojis, TypeScript strict.

## Commands

`pnpm --filter @msm/terrain test`; `pnpm typecheck`; `pnpm lint`.
