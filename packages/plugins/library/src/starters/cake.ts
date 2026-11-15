/**
 * The Cake Creator flow (ADR 0101 D2, ADR 0094 D2, D5): one `msm:block` of type `cake`, eaten
 * a slice at a time (seven slices, vanilla's `bites`), with what each slice restores. It is a
 * cake (icing over sponge, berries on top) or a pie (a lattice crust over the filling), drawn
 * by MSM in the topping and filling colours. A whole cake drops itself when broken; a cut one
 * drops nothing. It takes no candles (ADR 0094 D14). The recipe is vanilla's cake shape with the
 * flavour in place of the egg (three milk, sugar, flavour, sugar, three wheat), or a pie's
 * shapeless list (two of the flavour, sugar, an egg and wheat), so neither clashes with
 * vanilla's cake or pumpkin pie.
 */
import type {
  BundleContext,
  ContentBundle,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { cakeItemPng, cakePng } from '../assets/vanilla-parity/index';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The flavours: the vanilla food in the recipe. */
const FLAVOURS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:sweet_berries', label: 'Sweet berries' },
  { value: 'minecraft:glow_berries', label: 'Glow berries' },
  { value: 'minecraft:apple', label: 'Apple' },
  { value: 'minecraft:melon_slice', label: 'Melon slice' },
  { value: 'minecraft:cocoa_beans', label: 'Cocoa beans' },
  { value: 'minecraft:honey_bottle', label: 'Honey bottle' },
];

/** Default topping: cream; default filling: berry red. */
const CREAM: Rgb = [244, 236, 226];
const BERRY: Rgb = [178, 36, 58];

/** The Cake questions, groups "Cake" and "Food". */
export const CAKE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'cake_name',
    label: 'Name',
    description: 'Ids derive from it: Berry Cake gives berry_cake.',
    group: 'Cake',
    type: 'string',
    default: 'Berry Cake',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'style',
    label: 'What it is',
    group: 'Cake',
    type: 'choice',
    default: 'cake',
    choices: [
      { value: 'cake', label: 'A cake, iced on top' },
      { value: 'pie', label: 'A pie with a crust' },
    ],
  },
  {
    id: 'colour',
    label: 'Topping colour',
    description: 'The icing of a cake.',
    group: 'Cake',
    type: 'colour',
    default: hexFromRgb(CREAM),
  },
  {
    id: 'filling_colour',
    label: 'Filling colour',
    description: 'The berries on a cake, the filling of a pie.',
    group: 'Cake',
    type: 'colour',
    default: hexFromRgb(BERRY),
  },
  {
    id: 'nutrition',
    label: 'Hunger per slice',
    description: 'In half drumsticks (a slice of vanilla cake restores 2).',
    group: 'Food',
    type: 'number',
    default: 2,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'saturation',
    label: 'Saturation per slice',
    description: 'How long the hunger stays away (vanilla cake 0.1).',
    group: 'Food',
    type: 'number',
    default: 0.1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    id: 'flavour',
    label: 'Flavour',
    description: 'The food in the recipe that gives the cake its taste.',
    group: 'Food',
    type: 'choice',
    default: 'minecraft:sweet_berries',
    choices: FLAVOURS.map((entry) => ({ ...entry })),
  },
  {
    id: 'recipe',
    label: 'Crafting recipe',
    group: 'Food',
    type: 'boolean',
    default: true,
  },
]);

export function cakeBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CAKE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'cake_name'));
  const pie = stringValue(values, 'style') === 'pie';
  const topping = rgbFromHex(stringValue(values, 'colour'), CREAM);
  const filling = rgbFromHex(stringValue(values, 'filling_colour'), BERRY);
  const nutrition = Math.round(numberValue(values, 'nutrition'));
  const saturation = Math.round(numberValue(values, 'saturation') * 100) / 100;
  const flavour = stringValue(values, 'flavour');
  const id = (p: string): ResourceLocation => rl(namespace, p);
  const p = name.id;
  const face = (f: string): ResourceLocation => id(`block/${p}_${f}`);

  const data: JsonObject = {
    format: 1,
    type: 'cake',
    display_name: name.display,
    food: { nutrition, saturation },
    sound_type: 'wool',
    loot: 'self',
    item: { creative_tab: 'minecraft:food_and_drinks', max_stack_size: 1 },
    textures: {
      top: face('top'),
      bottom: face('bottom'),
      side: face('side'),
      inside: face('inside'),
      item: id(`item/${p}`),
    },
    components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
  };
  const elements = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}.`),
    element(
      id(p),
      KINDS.block,
      data,
      `${name.display}: place it, then use it to eat a slice when you are hungry (in creative, at any time). Each of its seven slices restores ${nutrition} hunger with a saturation of ${saturation}; a comparator next to it reads how much is left. A whole ${pie ? 'pie' : 'cake'} drops itself when broken, a cut one nothing. It takes no candles.`,
    ),
  ];
  if (booleanValue(values, 'recipe')) {
    const words = flavour.slice('minecraft:'.length).replaceAll('_', ' ');
    elements.push(
      element(
        id(`${p}_from_${flavour.slice('minecraft:'.length)}`),
        KINDS.recipe,
        pie
          ? {
              type: 'minecraft:crafting_shapeless',
              category: 'misc',
              ingredients: [
                flavour,
                flavour,
                'minecraft:sugar',
                'minecraft:egg',
                'minecraft:wheat',
              ],
              result: { id: id(p) },
            }
          : {
              type: 'minecraft:crafting_shaped',
              category: 'misc',
              key: {
                F: flavour,
                M: 'minecraft:milk_bucket',
                S: 'minecraft:sugar',
                W: 'minecraft:wheat',
              },
              pattern: ['MMM', 'SFS', 'WWW'],
              result: { id: id(p) },
            },
        pie
          ? `Two ${words}, sugar, an egg and wheat make the pie.`
          : `Vanilla's cake shape with ${words} in place of the egg: three milk buckets, sugar, ${words}, sugar and three wheat. The buckets come back empty.`,
      ),
    );
  }
  const assets = (['top', 'side', 'bottom', 'inside'] as const).map((f) => ({
    namespace,
    path: `textures/block/${p}_${f}.png`,
    bytes: cakePng(f, topping, filling, pie),
  }));
  assets.push({
    namespace,
    path: `textures/item/${p}.png`,
    bytes: cakeItemPng(topping, filling, pie),
  });
  return { elements, assets };
}
