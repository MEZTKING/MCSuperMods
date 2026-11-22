/**
 * Picture helpers of the data-only flows Banner pattern, Armour trim, Glider and Pot pattern
 * (ADR 0106 D4, B508): a texture drawn by an art recipe that has no placeholder pattern, the
 * eight-shade palette key of a trim layer and the `.png.mcmeta` that points a trim layer at it.
 * Everything is drawn by MSM's generator (ADR 0092); nothing comes from Minecraft's files.
 */
import type { ContentBundleAsset } from '@msm/plugin-api';
import { artLookPng } from '../art/draw';
import type { ArtRecipeId } from '../art/info';
import { TRIM_KEY_GREY, trimKeyColours } from '../art/recipes/patterns';
import { encodePng, type Rgb } from '../assets/png';
import { artSeed } from '../content/bundle';

/**
 * A texture at `textures/<path>.png` of `namespace`, drawn by `recipe` in `colour` (and
 * `finish`), with the default seed of its path (ADR 0092 D11).
 */
export function drawnTexture(
  namespace: string,
  path: string,
  recipe: ArtRecipeId,
  colour: Rgb,
  finish?: string,
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: artLookPng({
      recipe,
      colour,
      ...(finish === undefined ? {} : { finish }),
      seed: artSeed(namespace, path, recipe),
    }),
  };
}

/**
 * A trim layer's palette key at `textures/palettes/<path>.png`: the eight shades the trim layers
 * are drawn in ({@link trimKeyColours} of {@link TRIM_KEY_GREY}), lightest first, 8 by 1.
 */
export function trimKeyTexture(namespace: string, path: string): ContentBundleAsset {
  const shades = trimKeyColours(TRIM_KEY_GREY);
  const data = new Uint8Array(shades.length * 4);
  for (const [i, rgb] of shades.entries()) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { namespace, path: `textures/palettes/${path}.png`, bytes: encodePng(data, 8, 1) };
}

/**
 * The `.png.mcmeta` beside a trim layer (`textures/<path>.png.mcmeta`): its palette key is
 * `keyId` (`<namespace>:<path>` of `textures/palettes/<path>.png`), so the game recolours each
 * key shade with the trim material's shade at the same place.
 */
export function trimLayerMeta(namespace: string, path: string, keyId: string): ContentBundleAsset {
  const text = `${JSON.stringify({ palette: { base_palette: keyId } }, null, 2)}\n`;
  return {
    namespace,
    path: `textures/${path}.png.mcmeta`,
    bytes: new TextEncoder().encode(text),
  };
}
