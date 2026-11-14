/**
 * The Wood set Creator flow (ADR 0069 D1 to D3): every member of a vanilla wood set as one
 * `msm:block` each, with the block types of ADR 0067 and ADR 0068. From one name, a wood colour
 * and a leaf colour (or a picture per texture) it builds the log, wood, stripped log and
 * stripped wood (`pillar`), planks (`block` with a cube model), stairs, slab, fence, fence gate,
 * door, trapdoor, button, pressure plate, leaves and sapling, the sapling's tree
 * (`minecraft:worldgen/feature` of type `minecraft:tree`), and optionally the tree growing in
 * the world (a placed feature and an `msm:biome_addition`, ADR 0060).
 *
 * Ids derive from `wood_name`: `maple_log`, `stripped_maple_log`, `maple_planks`, the tree
 * `maple_tree` (the "Tree for a sapling" template's rule: the tree `<base>_tree` grows
 * `<base>_log` and `<base>_leaves`), the item tag `maple_logs` and the recipes
 * `maple_planks_from_logs` and so on (element ids are unique across kinds, so a recipe cannot
 * share its result's id).
 *
 * Behaviour as vanilla's oak set: an axe strips the logs and wood (`msm:strippable`); planks,
 * stairs, slabs, fences and fence gates burn with odds 5 and 20, logs and wood with 5 and 5,
 * leaves with 30 and 60 (`msm:flammable`, the arguments of vanilla's `FireBlock.setFlammable`,
 * read from the Minecraft jar); doors, trapdoors and pressure plates carry `msm:flammable` with 0
 * and 0, which is how the runtime makes lava ignite them as vanilla's wooden ones without fire
 * spreading to them. Leaves and saplings compost at 30%. Every wooden member is mined faster
 * with an axe and drops by hand.
 *
 * Tags: element ids are unique across kinds, so one id cannot be both a block tag and an item
 * tag element. The flow therefore writes the item tag `<ns>:<w>_logs` (the planks recipe's
 * ingredient, as vanilla's `#oak_logs`), joins it into the item tag `minecraft:logs_that_burn`
 * (which vanilla's `minecraft:logs` item tag includes), and lists the log blocks directly in
 * the block tag `minecraft:logs` (leaf decay). Planks join the item tag `minecraft:planks`,
 * stairs and slabs `minecraft:wooden_stairs` and `minecraft:wooden_slabs` (furnace fuel and
 * vanilla recipes); the type tags (`wooden_fences`, `wooden_doors`, `leaves`, `saplings` and so
 * on) come from the block types' own lowering.
 *
 * Members that need others: the sapling, the tree and "Grows in the world" need the log and the
 * leaves (the tree is made of them); the recipes of stairs, slab, fence, gate, door, trapdoor,
 * button and plate need the planks; wood and stripped wood are crafted from their logs.
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
import type { PlaceholderPattern, Rgb } from '../assets/png';
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
  booleanValue,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  nameForms,
  numberValue,
  type ParameterValues,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** The members of a wood set, in vanilla's order. */
export const WOOD_SET_MEMBERS = Object.freeze([
  { value: 'log', label: 'Log' },
  { value: 'wood', label: 'Wood (bark on every side)' },
  { value: 'stripped_log', label: 'Stripped log' },
  { value: 'stripped_wood', label: 'Stripped wood' },
  { value: 'planks', label: 'Planks' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'slab', label: 'Slab' },
  { value: 'fence', label: 'Fence' },
  { value: 'fence_gate', label: 'Fence gate' },
  { value: 'door', label: 'Door' },
  { value: 'trapdoor', label: 'Trapdoor' },
  { value: 'button', label: 'Button' },
  { value: 'pressure_plate', label: 'Pressure plate' },
  { value: 'leaves', label: 'Leaves' },
  { value: 'sapling', label: 'Sapling' },
] as const);

/** A member's value. */
type Member = (typeof WOOD_SET_MEMBERS)[number]['value'];

/** The wooden set types (ADR 0067 D2) and the sound type their blocks make. */
const SET_TYPES: readonly { value: string; label: string; sound: string }[] = [
  { value: 'wood', label: 'Oak-like wood', sound: 'wood' },
  { value: 'cherry', label: 'Cherry', sound: 'cherry_wood' },
  { value: 'bamboo', label: 'Bamboo', sound: 'bamboo_wood' },
  { value: 'crimson', label: 'Crimson', sound: 'nether_wood' },
  { value: 'warped', label: 'Warped', sound: 'nether_wood' },
];

/** The fence gate wood types (ADR 0067 D2): their open and close sounds. */
const WOOD_TYPES: readonly { value: string; label: string }[] = [
  { value: 'oak', label: 'Oak' },
  { value: 'spruce', label: 'Spruce' },
  { value: 'birch', label: 'Birch' },
  { value: 'acacia', label: 'Acacia' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'dark_oak', label: 'Dark oak' },
  { value: 'pale_oak', label: 'Pale oak' },
  { value: 'mangrove', label: 'Mangrove' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'warped', label: 'Warped' },
  { value: 'bamboo', label: 'Bamboo' },
];

/** The tree shapes: vanilla trunk and foliage placer pairs. */
const TREE_SHAPES: readonly { value: string; label: string }[] = [
  { value: 'straight', label: 'Straight, as an oak' },
  { value: 'fancy', label: 'Tall and branching, as a big oak' },
  { value: 'forking', label: 'Forking, as an acacia' },
  { value: 'cherry', label: 'Wide and hanging, as a cherry' },
  { value: 'dark_oak', label: 'Two by two, as a dark oak' },
];

/** The biomes the tree can grow in. */
const BIOMES: readonly { tag: string; label: string }[] = [
  { tag: '#minecraft:is_forest', label: 'Forests' },
  { tag: '#minecraft:is_taiga', label: 'Taigas' },
  { tag: '#minecraft:is_jungle', label: 'Jungles' },
  { tag: '#minecraft:is_savanna', label: 'Savannas' },
  { tag: '#minecraft:is_overworld', label: 'Every overworld biome' },
];

/** The textures of a wood set: parameter id, label, pattern and whether it is leafy. */
const PICTURES: readonly {
  id: string;
  label: string;
  pattern: PlaceholderPattern;
  leafy: boolean;
}[] = [
  { id: 'picture_bark', label: 'Bark (log and wood sides)', pattern: 'bark', leafy: false },
  { id: 'picture_log_top', label: 'Log end', pattern: 'log_top', leafy: false },
  { id: 'picture_stripped_log', label: 'Stripped log side', pattern: 'stripped_log', leafy: false },
  {
    id: 'picture_stripped_log_top',
    label: 'Stripped log end',
    pattern: 'stripped_log_top',
    leafy: false,
  },
  { id: 'picture_planks', label: 'Planks', pattern: 'planks', leafy: false },
  { id: 'picture_door_top', label: 'Door, top half', pattern: 'door_top', leafy: false },
  { id: 'picture_door_bottom', label: 'Door, bottom half', pattern: 'door_bottom', leafy: false },
  { id: 'picture_trapdoor', label: 'Trapdoor', pattern: 'trapdoor', leafy: false },
  { id: 'picture_leaves', label: 'Leaves', pattern: 'leaves', leafy: true },
  { id: 'picture_sapling', label: 'Sapling', pattern: 'sapling', leafy: true },
];

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 256;

/** The largest picture file the flow accepts, in bytes (1 MB). */
const PICTURE_MAX_BYTES = 1_048_576;

/** The Wood set's questions, groups "Wood", "Members", "Tree" and "Pictures". */
export const WOOD_SET_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'wood_name',
    label: 'Wood name',
    description:
      'The name of the wood. Ids derive from it: Maple gives maple_log, maple_planks and maple_tree.',
    group: 'Wood',
    type: 'string',
    default: 'Maple',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Wood colour',
    description:
      'The colour of the placeholder planks; the bark is drawn in darker shades of it, the stripped wood in lighter ones.',
    group: 'Wood',
    type: 'colour',
    default: hexFromRgb(COLOURS.wood),
  },
  {
    id: 'leaf_colour',
    label: 'Leaf colour',
    description: 'The colour of the placeholder leaves and sapling.',
    group: 'Wood',
    type: 'colour',
    default: hexFromRgb(COLOURS.amber),
  },
  {
    id: 'members',
    label: 'Blocks in the set',
    description:
      'The sapling and the tree need the log and the leaves. Stairs, slab, fence, gate, door, trapdoor, button and pressure plate are crafted from the planks.',
    group: 'Members',
    type: 'set',
    default: WOOD_SET_MEMBERS.map((member) => member.value),
    choices: WOOD_SET_MEMBERS.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'set_type',
    label: 'Kind of wood',
    description:
      'Picks the sounds of every block and of the door, trapdoor, button and pressure plate, as the vanilla wood of that kind.',
    group: 'Members',
    type: 'choice',
    default: 'wood',
    choices: SET_TYPES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'wood_type',
    label: 'Fence gate sounds',
    description:
      'The vanilla wood whose fence gate sounds the gate makes when it opens and closes.',
    group: 'Members',
    type: 'choice',
    default: 'oak',
    choices: WOOD_TYPES.map((entry) => ({ ...entry })),
  },
  {
    id: 'leaf_tint',
    label: 'Leaf colour in the world',
    description:
      'Own colours keep the leaf texture as drawn. Biome foliage tints a grey texture with the biome colour, as oak leaves are (shown in the game only, not in the app).',
    group: 'Tree',
    type: 'choice',
    default: 'none',
    choices: [
      { value: 'none', label: 'Own colours' },
      { value: 'foliage', label: 'Biome foliage colour' },
    ],
  },
  {
    id: 'tree_shape',
    label: 'Tree shape',
    description:
      'The shape the sapling grows into. A two by two tree grows from four saplings in a square; a single sapling grows a straight tree.',
    group: 'Tree',
    type: 'choice',
    default: 'straight',
    choices: TREE_SHAPES.map((entry) => ({ ...entry })),
  },
  {
    id: 'grows',
    label: 'Grows in the world',
    description:
      'The tree also grows in the biomes below, in newly generated chunks only. Needs the Fabric mod jar export.',
    group: 'Tree',
    type: 'boolean',
    default: true,
  },
  {
    id: 'biomes',
    label: 'Biomes',
    group: 'Tree',
    type: 'choice',
    default: BIOMES[0]?.tag ?? '#minecraft:is_forest',
    choices: BIOMES.map(({ tag, label }) => ({ value: tag, label })),
  },
  {
    id: 'trees_per_chunk',
    label: 'Trees per chunk',
    description:
      'How many trees each chunk of those biomes tries to grow (a forest has about ten).',
    group: 'Tree',
    type: 'number',
    default: 2,
    min: 1,
    max: 16,
    step: 1,
  },
  ...PICTURES.map(
    (picture): StarterParameter => ({
      id: picture.id,
      label: picture.label,
      description: `A square PNG for this texture (16 by 16 as vanilla, up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}). Leave it empty for a placeholder in the ${picture.leafy ? 'leaf' : 'wood'} colour.`,
      group: 'Pictures',
      type: 'image',
      default: null,
      maxBytes: PICTURE_MAX_BYTES,
      maxSize: PICTURE_MAX_SIZE,
    }),
  ),
]);

/** The ids, display names and texture ids of a wood set. */
interface WoodIds {
  name: NameForms;
  block: Record<Member, ResourceLocation>;
  display: Record<Member, string>;
  texture: Record<string, ResourceLocation>;
  logsTag: ResourceLocation;
  tree: ResourceLocation;
  megaTree: ResourceLocation;
  placed: ResourceLocation;
  addition: ResourceLocation;
}

function woodIds(namespace: string, name: NameForms): WoodIds {
  const w = name.id;
  const d = name.display;
  const paths: Record<Member, string> = {
    log: `${w}_log`,
    wood: `${w}_wood`,
    stripped_log: `stripped_${w}_log`,
    stripped_wood: `stripped_${w}_wood`,
    planks: `${w}_planks`,
    stairs: `${w}_stairs`,
    slab: `${w}_slab`,
    fence: `${w}_fence`,
    fence_gate: `${w}_fence_gate`,
    door: `${w}_door`,
    trapdoor: `${w}_trapdoor`,
    button: `${w}_button`,
    pressure_plate: `${w}_pressure_plate`,
    leaves: `${w}_leaves`,
    sapling: `${w}_sapling`,
  };
  const display: Record<Member, string> = {
    log: `${d} Log`,
    wood: `${d} Wood`,
    stripped_log: `Stripped ${d} Log`,
    stripped_wood: `Stripped ${d} Wood`,
    planks: `${d} Planks`,
    stairs: `${d} Stairs`,
    slab: `${d} Slab`,
    fence: `${d} Fence`,
    fence_gate: `${d} Fence Gate`,
    door: `${d} Door`,
    trapdoor: `${d} Trapdoor`,
    button: `${d} Button`,
    pressure_plate: `${d} Pressure Plate`,
    leaves: `${d} Leaves`,
    sapling: `${d} Sapling`,
  };
  const block = Object.fromEntries(
    Object.entries(paths).map(([member, path]) => [member, rl(namespace, path)]),
  ) as Record<Member, ResourceLocation>;
  const texture: Record<string, ResourceLocation> = {
    picture_bark: rl(namespace, `block/${w}_log`),
    picture_log_top: rl(namespace, `block/${w}_log_top`),
    picture_stripped_log: rl(namespace, `block/stripped_${w}_log`),
    picture_stripped_log_top: rl(namespace, `block/stripped_${w}_log_top`),
    picture_planks: rl(namespace, `block/${w}_planks`),
    picture_door_top: rl(namespace, `block/${w}_door_top`),
    picture_door_bottom: rl(namespace, `block/${w}_door_bottom`),
    picture_trapdoor: rl(namespace, `block/${w}_trapdoor`),
    picture_leaves: rl(namespace, `block/${w}_leaves`),
    picture_sapling: rl(namespace, `block/${w}_sapling`),
  };
  return {
    name,
    block,
    display,
    texture,
    logsTag: rl(namespace, `${w}_logs`),
    tree: rl(namespace, `${w}_tree`),
    megaTree: rl(namespace, `${w}_mega_tree`),
    placed: rl(namespace, `${w}_tree_placed`),
    addition: rl(namespace, `${w}_trees`),
  };
}

/** Vanilla's planks: hardness 2, resistance 3, faster with an axe, dropped by hand. */
const PLANKS_BREAKABLE: JsonObject = {
  hardness: 2,
  resistance: 3,
  tool: 'axe',
  requires_tool: false,
};
/** Vanilla's logs: hardness and resistance 2. */
const LOG_BREAKABLE: JsonObject = { hardness: 2, resistance: 2, tool: 'axe', requires_tool: false };
/** Vanilla's wooden doors and trapdoors: hardness and resistance 3. */
const DOOR_BREAKABLE: JsonObject = {
  hardness: 3,
  resistance: 3,
  tool: 'axe',
  requires_tool: false,
};
/** Vanilla's wooden buttons and pressure plates: hardness and resistance 0.5. */
const SMALL_BREAKABLE: JsonObject = {
  hardness: 0.5,
  resistance: 0.5,
  tool: 'axe',
  requires_tool: false,
};

/** Fire odds as vanilla's `FireBlock.setFlammable(block, burn_odds, ignite_odds)`. */
const PLANKS_FIRE: JsonObject = { burn_odds: 5, ignite_odds: 20 };
const LOG_FIRE: JsonObject = { burn_odds: 5, ignite_odds: 5 };
const LEAVES_FIRE: JsonObject = { burn_odds: 30, ignite_odds: 60 };
/** Lava ignites it, fire does not spread to it (vanilla's wooden doors, trapdoors and plates). */
const LAVA_ONLY_FIRE: JsonObject = { burn_odds: 0, ignite_odds: 0 };

/** The grey a foliage-tinted leaf texture is drawn in, so the biome colour shows true. */
const TINTABLE_GREY: Rgb = [176, 176, 176];

export function woodSetBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(WOOD_SET_PARAMETERS, context);
  const ids = woodIds(namespace, nameForms(stringValue(values, 'wood_name')));
  const { name } = ids;
  const woodColour = rgbFromHex(stringValue(values, 'colour'), COLOURS.wood);
  const leafColour = rgbFromHex(stringValue(values, 'leaf_colour'), COLOURS.amber);
  const chosen = new Set(setValue(values, 'members') as readonly Member[]);
  const has = (member: Member): boolean => chosen.has(member);
  const setType =
    SET_TYPES.find((entry) => entry.value === stringValue(values, 'set_type')) ??
    (SET_TYPES[0] as (typeof SET_TYPES)[number]);
  const sound = setType.sound;
  const woodType = stringValue(values, 'wood_type');
  const tinted = stringValue(values, 'leaf_tint') === 'foliage';
  const shape = stringValue(values, 'tree_shape');
  const hasTree = has('log') && has('leaves');
  const hasSapling = hasTree && has('sapling');
  const grows = hasTree && booleanValue(values, 'grows');
  const logMembers = (['log', 'wood', 'stripped_log', 'stripped_wood'] as const).filter(has);

  const elements: ContentBundleElement[] = [];
  const used = new Set<string>();
  const tex = (picture: string): string => {
    used.add(picture);
    return ids.texture[picture] as string;
  };
  const block = (member: Member, data: JsonObject, notes: string): void => {
    elements.push(
      element(
        ids.block[member],
        KINDS.block,
        { format: 1, display_name: ids.display[member], ...data },
        notes,
      ),
    );
  };
  const buildingTab = { creative_tab: 'minecraft:building_blocks' };
  const planksTexture = (): string => tex('picture_planks');

  // Logs and wood ------------------------------------------------------------------------
  const strippable = (into: Member): JsonObject =>
    has(into) ? { 'msm:strippable': { into: ids.block[into] } } : {};
  if (has('log')) {
    block(
      'log',
      {
        type: 'pillar',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { side: tex('picture_bark'), end: tex('picture_log_top') },
        components: {
          'msm:breakable': { ...LOG_BREAKABLE },
          'msm:flammable': { ...LOG_FIRE },
          ...strippable('stripped_log'),
        },
      },
      `The ${name.lower} log: a pillar that turns to the face you place it against, bark on the sides and rings on the ends.${has('stripped_log') ? ' An axe strips it into the stripped log (msm:strippable).' : ''} It burns as vanilla logs do, and the block tag minecraft:logs keeps the ${name.lower} leaves from decaying next to it.`,
    );
  }
  if (has('wood')) {
    block(
      'wood',
      {
        type: 'pillar',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { side: tex('picture_bark'), end: tex('picture_bark') },
        components: {
          'msm:breakable': { ...LOG_BREAKABLE },
          'msm:flammable': { ...LOG_FIRE },
          ...strippable('stripped_wood'),
        },
      },
      `${name.display} wood: a log with bark on every side, as vanilla oak wood.${has('stripped_wood') ? ' An axe strips it into stripped wood.' : ''}`,
    );
  }
  if (has('stripped_log')) {
    block(
      'stripped_log',
      {
        type: 'pillar',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { side: tex('picture_stripped_log'), end: tex('picture_stripped_log_top') },
        components: { 'msm:breakable': { ...LOG_BREAKABLE }, 'msm:flammable': { ...LOG_FIRE } },
      },
      `The stripped ${name.lower} log, what an axe leaves of the log. It keeps the log's axis.`,
    );
  }
  if (has('stripped_wood')) {
    block(
      'stripped_wood',
      {
        type: 'pillar',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { side: tex('picture_stripped_log'), end: tex('picture_stripped_log') },
        components: { 'msm:breakable': { ...LOG_BREAKABLE }, 'msm:flammable': { ...LOG_FIRE } },
      },
      `Stripped ${name.lower} wood: the stripped side on every face.`,
    );
  }

  // Planks and what is made of them ------------------------------------------------------
  const planksModel = rl(namespace, `block/${name.id}_planks`);
  if (has('planks')) {
    block(
      'planks',
      {
        model: planksModel,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        components: {
          'msm:breakable': { ...PLANKS_BREAKABLE },
          'msm:flammable': { ...PLANKS_FIRE },
        },
      },
      `${name.display} planks, a plain full block with the cube model below. They count as planks for vanilla recipes (crafting tables, sticks, chests) through the item tag minecraft:planks.`,
    );
    elements.push(
      element(
        planksModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: planksTexture() } },
        `A full cube drawn from textures/block/${name.id}_planks.png. The stairs, slab, fence, gate, button and pressure plate use the same texture, so repainting it restyles them all.`,
      ),
    );
  }
  const planksTextures = (): JsonObject => ({ all: planksTexture() });
  if (has('stairs')) {
    block(
      'stairs',
      {
        type: 'stairs',
        base_block: has('planks') ? ids.block.planks : 'minecraft:oak_planks',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: planksTextures(),
        components: {
          'msm:breakable': { ...PLANKS_BREAKABLE },
          'msm:flammable': { ...PLANKS_FIRE },
        },
      },
      `${name.display} stairs: they form corners next to other stairs and copy the behaviour of their base block, ${has('planks') ? 'the planks' : 'vanilla oak planks'}.`,
    );
  }
  if (has('slab')) {
    block(
      'slab',
      {
        type: 'slab',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: planksTextures(),
        components: {
          'msm:breakable': { ...PLANKS_BREAKABLE },
          'msm:flammable': { ...PLANKS_FIRE },
        },
      },
      `A ${name.lower} slab: two stack into a double slab, which drops two.`,
    );
  }
  if (has('fence')) {
    block(
      'fence',
      {
        type: 'fence',
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { texture: planksTexture() },
        components: {
          'msm:breakable': { ...PLANKS_BREAKABLE },
          'msm:flammable': { ...PLANKS_FIRE },
        },
      },
      `A ${name.lower} fence. Its wood sound puts it in #minecraft:wooden_fences, so it connects to every wooden fence.`,
    );
  }
  if (has('fence_gate')) {
    block(
      'fence_gate',
      {
        type: 'fence_gate',
        wood_type: woodType,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { texture: planksTexture() },
        components: {
          'msm:breakable': { ...PLANKS_BREAKABLE },
          'msm:flammable': { ...PLANKS_FIRE },
        },
      },
      `A ${name.lower} fence gate. It opens by hand or with redstone and makes the ${woodType.replace('_', ' ')} gate sounds.`,
    );
  }
  if (has('door')) {
    block(
      'door',
      {
        type: 'door',
        set_type: setType.value,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { top: tex('picture_door_top'), bottom: tex('picture_door_bottom') },
        components: {
          'msm:breakable': { ...DOOR_BREAKABLE },
          'msm:flammable': { ...LAVA_ONLY_FIRE },
        },
      },
      `A two-block-high ${name.lower} door that opens by hand or with redstone. Breaking either half drops one door. msm:flammable with odds of 0 lets lava set it alight as vanilla wooden doors, while fire does not spread to it.`,
    );
  }
  if (has('trapdoor')) {
    block(
      'trapdoor',
      {
        type: 'trapdoor',
        set_type: setType.value,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { texture: tex('picture_trapdoor') },
        components: {
          'msm:breakable': { ...DOOR_BREAKABLE },
          'msm:flammable': { ...LAVA_ONLY_FIRE },
        },
      },
      `A ${name.lower} trapdoor that opens by hand or with redstone.`,
    );
  }
  if (has('button')) {
    block(
      'button',
      {
        type: 'button',
        set_type: setType.value,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { texture: planksTexture() },
        components: { 'msm:breakable': { ...SMALL_BREAKABLE } },
      },
      `A ${name.lower} button: a redstone pulse of a second and a half, and arrows press it, as vanilla wooden buttons.`,
    );
  }
  if (has('pressure_plate')) {
    block(
      'pressure_plate',
      {
        type: 'pressure_plate',
        set_type: setType.value,
        sound_type: sound,
        loot: 'self',
        item: { ...buildingTab },
        textures: { texture: planksTexture() },
        components: {
          'msm:breakable': { ...SMALL_BREAKABLE },
          'msm:flammable': { ...LAVA_ONLY_FIRE },
        },
      },
      `A ${name.lower} pressure plate: any entity on it, dropped items too, gives a redstone signal.`,
    );
  }

  // Leaves, sapling and the tree ---------------------------------------------------------
  if (has('leaves')) {
    const drops: JsonObject = {};
    if (hasSapling) drops.sapling = ids.block.sapling;
    const data: JsonObject = {
      type: 'leaves',
      sound_type: 'grass',
      textures: { all: tex('picture_leaves') },
      loot: 'leaves',
      leaves_drops: drops,
      item: { creative_tab: 'minecraft:natural_blocks', compost: '30%' },
      components: {
        'msm:breakable': { hardness: 0.2, resistance: 0.2 },
        'msm:flammable': { ...LEAVES_FIRE },
      },
    };
    if (tinted) data.tint = 'foliage';
    block(
      'leaves',
      data,
      `${name.display} leaves. They decay when no block of #minecraft:logs is near, drop themselves to shears or Silk Touch, and otherwise now and then ${hasSapling ? 'a sapling and ' : ''}sticks (the leaves loot preset). ${tinted ? 'The biome foliage colour tints them in the game (the app shows the grey texture).' : 'They keep the colours of their texture.'} They compost at 30%.`,
    );
  }
  if (hasSapling) {
    const data: JsonObject = {
      type: 'sapling',
      tree: ids.tree,
      sound_type: 'grass',
      loot: 'self',
      textures: { sapling: tex('picture_sapling') },
      item: { creative_tab: 'minecraft:natural_blocks', compost: '30%' },
      components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
    };
    if (shape === 'dark_oak') data.mega_tree = ids.megaTree;
    block(
      'sapling',
      data,
      `A ${name.lower} sapling. It grows into the tree ${ids.tree} by itself or with bone meal${shape === 'dark_oak' ? `, and four in a square grow the two by two tree ${ids.megaTree}` : ''}. It composts at 30%.`,
    );
  }
  if (hasTree) elements.push(...treeElements(ids, shape));
  if (grows) elements.push(...growthElements(ids, values, shape, hasSapling));

  // Recipes ------------------------------------------------------------------------------
  elements.push(...recipes(namespace, ids, has, logMembers.length > 0));

  // Tags ---------------------------------------------------------------------------------
  if (logMembers.length > 0) {
    const logIds = logMembers.map((member) => ids.block[member]);
    elements.push(
      element(
        ids.logsTag,
        KINDS.tagItem,
        { values: logIds },
        `The ${name.lower} logs as items, as vanilla's #minecraft:oak_logs: the planks recipe takes any of them.`,
      ),
      element(
        'minecraft:logs_that_burn',
        KINDS.tagItem,
        { values: [`#${ids.logsTag}`] },
        'Adds the logs to the vanilla item tag of logs that burn, which minecraft:logs includes: they smelt into charcoal, fuel furnaces and count as logs in vanilla recipes. Tags are merged with the vanilla ones.',
      ),
      element(
        'minecraft:logs',
        KINDS.tagBlock,
        { values: logIds },
        'Adds the log blocks to the vanilla block tag of logs: leaves near them do not decay. An element id is either a block tag or an item tag, so the item side goes through minecraft:logs_that_burn.',
      ),
    );
  }
  if (has('planks')) {
    elements.push(
      element(
        'minecraft:planks',
        KINDS.tagItem,
        { values: [ids.block.planks] },
        'Adds the planks to the vanilla item tag of planks, so vanilla recipes (sticks, crafting table, chest) and furnaces accept them.',
      ),
    );
  }
  if (has('stairs')) {
    elements.push(
      element(
        'minecraft:wooden_stairs',
        KINDS.tagItem,
        { values: [ids.block.stairs] },
        'Adds the stairs to the vanilla wooden stairs item tag, so they burn in a furnace.',
      ),
    );
  }
  if (has('slab')) {
    elements.push(
      element(
        'minecraft:wooden_slabs',
        KINDS.tagItem,
        { values: [ids.block.slab] },
        'Adds the slab to the vanilla wooden slabs item tag, so it burns in a furnace.',
      ),
    );
  }

  const contents = `${name.lower} ${has('log') ? 'logs, ' : ''}planks and building blocks`;
  return {
    elements: [
      packElement(namespace, `${projectName}: a ${name.lower} wood set`, PACK_NOTES),
      modElement(namespace, projectName, `Adds a ${name.lower} wood set: ${contents}.`),
      ...elements,
    ],
    assets: PICTURES.filter((picture) => used.has(picture.id)).map(
      (picture): ContentBundleAsset =>
        pictureTexture(
          namespace,
          (ids.texture[picture.id] as string).slice(namespace.length + 1),
          imageValue(values, picture.id),
          picture.pattern,
          picture.leafy
            ? picture.id === 'picture_leaves' && tinted
              ? TINTABLE_GREY
              : leafColour
            : woodColour,
        ),
    ),
  };
}

/** The tree placers of each shape (vanilla's oak, fancy oak, acacia, cherry and dark oak). */
function treeShape(shape: string): JsonObject {
  switch (shape) {
    case 'fancy':
      return {
        minimum_size: {
          type: 'minecraft:two_layers_feature_size',
          limit: 0,
          min_clipped_height: 4,
          upper_size: 0,
        },
        trunk_placer: {
          type: 'minecraft:fancy_trunk_placer',
          base_height: 3,
          height_rand_a: 11,
          height_rand_b: 0,
        },
        foliage_placer: { type: 'minecraft:fancy_foliage_placer', radius: 2, offset: 4, height: 4 },
      };
    case 'forking':
      return {
        minimum_size: { type: 'minecraft:two_layers_feature_size', upper_size: 2 },
        trunk_placer: {
          type: 'minecraft:forking_trunk_placer',
          base_height: 5,
          height_rand_a: 2,
          height_rand_b: 2,
        },
        foliage_placer: { type: 'minecraft:acacia_foliage_placer', radius: 2, offset: 0 },
      };
    case 'cherry':
      return {
        minimum_size: { type: 'minecraft:two_layers_feature_size', upper_size: 2 },
        trunk_placer: {
          type: 'minecraft:cherry_trunk_placer',
          base_height: 7,
          height_rand_a: 1,
          height_rand_b: 0,
          branch_count: {
            type: 'minecraft:weighted_list',
            distribution: [
              { data: 1, weight: 1 },
              { data: 2, weight: 1 },
              { data: 3, weight: 1 },
            ],
          },
          branch_horizontal_length: {
            type: 'minecraft:uniform',
            min_inclusive: 2,
            max_inclusive: 4,
          },
          branch_start_offset_from_top: { min_inclusive: -4, max_inclusive: -3 },
          branch_end_offset_from_top: {
            type: 'minecraft:uniform',
            min_inclusive: -1,
            max_inclusive: 0,
          },
        },
        foliage_placer: {
          type: 'minecraft:cherry_foliage_placer',
          radius: 4,
          offset: 0,
          height: 5,
          wide_bottom_layer_hole_chance: 0.25,
          corner_hole_chance: 0.25,
          hanging_leaves_chance: 0.16666667,
          hanging_leaves_extension_chance: 0.33333334,
        },
      };
    case 'dark_oak':
      return {
        minimum_size: { type: 'minecraft:three_layers_feature_size', upper_size: 2 },
        trunk_placer: {
          type: 'minecraft:dark_oak_trunk_placer',
          base_height: 6,
          height_rand_a: 2,
          height_rand_b: 1,
        },
        foliage_placer: { type: 'minecraft:dark_oak_foliage_placer', radius: 0, offset: 0 },
      };
    default:
      return {
        minimum_size: { type: 'minecraft:two_layers_feature_size' },
        trunk_placer: {
          type: 'minecraft:straight_trunk_placer',
          base_height: 4,
          height_rand_a: 2,
          height_rand_b: 0,
        },
        foliage_placer: { type: 'minecraft:blob_foliage_placer', radius: 2, offset: 0, height: 3 },
      };
  }
}

/** A tree feature of `shape` from the set's log and leaves, as the "Tree for a sapling" template. */
function treeData(ids: WoodIds, shape: string): JsonObject {
  return {
    type: 'minecraft:tree',
    ignore_vines: true,
    below_trunk_provider: 'minecraft:soil_beneath_tree',
    trunk_provider: { id: ids.block.log },
    foliage_provider: {
      id: ids.block.leaves,
      properties: { distance: '7', persistent: 'false' },
    },
    ...treeShape(shape),
    decorators: [],
  };
}

/** The tree (and for a two by two shape the big tree) the sapling grows. */
function treeElements(ids: WoodIds, shape: string): ContentBundleElement[] {
  const label = TREE_SHAPES.find((entry) => entry.value === shape)?.label.toLowerCase();
  const out = [
    element(
      ids.tree,
      KINDS.feature,
      treeData(ids, shape === 'dark_oak' ? 'straight' : shape),
      `The ${ids.name.lower} tree: a configured tree feature of the ${ids.name.lower} log and leaves (${shape === 'dark_oak' ? 'straight, as an oak' : label}). The leaves are placed with distance 7 and persistent false, so they decay once the log is cut. Open it in the Tree Studio to change the trunk and foliage shapes.`,
    ),
  ];
  if (shape === 'dark_oak') {
    out.push(
      element(
        ids.megaTree,
        KINDS.feature,
        treeData(ids, 'dark_oak'),
        `The two by two ${ids.name.lower} tree, as a dark oak: four saplings in a square grow it.`,
      ),
    );
  }
  return out;
}

/** The placed feature and the biome addition that grow the tree in the world (ADR 0060). */
function growthElements(
  ids: WoodIds,
  values: ParameterValues,
  shape: string,
  hasSapling: boolean,
): ContentBundleElement[] {
  const biome =
    BIOMES.find((entry) => entry.tag === stringValue(values, 'biomes')) ??
    (BIOMES[0] as (typeof BIOMES)[number]);
  const count = Math.round(numberValue(values, 'trees_per_chunk'));
  const survivor = hasSapling ? ids.block.sapling : 'minecraft:oak_sapling';
  const feature = shape === 'dark_oak' ? ids.megaTree : ids.tree;
  return [
    element(
      ids.placed,
      KINDS.placedFeature,
      {
        feature,
        placement: [
          { type: 'minecraft:count', count },
          { type: 'minecraft:in_square' },
          { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
          { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
          {
            type: 'minecraft:block_predicate_filter',
            predicate: { type: 'minecraft:would_survive', state: survivor },
          },
          { type: 'minecraft:biome' },
        ],
      },
      `Where the tree grows: ${count} ${count === 1 ? 'try' : 'tries'} per chunk on the surface, out of water, only where ${hasSapling ? 'the sapling' : 'an oak sapling'} would survive. The world addition ${ids.addition} lists it in the biomes.`,
    ),
    element(
      ids.addition,
      KINDS.biomeAddition,
      {
        format: 1,
        biomes: [biome.tag],
        features: [{ feature: ids.placed, step: 'vegetal_decoration' }],
      },
      `A world addition: it adds the placed tree to ${biome.label.toLowerCase()} at the vegetal decoration step, as vanilla trees are, without replacing any vanilla file. Only newly generated chunks get the trees. It needs the Fabric mod jar export.`,
    ),
  ];
}

/** The vanilla recipes of the set, in vanilla's shapes and groups. */
function recipes(
  namespace: string,
  ids: WoodIds,
  has: (member: Member) => boolean,
  hasLogs: boolean,
): ContentBundleElement[] {
  const w = ids.name.id;
  const out: ContentBundleElement[] = [];
  const planks = ids.block.planks;
  const shaped = (
    path: string,
    member: Member,
    category: string | undefined,
    group: string,
    pattern: string[],
    key: JsonObject,
    count: number,
    notes: string,
  ): void => {
    const data: JsonObject = { type: 'minecraft:crafting_shaped' };
    if (category !== undefined) data.category = category;
    data.group = group;
    data.key = key;
    data.pattern = pattern;
    data.result = count === 1 ? { id: ids.block[member] } : { count, id: ids.block[member] };
    out.push(element(rl(namespace, path), KINDS.recipe, data, notes));
  };
  if (has('planks') && hasLogs) {
    out.push(
      element(
        rl(namespace, `${w}_planks_from_logs`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'building',
          group: 'planks',
          ingredients: [`#${ids.logsTag}`],
          result: { count: 4, id: planks },
        },
        `Any ${ids.name.lower} log or wood makes four planks. Recipe ids cannot share their result's id, hence _from_logs.`,
      ),
    );
  }
  if (has('log') && has('wood')) {
    shaped(
      `${w}_wood_from_logs`,
      'wood',
      'building',
      'bark',
      ['##', '##'],
      { '#': ids.block.log },
      3,
      'Four logs make three wood.',
    );
  }
  if (has('stripped_log') && has('stripped_wood')) {
    shaped(
      `stripped_${w}_wood_from_logs`,
      'stripped_wood',
      'building',
      'bark',
      ['##', '##'],
      { '#': ids.block.stripped_log },
      3,
      'Four stripped logs make three stripped wood.',
    );
  }
  if (!has('planks')) return out;
  const fromPlanks = (member: Member): string =>
    `${ids.block[member].slice(namespace.length + 1)}_from_planks`;
  if (has('stairs')) {
    shaped(
      fromPlanks('stairs'),
      'stairs',
      'building',
      'wooden_stairs',
      ['#  ', '## ', '###'],
      { '#': planks },
      4,
      'Six planks make four stairs.',
    );
  }
  if (has('slab')) {
    shaped(
      fromPlanks('slab'),
      'slab',
      'building',
      'wooden_slab',
      ['###'],
      { '#': planks },
      6,
      'Three planks make six slabs.',
    );
  }
  if (has('fence')) {
    shaped(
      fromPlanks('fence'),
      'fence',
      undefined,
      'wooden_fence',
      ['W#W', 'W#W'],
      { '#': 'minecraft:stick', W: planks },
      3,
      'Four planks and two sticks make three fences (no category, as vanilla).',
    );
  }
  if (has('fence_gate')) {
    shaped(
      fromPlanks('fence_gate'),
      'fence_gate',
      'redstone',
      'wooden_fence_gate',
      ['#W#', '#W#'],
      { '#': 'minecraft:stick', W: planks },
      1,
      'Two planks and four sticks make a fence gate.',
    );
  }
  if (has('door')) {
    shaped(
      fromPlanks('door'),
      'door',
      'redstone',
      'wooden_door',
      ['##', '##', '##'],
      { '#': planks },
      3,
      'Six planks make three doors.',
    );
  }
  if (has('trapdoor')) {
    shaped(
      fromPlanks('trapdoor'),
      'trapdoor',
      'redstone',
      'wooden_trapdoor',
      ['###', '###'],
      { '#': planks },
      2,
      'Six planks make two trapdoors.',
    );
  }
  if (has('button')) {
    out.push(
      element(
        rl(namespace, fromPlanks('button')),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'redstone',
          group: 'wooden_button',
          ingredients: [planks],
          result: { id: ids.block.button },
        },
        'One plank makes a button.',
      ),
    );
  }
  if (has('pressure_plate')) {
    shaped(
      fromPlanks('pressure_plate'),
      'pressure_plate',
      'redstone',
      'wooden_pressure_plate',
      ['##'],
      { '#': planks },
      1,
      'Two planks make a pressure plate.',
    );
  }
  return out;
}
