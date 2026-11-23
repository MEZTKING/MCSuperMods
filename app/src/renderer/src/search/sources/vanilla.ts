/**
 * The vanilla layer (ADR 0124 D3; B660): one entry per id of the target's registries of the shown
 * sorts (blocks and items as one thing, mobs, biomes, effects, enchantments, potions, particles and
 * sounds), named from the user's own jar (`vanilla-names.ts`) or, without it, by words made from
 * the id. Each entry carries its whole id as an exact id and its sort as a word; particles and
 * sounds are technical for Very easy. A vanilla id a target lacks is simply not there.
 *
 * Also the things the answer reader may name (blocks, items and mobs with their names) and the
 * protected words (the words of the ids, so the stemmer never cuts a game word short).
 *
 * @packageDocumentation
 */

import type { SearchEntry, SearchThing } from '@msm/search';
import type { VanillaNames } from '../../../../shared/platform';
import { nameOf, thingNameOf } from '../vanilla-names';
import { asAction, asPreview, entryIds, type VanillaSort } from './shared';

/** The registries read, with the sort they become and the word they carry. */
export const VANILLA_REGISTRIES: readonly {
  readonly registry: string;
  readonly sort: VanillaSort;
  readonly word: string;
  readonly technical?: boolean;
}[] = [
  { registry: 'block', sort: 'thing', word: 'block' },
  { registry: 'item', sort: 'thing', word: 'item' },
  { registry: 'entity_type', sort: 'mob', word: 'mob' },
  { registry: 'worldgen/biome', sort: 'biome', word: 'biome' },
  { registry: 'mob_effect', sort: 'effect', word: 'effect' },
  { registry: 'enchantment', sort: 'enchantment', word: 'enchantment' },
  { registry: 'potion', sort: 'potion', word: 'potion' },
  { registry: 'particle_type', sort: 'particle', word: 'particle', technical: true },
  { registry: 'sound_event', sort: 'sound', word: 'sound', technical: true },
];

/** The vendored registries: registry name to ids (paths, or whole ids). */
export type VanillaRegistries = Readonly<Record<string, readonly string[]>>;

const pathOf = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** Words made from a vanilla id ("Oak log"; a sound keeps its whole path past the category). */
export function vanillaWords(path: string, sort: VanillaSort): string {
  if (sort === 'sound') {
    const parts = path.split('.').filter((part) => part !== '');
    return capitalise((parts.length > 1 ? parts.slice(1) : parts).join(' ').replace(/_/g, ' '));
  }
  const last =
    path
      .split('/')
      .filter((part) => part !== '')
      .pop() ?? path;
  return capitalise(last.replace(/_/g, ' ').trim());
}

function nameFor(
  names: VanillaNames | null,
  registry: string,
  id: string,
  path: string,
): string | undefined {
  switch (registry) {
    case 'block':
    case 'item':
      return thingNameOf(names, id);
    case 'entity_type':
      return nameOf(names, 'entityTypes', id);
    case 'worldgen/biome':
      return nameOf(names, 'biomes', id);
    case 'mob_effect':
      return nameOf(names, 'effects', id);
    case 'enchantment':
      return nameOf(names, 'enchantments', id);
    case 'potion':
      return nameOf(names, 'potions', id);
    case 'sound_event':
      return nameOf(names, 'subtitles', path);
    default:
      return undefined;
  }
}

/** What the vanilla collector makes. */
export interface VanillaLayer {
  readonly entries: SearchEntry[];
  readonly things: SearchThing[];
  readonly protect: string[];
}

/** The vanilla layer of a target's registries, named by `names` when given. */
export function vanillaLayer(
  registries: VanillaRegistries,
  names: VanillaNames | null,
): VanillaLayer {
  const entries = new Map<string, SearchEntry & { words: string[]; ids: string[] }>();
  const things = new Map<string, SearchThing>();
  const protect = new Set<string>();
  for (const { registry, sort, word, technical } of VANILLA_REGISTRIES) {
    const list = registries[registry];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== 'string' || raw === '') continue;
      const path = pathOf(raw);
      const id = raw.includes(':') ? raw : `minecraft:${raw}`;
      for (const part of path.split(/[_/.]/)) if (part.length > 3) protect.add(part);
      const key = entryIds.vanilla(sort, path);
      const name = nameFor(names, registry, id, path);
      const held = entries.get(key);
      if (held !== undefined) {
        if (!held.words.includes(word)) held.words.push(word);
        continue;
      }
      const action = { type: 'vanilla', id, sort } as const;
      entries.set(key, {
        id: key,
        source: 'vanilla',
        title: name ?? vanillaWords(path, sort),
        words: [word],
        ids: [id],
        available: true,
        ...(technical === true ? { technical: true } : {}),
        action: asAction(action),
        preview: asPreview(action),
      });
      if (sort === 'thing' || sort === 'mob') {
        const thingSort = sort === 'mob' ? 'mob' : registry === 'block' ? 'block' : 'item';
        if (!things.has(id)) {
          things.set(id, { id, name: name ?? vanillaWords(path, sort), sort: thingSort });
        }
      }
    }
  }
  return {
    entries: [...entries.values()],
    things: [...things.values()],
    protect: [...protect].sort(),
  };
}

/** Parses the vendored registries file (a JSON object of string lists). */
export function parseVanillaRegistries(json: unknown): VanillaRegistries {
  const out: Record<string, string[]> = {};
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return out;
  for (const [name, ids] of Object.entries(json)) {
    if (Array.isArray(ids)) out[name] = ids.filter((id): id is string => typeof id === 'string');
  }
  return out;
}
