/**
 * The Flower pot Creator flow (ADR 0112 D2, ADR 0103 D2; B518): an empty flower pot of the
 * project's own (`flower_pot`) that takes the vanilla plants you pick. Using the pot with a
 * listed plant's item puts the plant in, which turns it into the generated
 * `<pot>_<plant path>` block; breaking a potted plant drops the pot and the plant, as vanilla's.
 * Vanilla's own flower pot is not changed, and a project pot takes only the plants it lists.
 *
 * The pot's clay is drawn by MSM's art generator (ADR 0092, the `pot` recipe) in the colour you
 * pick; the earth is vanilla's dirt and the item picture vanilla's pot, both from the player's
 * own game (nothing is bundled). The recipe is three of the material in a V, as vanilla's pot is
 * made of three bricks. New blocks need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import { artLookPng } from '../art/draw';
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
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** The vanilla plants a pot can take, in the creative menu's order. */
export const FLOWER_POT_PLANTS = Object.freeze([
  { value: 'minecraft:dandelion', label: 'Dandelion' },
  { value: 'minecraft:poppy', label: 'Poppy' },
  { value: 'minecraft:blue_orchid', label: 'Blue orchid' },
  { value: 'minecraft:allium', label: 'Allium' },
  { value: 'minecraft:azure_bluet', label: 'Azure bluet' },
  { value: 'minecraft:oxeye_daisy', label: 'Oxeye daisy' },
  { value: 'minecraft:cornflower', label: 'Cornflower' },
  { value: 'minecraft:lily_of_the_valley', label: 'Lily of the valley' },
  { value: 'minecraft:oak_sapling', label: 'Oak sapling' },
  { value: 'minecraft:birch_sapling', label: 'Birch sapling' },
  { value: 'minecraft:fern', label: 'Fern' },
  { value: 'minecraft:dead_bush', label: 'Dead bush' },
  { value: 'minecraft:red_mushroom', label: 'Red mushroom' },
  { value: 'minecraft:brown_mushroom', label: 'Brown mushroom' },
] as const);

/** What the pot is crafted from. */
const INGREDIENTS = Object.freeze([
  { value: 'minecraft:brick', label: 'Bricks, as the vanilla pot' },
  { value: 'minecraft:clay_ball', label: 'Clay balls' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingots' },
  { value: 'none', label: 'No recipe (creative menu only)' },
] as const);

/** The default clay: a fired terracotta. */
const TERRACOTTA: Rgb = [166, 92, 62];

/** The Flower pot questions, groups "Pot" and "Getting it". */
export const FLOWER_POT_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'pot_name',
    label: 'Pot name',
    description: 'The English name. Ids derive from it: Clay Planter gives clay_planter.',
    group: 'Pot',
    type: 'string',
    default: 'Clay Planter',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the drawn clay.',
    group: 'Pot',
    type: 'colour',
    default: hexFromRgb(TERRACOTTA),
  },
  {
    id: 'plants',
    label: 'Plants it takes',
    description:
      'The plants that go into it. Each one becomes a potted block of its own; other plants do not go in.',
    group: 'Pot',
    type: 'set',
    default: [
      'minecraft:dandelion',
      'minecraft:poppy',
      'minecraft:cornflower',
      'minecraft:oak_sapling',
      'minecraft:fern',
    ],
    choices: FLOWER_POT_PLANTS.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Three of it in a V make one pot.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:brick',
    choices: INGREDIENTS.map(({ value, label }) => ({ value, label })),
  },
]);

export function flowerPotBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(FLOWER_POT_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'pot_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), TERRACOTTA);
  const known = new Set<string>(FLOWER_POT_PLANTS.map((plant) => plant.value));
  const plants = (setValue(values, 'plants') as readonly string[]).filter((plant) =>
    known.has(plant),
  );
  const listed = plants.length > 0 ? plants : ['minecraft:poppy'];
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));
  const id = name.id;
  const pot = rl(namespace, id);
  const clay = rl(namespace, `block/${id}`);
  const labels = listed.map(
    (plant) =>
      FLOWER_POT_PLANTS.find((entry) => entry.value === plant)?.label.toLowerCase() ?? plant,
  );
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a flower pot of its own.`),
    element(
      pot,
      KINDS.block,
      {
        format: 1,
        display_name: name.display,
        type: 'flower_pot',
        plants: [...listed],
        sound_type: 'stone',
        loot: 'self',
        item: { creative_tab: 'minecraft:functional_blocks' },
        textures: { pot: clay, item: 'minecraft:item/flower_pot' },
        components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
      },
      `An empty flower pot (type flower_pot) that takes ${labels.join(', ')}: use it with one of them to put the plant in, and it becomes the generated potted block ${pot}_<plant> (for example ${pot}_${(listed[0] ?? '').split(':')[1] ?? ''}). Use a potted pot with an empty hand to take the plant out; breaking it drops the pot and the plant. Other plants do not go in, and vanilla's own flower pot is not changed. Its clay is drawn by MSM; the earth is vanilla's dirt and the item picture vanilla's pot.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    elements.push(
      element(
        rl(namespace, `${id}_from_${ingredient.value.split(':')[1] ?? ''}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          key: { '#': ingredient.value },
          pattern: ['# #', ' # '],
          result: { id: pot },
        },
        `Three ${ingredient.label.toLowerCase().replace(/, as .*$/, '')} in a V make ${name.lower}, as three bricks make a flower pot.`,
      ),
    );
  }
  const assets: ContentBundleAsset[] = [
    {
      namespace,
      path: `textures/block/${id}.png`,
      bytes: artLookPng({ recipe: 'pot', colour, seed: artSeed(namespace, `block/${id}`, 'pot') }),
    },
  ];
  return { elements, assets };
}
