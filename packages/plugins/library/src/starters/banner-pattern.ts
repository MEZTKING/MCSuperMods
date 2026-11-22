/**
 * The Banner pattern Creator flow (ADR 0106 D4, B508): a `minecraft:banner_pattern` with its
 * banner and shield pictures (pale masks the game dyes, drawn by the art generator in the shape
 * the user picks), its banner pattern tag, and the item that applies it in the loom. A vanilla
 * pack cannot add an item, so the item is paper carrying the vanilla components
 * `minecraft:provides_banner_patterns` (the tag), `minecraft:item_model` and
 * `minecraft:item_name`, made by a shapeless recipe from paper and an ingredient. The dye colour
 * names of the pattern come from the target's dye colours. Data only: it works in a vanilla
 * resource pack and data pack. Ids derive from `pattern_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import { type BANNER_SHAPES, PATTERN_MASK_GREY } from '../art/recipes/patterns';
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
import { drawnTexture } from './pattern-art';

/** The shapes, in words (the finishes of the banner and shield recipes). */
const SHAPES: readonly { value: (typeof BANNER_SHAPES)[number]; label: string }[] = [
  { value: 'diamond', label: 'Diamond' },
  { value: 'ring', label: 'Ring' },
  { value: 'chevrons', label: 'Chevrons' },
  { value: 'star', label: 'Star' },
];

/** What the recipe adds to a sheet of paper. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:feather', label: 'Feather' },
  { value: 'minecraft:ink_sac', label: 'Ink sac' },
  { value: 'minecraft:glow_ink_sac', label: 'Glow ink sac' },
  { value: 'minecraft:gold_nugget', label: 'Gold nugget' },
];

/** The Banner pattern flow's questions, groups "Pattern" and "Getting it". */
export const BANNER_PATTERN_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'pattern_name',
    label: 'Name',
    description:
      'The English name of the pattern. Ids derive from it: Lucky Star gives lucky_star.',
    group: 'Pattern',
    type: 'string',
    default: 'Lucky Star',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'shape',
    label: 'Shape',
    description: 'What the pattern draws on the banner and the shield, in the colour you dye it.',
    group: 'Pattern',
    type: 'choice',
    default: 'star',
    choices: SHAPES.map((entry) => ({ ...entry })),
  },
  {
    id: 'colour',
    label: 'Sheet colour',
    description: 'The colour of the mark on the pattern item.',
    group: 'Pattern',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Paper and one of it in the crafting grid make the pattern item.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:amethyst_shard',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

/** `Lucky Star` in the dye colour `light_blue`: `Light Blue Lucky Star`. */
const colourName = (colour: string, display: string): string =>
  `${colour
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')} ${display}`;

export function bannerPatternBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(BANNER_PATTERN_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'pattern_name'));
  const shape =
    SHAPES.find((entry) => entry.value === stringValue(values, 'shape')) ??
    (SHAPES[3] as (typeof SHAPES)[number]);
  const ingredient =
    INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient')) ??
    (INGREDIENTS[0] as (typeof INGREDIENTS)[number]);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);

  const pattern = rl(namespace, name.id);
  const tag = rl(namespace, `pattern_item/${name.id}`);
  const itemPath = `${name.id}_banner_pattern`;
  const item = rl(namespace, itemPath);
  const translationKey = `block.${namespace}.banner.${name.id}`;
  const itemKey = `item.${namespace}.${itemPath}`;
  const dyes = context.target.blocks?.dyeColours ?? [];
  const lang: Record<string, string> = { [itemKey]: `${name.display} Banner Pattern` };
  for (const dye of dyes) lang[`${translationKey}.${dye}`] = colourName(dye, name.display);
  const components = {
    'minecraft:provides_banner_patterns': `#${tag}`,
    'minecraft:item_model': item,
    'minecraft:item_name': { translate: itemKey },
    'minecraft:max_stack_size': 1,
    'minecraft:rarity': 'uncommon',
  };
  const giveComponents = `minecraft:provides_banner_patterns="#${tag}",minecraft:item_model="${item}",minecraft:item_name={translate:"${itemKey}"},minecraft:max_stack_size=1,minecraft:rarity="uncommon"`;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} banner pattern`, PACK_NOTES),
    element(
      pattern,
      KINDS.bannerPattern,
      { asset_id: pattern, translation_key: translationKey },
      `The banner pattern. asset_id names its two pictures in this namespace: textures/entity/banner/${name.id}.png for banners and textures/entity/shield/${name.id}.png for shields, pale masks the game dyes in the colour chosen in the loom (a ${shape.label.toLowerCase()} drawn by MSM; paint over them to change the shape). translation_key is the start of its name: the game adds the dye colour, so ${translationKey}.red reads "${colourName('red', name.display)}".`,
    ),
    element(
      tag,
      KINDS.tagBannerPattern,
      { values: [pattern] },
      `The patterns the pattern item offers in the loom; vanilla items use tags of the same form, such as #minecraft:pattern_item/flow. This one holds only ${name.display}.`,
    ),
    element(
      rl(namespace, `${itemPath}_from_paper`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shapeless',
        category: 'misc',
        ingredients: ['minecraft:paper', ingredient.value],
        result: { id: 'minecraft:paper', components },
      },
      `Paper and ${articleFor(ingredient.label)} ${ingredient.label.toLowerCase()} make the pattern item. A vanilla pack cannot add an item, so it is paper carrying vanilla components: minecraft:provides_banner_patterns names the tag #${tag}, so the loom accepts it in its pattern slot and offers ${name.display}; minecraft:item_model shows the pattern sheet picture and minecraft:item_name its name.`,
    ),
    element(
      item,
      KINDS.itemDefinition,
      { model: { type: 'minecraft:model', model: rl(namespace, `item/${itemPath}`) } },
      `What the pattern item looks like: its minecraft:item_model component names ${item}, this definition, which shows the flat model below.`,
    ),
    itemModel(
      namespace,
      itemPath,
      'minecraft:item/generated',
      `The pattern item's flat model, drawn from textures/item/${itemPath}.png.`,
    ),
    element(
      rl(namespace, `give_${itemPath}`),
      KINDS.function,
      {
        lines: [
          `# Run with /function ${namespace}:give_${itemPath}`,
          `give @s minecraft:paper[${giveComponents}]`,
        ],
      },
      'Gives the pattern item, the same as the recipe makes. Put it in the pattern slot of a loom with a banner and a dye.',
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      Object.fromEntries(Object.entries(lang).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      `The English names: the pattern item, and the pattern in each of the ${dyes.length} dye colours (the loom and the banner's tooltip show them).`,
    ),
  ];
  return {
    elements,
    assets: [
      drawnTexture(
        namespace,
        `entity/banner/${name.id}`,
        'banner_pattern',
        PATTERN_MASK_GREY,
        shape.value,
      ),
      drawnTexture(
        namespace,
        `entity/shield/${name.id}`,
        'shield_pattern',
        PATTERN_MASK_GREY,
        shape.value,
      ),
      drawnTexture(namespace, `item/${itemPath}`, 'pattern_sheet', colour),
    ],
  };
}
