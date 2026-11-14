/**
 * `@msm/plugin-library`: the built-in templates and samples library (ADR 0020). It
 * contributes project starters and Examples gallery entries, and the deterministic
 * placeholder textures they use. It registers no element kinds: its bundles use the kinds of
 * the resource pack, data pack, structures, worldgen, blocks and items, entities, models and
 * animations and scripting plugins, named in each entry's `requiresKinds`, and the host hides
 * entries whose kinds are not registered.
 *
 * Content decisions recorded in ADR 0020:
 * - The Custom ore starter adds a real ruby ore block and ruby item (Phase 4; it needs the
 *   Fabric mod jar export).
 * - The Custom mob starter adds an animated Ruby Golem (Phase 5, ADRs 0028 and 0029; it needs
 *   the Fabric mod jar export with GeckoLib).
 * - The Custom ore, Custom sword and Custom mob starters are wizards: their `parameters`
 *   (ADR 0040) name, colour and tune the content; the defaults build the ruby content.
 * - Creator flows (ADR 0043) are starters with `creator`: Gear set, Simple block, Food,
 *   Scripted behaviour, Custom ore and Custom mob, (ADR 0044) Weapon, Consumable, Totem,
 *   Enchantment, Painting and Music disc, (ADRs 0055, 0056) Status effect and Throwable, and
 *   (ADR 0069) Wood set, Stone set, Crop and Tree.
 * - The Scripted ore starter adds three runtime scripts to the Custom ore starter's content
 *   (Phase 6, ADRs 0031 and 0032; scripts need the Fabric mod jar export and are not part of
 *   the Java project export).
 * - The music disc starter refers to the vanilla sound file `minecraft:records/cat`; no
 *   `.ogg` is bundled.
 * - Examples are mirrored on disk under `examples/` as ordinary MSM projects.
 *
 * @packageDocumentation
 */
import { definePlugin, type Plugin } from '@msm/plugin-api';
import { libraryExamples } from './examples/index';
import { libraryStarters } from './starters/index';

export {
  ARMOR_LAYER_SIZE,
  armorLayerPng,
  bodyArmorLayerPng,
  boxSkinPng,
  DEFAULT_COLOUR,
  EFFECT_ICON_SIZE,
  encodePng,
  HORSE_ARMOR_LAYER_SIZE,
  mobSkinPng,
  PAINTING_PIXELS_PER_BLOCK,
  PLACEHOLDER_PATTERNS,
  PLACEHOLDER_SIZE,
  PLACEHOLDER_SKIN_SIZE,
  type PlaceholderOptions,
  type PlaceholderPattern,
  paintingPixels,
  paintingPng,
  placeholderPixels,
  placeholderPng,
  placeholderSize,
  placeholderSkinPixels,
  placeholderSkinPng,
  type Rgb,
  WOLF_ARMOR_LAYER_SIZE,
} from './assets/png';
export { COLOURS, KINDS, modIdFromNamespace } from './content/bundle';
export {
  MOB_PRESET_NAMES,
  MOB_PRESETS,
  presetAnimationFields,
  presetSkinPng,
} from './content/mob-presets';
export { type DecodedPng, decodePngDataUrl, PNG_DATA_URL_PREFIX } from './content/parameters';
export {
  behaviourExamples,
  categoryTag,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  STARTERS_CATEGORY,
  scriptBehaviourExamples,
  starterExamples,
} from './examples/index';
export {
  BREWING_INGREDIENTS,
  CONSUMABLE_PARAMETERS,
  CROP_PARAMETERS,
  CUSTOM_MOB_PARAMETERS,
  CUSTOM_ORE_PARAMETERS,
  CUSTOM_SWORD_PARAMETERS,
  ENCHANTMENT_PARAMETERS,
  EXTRA_DROP_PARAMETERS,
  EXTRA_DROP_TABLES,
  FOOD_PARAMETERS,
  GEAR_SET_PARAMETERS,
  GOAT_HORN_PARAMETERS,
  gearSetIds,
  libraryStarters,
  MOB_SKIN_BIOMES,
  MOB_SKIN_PARAMETERS,
  MUSIC_DISC_ITEM_PARAMETERS,
  nearestTrimPalette,
  PAINTING_MAX_BYTES,
  PAINTING_MAX_SIZE,
  PAINTING_PARAMETERS,
  POTION_PARAMETERS,
  SCRIPTED_ITEM_PARAMETERS,
  SIMPLE_BLOCK_PARAMETERS,
  STATUS_EFFECT_PARAMETERS,
  STONE_SET_MEMBERS,
  STONE_SET_PARAMETERS,
  scriptedItemIds,
  scriptedOreIds,
  THROWABLE_PARAMETERS,
  TOTEM_PARAMETERS,
  TREE_PARAMETERS,
  WEAPON_PARAMETERS,
  WEAPON_TYPES,
  WOOD_SET_MEMBERS,
  WOOD_SET_PARAMETERS,
} from './starters/index';

const plugin: Readonly<Plugin> = definePlugin({
  id: 'msm.library',
  apiVersion: '^1.0.0',
  contributes: {
    projectStarters: [...libraryStarters],
    examples: [...libraryExamples],
  },
});

export default plugin;
