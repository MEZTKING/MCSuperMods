/**
 * Bags and bundles (B463, ADR 0095, B450 notes) as Try it's mock-up reads them: an item with
 * `msm:item_inventory` opens a screen from the hand, the one the runtime opens:
 *
 * - layout `chest` (the default) with 3 rows: the shulker box screen, 27 slots; other rows: the
 *   generic chest screens of 9, 18, 36, 45 or 54 slots;
 * - layout `hopper`: one row of five; `dispenser`: three by three.
 *
 * `open: use` (the default) opens with or without sneaking, `sneak_use` only while sneaking. The
 * game moves items and keeps them in the bag (`minecraft:container`); the preview draws the
 * slots and nothing moves. A `msm:bundle` holds items in the game only (said out loud).
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import type { SimFiles } from '../types.js';

/** A bag's screen. */
export interface BagScreen {
  readonly kind: 'bag';
  /** The layout of `msm:item_inventory`. */
  readonly layout: 'chest' | 'hopper' | 'dispenser';
  /** The screen it stands for. */
  readonly screen: 'shulker_box' | 'chest' | 'hopper' | 'dispenser';
  readonly rows: number;
  readonly columns: number;
  /** When it opens: on any use, or only while sneaking. */
  readonly open: 'use' | 'sneak_use';
}

/** A bundle (vanilla's bundle, B450). */
export interface BundleSpec {
  readonly kind: 'bundle';
}

/** What an item holds. */
export type ItemInventorySpec = BagScreen | BundleSpec;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ITEM_PATH = /^msm\/([a-z0-9_.-]+)\/item\/(.+)\.json$/;

/** The bag or bundle a lowered item definition makes, or `undefined`. */
export function itemInventoryOf(definition: Json | undefined): ItemInventorySpec | undefined {
  if (!isRecord(definition)) return undefined;
  const components = isRecord(definition.components) ? definition.components : {};
  const bag = components['msm:item_inventory'];
  if (isRecord(bag)) {
    const open = bag.open === 'sneak_use' ? 'sneak_use' : 'use';
    if (bag.layout === 'hopper') {
      return Object.freeze({
        kind: 'bag',
        layout: 'hopper',
        screen: 'hopper',
        rows: 1,
        columns: 5,
        open,
      });
    }
    if (bag.layout === 'dispenser') {
      return Object.freeze({
        kind: 'bag',
        layout: 'dispenser',
        screen: 'dispenser',
        rows: 3,
        columns: 3,
        open,
      });
    }
    const rows =
      typeof bag.rows === 'number' && Number.isInteger(bag.rows)
        ? Math.min(6, Math.max(1, bag.rows))
        : 3;
    return Object.freeze({
      kind: 'bag',
      layout: 'chest',
      screen: rows === 3 ? 'shulker_box' : 'chest',
      rows,
      columns: 9,
      open,
    });
  }
  if (isRecord(components['msm:bundle'])) return Object.freeze({ kind: 'bundle' });
  return undefined;
}

/** Every project item that is a bag or a bundle, by item id. */
export function bagsFromFiles(files: SimFiles): Map<string, ItemInventorySpec> {
  const out = new Map<string, ItemInventorySpec>();
  for (const path of [...files.keys()].sort()) {
    const match = ITEM_PATH.exec(path);
    if (match === null) continue;
    const spec = itemInventoryOf(readJsonFile(files, path));
    if (spec !== undefined) out.set(`${match[1]}:${match[2]}`, spec);
  }
  return out;
}

/** The number of slots of a bag's screen. */
export const bagSlots = (bag: BagScreen): number => bag.rows * bag.columns;

/** What a bag screen stands for in words: "shulker box screen, 27 slots". */
export function bagScreenWords(bag: BagScreen): string {
  const slots = bagSlots(bag);
  switch (bag.screen) {
    case 'shulker_box':
      return `shulker box screen, ${slots} slots`;
    case 'chest':
      return `chest screen, ${bag.rows} ${bag.rows === 1 ? 'row' : 'rows'} of 9`;
    case 'hopper':
      return 'hopper screen, 5 slots';
    default:
      return 'dispenser screen, 3 by 3';
  }
}
