/**
 * The Desert plants Creator flow (ADR 0112 D2, ADR 0103 D1; B518): one plant that grows tall in
 * a column or tips under your feet:
 *
 * - **Grows tall by water** (as sugar cane): a `column_plant` of style `cane` on sand, dirt or
 *   grass with water beside it.
 * - **Spiny and grows on sand** (as cactus): style `cactus`, which hurts what touches it.
 * - **Woody stalk with leaves** (as bamboo): style `bamboo`, planted as the generated
 *   `<name>_shoot`, with leaves by height.
 * - **Tips when you stand on it** (as big dripleaf): a big `dripleaf` `<name>` on its stem
 *   `<name>_stem` and a small one `small_<name>` that bone meal grows into the big one.
 *
 * "How tall" keeps vanilla's heights or makes it taller or shorter. "Crafts as the vanilla plant
 * does" adds the vanilla uses: a cane makes sugar, a cactus smelts into green dye, two stalks of
 * bamboo make a stick. The pictures are drawn by MSM's art generator (ADR 0092): the `stalk`
 * recipe (cane, cactus, cactus top, bamboo and its leaves), `sapling` for the bamboo shoot and
 * `dripleaf` (leaf, edge, stem). New blocks need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { artLookPng } from '../art/draw';
import type { ArtRecipeId } from '../art/info';
import type { Rgb } from '../assets/png';
import {
  artSeed,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
} from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The kinds of desert plant. */
export const DESERT_PLANT_KINDS = Object.freeze([
  { value: 'cane', label: 'Grows tall next to water, as sugar cane' },
  { value: 'cactus', label: 'Spiny and grows on sand, as cactus' },
  { value: 'bamboo', label: 'A woody stalk with leaves, as bamboo' },
  { value: 'dripleaf', label: 'A big leaf that tips when you stand on it, as big dripleaf' },
] as const);

/** A kind's value. */
type DesertPlantKind = (typeof DESERT_PLANT_KINDS)[number]['value'];

/** The heights: as vanilla's, taller or shorter (cane and cactus, then bamboo). */
const HEIGHTS = Object.freeze([
  { value: 'usual', label: 'As tall as the vanilla plant', column: undefined, bamboo: undefined },
  { value: 'taller', label: 'About twice as tall', column: 6, bamboo: 24 },
  { value: 'shorter', label: 'Shorter', column: 2, bamboo: 8 },
] as const);

/** The default colour: a dry green. */
const DRY_GREEN: Rgb = [118, 164, 70];

/** The Desert plants questions, group "Plant". */
export const DESERT_PLANTS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'plant_name',
    label: 'Plant name',
    description: 'The English name. Ids derive from it: Dune Reed gives dune_reed.',
    group: 'Plant',
    type: 'string',
    default: 'Dune Reed',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'kind',
    label: 'What it does',
    description: 'How it grows.',
    group: 'Plant',
    type: 'choice',
    default: 'cane',
    choices: DESERT_PLANT_KINDS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the drawn plant.',
    group: 'Plant',
    type: 'colour',
    default: hexFromRgb(DRY_GREEN),
  },
  {
    id: 'height',
    label: 'How tall',
    description:
      'How tall a cane, cactus or bamboo grows by itself (sugar cane and cactus 3 blocks, bamboo 12 to 16); bone meal and stacking by hand go higher. A dripleaf grows by bone meal.',
    group: 'Plant',
    type: 'choice',
    default: 'usual',
    choices: HEIGHTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'uses',
    label: 'Crafts as the vanilla plant does',
    description:
      'A cane makes sugar, a cactus smelts into green dye and two bamboo stalks make a stick, as the vanilla plants do. A dripleaf has no recipe.',
    group: 'Plant',
    type: 'boolean',
    default: true,
  },
]);

/** A texture at `textures/<path>.png` drawn by `recipe` with its default seed. */
function drawn(
  namespace: string,
  path: string,
  recipe: ArtRecipeId,
  colour: Rgb,
  finish?: string,
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: artLookPng({
      recipe,
      colour,
      ...(finish === undefined ? {} : { finish }),
      seed: artSeed(namespace, path, recipe),
    }),
  };
}

/** Vanilla's numbers: canes and leaves break at once, cactus 0.4, bamboo 1 (an axe is faster). */
const BREAKABLE: Readonly<Record<DesertPlantKind, JsonObject>> = {
  cane: { hardness: 0, resistance: 0 },
  cactus: { hardness: 0.4, resistance: 0.4 },
  bamboo: { hardness: 1, resistance: 1, tool: 'axe', requires_tool: false },
  dripleaf: { hardness: 0.1, resistance: 0.1, tool: 'axe', requires_tool: false },
};

export function desertPlantsBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(DESERT_PLANTS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'plant_name'));
  const kind = (DESERT_PLANT_KINDS.find((entry) => entry.value === stringValue(values, 'kind'))
    ?.value ?? 'cane') as DesertPlantKind;
  const colour = rgbFromHex(stringValue(values, 'colour'), DRY_GREEN);
  const height =
    HEIGHTS.find((entry) => entry.value === stringValue(values, 'height')) ?? HEIGHTS[0];
  const uses = booleanValue(values, 'uses');
  const id = name.id;
  const block = rl(namespace, id);
  const tex = (path: string): string => rl(namespace, `block/${path}`);
  const assets: ContentBundleAsset[] = [];
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a plant that grows tall.`),
  ];
  const common = (data: JsonObject): JsonObject => ({
    format: 1,
    display_name: name.display,
    loot: 'self',
    item: { creative_tab: 'minecraft:natural_blocks' },
    ...data,
    components: { 'msm:breakable': { ...BREAKABLE[kind] } },
  });
  const heightWords =
    height.value === 'usual'
      ? ''
      : ` It grows by itself to ${kind === 'bamboo' ? height.bamboo : height.column} blocks (max_height), ${height.value === 'taller' ? 'taller' : 'shorter'} than the vanilla plant.`;

  if (kind === 'dripleaf') {
    const small = rl(namespace, `small_${id}`);
    assets.push(
      drawn(namespace, `block/${id}_top`, 'dripleaf', colour, 'top'),
      drawn(namespace, `block/${id}_side`, 'dripleaf', colour, 'side'),
      drawn(namespace, `block/${id}_stem`, 'dripleaf', colour, 'stem'),
    );
    elements.push(
      element(
        block,
        KINDS.block,
        common({
          type: 'dripleaf',
          size: 'big',
          sound_type: 'grass',
          textures: {
            top: tex(`${id}_top`),
            side: tex(`${id}_side`),
            tip: tex(`${id}_side`),
            stem: tex(`${id}_stem`),
          },
        }),
        `${name.display} is a big leaf on a stem (type dripleaf, size big), as big dripleaf: stand on it and it tips a little, then fully, then drops you, and springs back when you step off. Bone meal grows it a block taller; the stem below the leaf is the generated block ${block}_stem. It drops itself.`,
      ),
      element(
        small,
        KINDS.block,
        {
          ...common({
            type: 'dripleaf',
            size: 'small',
            grows_into: block,
            sound_type: 'grass',
            textures: {
              top: tex(`${id}_top`),
              side: tex(`${id}_side`),
              stem_top: tex(`${id}_stem`),
            },
          }),
          display_name: `Small ${name.display}`,
        },
        `Small ${name.lower}, two blocks high, as small dripleaf: bone meal turns it into ${name.lower} (grows_into), two to four blocks tall. Only shears pick it up.`,
      ),
    );
    return { elements, assets };
  }

  let data: JsonObject;
  let words: string;
  if (kind === 'cane') {
    assets.push(drawn(namespace, `block/${id}`, 'stalk', colour, 'cane'));
    data = common({
      type: 'column_plant',
      style: 'cane',
      sound_type: 'grass',
      textures: { all: tex(id) },
    });
    words = `${name.display} grows tall a block at a time (type column_plant, style cane), as sugar cane: it stands on sand, dirt or grass with water beside its base, and breaking a block breaks the ones above.`;
  } else if (kind === 'cactus') {
    assets.push(
      drawn(namespace, `block/${id}_side`, 'stalk', colour, 'cactus'),
      drawn(namespace, `block/${id}_top`, 'stalk', colour, 'cactustop'),
    );
    data = common({
      type: 'column_plant',
      style: 'cactus',
      sound_type: 'wool',
      textures: { side: tex(`${id}_side`), top: tex(`${id}_top`), bottom: tex(`${id}_top`) },
    });
    words = `${name.display} grows tall a block at a time (type column_plant, style cactus), as cactus: it stands on sand, breaks when a block is placed beside it and hurts whatever touches it.`;
  } else {
    assets.push(
      drawn(namespace, `block/${id}`, 'stalk', colour, 'bamboo'),
      drawn(namespace, `block/${id}_leaves`, 'stalk', colour, 'leaves'),
      drawn(namespace, `block/${id}_shoot`, 'sapling', colour),
    );
    data = common({
      type: 'column_plant',
      style: 'bamboo',
      sound_type: 'bamboo',
      textures: {
        stalk: tex(id),
        leaves_small: tex(`${id}_leaves`),
        leaves_large: tex(`${id}_leaves`),
        shoot: tex(`${id}_shoot`),
      },
    });
    words = `${name.display} is a woody stalk (type column_plant, style bamboo), as bamboo: placed, it is a shoot (the generated block ${block}_shoot) that grows into a stalk with leaves near its top and thickens as it grows. Bone meal grows it one or two blocks.`;
  }
  const max = kind === 'bamboo' ? height.bamboo : height.column;
  if (max !== undefined) data.max_height = max;
  elements.push(
    element(block, KINDS.block, data, `${words}${heightWords} The pictures are drawn by MSM.`),
  );

  if (uses) {
    if (kind === 'cane') {
      elements.push(
        element(
          rl(namespace, `sugar_from_${id}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'misc',
            ingredients: [block],
            result: { id: 'minecraft:sugar' },
          },
          `One ${name.lower} makes sugar, as sugar cane does.`,
        ),
      );
    } else if (kind === 'cactus') {
      elements.push(
        element(
          rl(namespace, `green_dye_from_${id}`),
          KINDS.recipe,
          {
            type: 'minecraft:smelting',
            category: 'misc',
            ingredient: block,
            result: { id: 'minecraft:green_dye' },
            experience: 1,
            cookingtime: 200,
          },
          `${name.display} smelts into green dye, as cactus does.`,
        ),
      );
    } else {
      elements.push(
        element(
          rl(namespace, `stick_from_${id}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'misc',
            key: { '#': block },
            pattern: ['#', '#'],
            result: { id: 'minecraft:stick' },
          },
          `Two ${name.plural} one above the other make a stick, as bamboo does.`,
        ),
      );
    }
  }
  return { elements, assets };
}
