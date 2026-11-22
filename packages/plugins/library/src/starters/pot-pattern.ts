/**
 * The Pot pattern Creator flow (ADR 0106 D4, B508): a `minecraft:decorated_pot_pattern` with its
 * face picture (fired clay with a raised picture, drawn by the art generator) and the sherd that
 * puts it on a pot. A vanilla pack cannot add an item, so the sherd is a brick carrying the
 * vanilla components `minecraft:provides_pottery_pattern` (the pattern), `minecraft:item_model`
 * and `minecraft:item_name`, made by a shapeless recipe from a brick and an ingredient. A brick is
 * already in the vanilla tag `#minecraft:decorated_pot_ingredients`, and a pot keeps each side's
 * item with its components, so no item tag is needed. Data only: it works in a vanilla resource
 * pack and data pack. Ids derive from `pattern_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import type { POT_PICTURES } from '../art/recipes/patterns';
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

/** The decorated pot pattern kind (ADR 0106 D1, B504). */
const POT_PATTERN_KIND = 'minecraft:decorated_pot_pattern';

/** The pictures, in words (the finishes of the pot face recipe). */
const PICTURES: readonly { value: (typeof POT_PICTURES)[number]; label: string }[] = [
  { value: 'sun', label: 'Sun' },
  { value: 'fish', label: 'Fish' },
  { value: 'leaf', label: 'Leaf' },
];

/** What the recipe adds to a brick. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:clay_ball', label: 'Clay ball' },
  { value: 'minecraft:bone_meal', label: 'Bone meal' },
  { value: 'minecraft:glowstone_dust', label: 'Glowstone dust' },
  { value: 'minecraft:lapis_lazuli', label: 'Lapis lazuli' },
];

/** The Pot pattern flow's questions, groups "Pattern" and "Getting it". */
export const POT_PATTERN_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'pattern_name',
    label: 'Name',
    description: 'The English name of the sherd. Ids derive from it: Sunrise gives sunrise.',
    group: 'Pattern',
    type: 'string',
    default: 'Sunrise',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'picture',
    label: 'Picture',
    description: 'What the pattern shows on a side of a decorated pot.',
    group: 'Pattern',
    type: 'choice',
    default: 'sun',
    choices: PICTURES.map((entry) => ({ ...entry })),
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the picture, on the pot and on the sherd.',
    group: 'Pattern',
    type: 'colour',
    default: hexFromRgb(COLOURS.amber),
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'A brick and one of it in the crafting grid make the sherd.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:clay_ball',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

export function potPatternBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(POT_PATTERN_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'pattern_name'));
  const picture =
    PICTURES.find((entry) => entry.value === stringValue(values, 'picture')) ??
    (PICTURES[0] as (typeof PICTURES)[number]);
  const ingredient =
    INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient')) ??
    (INGREDIENTS[0] as (typeof INGREDIENTS)[number]);
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.amber);

  const pattern = rl(namespace, name.id);
  const facePath = `${name.id}_pottery_pattern`;
  const sherdPath = `${name.id}_pottery_sherd`;
  const sherd = rl(namespace, sherdPath);
  const sherdKey = `item.${namespace}.${sherdPath}`;
  const components = {
    'minecraft:provides_pottery_pattern': pattern,
    'minecraft:item_model': sherd,
    'minecraft:item_name': { translate: sherdKey },
  };
  const giveComponents = `minecraft:provides_pottery_pattern="${pattern}",minecraft:item_model="${sherd}",minecraft:item_name={translate:"${sherdKey}"}`;

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} pot pattern`, PACK_NOTES),
    element(
      pattern,
      POT_PATTERN_KIND,
      { asset_id: rl(namespace, facePath) },
      `The decorated pot pattern. asset_id names its picture, textures/entity/decorated_pot/${facePath}.png in this namespace: a ${picture.label.toLowerCase()} raised on fired clay, 16 by 16, drawn by MSM. Paint over it to make it yours.`,
    ),
    element(
      rl(namespace, `${sherdPath}_from_brick`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shapeless',
        category: 'misc',
        ingredients: ['minecraft:brick', ingredient.value],
        result: { id: 'minecraft:brick', components },
      },
      `A brick and ${articleFor(ingredient.label)} ${ingredient.label.toLowerCase()} make the sherd. A vanilla pack cannot add an item, so it is a brick carrying vanilla components: minecraft:provides_pottery_pattern names ${pattern}, so a decorated pot crafted with it shows the picture on that side; minecraft:item_model and minecraft:item_name give its look and name. Bricks are already pot ingredients, so four bricks or sherds in a diamond make a decorated pot.`,
    ),
    element(
      sherd,
      KINDS.itemDefinition,
      { model: { type: 'minecraft:model', model: rl(namespace, `item/${sherdPath}`) } },
      `What the sherd looks like: its minecraft:item_model component names ${sherd}, this definition, which shows the flat model below.`,
    ),
    itemModel(
      namespace,
      sherdPath,
      'minecraft:item/generated',
      `The sherd's flat model, drawn from textures/item/${sherdPath}.png.`,
    ),
    element(
      rl(namespace, `give_${sherdPath}`),
      KINDS.function,
      {
        lines: [
          `# Run with /function ${namespace}:give_${sherdPath}`,
          `give @s minecraft:brick[${giveComponents}]`,
        ],
      },
      'Gives the sherd, the same as the recipe makes.',
    ),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [sherdKey]: `${name.display} Pottery Sherd` },
      "The sherd's English name.",
    ),
  ];
  return {
    elements,
    assets: [
      drawnTexture(
        namespace,
        `entity/decorated_pot/${facePath}`,
        'pot_pattern',
        colour,
        picture.value,
      ),
      drawnTexture(namespace, `item/${sherdPath}`, 'pottery_sherd', colour),
    ],
  };
}
