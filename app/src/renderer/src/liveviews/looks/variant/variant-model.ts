/**
 * What the variant views read from a variant's data (B627; ADR 0121 D4): the picture a variant
 * names for a look (wild, tame or angry for wolves; adult or baby), the model it names, where it
 * spawns, and the named parts of the zombie nautilus's flat sheet. Pure: no DOM.
 *
 * The data shapes are the targets' own (`wolf_variant`: `assets` and `baby_assets` with `wild`,
 * `tame` and `angry`; `cat`, `pig`, `cow` and `chicken`: `asset_id` and `baby_asset_id`; `frog`
 * and `zombie_nautilus`: `asset_id` only; `pig`, `cow`, `chicken` and `zombie_nautilus`: an
 * optional `model`), the same on both targets.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** A wolf's three looks. */
export type WolfLook = 'wild' | 'tame' | 'angry';

/** The wolf's looks, in the picker's order. */
export const WOLF_LOOKS: readonly WolfLook[] = ['wild', 'tame', 'angry'];

/** Each wolf look in words. */
export const WOLF_LOOK_WORDS: Readonly<Record<WolfLook, string>> = {
  wild: 'Wild',
  tame: 'Tame',
  angry: 'Angry',
};

/** Whether the kind is the wolf's variant. */
export const isWolf = (kind: string): boolean => kind === 'minecraft:wolf_variant';

/** The mob a variant kind dresses, in words (`Wolf`, `Zombie nautilus`). */
export function mobWordsOf(kind: string): string {
  const name = kind
    .replace(/^minecraft:/, '')
    .replace(/_(sound_)?variant$/, '')
    .replace(/_archetype$/, '');
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The texture id a variant names for a look (`minecraft:entity/wolf/wolf_tame`), or `undefined`
 * when the data names none. A baby without its own picture has none (the game then has nothing
 * to draw either).
 */
export function variantTexture(
  kind: string,
  data: Json | undefined,
  look: { wolf?: WolfLook; baby?: boolean } = {},
): string | undefined {
  if (!isObject(data)) return undefined;
  if (isWolf(kind)) {
    const assets = data[look.baby === true ? 'baby_assets' : 'assets'];
    return isObject(assets) ? text(assets[look.wolf ?? 'wild']) : undefined;
  }
  return text(data[look.baby === true ? 'baby_asset_id' : 'asset_id']);
}

/** Whether a variant of this kind can name a baby picture (the frog and the zombie nautilus cannot). */
export function hasBabyLook(kind: string): boolean {
  return (
    kind !== 'minecraft:frog_variant' &&
    kind !== 'minecraft:zombie_nautilus_variant' &&
    kind.endsWith('_variant')
  );
}

/** The model a variant names (`normal` when it names none). */
export function variantModel(data: Json | undefined): string {
  const model = isObject(data) ? text(data.model) : undefined;
  return (model ?? 'normal').replace(/^minecraft:/, '');
}

/** Each model name in words. */
export const MODEL_WORDS: Readonly<Record<string, string>> = {
  normal: 'the usual body',
  cold: 'the cold body',
  warm: 'the warm body',
};

/** One spawn condition of a variant, read from `spawn_conditions`. */
export interface SpawnRule {
  readonly priority: number;
  /**
   * `anywhere` (no condition), `biome`, `structure` and `moon` (the three condition types of
   * both targets), or `other` for a type this view does not know (named as written).
   */
  readonly type: 'anywhere' | 'biome' | 'structure' | 'moon' | 'other';
  /** The ids or `#` tags of a biome or structure condition, as written. */
  readonly ids: readonly string[];
  /** The moon brightness range of a `moon` condition. */
  readonly range?: { readonly min?: number; readonly max?: number };
  /** The condition type as written, for `other`. */
  readonly written?: string;
}

const ids = (value: Json | undefined): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];

const bound = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The spawn conditions of a variant, highest priority first (the game tries them in that order). */
export function spawnRules(data: Json | undefined): SpawnRule[] {
  const list = isObject(data) && Array.isArray(data.spawn_conditions) ? data.spawn_conditions : [];
  const out: SpawnRule[] = [];
  for (const entry of list) {
    if (!isObject(entry)) continue;
    const priority = typeof entry.priority === 'number' ? entry.priority : 0;
    const condition = isObject(entry.condition) ? entry.condition : undefined;
    if (condition === undefined) {
      out.push({ priority, type: 'anywhere', ids: [] });
      continue;
    }
    const type = (text(condition.type) ?? '').replace(/^minecraft:/, '');
    if (type === 'biome') out.push({ priority, type: 'biome', ids: ids(condition.biomes) });
    else if (type === 'structure')
      out.push({ priority, type: 'structure', ids: ids(condition.structures) });
    else if (type === 'moon_brightness') {
      const range = condition.range;
      const min =
        typeof range === 'number' ? range : isObject(range) ? bound(range.min) : undefined;
      const max =
        typeof range === 'number' ? range : isObject(range) ? bound(range.max) : undefined;
      out.push({
        priority,
        type: 'moon',
        ids: [],
        range: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) },
      });
    } else out.push({ priority, type: 'other', ids: [], written: type });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** A rectangle of a flat sheet, in texels: `[x0, y0, x1, y1]`. */
export type SheetRect = readonly [number, number, number, number];

/** One named part of a flat sheet. */
export interface SheetPart {
  readonly name: string;
  readonly rect: SheetRect;
}

/**
 * The parts of the zombie nautilus's sheet, as the spike B619 measured them on both targets
 * (`docs/reference/spikes/b619/results/bodies-*.json`, the faces seen square on): the upper box
 * (14 by 10 by 16 texels) and the lower box (14 by 8 by 20), each face named for its side; the
 * warm model's coral pieces sit at an angle and were measured only in part. In texels of the
 * 128 by 128 picture; a picture of another size is scaled to it.
 */
export const NAUTILUS_SHEET_SIZE = 128;

const UPPER: readonly SheetPart[] = [
  { name: 'Upper part, top', rect: [16, 0, 30, 16] },
  { name: 'Upper part, one side', rect: [0, 16, 16, 26] },
  { name: 'Upper part, front', rect: [16, 16, 30, 26] },
  { name: 'Upper part, the other side', rect: [30, 16, 46, 26] },
  { name: 'Upper part, back', rect: [46, 16, 60, 26] },
];

const LOWER: readonly SheetPart[] = [
  { name: 'Lower part, one side', rect: [0, 46, 20, 54] },
  { name: 'Lower part, front', rect: [20, 46, 34, 54] },
  { name: 'Lower part, the other side', rect: [34, 46, 54, 54] },
];

const CORAL: readonly SheetPart[] = [
  { name: 'Coral pieces (at an angle; measured in part)', rect: [6, 85, 10, 112] },
];

/** The named parts of the zombie nautilus's sheet for a model (`normal` or `warm`). */
export function nautilusParts(model: string): readonly SheetPart[] {
  return model === 'warm' ? [...UPPER, ...LOWER, ...CORAL] : [...UPPER, ...LOWER];
}

/** The notes every body view carries (3L3, 3L4). */
export const BODY_NOTES: readonly string[] = [
  'The body is MSM’s stand-in, measured from what the game shows: small parts may sit a little differently.',
  'It turns but does not walk: Minecraft’s own movements are only in the game.',
];

/** The line of the flat sheet (3L5). */
export const FLAT_SHEET_WORDS =
  'MSM has no body for this mob yet: its picture is shown flat, with the parts that were measured named. The body itself is only in the game.';
