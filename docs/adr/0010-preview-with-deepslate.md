# ADR 0010: Preview with deepslate's own renderer; MSM-authored fallback parents; no three.js in Phase 1

## Context

DESIGN planned "three.js with Misode's deepslate" for the [Preview panel](../DESIGN.md#8-editors-and-ux). deepslate 0.27.2 (read from the npm tarball on 2026-11-04) renders block models (`BlockModel`, `BlockDefinition`, `StructureRenderer`) and item models (`ItemModel.fromJson` for `items/*.json` definitions, `ItemRenderer`) directly over a `WebGLRenderingContext`. Its dependencies are `gl-matrix`, `pako` and `md5`. three.js 0.187.0 would add roughly 600 kB plus a mesh-conversion layer, with no Phase 1 benefit.

Previews also need vanilla parent models (`block/cube_all`, `item/generated`) and textures. These come from the user's client jar ([Minecraft installation](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)), which may be missing, and the CI and development machines have no display.

## Decision

- The Phase 1 preview uses deepslate's own WebGL renderers, with `gl-matrix` 3.4.4 for view matrices. three.js is not a dependency. It is reconsidered in Phase 3 (structure preview) only if deepslate's `StructureRenderer` proves insufficient.
- A model's parent chain resolves through, in order: project elements, the extracted vanilla cache ([ADR 0011](0011-client-jar-asset-extraction.md)), then a small set of **MSM-authored fallback parents**: `msm:block/cube`, `msm:block/cube_all`, `msm:block/cube_column`, `msm:block/cube_bottom_top`, `msm:block/cross`, `msm:item/generated` and `msm:item/handheld`. They are written from scratch in `app/src/renderer/src/preview/fallback-models.ts`, are not extracted from or copied out of Mojang files, are used only for preview and are never exported.
- Missing textures render with deepslate's missing-texture checker (`TextureAtlas.fromBlobs` with only the textures we have). The atlas crops each texture to its first 16×16 tile, so animated strips show their first frame.
- Without vanilla assets, a banner says "Vanilla assets not found — set your Minecraft folder" and links to settings.
- Without a WebGL context, the panel shows a message and the rest of the app works normally. Headless runs (CI smoke and e2e under xvfb) show "WebGL is disabled".
- The preview is lazy-loaded.

## Consequences

- One rendering library instead of two; the bundle budget gains roughly 600 kB of headroom.
- Previews work without a client jar for models built on the common parents, which keeps the beginner path usable before the Minecraft folder is set.
- The fallback-parent policy is a judgement under "never bundle Mojang assets". The main session accepts it (the files are geometry written from scratch, not copied); it is recorded as DESIGN [Open Question 12](../DESIGN.md#18-open-questions) pending the user's veto. If vetoed, the fallback file is deleted and the preview without a client jar shows only models that declare their own `elements`.
- DESIGN [Preview panel](../DESIGN.md#8-editors-and-ux) and [Desktop app](../DESIGN.md#14-tech-stack) now name deepslate alone.

## Status

Accepted (2026-11-04). Implemented in Phase 1 as written: the seven fallback parents are from-scratch geometry. The fallback-parent policy is still pending the user's confirmation at Phase 2 close (DESIGN Q12).

Updated in Phase 2 (2026-11-04): animated textures are previewed frame by frame from their `.png.mcmeta` ([ADR 0011](0011-client-jar-asset-extraction.md)), with a frame scrubber (play, pause, previous, next, slider) and no interpolation between frames. The atlas still crops each texture to a 16×16 tile, so textures larger than 16×16 (HD packs) preview cropped; this is a Phase 2 follow-up in the [ROADMAP](../ROADMAP.md).
