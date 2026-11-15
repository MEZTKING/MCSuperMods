/**
 * The Bed Creator flow (ADR 0101 D2, ADR 0094 D2): one `msm:block` of type `bed`, a two-block
 * bed players sleep in to skip the night and set their spawn, or a sleeping bag that follows
 * vanilla's straw bed rule (`rule: straw_bed`, the target's `gameplay/straw_bed_rule`). Its
 * blanket is one of the sixteen dye colours, which is also the bed's `colour`. The picture on
 * every face is MSM's own (a pillow and a quilted blanket); the item shows the bed itself, as
 * vanilla's bed items do. The recipe never clashes with vanilla's: a bed is two of the dye's
 * wool round a feather over three planks, a sleeping bag three of the wool over three leather.
 *
 * Limit (B440): villagers do not sleep in or claim project beds.
 */
import type {
  BundleContext,
  ContentBundle,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { bedPng } from '../assets/vanilla-parity/index';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  stringValue,
} from '../content/parameters';

/** The sixteen dye colours with the blanket colour MSM draws for each (original values). */
export const BED_DYES: readonly { value: string; label: string; rgb: Rgb }[] = Object.freeze([
  { value: 'white', label: 'White', rgb: [226, 228, 230] },
  { value: 'orange', label: 'Orange', rgb: [222, 112, 34] },
  { value: 'magenta', label: 'Magenta', rgb: [180, 66, 172] },
  { value: 'light_blue', label: 'Light blue', rgb: [70, 166, 214] },
  { value: 'yellow', label: 'Yellow', rgb: [236, 190, 46] },
  { value: 'lime', label: 'Lime', rgb: [112, 182, 40] },
  { value: 'pink', label: 'Pink', rgb: [222, 128, 160] },
  { value: 'gray', label: 'Grey', rgb: [70, 74, 80] },
  { value: 'light_gray', label: 'Light grey', rgb: [140, 140, 134] },
  { value: 'cyan', label: 'Cyan', rgb: [30, 132, 140] },
  { value: 'purple', label: 'Purple', rgb: [114, 44, 160] },
  { value: 'blue', label: 'Blue', rgb: [50, 56, 150] },
  { value: 'brown', label: 'Brown', rgb: [112, 72, 42] },
  { value: 'green', label: 'Green', rgb: [80, 104, 32] },
  { value: 'red', label: 'Red', rgb: [156, 40, 36] },
  { value: 'black', label: 'Black', rgb: [28, 28, 34] },
]);

/** The Bed questions, group "Bed". */
export const BED_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'bed_name',
    label: 'Name',
    description: 'Ids derive from it: Cosy gives cosy_bed, or cosy_sleeping_bag.',
    group: 'Bed',
    type: 'string',
    default: 'Cosy',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'kind',
    label: 'What it is',
    description:
      'A bed sets your spawn and lets you sleep through the night. A sleeping bag follows the rule of the straw bed instead.',
    group: 'Bed',
    type: 'choice',
    default: 'bed',
    choices: [
      { value: 'bed', label: 'A bed' },
      { value: 'sleeping_bag', label: 'A sleeping bag' },
    ],
  },
  {
    id: 'colour',
    label: 'Blanket colour',
    group: 'Bed',
    type: 'choice',
    default: 'red',
    choices: BED_DYES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'recipe',
    label: 'Crafting recipe',
    description:
      'A bed: two wool of the colour round a feather over three planks. A sleeping bag: three wool over three leather.',
    group: 'Bed',
    type: 'boolean',
    default: true,
  },
]);

export function bedBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(BED_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'bed_name'));
  const bag = stringValue(values, 'kind') === 'sleeping_bag';
  const dye =
    BED_DYES.find((entry) => entry.value === stringValue(values, 'colour')) ??
    (BED_DYES[14] as (typeof BED_DYES)[number]);
  const path = `${name.id}_${bag ? 'sleeping_bag' : 'bed'}`;
  const display = `${name.display} ${bag ? 'Sleeping Bag' : 'Bed'}`;
  const id = (p: string): ResourceLocation => rl(namespace, p);
  const texture = id(`block/${path}`);
  const wool = `minecraft:${dye.value}_wool`;

  const data: JsonObject = {
    format: 1,
    type: 'bed',
    display_name: display,
    colour: dye.value,
    sound_type: 'wood',
    loot: 'self',
    item: { creative_tab: 'minecraft:functional_blocks', max_stack_size: 1 },
    textures: { bed: texture },
    components: { 'msm:breakable': { hardness: 0.2, resistance: 0.2 } },
  };
  if (bag) data.rule = 'straw_bed';
  const elements = [
    packElement(namespace, `${projectName}: ${display.toLowerCase()}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${display.toLowerCase()}.`),
    element(
      id(path),
      KINDS.block,
      data,
      `${display}: two blocks long, placed with the foot towards you. ${bag ? 'It follows the straw bed rule of the game, as the vanilla straw bed does' : 'Sleep in it at night to skip to morning and set your spawn, as in any bed'}; it explodes in the Nether and the End. Breaking either half drops one. The picture is on every face, and the item shows the bed itself. Villagers do not use it.`,
    ),
  ];
  if (booleanValue(values, 'recipe')) {
    elements.push(
      element(
        id(`${path}_from_${dye.value}_wool`),
        KINDS.recipe,
        bag
          ? {
              type: 'minecraft:crafting_shaped',
              category: 'misc',
              group: 'sleeping_bag',
              key: { L: 'minecraft:leather', W: wool },
              pattern: ['WWW', 'LLL'],
              result: { id: id(path) },
            }
          : {
              type: 'minecraft:crafting_shaped',
              category: 'misc',
              group: 'bed',
              key: { F: 'minecraft:feather', P: '#minecraft:planks', W: wool },
              pattern: ['WFW', 'PPP'],
              result: { id: id(path) },
            },
        bag
          ? `Three ${dye.label.toLowerCase()} wool over three leather make the sleeping bag.`
          : `Two ${dye.label.toLowerCase()} wool round a feather, over three planks of any wood, make the bed.`,
      ),
    );
  }
  return {
    elements,
    assets: [{ namespace, path: `textures/block/${path}.png`, bytes: bedPng(dye.rgb) }],
  };
}
