/**
 * The Armour trim Creator flow (ADR 0106 D4, B508): a `minecraft:trim_pattern` with its two trim
 * layer pictures (helmet, chestplate and boots; leggings), drawn by the art generator in eight
 * shades of grey, their palette key and the `.png.mcmeta` beside each layer that names it, so the
 * game recolours the layer in each trim material's colours; the template item; the smithing
 * recipe that applies the trim; and the copy recipe that makes two templates from one. A vanilla
 * pack cannot add an item, so the template is a vanilla item the user picks (an echo shard by
 * default) carrying `minecraft:item_model` and `minecraft:item_name`; a recipe matches items by
 * type only, so any plain item of that type works as the template too. Data only: it works in a
 * vanilla resource pack and data pack. Ids derive from `trim_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import { TRIM_KEY_GREY, type TRIM_STYLES } from '../art/recipes/patterns';
import { COLOURS, element, itemModel, KINDS, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  articleFor,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import { drawnTexture, trimKeyTexture, trimLayerMeta } from './pattern-art';

/** The trim styles, in words (the finishes of the trim layer recipes). */
const STYLES: readonly { value: (typeof TRIM_STYLES)[number]; label: string }[] = [
  { value: 'bands', label: 'Bands' },
  { value: 'edges', label: 'Edges' },
  { value: 'studs', label: 'Studs' },
];

/** The vanilla items the template can be. */
const TEMPLATE_ITEMS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:echo_shard', label: 'Echo shard' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:prismarine_shard', label: 'Prismarine shard' },
  { value: 'minecraft:flint', label: 'Flint' },
];

/** The block the copy recipe takes, as each vanilla template takes one of its own. */
const COPY_BLOCKS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:cobblestone', label: 'Cobblestone' },
  { value: 'minecraft:deepslate', label: 'Deepslate' },
  { value: 'minecraft:sandstone', label: 'Sandstone' },
  { value: 'minecraft:prismarine', label: 'Prismarine' },
];

/** The Armour trim flow's questions, groups "Trim" and "Template". */
export const ARMOUR_TRIM_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'trim_name',
    label: 'Name',
    description: 'The English name of the trim. Ids derive from it: Ember Lines gives ember_lines.',
    group: 'Trim',
    type: 'string',
    default: 'Ember Lines',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'style',
    label: 'Style',
    description: 'What the trim draws on worn armour, in the colours of the trim material.',
    group: 'Trim',
    type: 'choice',
    default: 'bands',
    choices: STYLES.map((entry) => ({ ...entry })),
  },
  {
    id: 'template_item',
    label: 'Template made from',
    description:
      'The vanilla item the template is. The smithing table accepts any item of this kind as the template.',
    group: 'Template',
    type: 'choice',
    default: 'minecraft:echo_shard',
    choices: TEMPLATE_ITEMS.map((entry) => ({ ...entry })),
  },
  {
    id: 'copy_block',
    label: 'Copied with',
    description: 'A template, seven diamonds and this block make two templates.',
    group: 'Template',
    type: 'choice',
    default: 'minecraft:cobblestone',
    choices: COPY_BLOCKS.map((entry) => ({ ...entry })),
  },
  {
    id: 'colour',
    label: 'Template colour',
    description: 'The colour of the mark on the template item.',
    group: 'Template',
    type: 'colour',
    default: hexFromRgb(COLOURS.amber),
  },
]);

export function armourTrimBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(ARMOUR_TRIM_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'trim_name'));
  const style =
    STYLES.find((entry) => entry.value === stringValue(values, 'style')) ??
    (STYLES[0] as (typeof STYLES)[number]);
  const base =
    TEMPLATE_ITEMS.find((entry) => entry.value === stringValue(values, 'template_item')) ??
    (TEMPLATE_ITEMS[0] as (typeof TEMPLATE_ITEMS)[number]);
  const copyBlock =
    COPY_BLOCKS.find((entry) => entry.value === stringValue(values, 'copy_block')) ??
    (COPY_BLOCKS[0] as (typeof COPY_BLOCKS)[number]);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.amber);

  const pattern = rl(namespace, name.id);
  const templatePath = `${name.id}_armor_trim_smithing_template`;
  const template = rl(namespace, templatePath);
  const patternKey = `trim_pattern.${namespace}.${name.id}`;
  const templateKey = `item.${namespace}.${templatePath}`;
  const keyPath = `${name.id}_trim_key`;
  const keyId = rl(namespace, keyPath);
  const components = {
    'minecraft:item_model': template,
    'minecraft:item_name': { translate: templateKey },
    'minecraft:rarity': 'uncommon',
  };
  const giveComponents = `minecraft:item_model="${template}",minecraft:item_name={translate:"${templateKey}"},minecraft:rarity="uncommon"`;
  const baseWords = `${articleFor(base.label)} ${base.label.toLowerCase()}`;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} armour trim`, PACK_NOTES),
    element(
      pattern,
      KINDS.trimPattern,
      { asset_id: pattern, description: { translate: patternKey }, decal: false },
      `The trim pattern. asset_id names its two layers in this namespace: textures/trims/entity/humanoid/${name.id}.png for the helmet, chestplate and boots and textures/trims/entity/humanoid_leggings/${name.id}.png for the leggings, ${style.label.toLowerCase()} drawn by MSM in eight greys. The .png.mcmeta beside each names its palette key, textures/palettes/${keyPath}.png (the same eight greys, lightest first), so the game swaps each grey for the trim material's colour at the same place. description is the tooltip line; decal false draws the trim over the armour's own colours.`,
    ),
    element(
      rl(namespace, `${name.id}_armor_trim`),
      KINDS.recipe,
      {
        type: 'minecraft:smithing_trim',
        template: base.value,
        base: '#minecraft:trimmable_armor',
        addition: '#minecraft:trim_materials',
        pattern,
      },
      `Applies the trim at a smithing table: the template in the first slot, any trimmable armour piece in the second and any trim material (iron, gold, an emerald and so on) in the third. The template slot takes ${baseWords}: a recipe names an item type, not its components, so a plain ${base.label.toLowerCase()} works too.`,
    ),
    element(
      rl(namespace, `${templatePath}_copy`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shaped',
        category: 'misc',
        pattern: ['DTD', 'DCD', 'DDD'],
        key: { D: 'minecraft:diamond', T: base.value, C: copyBlock.value },
        result: { id: base.value, count: 2, components },
      },
      `Copies the template as vanilla templates are copied: seven diamonds, the template and ${articleFor(copyBlock.label)} ${copyBlock.label.toLowerCase()} make two.`,
    ),
    element(
      template,
      KINDS.itemDefinition,
      { model: { type: 'minecraft:model', model: rl(namespace, `item/${templatePath}`) } },
      `What the template looks like: its minecraft:item_model component names ${template}, this definition, which shows the flat model below.`,
    ),
    itemModel(
      namespace,
      templatePath,
      'minecraft:item/generated',
      `The template's flat model, drawn from textures/item/${templatePath}.png.`,
    ),
    element(
      rl(namespace, `give_${templatePath}`),
      KINDS.function,
      {
        lines: [
          `# Run with /function ${namespace}:give_${templatePath}`,
          `give @s ${base.value}[${giveComponents}]`,
        ],
      },
      'Gives the template. Find more by copying it, or put it in a chest loot table of your own.',
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      {
        [templateKey]: `${name.display} Armour Trim`,
        [patternKey]: `${name.display} Armour Trim`,
      },
      'The English names of the template item and of the trim in the armour tooltip.',
    ),
  ];
  const layer = (folder: string) => `trims/entity/${folder}/${name.id}`;
  return {
    elements,
    assets: [
      drawnTexture(namespace, layer('humanoid'), 'trim_layer_1', TRIM_KEY_GREY, style.value),
      trimLayerMeta(namespace, layer('humanoid'), keyId),
      drawnTexture(
        namespace,
        layer('humanoid_leggings'),
        'trim_layer_2',
        TRIM_KEY_GREY,
        style.value,
      ),
      trimLayerMeta(namespace, layer('humanoid_leggings'), keyId),
      trimKeyTexture(namespace, keyPath),
      drawnTexture(namespace, `item/${templatePath}`, 'smithing_template', colour),
    ],
  };
}
