/**
 * The Glider Creator flow (ADR 0106 D4, B508): something to wear on the chest and glide with, as
 * an elytra does, from vanilla components only. A vanilla pack cannot add an item, so the glider
 * is a phantom membrane carrying `minecraft:glider`, `minecraft:equippable` (the chest slot and
 * the flow's own `minecraft:equipment` asset, whose wings layer is drawn by the art generator in
 * the elytra layout), `minecraft:max_damage`, `minecraft:repairable` (the repair item the user
 * picks), `minecraft:item_model` and `minecraft:item_name`, made by a shaped recipe. Data only:
 * it works in a vanilla resource pack and data pack. Ids derive from `glider_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import { COLOURS, element, itemModel, KINDS, PACK_NOTES, packElement, rl } from '../content/bundle';
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
import { drawnTexture } from './pattern-art';

/** The vanilla item every glider is (a recipe's result names an item type). */
const GLIDER_BASE = 'minecraft:phantom_membrane';

/** What the glider is made from and repaired with. */
const MATERIALS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:phantom_membrane', label: 'Phantom membrane' },
  { value: 'minecraft:leather', label: 'Leather' },
  { value: 'minecraft:paper', label: 'Paper' },
  { value: 'minecraft:breeze_rod', label: 'Breeze rod' },
];

/** The Glider flow's questions, groups "Glider" and "Getting it". */
export const GLIDER_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'glider_name',
    label: 'Name',
    description:
      'The English name of the glider. Ids derive from it: Silk Glider gives silk_glider.',
    group: 'Glider',
    type: 'string',
    default: 'Silk Glider',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'durability',
    label: 'Seconds of gliding',
    description:
      'Gliding wears it down one point a second; it stops gliding when one point is left. An elytra has 432.',
    group: 'Glider',
    type: 'number',
    default: 432,
    min: 30,
    max: 2000,
    step: 1,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the wings, worn and on the item.',
    group: 'Glider',
    type: 'colour',
    default: hexFromRgb(COLOURS.sapphire),
  },
  {
    id: 'material',
    label: 'Made from',
    description:
      'Six of it and a stick make the glider, and one of it repairs the glider in an anvil.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:phantom_membrane',
    choices: MATERIALS.map((entry) => ({ ...entry })),
  },
]);

export function gliderBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(GLIDER_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'glider_name'));
  const durability = Math.round(numberValue(values, 'durability'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.sapphire);
  const material =
    MATERIALS.find((entry) => entry.value === stringValue(values, 'material')) ??
    (MATERIALS[0] as (typeof MATERIALS)[number]);

  const id = rl(namespace, name.id);
  const wings = rl(namespace, `${name.id}_wings`);
  const itemKey = `item.${namespace}.${name.id}`;
  const components = {
    'minecraft:glider': {},
    'minecraft:equippable': {
      slot: 'chest',
      asset_id: wings,
      equip_sound: 'minecraft:item.armor.equip_elytra',
      damage_on_hurt: false,
    },
    'minecraft:max_stack_size': 1,
    'minecraft:max_damage': durability,
    'minecraft:repairable': { items: material.value },
    'minecraft:item_model': id,
    'minecraft:item_name': { translate: itemKey },
  };
  const giveComponents = `minecraft:glider={},minecraft:equippable={slot:"chest",asset_id:"${wings}",equip_sound:"minecraft:item.armor.equip_elytra",damage_on_hurt:false},minecraft:max_stack_size=1,minecraft:max_damage=${durability},minecraft:repairable={items:"${material.value}"},minecraft:item_model="${id}",minecraft:item_name={translate:"${itemKey}"}`;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    element(
      wings,
      KINDS.equipment,
      { layers: { wings: [{ texture: id }] } },
      `How the glider looks when worn; the glider's minecraft:equippable names it in asset_id. The wings layer names the texture ${id}, the drawn picture textures/entity/equipment/wings/${name.id}.png in the elytra layout (64 by 32; the game mirrors it for the other wing). Paint over it to make it yours.`,
    ),
    element(
      rl(namespace, `${name.id}_crafting`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shaped',
        category: 'equipment',
        pattern: ['MSM', 'M M', 'M M'],
        key: { M: material.value, S: 'minecraft:stick' },
        result: { id: GLIDER_BASE, components },
      },
      `Six ${material.label.toLowerCase()} round a stick make the glider. A vanilla pack cannot add an item, so it is a phantom membrane carrying vanilla components: minecraft:glider and minecraft:equippable (the chest slot, the equipment asset ${wings} and the elytra's sound) let it glide as an elytra does, minecraft:max_damage gives ${durability} seconds of gliding, minecraft:repairable lets ${material.label.toLowerCase()} repair it in an anvil, and minecraft:item_model and minecraft:item_name give its look and name. Wear it, jump from somewhere high and press jump in the air to glide; firework rockets speed it up.`,
    ),
    element(
      id,
      KINDS.itemDefinition,
      { model: { type: 'minecraft:model', model: rl(namespace, `item/${name.id}`) } },
      `What the glider looks like in the hand and the inventory: its minecraft:item_model component names ${id}, this definition, which shows the flat model below.`,
    ),
    itemModel(
      namespace,
      name.id,
      'minecraft:item/generated',
      `The glider's flat model, drawn from textures/item/${name.id}.png.`,
    ),
    element(
      rl(namespace, `give_${name.id}`),
      KINDS.function,
      {
        lines: [
          `# Run with /function ${namespace}:give_${name.id}`,
          `give @s ${GLIDER_BASE}[${giveComponents}]`,
        ],
      },
      'Gives the glider, the same as the recipe makes.',
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [itemKey]: name.display },
      "The glider's English name.",
    ),
  ];
  return {
    elements,
    assets: [
      drawnTexture(namespace, `entity/equipment/wings/${name.id}`, 'glider_wings', colour),
      drawnTexture(namespace, `item/${name.id}`, 'glider', colour),
    ],
  };
}
