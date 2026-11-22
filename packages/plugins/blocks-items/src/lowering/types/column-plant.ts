/**
 * `column_plant` (ADR 0103 D1, D4 and its amendment after the spike): a stalk of stacked blocks
 * that grows up to a height, as sugar cane (`style: "cane"`), cactus (`"cactus"`) and bamboo
 * (`"bamboo"`, which starts as the generated companion `<path>_shoot`).
 *
 * The generated models name vanilla's templates for the style, with the element's textures:
 *
 * - `cane`: `minecraft:block/cross` from `textures.all` at `<ns>:block/<path>` (vanilla's sugar
 *   cane uses the grass-tinted cross; a project cane's picture carries its own colour);
 * - `cactus`: `minecraft:block/cactus` from `top`, `side` and `bottom` at `<ns>:block/<path>`;
 * - `bamboo`: vanilla's eight stalk models `minecraft:block/bamboo1_age0` to `bamboo4_age1` from
 *   `stalk` (`<ns>:block/<path>`, `_stalk2` to `_stalk4` for the thin stalk, `_thick` to
 *   `_thick4` for the thick one), `bamboo_small_leaves` and `bamboo_large_leaves` from
 *   `leaves_small` and `leaves_large` when either is given (each defaults to the other), and the
 *   shoot on `minecraft:block/cross` from `shoot` (default `stalk`) at `<ns>:block/<path>_shoot`.
 *
 * The block states are vanilla's: one variant for cane and cactus; for bamboo vanilla's
 * multipart, the four stalk models picked at random by `age` (0 thin, 1 thick) and the leaves by
 * `leaves`; the shoot one variant. The block item is a flat `minecraft:item/generated` model of
 * `textures.item` (default `all`, `side` or `stalk`).
 *
 * Tags: a bamboo stalk and its shoot join block `supports_bamboo`, as vanilla's bamboo and its
 * sapling do (`TargetFacts.blocks.plantSoils.bamboo`: a stalk stands on stalks and shoots). Cane
 * and cactus join none: they stand on themselves by the runtime's own rule.
 *
 * `"loot": "self"` drops the item, the shoot too, as vanilla's tables.
 *
 * Model slots: `default`; optional `stalk2` to `stalk4`, `thick` to `thick4`, `leaves_small`,
 * `leaves_large`, `shoot` (bamboo).
 */
import type { JsonObject } from '@msm/plugin-api';
import { nonEmptyString } from '../shared';
import { part, variant } from './blockstates';
import {
  type ModelSpec,
  readTextures,
  type SlotModels,
  type TypeLowering,
  textureLookup,
} from './models';
import type { TypeTags } from './tags';

/** The suffix of a bamboo-like column plant's shoot companion (ADR 0103 D1). */
export const SHOOT_COMPANION_SUFFIX = '_shoot';

/** The styles of a column plant. */
export const COLUMN_PLANT_STYLES = Object.freeze(['cane', 'cactus', 'bamboo'] as const);
export type ColumnPlantStyle = (typeof COLUMN_PLANT_STYLES)[number];

/** The block tags a bamboo stalk and its shoot join (`plantSoils.bamboo`). */
export const BAMBOO_BLOCK_TAGS: readonly string[] = Object.freeze(['supports_bamboo']);

/** Vanilla's height of each style: 3 for cane and cactus, 16 for bamboo (verify at implementation). */
export const DEFAULT_MAX_HEIGHT: Readonly<Record<ColumnPlantStyle, number>> = Object.freeze({
  cane: 3,
  cactus: 3,
  bamboo: 16,
});
/** The lowest height a vanilla bamboo stalk stops at, as measured by B503. */
export const BAMBOO_MIN_HEIGHT = 12;

/** The style of a column plant; `cane` when it is missing or unknown. */
export function columnStyleOf(data: JsonObject): ColumnPlantStyle {
  const style = nonEmptyString(data.style);
  return (COLUMN_PLANT_STYLES as readonly string[]).includes(style ?? '')
    ? (style as ColumnPlantStyle)
    : 'cane';
}

/** `max_height` as written, else the style's default. */
export const columnMaxHeight = (data: JsonObject): number =>
  typeof data.max_height === 'number' ? data.max_height : DEFAULT_MAX_HEIGHT[columnStyleOf(data)];

/** The thin stalk slots (age 0), primary first, and the thick ones (age 1). */
const THIN_SLOTS = ['default', 'stalk2', 'stalk3', 'stalk4'] as const;
const THICK_SLOTS = ['thick', 'thick2', 'thick3', 'thick4'] as const;

const bambooStalkSpecs = (stalk: string): ModelSpec[] =>
  [THIN_SLOTS, THICK_SLOTS].flatMap((slots, age) =>
    slots.map((slot, index) => ({
      slot,
      suffix: slot === 'default' ? '' : `_${slot}`,
      parent: `minecraft:block/bamboo${index + 1}_age${age}`,
      textures: { all: stalk, particle: stalk },
    })),
  );

/** The models from the element's textures, by style. */
function columnPlantSpecs(data: JsonObject): ModelSpec[] {
  const textures = readTextures(data);
  const texture = textureLookup(textures);
  if (texture === undefined) return [];
  const style = columnStyleOf(data);
  if (style === 'cane') {
    return [
      {
        slot: 'default',
        suffix: '',
        parent: 'minecraft:block/cross',
        textures: { cross: texture('all') },
      },
    ];
  }
  if (style === 'cactus') {
    const side = texture('side', 'top');
    return [
      {
        slot: 'default',
        suffix: '',
        parent: 'minecraft:block/cactus',
        textures: {
          bottom: texture('bottom', 'top', 'side'),
          particle: side,
          side,
          top: texture('top', 'side'),
        },
      },
    ];
  }
  const stalk = texture('stalk');
  const specs = bambooStalkSpecs(stalk);
  const small = textures.leaves_small ?? textures.leaves_large;
  const large = textures.leaves_large ?? textures.leaves_small;
  if (small !== undefined && large !== undefined) {
    specs.push(
      {
        slot: 'leaves_small',
        suffix: '_leaves_small',
        parent: 'minecraft:block/bamboo_small_leaves',
        textures: { particle: small, texture: small },
      },
      {
        slot: 'leaves_large',
        suffix: '_leaves_large',
        parent: 'minecraft:block/bamboo_large_leaves',
        textures: { particle: large, texture: large },
      },
    );
  }
  specs.push({
    slot: 'shoot',
    suffix: SHOOT_COMPANION_SUFFIX,
    parent: 'minecraft:block/cross',
    textures: { cross: texture('shoot', 'stalk') },
  });
  return specs;
}

/** One model, or vanilla's list of models picked at random. */
const randomApply = (models: readonly string[]): JsonObject | JsonObject[] =>
  models.length === 1 ? variant(models[0] ?? '') : models.map((model) => variant(model));

/** The given models of `slots`, in order. */
const present = (models: SlotModels, slots: readonly string[]): string[] =>
  slots.map((slot) => models[slot]).filter((model): model is string => model !== undefined);

/** Vanilla's bamboo multipart: the stalk by `age`, the leaves by `leaves`. */
function bambooBlockstate(models: SlotModels): JsonObject {
  const thin = present(models, THIN_SLOTS);
  const thick = present(models, THICK_SLOTS);
  const multipart: JsonObject[] = [
    { apply: randomApply(thin), when: { age: '0' } },
    { apply: randomApply(thick.length > 0 ? thick : thin), when: { age: '1' } },
  ];
  if (models.leaves_small !== undefined) {
    multipart.push(part(variant(models.leaves_small), { leaves: 'small' }));
  }
  const large = models.leaves_large ?? models.leaves_small;
  if (large !== undefined) multipart.push(part(variant(large), { leaves: 'large' }));
  return { multipart };
}

const isBamboo = (data: JsonObject): boolean => columnStyleOf(data) === 'bamboo';

export const columnPlantType: TypeLowering = {
  slots: ['default'],
  optionalSlots: [...THIN_SLOTS.slice(1), ...THICK_SLOTS, 'leaves_small', 'leaves_large', 'shoot'],
  generate: () => [],
  generateFromData: columnPlantSpecs,
  itemTextureFromData: (data) => {
    const fallback = { cane: 'all', cactus: 'side', bamboo: 'stalk' }[columnStyleOf(data)];
    return textureLookup(readTextures(data))?.('item', fallback);
  },
  blockstate: (models, { data }) =>
    isBamboo(data) ? bambooBlockstate(models) : { variants: { '': variant(models.default ?? '') } },
  tags: (data): TypeTags => ({ block: isBamboo(data) ? BAMBOO_BLOCK_TAGS : [], item: [] }),
  companions: [
    {
      suffix: SHOOT_COMPANION_SUFFIX,
      applies: isBamboo,
      blockstate: (models) => ({ variants: { '': variant(models.shoot ?? models.default ?? '') } }),
      blockTags: BAMBOO_BLOCK_TAGS,
    },
  ],
};
