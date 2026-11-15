/**
 * The Backpack Creator flow (ADR 0101 D2, ADR 0095): an `msm:item` with `msm:item_inventory`
 * in the chest layout, a bag that opens a screen of one to six rows when used (or sneak-used)
 * and keeps what is put in it on the item itself (`minecraft:container`), so the bag can be
 * carried, dropped and picked up with its contents. A bag stacks to one and cannot be put in
 * itself, in another bag or in a shulker box (the runtime's guard, ADR 0095 D3). The recipe is
 * leather round a chest and a string strap; with "Dye recipe" a second bag in a dye's colour is
 * crafted from the bag and the dye (`minecraft:crafting_transmute`, which keeps the contents).
 *
 * Ids derive from `bag_name`: `backpack`, the dyed bag `red_backpack`. Pictures are MSM's own.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { backpackItemPng } from '../assets/vanilla-parity/index';
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
import { BED_DYES } from './bed';

/** Tanned leather, the default bag colour. */
const LEATHER: Rgb = [146, 92, 52];

/** The Backpack questions, groups "Bag" and "Recipes". */
export const BACKPACK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'bag_name',
    label: 'Name',
    description: 'Ids derive from it: Backpack gives backpack.',
    group: 'Bag',
    type: 'string',
    default: 'Backpack',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    group: 'Bag',
    type: 'colour',
    default: hexFromRgb(LEATHER),
  },
  {
    id: 'rows',
    label: 'Rows (1 to 6)',
    description: 'Rows of nine slots in its screen, as a chest (3) or a large chest (6).',
    group: 'Bag',
    type: 'number',
    default: 3,
    min: 1,
    max: 6,
    step: 1,
  },
  {
    id: 'open',
    label: 'Open it with',
    group: 'Bag',
    type: 'choice',
    default: 'use',
    choices: [
      { value: 'use', label: 'Right-click' },
      { value: 'sneak_use', label: 'Sneak and right-click' },
    ],
  },
  {
    id: 'recipe',
    label: 'Crafting recipe',
    description: 'Leather round a chest, with a string strap on top.',
    group: 'Recipes',
    type: 'boolean',
    default: true,
  },
  {
    id: 'dye_recipe',
    label: 'Dye recipe',
    description:
      'A second bag in the colour of a dye, made from the bag and the dye; it keeps what is inside.',
    group: 'Recipes',
    type: 'boolean',
    default: false,
  },
  {
    id: 'dye',
    label: 'Dye',
    group: 'Recipes',
    type: 'choice',
    default: 'red',
    choices: BED_DYES.map(({ value, label }) => ({ value, label })),
  },
]);

export function backpackBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(BACKPACK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'bag_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), LEATHER);
  const rows = Math.max(1, Math.min(6, Math.round(numberValue(values, 'rows'))));
  const open = stringValue(values, 'open');
  const id = (p: string): ResourceLocation => rl(namespace, p);
  const inventory: JsonObject = {
    layout: 'chest',
    rows,
    open,
    open_sound: 'minecraft:item.armor.equip_leather',
    close_sound: 'minecraft:block.wool.place',
  };
  const elements: ContentBundleElement[] = [];
  const assets: ContentBundleAsset[] = [];
  const bag = (path: string, display: string, rgb: Rgb, notes: string): void => {
    const model = id(`item/${path}`);
    elements.push(
      element(
        id(path),
        KINDS.item,
        {
          format: 1,
          display_name: display,
          model,
          max_stack_size: 1,
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:item_inventory': { ...inventory } },
        },
        notes,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: model } },
        `A flat item model drawn from textures/item/${path}.png.`,
      ),
    );
    assets.push({ namespace, path: `textures/item/${path}.png`, bytes: backpackItemPng(rgb) });
  };
  const how = open === 'use' ? 'Right-click' : 'Sneak and right-click';
  bag(
    name.id,
    name.display,
    colour,
    `${name.display}: ${how.toLowerCase()} with it in your hand to open a screen of ${rows} row${rows === 1 ? '' : 's'} of nine slots. What you put in stays in the bag wherever it goes. It stacks to one and does not fit in itself, another bag or a shulker box.`,
  );
  if (booleanValue(values, 'recipe')) {
    elements.push(
      element(
        id(`${name.id}_from_leather`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'equipment',
          key: { C: 'minecraft:chest', L: 'minecraft:leather', S: 'minecraft:string' },
          pattern: ['LSL', 'LCL', 'LLL'],
          result: { id: id(name.id) },
        },
        'Seven leather round a chest, with string for the strap, make the bag.',
      ),
    );
  }
  if (booleanValue(values, 'dye_recipe')) {
    const dye =
      BED_DYES.find((entry) => entry.value === stringValue(values, 'dye')) ??
      (BED_DYES[14] as (typeof BED_DYES)[number]);
    const dyed = `${dye.value}_${name.id}`;
    bag(
      dyed,
      `${dye.label} ${name.display}`,
      dye.rgb,
      `The ${name.lower} dyed ${dye.label.toLowerCase()}: the same bag in another colour.`,
    );
    elements.push(
      element(
        id(`${dyed}_from_${dye.value}_dye`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_transmute',
          category: 'equipment',
          input: id(name.id),
          material: `minecraft:${dye.value}_dye`,
          result: { id: id(dyed) },
        },
        `The ${name.lower} and ${dye.label.toLowerCase()} dye make the ${dye.label.toLowerCase()} bag; the recipe keeps everything inside, as vanilla dyes bundles.`,
      ),
    );
  }
  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
      modElement(namespace, projectName, `Adds ${name.lower}, a bag that holds things.`),
      ...elements,
    ],
    assets,
  };
}
