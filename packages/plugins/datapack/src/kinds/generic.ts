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
] as const satisfies readonly DataFolderKey[]);

/** A registry with a generic kind. */
export type GenericDataRegistry = (typeof GENERIC_DATA_REGISTRIES)[number];

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
