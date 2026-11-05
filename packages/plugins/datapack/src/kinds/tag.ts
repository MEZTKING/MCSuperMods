/**
 * `minecraft:tag/<registry>`: a tag of one registry (`data/<ns>/<tags>/<registry>/<path>.json`),
 * validated against the per-registry schema reference `tag:<registry>` (ADR 0015). Outputs
 * declare `merge: 'tag'`, so several elements may contribute to one tag file (ADR 0027).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

/** The registries that have a tag kind, in a stable order. */
export const TAG_REGISTRIES = Object.freeze([
  'block',
  'item',
  'entity_type',
  'fluid',
  'game_event',
  'function',
  'damage_type',
  'enchantment',
  'painting_variant',
  'worldgen/biome',
  'worldgen/structure',
  'worldgen/world_preset',
] as const);

/** A registry with a tag kind. */
export type TagRegistry = (typeof TAG_REGISTRIES)[number];

/**
 * Creates the tag kind of one registry: id `minecraft:tag/<registry>`, schema
 * `tag:<registry>`, kind-folder `tags/<registry>`.
 *
 * @param registry - The registry whose ids the tag lists, such as `item`.
 * @returns The element kind.
 */
export function tagKind(registry: string): ElementKind {
  const schema = `tag:${registry}`;
  return {
    id: `minecraft:tag/${registry}`,
    schema,
    folder: `tags/${registry}`,
    defaultData: { replace: false, values: [] },
    lower: (element, target) =>
      lowerJsonData(element, target, 'tags', schema, registry).map((file) => ({
        ...file,
        merge: 'tag',
      })),
  };
}

/** The tag kinds of {@link TAG_REGISTRIES}, in the same order. */
export const tagKinds: readonly ElementKind[] = Object.freeze(TAG_REGISTRIES.map(tagKind));
