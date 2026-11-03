# packages/schemas — Schema system (mcdoc)

No code yet; this directory is planned for Phase 0. This file describes intent and conventions.

## Purpose

`@msm/schemas` is the only package that talks to Spyglass. It wraps `@spyglassmc/core`, `@spyglassmc/mcdoc` and `@spyglassmc/java-edition`, loads the pinned `vanilla-mcdoc` for each target, adds the MSM mcdoc extensions, loads mcmeta registries for autocomplete, and normalises schemas into a form model that editors consume.

## Contents (planned)

- `src/spyglass/`: adapter over `@spyglassmc/*` (versions pinned).
- `src/vanilla/`: resolves the `vanilla-mcdoc` git ref declared by each target.
- `mcdoc/msm/`: MSM mcdoc extensions (components, events, actions, MSM kinds).
- `src/registries/`: mcmeta registry loader and cache in `~/.msm/cache/`.
- `src/form/`: schema → `SchemaNode` form-model normaliser.
- `test/`: conformance tests, one per MSM mcdoc file.

## Conventions

- Spyglass types never leak past this package; export our own `SchemaNode` model.
- One `vanilla-mcdoc` git ref per target, declared in `packages/targets` and resolved here.
- `tools/sync-mcdoc` updates vendored copies; never edit vendored files by hand.
- MSM mcdoc files are the single source of truth for components and events. The app editors and the `engine-mod` codegen (Phase 4) both consume them.
- Depends only on `@msm/plugin-api`.

## Do / Don't

- Do write a conformance test for every MSM mcdoc file.
- Do keep the Spyglass surface small so a fallback mcdoc reader stays possible.
- Don't hand-write JSON Schema duplicates of mcdoc definitions.
- Don't hardcode a Minecraft version; take it from the target.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/schemas test`
- `pnpm --filter @msm/schemas build`
- `tools/sync-mcdoc` (refresh vendored `vanilla-mcdoc`)

## Read next

- [DESIGN §6 Schema System (mcdoc)](../../docs/DESIGN.md#6-schema-system-mcdoc)
- [DESIGN §11 Behaviour Model (Components and Events)](../../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [ROADMAP, Phase 0](../../docs/ROADMAP.md)
