# ADR 0092: Minecraft-style art

## Context

The user asked for much better art "rather than using your own art styles", and for the best method to get Minecraft-looking art. Today every starter, Creator flow, Surprise me result and example uses the placeholder patterns of `@msm/plugin-library` (`placeholderPng`, ADR 0020 D3): flat one-colour shapes with a bevel. They are original and byte-stable, but they do not look like vanilla: no hue-shifted ramps, no clustered texture, thin outlines, small heads on tools.

Two constraints frame the answer. MSM never bundles Mojang assets; it reads them from the user's client jar at run time ([ADR 0011](0011-client-jar-asset-extraction.md)), and ADR 0011 also says nothing from that cache is ever written to an export. Picture to texture ([ADR 0048](0048-pictures-screenshots-and-skins.md)) already turns any picture into a texture, but it does not make a picture look vanilla.

A prototype of two approaches lives in `packages/plugins/library/src/art/` (exported as `minecraftArt`), with unit tests on synthetic textures only. Comparison pictures were made outside the repository from the 26.3 client jar in the Loom cache, for the user's decision. Nothing is wired into a flow.

## Decision (Proposed)

- **D1 A: recolour from the user's own textures, for local use.** `recolourTexture` takes a vanilla texture from the user's extracted cache (a diamond ore, sword or helmet), finds the material against its base (the ore's stone, the same tool in iron) by palette membership, or by two-cluster colour clustering when there is no base, and maps each material colour to a ramp of the target colour with the same number of shades and the same lightness steps, hue-shifted (warmer highlights, cooler shadows). Alpha is kept, and an animated strip is recoloured with one map so its `.mcmeta` is reused unchanged. The results are derived from Mojang's textures:
  - they are offered only when a client jar is found, and are made on the user's machine at the user's request;
  - each texture made this way is marked as derived in the project (`meta.derivedFrom: "minecraft:<path>"` on the asset entry; verify at implementation where asset metadata lives);
  - export and publishing (modpack upload, Share, the docs site) warn before including derived pictures: "These pictures are recoloured from Minecraft's own textures. They are fine in your own game; do not publish them." with "Replace with generated art" (D2) as the default button;
  - this amends ADR 0011's "nothing from the cache is ever written to an export" for derived pictures only, and only with the warning; the cache itself is still never exported or packaged.
- **D2 B: an original vanilla-style generator, the default.** `generateArt(recipe, { colour, seed, finish, leafColour, style })` draws on 16x16 with original silhouettes and rules: four to six shades per material from `generateRamp`, light from the top left, clustered noise (blurred and ranked white noise, wrapping so blocks tile), a dark outline on items and none on full blocks, and a structure per material (veins in stone or deepslate, a bevel and glints or plates on blocks, boards with joints, bark streaks, growth rings, foliage with gaps). Recipes: ore, deepslate ore, gem, ingot, block (gem or metal finish), sword, pickaxe, axe, shovel, hoe, helmet, chestplate, leggings, boots, fruit, pie, planks, log, log top, leaves. Output depends only on recipe, colours and seed. B becomes the art of Surprise me, the Creator flows and the library examples, replacing the placeholder patterns recipe by recipe; patterns without a recipe keep their placeholder until one is drawn.
- **D3 Learned style numbers, optional.** `learnStyle` may read the user's jar at run time and keep two numbers only (cluster blur from the mean run length, hue shift from the median ramp turn), never pixels. Without a jar the built-in tuned constants apply (`DEFAULT_STYLE`, original values). The prototype's measurement over 23 vanilla textures gave a blur of 1 (the default) and a hue turn below the default, so the default hue shift may come down at implementation.
- **D4 C: an optional AI image provider.** With the user's own key (like the AI helper, ADR 0041), a picture from an image model goes through B's clean-up before it is used: Picture to texture's crop and scale (ADR 0048), then quantising to a B ramp of the user's colour, hardening alpha and adding B's outline rule for items. Off by default; the provider, its terms and the key stay the user's; nothing is sent without the user asking.
- **D5 D: a commissioned original library.** A set of hand-drawn textures by a pixel artist, licensed to MSM (CC0 or MIT-compatible), recoloured at run time with D1's ramp maps (they are ours, so no warning). This costs money and time and is the user's decision; B's recipes are written so a drawn silhouette can replace a generated one without other changes.

## Rollout

1. User picks from the comparison pictures (A, B, both).
2. B: move `art/` out of prototype status; add the remaining recipes the flows use (bow, shield, bottle, spawn egg, crop stages, stone and wood family blocks, door, trapdoor, sapling, effect icon, armour layers 64x32 drawn from the item ramps); a helper `artPng(pattern, options)` that prefers a B recipe and falls back to `placeholderPng`.
3. B: switch the Creator flows and Surprise me to the helper, then the examples (the `examples/` mirror goldens change once, with `UPDATE_GOLDENS=1`); placeholder patterns stay for anything without a recipe.
4. A: main-process IPC that reads textures from the extracted cache (ADR 0011), a "Recolour from my game" choice in the texture editor and the Creator's colour step, `meta.derivedFrom`, the export and publish warning, and an e2e path with a synthetic jar.
5. C and D only on the user's say.

## Consequences

- The default art looks closer to vanilla without any Mojang bytes in the repository or the app.
- A gives the most vanilla-looking result but is derived work, so it stays local and marked.
- Example and starter PNGs change once when B lands, which churns the `examples/` mirror once.
- Placeholder patterns remain the fallback, so no flow loses a picture during the rollout.

## Status

Proposed, 2026-11-14.
