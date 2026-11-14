/**
 * The Machine Creator flow (ADR 0076 D2): one `horizontal` `msm:block` with `msm:machine`
 * (ADR 0075) that works items in a vanilla furnace screen: one input, one fuel and one output
 * slot. It turns its front towards the player who places it, as a furnace does, and shows its
 * front texture `front_lit` while it works. Choices: the power (fuel, a redstone signal or
 * always), the speed, the vanilla cooking recipes it also takes, up to three recipes of its own
 * (picked from a list of vanilla items), a crafting recipe (eight of a material around a
 * furnace) and pictures for the front, the working front, the sides and the top.
 *
 * Its own recipes are the element's `recipes` (lowered to `data/<ns>/recipe/<id>/<name>.json`
 * with the machine's id as their `type`, ADR 0075 D8); without any, the machine takes only the
 * vanilla recipes chosen. Ids derive from `machine_name`: `grinder`, its textures
 * `block/grinder`, `block/grinder_front`, `block/grinder_front_lit` and `block/grinder_top`,
 * and the crafting recipe `grinder_from_furnace`. Machines need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  Json,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { PlaceholderPattern } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  pictureTexture,
  rl,
} from '../content/bundle';
import {
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** How the machine is powered (ADR 0075 D1), with the Block Studio's labels (ADR 0076 D1). */
const POWERS: readonly { value: string; label: string; words: string }[] = [
  { value: 'fuel', label: 'Fuel', words: 'burns fuel in its fuel slot, as a furnace does' },
  {
    value: 'redstone',
    label: 'Redstone signal',
    words: 'works only while it receives a redstone signal and takes no fuel',
  },
  { value: 'always', label: 'Always', words: 'works whenever it has an input and takes no fuel' },
];

/** The vanilla cooking recipe types a machine can also take (`TargetFacts.blocks`). */
export const MACHINE_VANILLA_TYPES = Object.freeze([
  { value: 'minecraft:smelting', label: "Smelting (a furnace's recipes)" },
  { value: 'minecraft:blasting', label: "Blasting (a blast furnace's recipes)" },
  { value: 'minecraft:smoking', label: "Smoking (a smoker's recipes)" },
  { value: 'minecraft:campfire_cooking', label: 'Campfire cooking' },
] as const);

/** One recipe of its own a machine can have. */
interface MachineRecipe {
  value: string;
  label: string;
  ingredient: string;
  result: string;
  count: number;
  experience?: number;
}

/**
 * The recipes of its own a machine can have: vanilla items in and out, each ingredient once, so
 * no two recipes compete for one input.
 */
export const MACHINE_RECIPES: readonly MachineRecipe[] = Object.freeze([
  {
    value: 'gravel',
    label: 'Cobblestone into gravel',
    ingredient: 'minecraft:cobblestone',
    result: 'minecraft:gravel',
    count: 1,
  },
  {
    value: 'flint',
    label: 'Gravel into flint',
    ingredient: 'minecraft:gravel',
    result: 'minecraft:flint',
    count: 1,
    experience: 0.1,
  },
  {
    value: 'bone_meal',
    label: 'A bone into four bone meal',
    ingredient: 'minecraft:bone',
    result: 'minecraft:bone_meal',
    count: 4,
  },
  {
    value: 'iron_ingot',
    label: 'Raw iron into two iron ingots',
    ingredient: 'minecraft:raw_iron',
    result: 'minecraft:iron_ingot',
    count: 2,
    experience: 0.7,
  },
  {
    value: 'gold_ingot',
    label: 'Raw gold into two gold ingots',
    ingredient: 'minecraft:raw_gold',
    result: 'minecraft:gold_ingot',
    count: 2,
    experience: 1,
  },
  {
    value: 'copper_ingot',
    label: 'Raw copper into two copper ingots',
    ingredient: 'minecraft:raw_copper',
    result: 'minecraft:copper_ingot',
    count: 2,
    experience: 0.7,
  },
  {
    value: 'string',
    label: 'White wool into four string',
    ingredient: 'minecraft:white_wool',
    result: 'minecraft:string',
    count: 4,
  },
  {
    value: 'sugar',
    label: 'Sugar cane into two sugar',
    ingredient: 'minecraft:sugar_cane',
    result: 'minecraft:sugar',
    count: 2,
  },
  { value: 'none', label: 'No recipe', ingredient: '', result: '', count: 0 },
]);

/** The recipe slots of the flow and their defaults. */
const RECIPE_SLOTS: readonly { id: string; label: string; default: string }[] = [
  { id: 'recipe_1', label: 'First recipe', default: 'gravel' },
  { id: 'recipe_2', label: 'Second recipe', default: 'flint' },
  { id: 'recipe_3', label: 'Third recipe', default: 'bone_meal' },
];

/** What surrounds the vanilla furnace in the crafting recipe. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:iron_ingot', label: 'Iron ingots' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingots' },
  { value: 'minecraft:cobblestone', label: 'Cobblestone' },
  { value: 'minecraft:stone_bricks', label: 'Stone bricks' },
  { value: 'none', label: 'No recipe (creative menu only)' },
];

/** The machine's pictures: parameter id, label, texture suffix and placeholder pattern. */
const PICTURES: readonly {
  id: string;
  label: string;
  suffix: string;
  pattern: PlaceholderPattern;
  /** Drawn in the working colour (amber) instead of the machine's. */
  lit?: boolean;
}[] = [
  { id: 'picture_front', label: 'Front', suffix: '_front', pattern: 'block_front' },
  {
    id: 'picture_front_lit',
    label: 'Front when working',
    suffix: '_front_lit',
    pattern: 'block_front',
    lit: true,
  },
  { id: 'picture_side', label: 'Sides and back', suffix: '', pattern: 'plain' },
  { id: 'picture_top', label: 'Top and bottom', suffix: '_top', pattern: 'polished_stone' },
];

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;

/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/** The Machine's questions, groups "Machine", "Recipes", "Crafting" and "Pictures". */
export const MACHINE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'machine_name',
    label: 'Machine name',
    description: 'The English name. Ids derive from it: Grinder gives grinder.',
    group: 'Machine',
    type: 'string',
    default: 'Grinder',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder textures.',
    group: 'Machine',
    type: 'colour',
    default: hexFromRgb(COLOURS.slate),
  },
  {
    id: 'power',
    label: 'Power',
    description: 'Fuel burns coal, wood and other fuels as a furnace does.',
    group: 'Machine',
    type: 'choice',
    default: 'fuel',
    choices: POWERS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'speed',
    label: 'Speed',
    description: '1 works as fast as a furnace; 2 takes half the time.',
    group: 'Machine',
    type: 'number',
    default: 1,
    min: 0.5,
    max: 4,
    step: 0.5,
  },
  {
    id: 'vanilla_types',
    label: 'Also takes vanilla recipes',
    description:
      'Recipes of vanilla cooking blocks it also works, besides its own. With Smelting it smelts everything a furnace smelts.',
    group: 'Recipes',
    type: 'set',
    default: [],
    choices: MACHINE_VANILLA_TYPES.map(({ value, label }) => ({ value, label })),
    min: 0,
  },
  ...RECIPE_SLOTS.map(
    (slot): StarterParameter => ({
      id: slot.id,
      label: slot.label,
      description: 'A recipe of its own, at the time a furnace takes for one item.',
      group: 'Recipes',
      type: 'choice',
      default: slot.default,
      choices: MACHINE_RECIPES.map(({ value, label }) => ({ value, label })),
    }),
  ),
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Eight of it around a furnace make one machine.',
    group: 'Crafting',
    type: 'choice',
    default: 'minecraft:iron_ingot',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  ...PICTURES.map(
    (picture): StarterParameter => ({
      id: picture.id,
      label: picture.label,
      description: `A square PNG for this texture (16 by 16 as vanilla, up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}). Leave it empty for a placeholder in the colour.`,
      group: 'Pictures',
      type: 'image',
      default: null,
      maxBytes: PICTURE_MAX_BYTES,
      maxSize: PICTURE_MAX_SIZE,
    }),
  ),
]);

/** A furnace's breaking: hardness 3.5, drops only to a pickaxe. */
const FURNACE_BREAKING = { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' };

export function machineBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(MACHINE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'machine_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.slate);
  const power = POWERS.find((entry) => entry.value === stringValue(values, 'power')) ?? POWERS[0];
  if (power === undefined) throw new Error('No machine power.');
  // The format's range is 0.1 to 10; the flow offers 0.5 to 4 in halves.
  const speed = Math.min(10, Math.max(0.1, Math.round(numberValue(values, 'speed') * 10) / 10));
  // Only the types the target lists (ADR 0075 D3); both built-in targets list all four.
  const allowed = context.target.blocks?.machineRecipeTypes;
  const vanillaTypes = setValue(values, 'vanilla_types').filter(
    (type) => allowed === undefined || allowed.includes(type),
  );
  const own = [
    ...new Set(
      RECIPE_SLOTS.map((slot) => stringValue(values, slot.id)).filter((v) => v !== 'none'),
    ),
  ]
    .map((value) => MACHINE_RECIPES.find((entry) => entry.value === value))
    .filter((entry): entry is MachineRecipe => entry !== undefined && entry.value !== 'none');
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));

  const id = name.id;
  const block = rl(namespace, id);
  const machine: JsonObject = {};
  // Without vanilla types the machine takes its own recipe type only, the default; with them,
  // its own id comes first when it has recipes of its own.
  if (vanillaTypes.length > 0) {
    machine.recipe_types = [...(own.length > 0 ? [block] : []), ...vanillaTypes];
  }
  if (power.value !== 'fuel') machine.power = power.value;
  if (speed !== 1) machine.speed = speed;
  const recipes: Json[] = own.map((entry) => {
    const recipe: JsonObject = {
      ingredient: entry.ingredient,
      result: entry.count === 1 ? entry.result : { id: entry.result, count: entry.count },
    };
    if (entry.experience !== undefined) recipe.experience = entry.experience;
    return recipe;
  });

  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    type: 'horizontal',
    sound_type: 'stone',
    loot: 'self',
    item: { creative_tab: 'minecraft:functional_blocks' },
    textures: {
      front: rl(namespace, `block/${id}_front`),
      front_lit: rl(namespace, `block/${id}_front_lit`),
      side: rl(namespace, `block/${id}`),
      top: rl(namespace, `block/${id}_top`),
    },
    components: { 'msm:breakable': { ...FURNACE_BREAKING }, 'msm:machine': machine },
  };
  if (recipes.length > 0) data.recipes = recipes;

  const takes = [
    ...(own.length > 0 ? [`its own ${own.length === 1 ? 'recipe' : 'recipes'}`] : []),
    ...vanillaTypes.map((type) =>
      (MACHINE_VANILLA_TYPES.find((entry) => entry.value === type)?.label ?? type).toLowerCase(),
    ),
  ];
  const recipeWords =
    own.length === 0
      ? ''
      : ` Its recipes (${own.map((entry) => entry.label.toLowerCase()).join('; ')}) are the element's recipes: each becomes a data pack file data/${namespace}/recipe/${id}/<name>.json whose type is ${block}, at the machine's default time of 10 seconds unless a recipe sets time, with experience paid when a player takes the output. The vanilla data pack leaves them out, as a vanilla game cannot load them.`;
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a machine that works items.`),
    element(
      block,
      KINDS.block,
      data,
      `A machine (msm:machine) in a vanilla furnace screen: input, fuel and output. It ${power.words}${speed === 1 ? '' : `, at ${speed} times a furnace's speed`}, and takes ${takes.length === 0 ? 'no recipes yet: add some to recipes' : takes.join(', ')}.${recipeWords} It turns its front towards the player who places it and shows textures.front_lit while it works (the block state lit), giving light of level 13. Hoppers fill the input from above and the fuel from the sides and empty the output from below; comparators read its contents. Machines need the Fabric mod jar export.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    elements.push(
      element(
        rl(namespace, `${id}_from_furnace`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: ['XXX', 'XFX', 'XXX'],
          key: { X: ingredient.value, F: 'minecraft:furnace' },
          result: { id: block },
        },
        `Eight ${ingredient.label.toLowerCase()} around a furnace make one ${name.lower}. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
  }
  const assets = PICTURES.map((picture) =>
    pictureTexture(
      namespace,
      `block/${id}${picture.suffix}`,
      imageValue(values, picture.id),
      picture.pattern,
      picture.lit === true ? COLOURS.amber : colour,
    ),
  );
  return { elements, assets };
}
