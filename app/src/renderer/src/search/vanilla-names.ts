/**
 * Minecraft's own names, read once per target (ADR 0124 D3; B656's channel `minecraft:names`): the
 * English names of blocks, items, mobs, biomes, effects, enchantments, potions and sound subtitles
 * from the `en_us.json` of the user's own jar in the asset cache, for the search's vanilla layer
 * and, later, the ThingPicker. Kept in memory only, never written anywhere. `null` when the cache
 * is not set up, the bridge lacks the channel or the read fails: the search then makes names from
 * the ids. Many items have no `item.minecraft.` key and take their block's name.
 *
 * @packageDocumentation
 */

import type { VanillaNameSort, VanillaNames } from '../../../shared/platform';

/** Reads one target's names (the preload bridge's `minecraft.readNames`). */
export type ReadVanillaNames = (targetId: string) => Promise<VanillaNames | null>;

/** The bridge's reader, when the app has one (tests and older bridges: none). */
export function bridgeNamesReader(): ReadVanillaNames | undefined {
  const msm = (globalThis as { msm?: { minecraft?: { readNames?: ReadVanillaNames } } }).msm;
  const read = msm?.minecraft?.readNames;
  return typeof read === 'function' ? (targetId) => read.call(msm?.minecraft, targetId) : undefined;
}

const cache = new Map<string, Promise<VanillaNames | null>>();

/**
 * The names of a target, read once and kept (a failed read is retried on the next call). `null`
 * without a reader, without the cache or on an error.
 */
export function vanillaNamesFor(
  targetId: string,
  read: ReadVanillaNames | undefined = bridgeNamesReader(),
): Promise<VanillaNames | null> {
  const held = cache.get(targetId);
  if (held !== undefined) return held;
  if (read === undefined) return Promise.resolve(null);
  const pending = (async () => {
    try {
      const names = await read(targetId);
      return isNames(names) ? names : null;
    } catch {
      return null;
    }
  })();
  cache.set(targetId, pending);
  void pending.then((names) => {
    if (names === null && cache.get(targetId) === pending) cache.delete(targetId);
  });
  return pending;
}

/** Forgets every target's names (Settings changed the game folder; tests). */
export function clearVanillaNames(): void {
  cache.clear();
}

function isNames(value: unknown): value is VanillaNames {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One name of a sort, if the jar has it. */
export function nameOf(
  names: VanillaNames | null | undefined,
  sort: VanillaNameSort,
  key: string,
): string | undefined {
  const table = names?.[sort];
  if (typeof table !== 'object' || table === null) return undefined;
  const value = (table as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A block or item's name: the item's, else its block's (many items have no key of their own). */
export function thingNameOf(
  names: VanillaNames | null | undefined,
  id: string,
): string | undefined {
  return nameOf(names, 'items', id) ?? nameOf(names, 'blocks', id);
}
