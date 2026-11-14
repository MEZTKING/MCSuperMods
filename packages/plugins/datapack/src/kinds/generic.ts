/**
 * Tier-B generic data kinds (ADR 0015): `minecraft:<name>` for each registry below, schema
 * `resource:<name>`, one JSON file at `data/<ns>/<target.folders.data[name]>/<path>.json`.
 * They have no templates or studios; the schema form is their editor.
 */
import type { DataFolderKey, ElementKind, Json } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

/** The registries with a generic kind, in a stable order. Each is also a `DataFolderKey`. */
export const GENERIC_DATA_REGISTRIES = Object.freeze([
  'enchantment',
  'damage_type',
  'dimension_type',
  'chat_type',
  'jukebox_song',
  'banner_pattern',
  'painting_variant',
  'trim_material',
  'trim_pattern',
  'dialog',
  'villager_trade',
  'trade_set',
  'wolf_variant',
  'cat_variant',
  'pig_variant',
  'cow_variant',
  'chicken_variant',
  'frog_variant',
  'zombie_nautilus_variant',
  'cat_sound_variant',
  'pig_sound_variant',
  'cow_sound_variant',
  'chicken_sound_variant',
  'instrument',
  'enchantment_provider',
  'timeline',
  'world_clock',
] as const satisfies readonly DataFolderKey[]);

/** A registry with a generic kind. */
export type GenericDataRegistry = (typeof GENERIC_DATA_REGISTRIES)[number];

/** A mob variant that applies everywhere: one spawn condition with the lowest priority. */
const EVERYWHERE = [{ priority: 0 }];

/** The vanilla animal sound ids (adult and baby) for one animal, named by suffix. */
const sounds = (prefix: string, names: readonly string[]): Json =>
  Object.fromEntries(names.map((name) => [`${name}_sound`, `minecraft:entity.${prefix}.${name}`]));

/**
 * Minimal valid data per kind. Only `minecraft:` ids; asset ids name vanilla assets, so a new
 * element loads before the user points it at their own textures or sounds.
 */
const DEFAULTS: Readonly<Record<GenericDataRegistry, Json>> = {
  enchantment: {
    description: 'Custom enchantment',
    supported_items: '#minecraft:enchantable/sharp_weapon',
    weight: 10,
    max_level: 1,
    min_cost: { base: 1, per_level_above_first: 11 },
    max_cost: { base: 21, per_level_above_first: 11 },
    anvil_cost: 1,
    slots: ['mainhand'],
  },
  damage_type: {
    message_id: 'generic',
    scaling: 'when_caused_by_living_non_player',
    exhaustion: 0.1,
  },
  dimension_type: {
    has_skylight: true,
    has_ceiling: false,
    has_ender_dragon_fight: false,
    coordinate_scale: 1,
    ambient_light: 0,
    logical_height: 384,
    infiniburn: '#minecraft:infiniburn_overworld',
    min_y: -64,
    height: 384,
    monster_spawn_light_level: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 },
    monster_spawn_block_light_limit: 0,
  },
  chat_type: {
    chat: { translation_key: 'chat.type.text', parameters: ['sender', 'content'] },
    narration: { translation_key: 'chat.type.text.narrate', parameters: ['sender', 'content'] },
  },
  jukebox_song: {
    sound_event: 'minecraft:music_disc.cat',
    description: 'Custom song',
    length_in_seconds: 185,
    comparator_output: 2,
  },
  banner_pattern: {
    asset_id: 'minecraft:creeper',
    translation_key: 'block.minecraft.banner.creeper',
  },
  painting_variant: {
    asset_id: 'minecraft:kebab',
    width: 1,
    height: 1,
    title: 'Custom painting',
  },
  trim_material: {
    palette_id: 'minecraft:trim/quartz',
    description: 'Custom material',
  },
  trim_pattern: {
    asset_id: 'minecraft:coast',
    description: 'Custom pattern',
    decal: false,
  },
  dialog: {
    type: 'minecraft:notice',
    title: 'Notice',
  },
  villager_trade: {
    wants: { id: 'minecraft:emerald', count: 1 },
    gives: { id: 'minecraft:paper', count: 1 },
    max_uses: 12,
    xp: 1,
    reputation_discount: 0.05,
  },
  trade_set: {
    trades: '#minecraft:fletcher/level_1',
    amount: 2,
  },
  wolf_variant: {
    assets: {
      wild: 'minecraft:entity/wolf/wolf',
      tame: 'minecraft:entity/wolf/wolf_tame',
      angry: 'minecraft:entity/wolf/wolf_angry',
    },
    baby_assets: {
      wild: 'minecraft:entity/wolf/wolf_baby',
      tame: 'minecraft:entity/wolf/wolf_tame_baby',
      angry: 'minecraft:entity/wolf/wolf_angry_baby',
    },
    spawn_conditions: EVERYWHERE,
  },
  cat_variant: {
    asset_id: 'minecraft:entity/cat/cat_tabby',
    baby_asset_id: 'minecraft:entity/cat/cat_tabby_baby',
    spawn_conditions: EVERYWHERE,
  },
  pig_variant: {
    asset_id: 'minecraft:entity/pig/pig_temperate',
    baby_asset_id: 'minecraft:entity/pig/pig_temperate_baby',
    spawn_conditions: EVERYWHERE,
  },
  cow_variant: {
    asset_id: 'minecraft:entity/cow/cow_temperate',
    baby_asset_id: 'minecraft:entity/cow/cow_temperate_baby',
    spawn_conditions: EVERYWHERE,
  },
  chicken_variant: {
    asset_id: 'minecraft:entity/chicken/chicken_temperate',
    baby_asset_id: 'minecraft:entity/chicken/chicken_temperate_baby',
    spawn_conditions: EVERYWHERE,
  },
  frog_variant: {
    asset_id: 'minecraft:entity/frog/frog_temperate',
    spawn_conditions: EVERYWHERE,
  },
  zombie_nautilus_variant: {
    asset_id: 'minecraft:entity/nautilus/zombie_nautilus',
    spawn_conditions: EVERYWHERE,
  },
  // Sound events are named by id; the inline `{ sound_id }` form is not used in defaults.
  cat_sound_variant: {
    adult_sounds: sounds('cat', [
      'ambient',
      'beg_for_food',
      'death',
      'eat',
      'hiss',
      'hurt',
      'purr',
      'purreow',
      'stray_ambient',
    ]),
    baby_sounds: sounds('baby_cat', [
      'ambient',
      'beg_for_food',
      'death',
      'eat',
      'hiss',
      'hurt',
      'purr',
      'purreow',
      'stray_ambient',
    ]),
  },
  pig_sound_variant: {
    adult_sounds: sounds('pig', ['ambient', 'death', 'eat', 'hurt', 'step']),
    baby_sounds: sounds('baby_pig', ['ambient', 'death', 'eat', 'hurt', 'step']),
  },
  cow_sound_variant: sounds('cow', ['ambient', 'death', 'hurt', 'step']),
  chicken_sound_variant: {
    adult_sounds: sounds('chicken', ['ambient', 'death', 'hurt', 'step']),
    baby_sounds: sounds('baby_chicken', ['ambient', 'death', 'hurt', 'step']),
  },
  instrument: {
    description: 'Custom horn',
    sound_event: 'minecraft:item.goat_horn.sound.0',
    use_duration: 7,
    range: 256,
  },
  enchantment_provider: {
    type: 'minecraft:single',
    enchantment: 'minecraft:silk_touch',
    level: 1,
  },
  timeline: {
    clock: 'minecraft:overworld',
    period_ticks: 24000,
  },
  world_clock: {},
};

/**
 * Creates the generic kind of one registry: id `minecraft:<registry>`, schema
 * `resource:<registry>`, kind-folder `<registry>`, output folder
 * `target.folders.data[<registry>]`.
 *
 * @param registry - One of {@link GENERIC_DATA_REGISTRIES}.
 * @returns The element kind.
 */
export function genericKind(registry: GenericDataRegistry): ElementKind {
  const schema = `resource:${registry}`;
  return {
    id: `minecraft:${registry}`,
    schema,
    folder: registry,
    defaultData: structuredClone(DEFAULTS[registry]),
    lower: (element, target) => lowerJsonData(element, target, registry, schema),
  };
}

/** The generic kinds of {@link GENERIC_DATA_REGISTRIES}, in the same order. */
export const genericKinds: readonly ElementKind[] = Object.freeze(
  GENERIC_DATA_REGISTRIES.map(genericKind),
);
