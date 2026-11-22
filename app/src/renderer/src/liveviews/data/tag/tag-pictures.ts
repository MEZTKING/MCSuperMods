/**
 * Pictures and names of a tag's members (B612): which registries have a picture to show (blocks
 * and items by their own item, mobs by their spawn egg), found the way Try it's hotbar finds one
 * (`frame/item-picture.ts`), and each member's name from `en_us`, else words made from its id.
 * Nothing here reads a file itself; the slot does.
 */

import { itemName, type LangTable, wordsOfPath } from '../../frame/item-picture';

const split = (id: string): { namespace: string; path: string } => {
  const bare = id.startsWith('#') ? id.slice(1) : id;
  const colon = bare.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: bare }
    : { namespace: bare.slice(0, colon), path: bare.slice(colon + 1) };
};

/**
 * The item whose picture shows a member, or `null` when the registry has no pictures: a block
 * by its block item (same id; a block without one shows its name), an item by itself, a mob by
 * its spawn egg.
 */
export function pictureItemOf(registry: string, id: string): string | null {
  const { namespace, path } = split(id);
  switch (registry) {
    case 'block':
    case 'item':
      return `${namespace}:${path}`;
    case 'entity_type':
      return `${namespace}:${path}_spawn_egg`;
    default:
      return null;
  }
}

/** Whether the members of `registry` are drawn as slots with pictures. */
export function hasPictures(registry: string): boolean {
  return pictureItemOf(registry, 'minecraft:x') !== null;
}

/**
 * The `en_us` key that names a member of `registry`, or `null` when the registry's members have
 * no name of their own in the language file (they are then named by words from their id).
 */
export function langKeyOf(registry: string, id: string): string | null {
  const { namespace, path } = split(id);
  const dotted = path.replaceAll('/', '.');
  switch (registry) {
    case 'block':
      return `block.${namespace}.${dotted}`;
    case 'entity_type':
      return `entity.${namespace}.${dotted}`;
    case 'enchantment':
      return `enchantment.${namespace}.${dotted}`;
    case 'worldgen/biome':
      return `biome.${namespace}.${dotted}`;
    case 'painting_variant':
      return `painting.${namespace}.${dotted}.title`;
    case 'instrument':
      return `instrument.${namespace}.${dotted}`;
    case 'worldgen/flat_level_generator_preset':
      return `flat_world_preset.${namespace}.${dotted}`;
    case 'worldgen/world_preset':
      return `generator.${namespace}.${dotted}`;
    default:
      return null;
  }
}

/** A member's name: `en_us`'s words for it, else words made from its id. */
export function memberName(registry: string, id: string, lang: LangTable | null): string {
  if (registry === 'item') return itemName(id, lang);
  const key = langKeyOf(registry, id);
  const words = key === null ? undefined : lang?.[key];
  return words ?? wordsOfPath(id);
}
