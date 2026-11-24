# ADR 0135: Blockloom draws block pictures; Classic stays in Settings

## Context

MSM draws its own pictures with the art generator of ADR 0092 (option B): 101 recipes in `packages/plugins/library/src/art/`, `artPng`, `artLookPng`, `checkArtRules`. Its block faces (stone, cobblestone, bricks, ores, dirt, grass, sand, gravel, planks, logs, leaves) are tidy but plain next to Blockloom, the user's own MIT texture generator (https://github.com/MEZTKING/blockloom): block materials across the stone, earth, wood, ore, nether and end families and more, eleven effects (mossy, cracked, glowing, frosted, ancient, charred, gilded, flecked, crystals, wet, flowery), colour words read in context (`cyan crystals` is an accent, `blue stone` a tint), a natural-language description parser, finish, grain, contrast and hue, all seeded and reproducible. MSM must work offline and without another program running, so calling Blockloom's local server is not enough.

On 2026-11-24 the recommendation was: make Blockloom's block recipes part of MSM's own drawing code and use them wherever MSM draws a block picture; keep MSM's generator for everything else; delete nothing, keeping the current block recipes as a "Classic" style chosen in Settings. The user answered: "go ahead with the recommended, keep classic in settings". The same day Blockloom's author released `@blockloom/core` 1.1.0 (tag `core-v1.1.0`): the engine as a pure ESM package with no DOM, canvas, network, AI, token or ZIP, 89 recipes in 9 families, `generate`, `generateSet`, `parsePrompt`, `listMaterials` and 20 golden cases (`golden.json`, SHA-256 per engine version 1.0.0). It is not on npm.

## Decision

**D1 Vendored, unchanged.** MSM vendors `@blockloom/core` unchanged at `vendor/blockloom-core/` (tag `core-v1.1.0`, commit 31abd25), with its LICENSE (MIT, Copyright (c) 2026 Lelouch), as the workspace package `@blockloom/core` that `@msm/plugin-library` depends on. `vendor/README.md` names the tag and commit; Biome skips the folder (`!**/vendor`, already in `biome.json`), and the README's Licence section credits it. MSM updates it by tag: copy the newer `core/`, name the tag and commit, and let the golden test say what changed. MSM adds thin adapters only (`art/blockloom/style.ts`); it never edits the vendored code, never calls the Blockloom server, and encodes PNGs with its own code.

**D2 Goldens.** A library test draws every case of the core's `golden.json` and fails when a hash differs, and pins a few MSM looks; the engine version is checked against the golden file's.

**D3 Which recipes Blockloom draws.** The style applies to the block recipes that are whole faces with a Blockloom material: `plain` (stone, one finish smoother), `stone`, `cobblestone`, `bricks`, `ore` (the ore whose vein colour is nearest the look's colour), `deepslate_ore` (Blockloom has none: deepslate with crystals and flecks in the look's colour), `dirt`, `grass_top`, `grass_side`, `sand`, `gravel`, `planks`, `bark`, `log_top` (oak log side and top) and `leaves` (Blockloom's `leaves_cutout`, with see-through gaps). The look's colour becomes Blockloom's `promptColor` (its hue and saturation, and its lightness as a shift from the material's), except a grey (saturation under 0.12), which keeps the material's own colours because Blockloom lifts every tint to at least 0.24 saturation, and a grass side, whose dirt a tint would colour too (it keeps Blockloom's own green and dirt). The core's `tint` option is not used: in 1.1.0 it gives black pixels (it hands `{h, s, l}` to a palette that reads `{hue, sat, light}`). The detail picks the finish (Smooth, Balanced, Rugged); MSM's seed `s` is Blockloom's `s + 1`. Every other recipe (polished stone, pillars, storage blocks, furnace fronts, stripped logs, doors, trapdoors, saplings, crops, portals, plants, pots, the game pictures) and every item, worn, mob, icon and particle picture stays with MSM's generator in both styles.

**D4 Descriptions.** A look may carry a description in words (`mossy cobblestone with cyan crystals`), passed to the core as its prompt. A named material replaces the recipe's, with its own colours (any of the core's 89: glass, stained glass, concrete, wool colours, metal and copper blocks too); effects are added; a colour word tints the block, or colours the effects when it sits next to crystals, veins, flecks or glow. A description that names nothing changes nothing but its effects and colours.

**D5 The style setting.** `ArtLook.style` is `'blockloom' | 'classic'`; when it is left out, the library's block picture style is used, `'blockloom'` unless the host set another (`setBlockPictureStyle`). The app's Settings has **Block picture style** (Blockloom, the default, or Classic) under **Pictures**, kept in the renderer's preferences (`msm.preferences.v1`, `blockStyle`) and found by search. Every block picture the app draws follows it: the Draw dialog, the Creator and every flow, starter and example built in the app, Try it's drawn terrain, Home's and the showcase's stills, the AI helper's `create_texture`. Picture caches put `blockPictureCacheKey()` (`classic` or `blockloom@<engine version>`) in their keys. Classic draws byte for byte what it drew before this ADR.

**D6 The Draw dialog.** For block pictures in the Blockloom style the dialog shows **Describe it** (a text box) beside Colour; the six variations follow the style and the words as they are typed, and the What is it? tiles follow the style. **More options** holds the same block picture style choice as Settings. The Classic style shows no description box.

**D7 The library's content.** Flows, starters and examples use the default style, so their block pictures are Blockloom's; the `examples/` mirror and `fixtures/sample-mod` are regenerated. Tests that pin Classic pictures ask for the Classic style; `checkArtRules` stays the rule set of the Classic style (Blockloom's effects blend colours freely), so Blockloom faces are checked for size, hard alpha and the goldens instead.

**D8 What is stored with a picture.** A Blockloom picture's PNG carries a `tEXt` entry `blockloom`: JSON of the engine version, the words, the material, effects, seed, face, finish and tint, so the same picture can be drawn again and a later engine can be told apart. MSM writes it with its own encoder; Minecraft ignores it; nothing else is added to the project.

## Consequences

- Block pictures look richer and can be described in words, offline and without a key.
- The style is a host-wide setting the library reads when a look does not name one: one small piece of shared state in the library, set by the app at start-up and on change. Bundles built in the app follow it; tests and the `examples/` mirror use the default.
- A picture already in a project keeps its bytes until it is drawn again; Try it's drawn faces are made when Try it opens.
- The look's colour is a tint, not an exact base: a grey keeps the material's colours, and an ore's colour chooses which ore is drawn (the veins keep that ore's own colour).
- The core is in the library, which is in the app's main chunk: about 84 kB unminified (measured at implementation).
- Blockloom stays the user's own project; MSM follows it by tag.

## Status

Accepted (2026-11-24, the user: "go ahead with the recommended, keep classic in settings"; vendoring the core at `core-v1.1.0`, the orchestrator the same day). Amends ADR 0092: block faces default to Blockloom's recipes; MSM's generator stays for everything else and as the Classic block style.
