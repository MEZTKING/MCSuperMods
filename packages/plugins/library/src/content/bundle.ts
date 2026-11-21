/**
 * Small helpers the starters and examples share: kind ids, element and texture builders, and
 * bundle concatenation. Kinds are named by id string only; the library never imports the
 * resource pack or data pack plugins (ADR 0020).
 *
 * @packageDocumentation
 */
import type {
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  Json,
  ResourceLocation,
} from '@msm/plugin-api';
import { artPng, PATTERN_RECIPES } from '../art/artpng';
import type { ArtRecipeId } from '../art/info';
import { hashSeed } from '../art/noise';
import { type ArtCoat, boxSkinArtPng, evenCoatArtPng, HUMANOID_SKIN_BOXES } from '../art/skins';
import type { PlaceholderPattern, Rgb, SkinBox } from '../assets/png';
import { decodePngDataUrl } from './parameters';

/** Element kind ids used by the library's bundles. */
export const KINDS = Object.freeze({
  model: 'minecraft:model',
  blockDefinition: 'minecraft:block_definition',
  itemDefinition: 'minecraft:item_definition',
  lang: 'minecraft:lang',
  sounds: 'minecraft:sounds',
  pack: 'minecraft:pack_mcmeta',
  equipment: 'minecraft:equipment',
  atlas: 'minecraft:atlas',
  font: 'minecraft:font',
  recipe: 'minecraft:recipe',
  lootTable: 'minecraft:loot_table',
  advancement: 'minecraft:advancement',
  predicate: 'minecraft:predicate',
  itemModifier: 'minecraft:item_modifier',
  function: 'minecraft:function',
  tagBlock: 'minecraft:tag/block',
  tagItem: 'minecraft:tag/item',
  tagEntityType: 'minecraft:tag/entity_type',
  tagFluid: 'minecraft:tag/fluid',
  tagGameEvent: 'minecraft:tag/game_event',
  tagFunction: 'minecraft:tag/function',
  tagDamageType: 'minecraft:tag/damage_type',
  tagEnchantment: 'minecraft:tag/enchantment',
  tagPaintingVariant: 'minecraft:tag/painting_variant',
  tagWorldgenBiome: 'minecraft:tag/worldgen/biome',
  tagWorldgenStructure: 'minecraft:tag/worldgen/structure',
  tagWorldgenWorldPreset: 'minecraft:tag/worldgen/world_preset',
  tagVillagerTrade: 'minecraft:tag/villager_trade',
  tagBannerPattern: 'minecraft:tag/banner_pattern',
  tagDialog: 'minecraft:tag/dialog',
  tagInstrument: 'minecraft:tag/instrument',
  tagPointOfInterestType: 'minecraft:tag/point_of_interest_type',
  tagPotion: 'minecraft:tag/potion',
  tagTimeline: 'minecraft:tag/timeline',
  tagWorldgenFeature: 'minecraft:tag/worldgen/feature',
  tagWorldgenFlatLevelGeneratorPreset: 'minecraft:tag/worldgen/flat_level_generator_preset',
  enchantment: 'minecraft:enchantment',
  damageType: 'minecraft:damage_type',
  dimensionType: 'minecraft:dimension_type',
  chatType: 'minecraft:chat_type',
  jukeboxSong: 'minecraft:jukebox_song',
  bannerPattern: 'minecraft:banner_pattern',
  paintingVariant: 'minecraft:painting_variant',
  trimMaterial: 'minecraft:trim_material',
  trimPattern: 'minecraft:trim_pattern',
  dialog: 'minecraft:dialog',
  villagerTrade: 'minecraft:villager_trade',
  tradeSet: 'minecraft:trade_set',
  wolfVariant: 'minecraft:wolf_variant',
  catVariant: 'minecraft:cat_variant',
  pigVariant: 'minecraft:pig_variant',
  cowVariant: 'minecraft:cow_variant',
  chickenVariant: 'minecraft:chicken_variant',
  frogVariant: 'minecraft:frog_variant',
  zombieNautilusVariant: 'minecraft:zombie_nautilus_variant',
  catSoundVariant: 'minecraft:cat_sound_variant',
  pigSoundVariant: 'minecraft:pig_sound_variant',
  cowSoundVariant: 'minecraft:cow_sound_variant',
  chickenSoundVariant: 'minecraft:chicken_sound_variant',
  instrument: 'minecraft:instrument',
  trialSpawner: 'minecraft:trial_spawner',
  enchantmentProvider: 'minecraft:enchantment_provider',
  timeline: 'minecraft:timeline',
  worldClock: 'minecraft:world_clock',
  structureTemplate: 'minecraft:structure_template',
  templatePool: 'minecraft:worldgen/template_pool',
  structure: 'minecraft:worldgen/structure',
  structureSet: 'minecraft:worldgen/structure_set',
  processorList: 'minecraft:worldgen/processor_list',
  biome: 'minecraft:worldgen/biome',
  feature: 'minecraft:worldgen/feature',
  placedFeature: 'minecraft:worldgen/placed_feature',
  dimension: 'minecraft:dimension',
  worldPreset: 'minecraft:worldgen/world_preset',
  noiseSettings: 'minecraft:worldgen/noise_settings',
  densityFunction: 'minecraft:worldgen/density_function',
  noise: 'minecraft:worldgen/noise',
  carver: 'minecraft:worldgen/carver',
  flatLevelGeneratorPreset: 'minecraft:worldgen/flat_level_generator_preset',
  multiNoiseBiomeSourceParameterList: 'minecraft:worldgen/multi_noise_biome_source_parameter_list',
  blockStateProvider: 'minecraft:worldgen/block_state_provider',
  materialCondition: 'minecraft:worldgen/material_condition',
  materialRule: 'minecraft:worldgen/material_rule',
  block: 'msm:block',
  item: 'msm:item',
  mod: 'msm:mod',
  effect: 'msm:effect',
  potion: 'msm:potion',
  biomeAddition: 'msm:biome_addition',
  lootAddition: 'msm:loot_addition',
  entity: 'msm:entity',
  geoModel: 'msm:geo_model',
  animation: 'msm:animation',
  script: 'msm:script',
} as const);

/** Ruby red, gem blue, frost white and the other placeholder colours the library uses. */
export const COLOURS = Object.freeze({
  ruby: [196, 28, 52] as Rgb,
  sapphire: [36, 84, 196] as Rgb,
  amber: [222, 148, 32] as Rgb,
  jade: [40, 160, 96] as Rgb,
  violet: [128, 64, 176] as Rgb,
  slate: [96, 104, 120] as Rgb,
  frost: [214, 226, 238] as Rgb,
  /** Light brown wood, the Wood set's default (ADR 0069 D2). */
  wood: [164, 116, 68] as Rgb,
});

/** Joins a namespace and a path into a resource location. */
export const rl = (namespace: string, path: string): ResourceLocation => `${namespace}:${path}`;

/** One bundle element; `notes` and `tags` are left out when not given. */
export function element(
  id: ResourceLocation,
  kind: string,
  data: Json,
  notes?: string,
  tags?: string[],
): ContentBundleElement {
  const out: ContentBundleElement = { id, kind, data };
  if (notes !== undefined) out.notes = notes;
  if (tags !== undefined) out.tags = [...tags];
  return out;
}

/**
 * The default seed of a drawn picture (ADR 0092 D11): `hashSeed(namespace, path, recipe)`, so
 * two flows' swords differ and the same project always gets the same bytes. `path` is the
 * texture's path without `textures/` and `.png` (`item/ruby_sword`); `recipe` is the recipe id,
 * or `box_skin` for a skin.
 */
export function artSeed(namespace: string, path: string, recipe: ArtRecipeId | 'box_skin'): number {
  return hashSeed(namespace, path, recipe);
}

/** The look of a drawn texture beyond its colours: the variation and the finish. */
export interface TextureLook {
  /** The variation; defaults to {@link artSeed} of the texture. */
  seed?: number;
  /** One of the recipe's finishes; defaults to its first. */
  finish?: string;
}

/**
 * A texture at `textures/<path>.png` of `namespace`, drawn by the recipe of `pattern` in a
 * Minecraft-like style (ADR 0092 D10 (a), `artPng`), with the default seed {@link artSeed}
 * unless `look` gives one. Its texture id is `<namespace>:<path>`.
 */
export function texture(
  namespace: string,
  path: string,
  pattern: PlaceholderPattern,
  colour?: Rgb,
  accent?: Rgb,
  look: TextureLook = {},
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: artPng(pattern, {
      ...(colour === undefined ? {} : { colour }),
      ...(accent === undefined ? {} : { accent }),
      seed: look.seed ?? artSeed(namespace, path, PATTERN_RECIPES[pattern]),
      ...(look.finish === undefined ? {} : { finish: look.finish }),
    }),
  };
}

/**
 * A block texture at `textures/<path>.png` of `namespace` from an `image` parameter's value
 * (ADR 0069 D2): the picked PNG unchanged when it is square, else `pattern` drawn in `colour`
 * ({@link texture}). A non-square picture would be read as an animation strip, so it is not
 * used.
 */
export function pictureTexture(
  namespace: string,
  path: string,
  picked: string | null,
  pattern: PlaceholderPattern,
  colour: Rgb,
): ContentBundleAsset {
  const decoded = picked === null ? null : decodePngDataUrl(picked);
  if (decoded !== null && decoded.width === decoded.height) {
    return { namespace, path: `textures/${path}.png`, bytes: decoded.bytes };
  }
  return texture(namespace, path, pattern, colour);
}

/** Options of {@link skinTexture}: the model's boxes, its texture size and the coat. */
export interface SkinTextureOptions {
  /** The model's box-UV cubes; defaults to {@link HUMANOID_SKIN_BOXES}. */
  boxes?: readonly SkinBox[];
  /** Texture width; defaults to 64. */
  width?: number;
  /** Texture height; defaults to 64. */
  height?: number;
  /** The coat; defaults to `smooth`. */
  coat?: ArtCoat;
  /** The second colour (belly and spots). */
  accent?: Rgb;
}

/**
 * An entity skin at `textures/<path>.png` of `namespace` (texture id `<namespace>:<path>`):
 * the model's boxes drawn as a box skin (ADR 0092 D7, `boxSkinArtPng`), the humanoid boxes of
 * the 64 by 64 player-skin layout unless `options.boxes` says otherwise, with the default seed
 * {@link artSeed}. Pixels outside the faces are transparent, as on Minecraft's own skins.
 */
export function skinTexture(
  namespace: string,
  path: string,
  colour: Rgb,
  options: SkinTextureOptions = {},
): ContentBundleAsset {
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: boxSkinArtPng(options.boxes ?? HUMANOID_SKIN_BOXES, width, height, {
      colour,
      coat: options.coat ?? 'smooth',
      seed: artSeed(namespace, path, 'box_skin'),
      ...(options.accent === undefined ? {} : { accent: options.accent }),
    }),
  };
}

/**
 * A mob texture of `width` by `height` at `textures/<path>.png` of `namespace` (texture id
 * `<namespace>:<path>`), for vanilla mob variants (ADR 0064 D6): an even coat (ADR 0092 D7,
 * `evenCoatArtPng`, plan limit A3), since their layout belongs to vanilla's models. The seed
 * defaults to {@link artSeed} of the path; a variant's textures (wild, tame, angry, baby) pass
 * one seed so they share a coat.
 */
export function mobSkinTexture(
  namespace: string,
  path: string,
  width: number,
  height: number,
  colour: Rgb,
  coat: ArtCoat = 'fur',
  seed: number = artSeed(namespace, path, 'box_skin'),
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: evenCoatArtPng(width, height, { colour, coat, seed }),
  };
}

/** Reserved mod ids (ADR 0026 D2). */
const RESERVED: readonly string[] = [
  'minecraft',
  'java',
  'fabricloader',
  'fabric-api',
  'msm_runtime',
];

/**
 * A Fabric mod id (`^[a-z][a-z0-9_-]{1,63}$`) from a namespace, as the blocks and items
 * plugin's `msm:mod` template derives it (the library does not import that plugin): other
 * characters become `_`, a leading non-letter or a reserved id (ADR 0026 D2) gets a `mod_`
 * prefix, and the result is cut to 64 characters.
 */
export function modIdFromNamespace(namespace: string): string {
  let id = namespace.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!/^[a-z]/.test(id)) id = `mod_${id}`;
  if (id.length < 2) id = `${id}_mod`;
  if (RESERVED.includes(id)) id = `mod_${id}`;
  return id.slice(0, 64);
}

/** Concatenates bundles in order. */
export function concatBundles(...bundles: ContentBundle[]): ContentBundle {
  return {
    elements: bundles.flatMap((bundle) => bundle.elements),
    assets: bundles.flatMap((bundle) => bundle.assets),
  };
}

/** The distinct kinds a bundle uses, in first-use order. */
export function kindsOf(bundle: ContentBundle): string[] {
  return [...new Set(bundle.elements.map((entry) => entry.kind))];
}

/** A `pack.mcmeta` element `<namespace>:pack` with a plain description. */
export function packElement(namespace: string, description: string, notes?: string) {
  return element(rl(namespace, 'pack'), KINDS.pack, { pack: { description } }, notes);
}

/** The pack note every Creator flow with mod content uses. */
export const PACK_NOTES =
  'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.';

/**
 * The `msm:mod` element `<namespace>:mod` of a flow that adds items: the mod id from the
 * namespace, version 1.0.0, the project name, `description` and the usual note.
 */
export function modElement(namespace: string, projectName: string, description: string) {
  return element(
    rl(namespace, 'mod'),
    KINDS.mod,
    {
      mod_id: modIdFromNamespace(namespace),
      version: '1.0.0',
      name: projectName,
      description,
      authors: [],
      licence: 'All-Rights-Reserved',
    },
    'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New items exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
  );
}

/**
 * The pulling frames of a bow or crossbow item model `<ns>:item/<path>`: models
 * `<path>_pulling_0`…`_2` (and for a crossbow `_arrow` and `_firework`) whose parents are the
 * vanilla frames, each with a drawn texture. Every frame takes the seed of the weapon's own
 * texture `item/<path>` (recipe `bow` or `crossbow`), so the frames draw one bow. The item's
 * definition shows them while it is drawn or loaded (`msm:ranged_weapon`).
 */
export function rangedPullFrames(
  namespace: string,
  path: string,
  type: 'bow' | 'crossbow',
  colour: Rgb,
): { elements: ContentBundleElement[]; assets: ContentBundleAsset[] } {
  const frames =
    type === 'bow'
      ? ['pulling_0', 'pulling_1', 'pulling_2']
      : ['pulling_0', 'pulling_1', 'pulling_2', 'arrow', 'firework'];
  const elements: ContentBundleElement[] = [];
  const assets: ContentBundleAsset[] = [];
  const seed = artSeed(namespace, `item/${path}`, type);
  for (const frame of frames) {
    const model = rl(namespace, `item/${path}_${frame}`);
    elements.push(
      element(
        model,
        KINDS.model,
        { parent: `minecraft:item/${type}_${frame}`, textures: { layer0: model } },
        `The ${frame.replace('_', ' ')} frame the ${type} shows while it is ${type === 'bow' ? 'drawn' : frame.startsWith('pulling') ? 'charged' : 'loaded'}, drawn from textures/item/${path}_${frame}.png.`,
      ),
    );
    assets.push(
      texture(
        namespace,
        `item/${path}_${frame}`,
        `${type}_${frame}` as PlaceholderPattern,
        colour,
        undefined,
        { seed },
      ),
    );
  }
  return { elements, assets };
}

/** A flat (`generated`) or other item model `<namespace>:item/<path>` drawn from its own texture. */
export function itemModel(namespace: string, path: string, parent: string, notes: string) {
  const model = rl(namespace, `item/${path}`);
  return element(model, KINDS.model, { parent, textures: { layer0: model } }, notes);
}
