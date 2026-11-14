/**
 * The Simple block starter and Creator flow (ADR 0043 D2): one `msm:block` with a placeholder
 * texture and a full-cube model (or, placed facing the player or like a log, the `horizontal`
 * or `pillar` type with a second texture and generated models; ADR 0069 D4), how hard it is to break, the tool and tier that mine it, its
 * light level, whether it drops itself, an optional recipe from a vanilla ingredient, its
 * English name and the `msm:mod` metadata. Ids derive from `block_name`. New blocks need the
 * Fabric mod jar export (with `msm_runtime`).
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { PlaceholderPattern } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  packElement,
  rl,
  texture,
} from '../content/bundle';
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

/** The tools that can mine the block quickly, and the sound each kind of block makes. */
const TOOLS: readonly { value: string; label: string; sound: string }[] = [
  { value: 'pickaxe', label: 'Pickaxe', sound: 'stone' },
  { value: 'axe', label: 'Axe', sound: 'wood' },
  { value: 'shovel', label: 'Shovel', sound: 'gravel' },
  { value: 'hoe', label: 'Hoe', sound: 'moss' },
  { value: 'none', label: 'Any tool (or a hand)', sound: 'stone' },
];

/** How the block is placed (ADR 0069 D4): the same every way, facing the player or as a log. */
const PLACEMENTS: readonly { value: string; label: string }[] = [
  { value: 'same', label: 'The same every way' },
  { value: 'horizontal', label: 'Turns to face the player' },
  { value: 'pillar', label: 'Placed like a log' },
];

/** What the block's notes add for each way of placing it. */
const PLACEMENT_NOTES: Readonly<Record<string, string>> = {
  horizontal:
    ' Its type, horizontal, turns its front towards the player who places it, as a furnace: the generated model shows textures.front on the front and textures.all elsewhere.',
  pillar:
    ' Its type, pillar, turns it to the face it is placed against, as a log: the generated models show textures.side around it and textures.end on both ends.',
};

/** The tiers vanilla has `needs_<tier>_tool` tags for, plus none. */
const TIERS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'Any tier' },
  { value: 'stone', label: 'Stone or better' },
  { value: 'iron', label: 'Iron or better' },
  { value: 'diamond', label: 'Diamond or better' },
];

/** Vanilla blocks the optional 2x2 recipe can use. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No recipe' },
  { value: 'minecraft:stone', label: 'Stone' },
  { value: 'minecraft:cobblestone', label: 'Cobblestone' },
  { value: 'minecraft:deepslate', label: 'Deepslate' },
  { value: 'minecraft:oak_planks', label: 'Oak planks' },
  { value: 'minecraft:sandstone', label: 'Sandstone' },
  { value: 'minecraft:quartz_block', label: 'Block of quartz' },
];

/** The Simple block's questions (ADR 0043 D2), groups "Block", "Mining" and "Recipe". */
export const SIMPLE_BLOCK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'block_name',
    label: 'Block name',
    description: 'The English name. Ids derive from it: Ruby Tiles gives ruby_tiles.',
    group: 'Block',
    type: 'string',
    default: 'Ruby Tiles',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder texture.',
    group: 'Block',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'pattern',
    label: 'Texture',
    group: 'Block',
    type: 'choice',
    default: 'plain',
    choices: [
      { value: 'plain', label: 'Smooth with a bevel' },
      { value: 'ore', label: 'Coloured specks on stone' },
    ],
  },
  {
    id: 'placement',
    label: 'When placed',
    description:
      'A block that turns gets a second placeholder texture: a front with an opening, or ring-capped ends.',
    group: 'Block',
    type: 'choice',
    default: 'same',
    choices: PLACEMENTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'light_level',
    label: 'Light level',
    description: '0 gives no light; 15 is as bright as glowstone.',
    group: 'Block',
    type: 'number',
    default: 0,
    min: 0,
    max: 15,
    step: 1,
  },
  {
    id: 'hardness',
    label: 'Hardness',
    description: 'How long it takes to break (dirt 0.5, stone 1.5, obsidian 50).',
    group: 'Mining',
    type: 'number',
    default: 1.5,
    min: 0,
    max: 50,
    step: 0.5,
  },
  {
    id: 'tool',
    label: 'Mined with',
    group: 'Mining',
    type: 'choice',
    default: 'pickaxe',
    choices: TOOLS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'min_tier',
    label: 'Tool tier needed for drops',
    description: 'Mined with a weaker tool (or by hand), the block drops nothing.',
    group: 'Mining',
    type: 'choice',
    default: 'none',
    choices: TIERS.map((tier) => ({ ...tier })),
  },
  {
    id: 'drops_itself',
    label: 'Drops itself when mined',
    group: 'Mining',
    type: 'boolean',
    default: true,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Four of it in a square make four of the block.',
    group: 'Recipe',
    type: 'choice',
    default: 'minecraft:stone',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
]);

export function simpleBlockBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(SIMPLE_BLOCK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'block_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const pattern: PlaceholderPattern = stringValue(values, 'pattern') === 'ore' ? 'ore' : 'plain';
  const light = Math.round(numberValue(values, 'light_level'));
  const hardness = Math.round(numberValue(values, 'hardness') * 100) / 100;
  const tool = TOOLS.find((entry) => entry.value === stringValue(values, 'tool')) ?? TOOLS[0];
  const tier = stringValue(values, 'min_tier');
  const dropsItself = booleanValue(values, 'drops_itself');
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));
  const hasTool = tool !== undefined && tool.value !== 'none';
  const needsTier = hasTool && tier !== 'none';

  const block = rl(namespace, name.id);
  const model = rl(namespace, `block/${name.id}`);
  const breakable: JsonObject = { hardness, resistance: Math.max(hardness, 1) };
  if (hasTool) breakable.tool = tool.value;
  if (needsTier) breakable.min_tier = tier;
  const components: JsonObject = { 'msm:breakable': breakable };
  if (light > 0) components['msm:light_emitter'] = { level: light };
  const placement = stringValue(values, 'placement');
  const turns = placement === 'horizontal' || placement === 'pillar';
  const data: JsonObject = { format: 1 };
  if (placement === 'horizontal') {
    data.type = 'horizontal';
    data.textures = { all: model, front: rl(namespace, `block/${name.id}_front`) };
  } else if (placement === 'pillar') {
    data.type = 'pillar';
    data.textures = { side: model, end: rl(namespace, `block/${name.id}_top`) };
  } else {
    data.model = model;
  }
  Object.assign(data, {
    sound_type: tool?.sound ?? 'stone',
    item: { creative_tab: 'minecraft:building_blocks' },
    components,
  });
  if (dropsItself) data.loot = 'self';

  const mining = hasTool
    ? `It mines quickly with ${tool.value === 'axe' ? 'an' : 'a'} ${tool.value}${needsTier ? ` and drops only when the ${tool.value} is ${tier} or better` : ''}.`
    : 'No tool mines it faster than a hand.';
  const elements = [
    packElement(
      namespace,
      `${projectName}: ${name.lower}`,
      'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
    ),
    element(
      rl(namespace, 'mod'),
      KINDS.mod,
      {
        mod_id: modIdFromNamespace(namespace),
        version: '1.0.0',
        name: projectName,
        description: `Adds ${name.lower}, a new block.`,
        authors: [],
        licence: 'All-Rights-Reserved',
      },
      'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New blocks exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
    ),
    element(
      block,
      KINDS.block,
      data,
      `A new block with hardness ${hardness}. ${mining}${light > 0 ? ` It gives off light of level ${light}.` : ''} ${dropsItself ? '"loot": "self" generates a loot table that drops the block itself.' : 'It has no loot table, so it drops nothing; set loot to "self" to make it drop itself.'}${PLACEMENT_NOTES[placement] ?? ''}`,
    ),
    ...(turns
      ? []
      : [
          element(
            model,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: model } },
            `A full cube with the same texture on every side, drawn from textures/block/${name.id}.png. Paint over the placeholder to restyle it.`,
          ),
        ]),
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [`block.${namespace}.${name.id}`]: name.display },
      `The English name of the block: block.${namespace}.${name.id} is its translation key.`,
    ),
  ];
  if (ingredient !== undefined && ingredient.value !== 'none') {
    const ingredientPath = ingredient.value.slice('minecraft:'.length);
    elements.push(
      element(
        rl(namespace, `${name.id}_from_${ingredientPath}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['XX', 'XX'],
          key: { X: ingredient.value },
          result: { id: block, count: 4 },
        },
        `Four ${ingredient.label.toLowerCase()} in a square make four ${name.lower}. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
  }
  const assets = [texture(namespace, `block/${name.id}`, pattern, colour)];
  if (placement === 'horizontal') {
    assets.push(texture(namespace, `block/${name.id}_front`, 'block_front', colour));
  } else if (placement === 'pillar') {
    assets.push(texture(namespace, `block/${name.id}_top`, 'pillar_top', colour));
  }
  return { elements, assets };
}
