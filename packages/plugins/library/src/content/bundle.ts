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
import {
  type PlaceholderPattern,
  placeholderPng,
  placeholderSkinPng,
  type Rgb,
} from '../assets/png';

/** Element kind ids used by the library's bundles. */
export const KINDS = Object.freeze({
  model: 'minecraft:model',
  blockDefinition: 'minecraft:block_definition',
  itemDefinition: 'minecraft:item_definition',
  lang: 'minecraft:lang',
  sounds: 'minecraft:sounds',
  pack: 'minecraft:pack_mcmeta',
  equipment: 'minecraft:equipment',
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
  biomeAddition: 'msm:biome_addition',
  lootAddition: 'msm:loot_addition',
  entity: 'msm:entity',
  geoModel: 'msm:geo_model',
  animation: 'msm:animation',
  script: 'msm:script',
} as const);

/** Ruby red, gem blue and the other placeholder colours the library uses. */
export const COLOURS = Object.freeze({
  ruby: [196, 28, 52] as Rgb,
  sapphire: [36, 84, 196] as Rgb,
  amber: [222, 148, 32] as Rgb,
  jade: [40, 160, 96] as Rgb,
  violet: [128, 64, 176] as Rgb,
  slate: [96, 104, 120] as Rgb,
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
 * A generated placeholder texture at `textures/<path>.png` of `namespace`. Its texture id is
 * `<namespace>:<path>`.
 */
export function texture(
  namespace: string,
  path: string,
  pattern: PlaceholderPattern,
  colour?: Rgb,
  accent?: Rgb,
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: placeholderPng(pattern, {
      ...(colour === undefined ? {} : { colour }),
      ...(accent === undefined ? {} : { accent }),
    }),
  };
}

/**
 * A generated 64x64 two-tone entity skin at `textures/<path>.png` of `namespace` (texture id
 * `<namespace>:<path>`), for models over a 64x64 texture.
 */
export function skinTexture(namespace: string, path: string, colour: Rgb): ContentBundleAsset {
  return { namespace, path: `textures/${path}.png`, bytes: placeholderSkinPng({ colour }) };
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
 * vanilla frames, each with a tinted placeholder texture. The item's definition shows them
 * while it is drawn or loaded (`msm:ranged_weapon`).
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
      texture(namespace, `item/${path}_${frame}`, `${type}_${frame}` as PlaceholderPattern, colour),
    );
  }
  return { elements, assets };
}

/** A flat (`generated`) or other item model `<namespace>:item/<path>` drawn from its own texture. */
export function itemModel(namespace: string, path: string, parent: string, notes: string) {
  const model = rl(namespace, `item/${path}`);
  return element(model, KINDS.model, { parent, textures: { layer0: model } }, notes);
}
