/**
 * The Creative tab Creator flow (ADR 0101 D2, ADR 0096 D2): one `msm:creative_tab`, a tab of
 * the creative inventory with its title, icon and order, and, if you choose, a first block that
 * is listed in it (`item.creative_tab` names the tab) and shown as its icon. Items, block items
 * and spawn eggs join the tab by naming it in their own `creative_tab`; the Creative tab
 * Studio lists them and adds more. Extra tabs open on the creative inventory's second page.
 *
 * "In my own order" (ADR 0111 D7, B539) sets `order` `by_hand` with an `items` list: the first
 * block (or the icon, without one) first, then the vanilla items picked to go in the tab; the
 * tab's other items follow in the order they are registered.
 *
 * Ids derive from `tab_name`: the tab `my_blocks`, the first block `my_blocks_block`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { plainBlockPng } from '../assets/vanilla-parity/index';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** The creative tab kind (ADR 0096 D2). */
const CREATIVE_TAB_KIND = 'msm:creative_tab';

/** The icons a tab can show: its first block, or a vanilla item. */
const ICONS: readonly { value: string; label: string }[] = [
  { value: 'first_block', label: 'The first block' },
  { value: 'minecraft:diamond', label: 'Diamond' },
  { value: 'minecraft:emerald', label: 'Emerald' },
  { value: 'minecraft:bricks', label: 'Bricks' },
  { value: 'minecraft:golden_apple', label: 'Golden apple' },
  { value: 'minecraft:nether_star', label: 'Nether star' },
];

/** Vanilla items a hand-ordered tab can list beside the first block. */
const EXTRA_ITEMS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:torch', label: 'Torch' },
  { value: 'minecraft:lantern', label: 'Lantern' },
  { value: 'minecraft:bricks', label: 'Bricks' },
  { value: 'minecraft:glass', label: 'Glass' },
  { value: 'minecraft:flower_pot', label: 'Flower pot' },
];

/** Sky blue, the first block's default colour. */
const SKY: Rgb = [70, 150, 214];

/** The Creative tab questions, groups "Tab" and "First block". */
export const CREATIVE_TAB_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'tab_name',
    label: 'Tab title',
    description: 'The title shown above the tab. Ids derive from it: My Blocks gives my_blocks.',
    group: 'Tab',
    type: 'string',
    default: 'My Blocks',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'icon',
    label: 'Icon',
    description: 'The item on the tab. The first block can only be the icon when it is made.',
    group: 'Tab',
    type: 'choice',
    default: 'first_block',
    choices: ICONS.map((entry) => ({ ...entry })),
  },
  {
    id: 'order',
    label: 'Order',
    group: 'Tab',
    type: 'choice',
    default: 'as_listed',
    choices: [
      { value: 'as_listed', label: 'As listed in the project' },
      { value: 'by_name', label: 'By name' },
      { value: 'by_hand', label: 'In my own order' },
    ],
  },
  {
    id: 'extra_items',
    label: 'Vanilla items in the tab',
    description:
      'With "In my own order": vanilla items listed in the tab after the first block, in this order.',
    group: 'Tab',
    type: 'set',
    default: [],
    choices: EXTRA_ITEMS.map((entry) => ({ ...entry })),
  },
  {
    id: 'first_block',
    label: 'Make a first block in it',
    description: 'A plain block listed in the tab, to start from; more join from the Studios.',
    group: 'First block',
    type: 'boolean',
    default: true,
  },
  {
    id: 'colour',
    label: 'Block colour',
    group: 'First block',
    type: 'colour',
    default: hexFromRgb(SKY),
  },
]);

export function creativeTabBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CREATIVE_TAB_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'tab_name'));
  const withBlock = booleanValue(values, 'first_block');
  const colour = rgbFromHex(stringValue(values, 'colour'), SKY);
  const tab = rl(namespace, name.id);
  const blockId = rl(namespace, `${name.id}_block`);
  const chosenIcon = stringValue(values, 'icon');
  const icon =
    chosenIcon === 'first_block' ? (withBlock ? blockId : 'minecraft:diamond') : chosenIcon;
  const order = stringValue(values, 'order');
  const tabData: JsonObject = { format: 1, icon, display_name: name.display };
  if (order !== 'as_listed') tabData.order = order;
  const extras = (setValue(values, 'extra_items') as readonly string[]).filter((value) =>
    EXTRA_ITEMS.some((entry) => entry.value === value),
  );
  if (order === 'by_hand') tabData.items = [withBlock ? blockId : icon, ...extras];
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: the ${name.display} tab`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the ${name.display} creative tab.`),
    element(
      tab,
      CREATIVE_TAB_KIND,
      tabData,
      `The ${name.display} tab of the creative inventory (on its second page, after vanilla's tabs), showing ${icon}. Items, block items and spawn eggs join it by naming ${tab} as their creative tab, ${order === 'by_name' ? 'sorted by name' : order === 'by_hand' ? `in your own order: first the items listed in items (${(tabData.items as string[]).join(', ')}), any item not otherwise in the tab joining it, then the tab's other items in the order they are registered` : 'in the order the project lists them'}.`,
    ),
  ];
  const assets: ContentBundleAsset[] = [];
  if (withBlock) {
    const model = rl(namespace, `block/${name.id}_block`);
    elements.push(
      element(
        blockId,
        KINDS.block,
        {
          format: 1,
          display_name: `${name.display} Block`,
          model,
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: tab },
          components: {
            'msm:breakable': {
              hardness: 1.5,
              resistance: 6,
              tool: 'pickaxe',
              requires_tool: false,
            },
          },
        },
        `A first block for the tab: its item names ${tab} as its creative tab, so it is listed there.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: model } },
        `A full cube drawn from textures/block/${name.id}_block.png.`,
      ),
    );
    assets.push({
      namespace,
      path: `textures/block/${name.id}_block.png`,
      bytes: plainBlockPng(colour),
    });
  }
  return { elements, assets };
}
