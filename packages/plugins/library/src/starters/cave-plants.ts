/**
 * The Cave plants Creator flow (ADR 0112 D2, ADR 0103 D1; B518): one plant of the kinds that
 * grow in caves, lakes and the Nether, as one `msm:block`:
 *
 * - **Hangs with glowing berries** (as cave vines): a `growing_plant` growing down from a ceiling,
 *   bearing berries (`berries`) that glow while ripe and are picked by using the vine. The berries
 *   are the block's own item `<name>_berries` (it plants the vine, as glow berries do), edible
 *   through the vanilla food components; the strand joins `#minecraft:cave_vines` (climbing,
 *   bees grow the berries).
 * - **Hangs down** (as weeping vines) and **Grows up from the ground** (as twisting vines): a
 *   `growing_plant` growing down or up, climbable.
 * - **Grows up in water** (as kelp): a `growing_plant` with `needs_water`.
 * - **Spreads over any side** (as glow lichen): a `multiface` that covers the faces of the blocks
 *   around it, glows and spreads with bone meal.
 *
 * Every strand grows from its tip, the element, into the generated `<name>_plant` behind it.
 * The pictures are drawn by MSM's art generator (ADR 0092): the `strand` recipe for the tip, the
 * strand and their berried looks, `lichen` for the lichen, the berries item from the berries
 * sprite. New blocks need the Fabric mod jar export.
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
import { berriesItemPng } from '../assets/vanilla-parity/index';
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
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The kinds of cave plant: the answer, its words and what it is in the format. */
export const CAVE_PLANT_KINDS = Object.freeze([
  { value: 'cave_vine', label: 'Hangs from the ceiling with glowing berries, as cave vines' },
  { value: 'weeping', label: 'Hangs down in long strands, as weeping vines' },
  { value: 'twisting', label: 'Grows up from the ground in long strands, as twisting vines' },
  { value: 'kelp', label: 'Grows up in water, as kelp' },
  { value: 'lichen', label: 'Spreads over any side of a block and glows, as glow lichen' },
] as const);

/** A kind's value. */
type CavePlantKind = (typeof CAVE_PLANT_KINDS)[number]['value'];

/** The default leaf colour: a cave green. */
const CAVE_GREEN: Rgb = [62, 120, 48];
/** The default berry colour: a warm glow. */
const BERRY_ORANGE: Rgb = [236, 150, 48];

/** The Cave plants questions, groups "Plant" and "Glow". */
export const CAVE_PLANTS_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'plant_name',
    label: 'Plant name',
    description: 'The English name. Ids derive from it: Ember Vine gives ember_vine.',
    group: 'Plant',
    type: 'string',
    default: 'Ember Vine',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'kind',
    label: 'What it does',
    description: 'How it grows. Strands grow a block at a time from their tip.',
    group: 'Plant',
    type: 'choice',
    default: 'cave_vine',
    choices: CAVE_PLANT_KINDS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the drawn plant.',
    group: 'Plant',
    type: 'colour',
    default: hexFromRgb(CAVE_GREEN),
  },
  {
    id: 'berry_colour',
    label: 'Berry colour',
    description:
      'The colour of the berries of a plant with glowing berries, and of the glowing specks of a lichen.',
    group: 'Glow',
    type: 'colour',
    default: hexFromRgb(BERRY_ORANGE),
  },
  {
    id: 'light',
    label: 'How bright it glows',
    description:
      'The light of a vine with ripe berries (cave vines give 14) or of a lichen (glow lichen gives 7), 0 to 15. Other strands give no light.',
    group: 'Glow',
    type: 'number',
    default: 14,
    min: 0,
    max: 15,
    step: 1,
  },
]);

/** A texture at `textures/<path>.png` drawn by `recipe` with its default seed. */
function drawn(
  namespace: string,
  path: string,
  recipe: ArtRecipeId,
  colour: Rgb,
  accent: Rgb,
  finish?: string,
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/${path}.png`,
    bytes: artLookPng({
      recipe,
      colour,
      accent,
      ...(finish === undefined ? {} : { finish }),
      seed: artSeed(namespace, path, recipe),
    }),
  };
}

/** Plants break at once by hand, as vanilla's strands; a lichen takes a moment, as glow lichen. */
const INSTANT: JsonObject = { hardness: 0, resistance: 0 };
const LICHEN_BREAKABLE: JsonObject = { hardness: 0.2, resistance: 0.2 };

export function cavePlantsBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CAVE_PLANTS_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'plant_name'));
  const kind = (CAVE_PLANT_KINDS.find((entry) => entry.value === stringValue(values, 'kind'))
    ?.value ?? 'cave_vine') as CavePlantKind;
  const colour = rgbFromHex(stringValue(values, 'colour'), CAVE_GREEN);
  const berryColour = rgbFromHex(stringValue(values, 'berry_colour'), BERRY_ORANGE);
  const light = Math.max(0, Math.min(15, Math.round(numberValue(values, 'light'))));
  const id = name.id;
  const block = rl(namespace, id);
  const tex = (path: string): string => rl(namespace, `block/${path}`);
  const assets: ContentBundleAsset[] = [];
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a plant of the caves.`),
  ];

  if (kind === 'lichen') {
    assets.push(drawn(namespace, `block/${id}`, 'lichen', colour, berryColour));
    elements.push(
      element(
        block,
        KINDS.block,
        {
          format: 1,
          display_name: name.display,
          type: 'multiface',
          light,
          sound_type: 'grass',
          loot: 'self',
          item: { creative_tab: 'minecraft:natural_blocks' },
          textures: { texture: tex(id) },
          components: { 'msm:breakable': { ...LICHEN_BREAKABLE } },
        },
        `${name.display} spreads over any face of the blocks around it, as glow lichen (type multiface): place it on a wall, floor or ceiling and place more on the same block to cover more faces. It glows at light ${light}, bone meal spreads it to faces nearby, and it holds water. Only shears pick it up (the loot preset gives one item per face it covers). The pictures are drawn by MSM.`,
      ),
    );
    return { elements, assets };
  }

  const growing: JsonObject = {
    format: 1,
    display_name: name.display,
    type: 'growing_plant',
    sound_type: 'grass',
    loot: 'self',
    item: { creative_tab: 'minecraft:natural_blocks' },
    components: { 'msm:breakable': { ...INSTANT } },
  };
  const head = tex(id);
  const body = tex(`${id}_plant`);
  assets.push(
    drawn(namespace, `block/${id}`, 'strand', colour, berryColour, 'tip'),
    drawn(namespace, `block/${id}_plant`, 'strand', colour, berryColour, 'body'),
  );
  let words: string;
  if (kind === 'cave_vine') {
    const berries = rl(namespace, `${id}_berries`);
    const berriesTexture = rl(namespace, `item/${id}_berries`);
    growing.direction = 'down';
    growing.berries = { item: berries, light };
    growing.textures = {
      head,
      body,
      head_berries: tex(`${id}_berries`),
      body_berries: tex(`${id}_plant_berries`),
      item: berriesTexture,
    };
    growing.item = {
      id: berries,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:components': {
          'minecraft:consumable': {},
          'minecraft:food': { nutrition: 2, saturation: 0.4 },
        },
      },
    };
    assets.push(
      drawn(namespace, `block/${id}_berries`, 'strand', colour, berryColour, 'berrytip'),
      drawn(namespace, `block/${id}_plant_berries`, 'strand', colour, berryColour, 'berries'),
      {
        namespace,
        path: `textures/item/${id}_berries.png`,
        bytes: berriesItemPng(berryColour, colour),
      },
    );
    words = `${name.display} hangs from the underside of a block and grows down a block at a time from its tip (type growing_plant, direction down), as cave vines. Now and then a block of it bears berries (berries) that glow at light ${light}; use it to pick them, or bone meal it to ripen them. Its block item is the berries, ${berries}: eating one restores 2 hunger, and placing one under a block plants the vine, as glow berries do. Players climb it, and bees grow its berries (the tag #minecraft:cave_vines). Breaking a block with berries drops them; otherwise it drops nothing.`;
  } else {
    growing.textures = { head, body };
    if (kind === 'kelp') {
      growing.needs_water = true;
      words = `${name.display} grows up in water a block at a time from its tip (type growing_plant, needs_water), as kelp: it is always under water, is placed only in water and breaks when the water goes. Bone meal grows it a block. It drops itself when broken.`;
    } else if (kind === 'weeping') {
      growing.direction = 'down';
      words = `${name.display} hangs from the underside of a block and grows down a block at a time from its tip (type growing_plant, direction down), as weeping vines. Players climb it and bone meal grows it. It drops itself to shears or Silk Touch, and otherwise sometimes, more often with Fortune.`;
    } else {
      words = `${name.display} grows up from the top of a block a block at a time from its tip (type growing_plant), as twisting vines. Players climb it and bone meal grows it. It drops itself to shears or Silk Touch, and otherwise sometimes, more often with Fortune.`;
    }
  }
  elements.push(
    element(
      block,
      KINDS.block,
      growing,
      `${words} The strand behind the tip is the generated block ${block}_plant. The pictures are drawn by MSM.`,
    ),
  );
  return { elements, assets };
}
