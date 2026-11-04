# ADR 0023: Structure and climate previews

## Context

[ADR 0010](0010-preview-with-deepslate.md) chose deepslate's WebGL renderer for block and item models and said later phases extend the preview to structures and worldgen. Phase 3 adds structure templates ([ADR 0021](0021-structure-templates-and-nbt.md)) and the worldgen chain ([ADR 0022](0022-worldgen-element-model-and-validators.md)). `PreviewPanel` routes on `ElementKind.previewKind` (`model`, `block_definition`, `item_definition`), lazy-loads `PreviewCanvas`, is gated on WebGL and reads textures from project assets and the vanilla cache extracted from the user's client jar ([ADR 0011](0011-client-jar-asset-extraction.md)).

deepslate 0.27.2 (already bundled) offers `Structure` and `StructureRenderer` in `deepslate/render`, already used for a one-block structure, and `Climate.Parameters.find` and `MultiNoiseBiomeSource` in `deepslate/worldgen`. A Misode-style biome or terrain map sampled from noise needs the vanilla `noise_settings`, `density_function` and `noise` files, which MSM does not have today: the extraction cache holds only resource-pack assets.

## Decision

**Structure 3D preview.** Kind `minecraft:structure_template` declares `previewKind: 'structure'`. `PreviewCanvas` gains a structure mode: a deepslate `Structure` of the element's `size`, filled from its palette and blocks through a small block-state parser in the app (the app does not import plugin internals), drawn with `StructureRenderer`, `drawGrid` and an orbit camera centred on the template with the distance fitted to its bounding box. Resources are prepared for every distinct palette block id by generalising the single-block path: project elements first, then the vanilla cache, then the fallback parents. A block with no definition is drawn with the missing texture, never skipped; a palette entry that fails to parse is reported in the panel's status line. Block entities, entities and biome tints are not rendered. The view rebuilds 150 ms after its inputs stop changing, with chunk size 16.

**Climate map.** `minecraft:dimension` and `minecraft:worldgen/world_preset` declare `previewKind: 'climate_map'`. For a `multi_noise` biome source with an explicit `biomes` list, a 2D canvas (no WebGL, so it is outside the WebGL gate) plots two of the six climate parameters (temperature against humidity by default) with sliders for the other four. Each cell is coloured by the entry `Climate.Parameters.find` returns, using the project biome's `effects.grass_color` or `sky_color` when present and otherwise a stable hash of the biome id; hovering shows the id. It shows where a custom biome sits in climate space without any vanilla data. Other biome sources show a short explanation instead.

**Biome colours** are edited with colour pickers bound to the integer fields in the Biome Studio; there is no block rendering for biomes.

**Noise-sampled maps are deferred.** A Misode-style biome or terrain map is not part of Phase 3. It would extend extraction (cache schema 3) to `data/minecraft/worldgen/{noise_settings,density_function,noise,biome}/**` from the user's client jar, load them into deepslate's `WorldgenRegistries` and sample with `NoiseChunkGenerator`, falling back to the climate map without a jar. Whether extracting data-pack JSON from the user's own jar fits "never bundle Mojang assets" (it is read like textures are, cached and never exported) is DESIGN [Open Question 15](../DESIGN.md#18-open-questions). The work is described as reserve brief B84 and is scheduled only if the user asks for it after the Phase 3 in-game check.

**Decision pending the user's veto.** The orchestrator deferred the noise-sampled preview on the user's behalf (climate map only in v0.3); the deferral stands unless the user vetoes it.

## Consequences

- Structures get a real 3D preview with the existing atlas and model chain; no new renderer and no three.js.
- The climate map works without WebGL and without a client jar, so it is testable headlessly.
- The renderer grows by React code only; deepslate is already bundled. `tools/check-size` reports the delta.
- Users cannot yet see terrain shape or the real biome layout of a noise-generated dimension in the app; they check it in-game. This is listed in README "Known limitations" and the Phase 3 follow-ups.
- Large templates (48³) may render slowly; the debounce and chunking bound the cost.

## Status

Proposed (2026-11-04); implementation in B78 (structure mode and climate map) and B80 (biome colour pickers), within B73–B82. The noise-sampled map is reserve brief B84 and DESIGN Open Question 15. The deferral stands unless the user vetoes it.
