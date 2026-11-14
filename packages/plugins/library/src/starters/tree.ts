/**
 * The Tree Creator flow (ADR 0069 D1, D2; ADR 0068 D4, D5): a sapling that grows a tree of its
 * own, without the building blocks of a wood set. The log and the leaves are new blocks or
 * vanilla ones; the sapling is always new. Output: the log (`pillar`) and leaves (`leaves`)
 * when new, the sapling (`sapling`), the tree (`minecraft:worldgen/feature` of type
 * `minecraft:tree`, two for the two by two shape) and, with "Grows in the world", a placed
 * feature and an `msm:biome_addition` (ADR 0060).
 *
 * Ids derive from `tree_name` by the "Tree for a sapling" template's rule: the tree
 * `<base>_tree` grows `<base>_log` and `<base>_leaves`, and the sapling is `<base>_sapling`.
 * The tree shapes, biomes and vanilla numbers are the Wood set's (`wood-set.ts`), so a tree made
 * here grows as the same shape there. A new log joins the block tag `minecraft:logs` (leaves
 * near it do not decay) and the item tag `minecraft:logs_that_burn` (charcoal and fuel); new
 * leaves drop the sapling (the `leaves` loot preset), vanilla leaves keep their own drops.
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
  booleanValue,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import {
  BIOMES,
  LEAVES_FIRE,
  LOG_BREAKABLE,
  LOG_FIRE,
  PICTURE_MAX_BYTES,
  PICTURE_MAX_SIZE,
  TINTABLE_GREY,
  TREE_SHAPES,
  treeShape,
} from './wood-set';

/** The vanilla logs the tree can grow from, after the new one. */
const LOGS: readonly { value: string; label: string }[] = [
  { value: 'new', label: 'A new log' },
  { value: 'minecraft:oak_log', label: 'Oak log' },
  { value: 'minecraft:spruce_log', label: 'Spruce log' },
  { value: 'minecraft:birch_log', label: 'Birch log' },
  { value: 'minecraft:jungle_log', label: 'Jungle log' },
  { value: 'minecraft:acacia_log', label: 'Acacia log' },
  { value: 'minecraft:dark_oak_log', label: 'Dark oak log' },
  { value: 'minecraft:cherry_log', label: 'Cherry log' },
  { value: 'minecraft:pale_oak_log', label: 'Pale oak log' },
];

/** The vanilla leaves the tree can carry, after the new ones. */
const LEAVES: readonly { value: string; label: string }[] = [
  { value: 'new', label: 'New leaves' },
  { value: 'minecraft:oak_leaves', label: 'Oak leaves' },
  { value: 'minecraft:spruce_leaves', label: 'Spruce leaves' },
  { value: 'minecraft:birch_leaves', label: 'Birch leaves' },
  { value: 'minecraft:jungle_leaves', label: 'Jungle leaves' },
  { value: 'minecraft:acacia_leaves', label: 'Acacia leaves' },
  { value: 'minecraft:dark_oak_leaves', label: 'Dark oak leaves' },
  { value: 'minecraft:cherry_leaves', label: 'Cherry leaves' },
  { value: 'minecraft:azalea_leaves', label: 'Azalea leaves' },
  { value: 'minecraft:pale_oak_leaves', label: 'Pale oak leaves' },
];

/** The textures of a tree: parameter id, label, pattern, whether it is leafy, texture suffix. */
const PICTURES: readonly {
  id: string;
  label: string;
  pattern: PlaceholderPattern;
  leafy: boolean;
  suffix: string;
}[] = [
  { id: 'picture_bark', label: 'Bark (log sides)', pattern: 'bark', leafy: false, suffix: '_log' },
  { id: 'picture_log_top', label: 'Log end', pattern: 'log_top', leafy: false, suffix: '_log_top' },
  { id: 'picture_leaves', label: 'Leaves', pattern: 'leaves', leafy: true, suffix: '_leaves' },
  { id: 'picture_sapling', label: 'Sapling', pattern: 'sapling', leafy: true, suffix: '_sapling' },
];

/** The Tree's questions, groups "Tree", "Blocks", "World" and "Pictures". */
export const TREE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'tree_name',
    label: 'Tree name',
    description:
      'The name of the tree. Ids derive from it: Rowan gives rowan_sapling, rowan_tree, and rowan_log and rowan_leaves when they are new.',
    group: 'Tree',
    type: 'string',
    default: 'Rowan',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
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
    id: 'log',
    label: 'Trunk',
    description: 'A new log of its own, or a vanilla log.',
    group: 'Blocks',
    type: 'choice',
    default: 'new',
    choices: LOGS.map((entry) => ({ ...entry })),
  },
  {
    id: 'leaves',
    label: 'Leaves',
    description:
      'New leaves of their own, which drop the new sapling, or vanilla leaves, which keep their own drops.',
    group: 'Blocks',
    type: 'choice',
    default: 'new',
    choices: LEAVES.map((entry) => ({ ...entry })),
  },
  {
    id: 'colour',
    label: 'Wood colour',
    description: 'The colour of the placeholder bark and log end of a new log.',
    group: 'Blocks',
    type: 'colour',
    default: hexFromRgb(COLOURS.wood),
  },
  {
    id: 'leaf_colour',
    label: 'Leaf colour',
    description: 'The colour of the placeholder leaves and sapling.',
    group: 'Blocks',
    type: 'colour',
    default: hexFromRgb(COLOURS.jade),
  },
  {
    id: 'leaf_tint',
    label: 'Leaf colour in the world',
    description:
      'Own colours keep the leaf texture as drawn. Biome foliage tints a grey texture with the biome colour, as oak leaves are (shown in the game only, not in the app).',
    group: 'Blocks',
    type: 'choice',
    default: 'none',
    choices: [
      { value: 'none', label: 'Own colours' },
      { value: 'foliage', label: 'Biome foliage colour' },
    ],
  },
  {
    id: 'grows',
    label: 'Grows in the world',
    description:
      'The tree also grows in the biomes below, in newly generated chunks only. Needs the Fabric mod jar export.',
    group: 'World',
    type: 'boolean',
    default: true,
  },
  {
    id: 'biomes',
    label: 'Biomes',
    group: 'World',
    type: 'choice',
    default: BIOMES[0]?.tag ?? '#minecraft:is_forest',
    choices: BIOMES.map(({ tag, label }) => ({ value: tag, label })),
  },
  {
    id: 'trees_per_chunk',
    label: 'Trees per chunk',
    description:
      'How many trees each chunk of those biomes tries to grow (a forest has about ten).',
    group: 'World',
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

export function treeBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(TREE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'tree_name'));
  const base = name.id;
  const shape = stringValue(values, 'tree_shape');
  const woodColour = rgbFromHex(stringValue(values, 'colour'), COLOURS.wood);
  const leafColour = rgbFromHex(stringValue(values, 'leaf_colour'), COLOURS.jade);
  const logChoice = stringValue(values, 'log');
  const leavesChoice = stringValue(values, 'leaves');
  const newLog = logChoice === 'new';
  const newLeaves = leavesChoice === 'new';
  const tinted = newLeaves && stringValue(values, 'leaf_tint') === 'foliage';
  const grows = booleanValue(values, 'grows');

  const log: ResourceLocation = newLog
    ? rl(namespace, `${base}_log`)
    : (logChoice as ResourceLocation);
  const leaves: ResourceLocation = newLeaves
    ? rl(namespace, `${base}_leaves`)
    : (leavesChoice as ResourceLocation);
  const sapling = rl(namespace, `${base}_sapling`);
  const tree = rl(namespace, `${base}_tree`);
  const megaTree = rl(namespace, `${base}_mega_tree`);
  const placed = rl(namespace, `${base}_tree_placed`);
  const addition = rl(namespace, `${base}_trees`);
  const tex = (suffix: string) => rl(namespace, `block/${base}${suffix}`);
  const used = new Set<string>(['picture_sapling']);
  const logLabel = LOGS.find((entry) => entry.value === logChoice)?.label.toLowerCase();
  const leavesLabel = LEAVES.find((entry) => entry.value === leavesChoice)?.label.toLowerCase();

  const elements: ContentBundleElement[] = [];
  if (newLog) {
    used.add('picture_bark').add('picture_log_top');
    elements.push(
      element(
        log,
        KINDS.block,
        {
          format: 1,
          display_name: `${name.display} Log`,
          type: 'pillar',
          sound_type: 'wood',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          textures: { side: tex('_log'), end: tex('_log_top') },
          components: {
            'msm:breakable': { ...LOG_BREAKABLE },
            'msm:flammable': { ...LOG_FIRE },
          },
        },
        `The ${name.lower} log: a pillar that turns to the face you place it against, bark on the sides and rings on the ends. It burns as vanilla logs do, and the block tag minecraft:logs keeps the ${name.lower} leaves from decaying next to it.`,
      ),
    );
  }
  if (newLeaves) {
    used.add('picture_leaves');
    const data: JsonObject = {
      format: 1,
      display_name: `${name.display} Leaves`,
      type: 'leaves',
      sound_type: 'grass',
      textures: { all: tex('_leaves') },
      loot: 'leaves',
      leaves_drops: { sapling },
      item: { creative_tab: 'minecraft:natural_blocks', compost: '30%' },
      components: {
        'msm:breakable': { hardness: 0.2, resistance: 0.2 },
        'msm:flammable': { ...LEAVES_FIRE },
      },
    };
    if (tinted) data.tint = 'foliage';
    elements.push(
      element(
        leaves,
        KINDS.block,
        data,
        `${name.display} leaves. They decay when no block of #minecraft:logs is near, drop themselves to shears or Silk Touch, and otherwise now and then a sapling and sticks (the leaves loot preset). ${tinted ? 'The biome foliage colour tints them in the game (the app shows the grey texture).' : 'They keep the colours of their texture.'} They compost at 30%.`,
      ),
    );
  }
  const saplingData: JsonObject = {
    format: 1,
    display_name: `${name.display} Sapling`,
    type: 'sapling',
    tree,
    sound_type: 'grass',
    loot: 'self',
    textures: { sapling: tex('_sapling') },
    item: { creative_tab: 'minecraft:natural_blocks', compost: '30%' },
    components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
  };
  if (shape === 'dark_oak') saplingData.mega_tree = megaTree;
  elements.push(
    element(
      sapling,
      KINDS.block,
      saplingData,
      `A ${name.lower} sapling. It grows into the tree ${tree} by itself or with bone meal${shape === 'dark_oak' ? `, and four in a square grow the two by two tree ${megaTree}` : ''}.${newLeaves ? ' The new leaves drop it.' : ` The ${leavesLabel ?? 'vanilla leaves'} keep their own drops, so more saplings come only from the creative inventory or commands.`} It composts at 30%.`,
    ),
  );

  // The tree, as the Wood set's and the "Tree for a sapling" template's.
  const treeData = (treeShapeName: string): JsonObject => ({
    type: 'minecraft:tree',
    ignore_vines: true,
    below_trunk_provider: 'minecraft:soil_beneath_tree',
    trunk_provider: { id: log },
    foliage_provider: { id: leaves, properties: { distance: '7', persistent: 'false' } },
    ...treeShape(treeShapeName),
    decorators: [],
  });
  const shapeLabel = TREE_SHAPES.find((entry) => entry.value === shape)?.label.toLowerCase();
  elements.push(
    element(
      tree,
      KINDS.feature,
      treeData(shape === 'dark_oak' ? 'straight' : shape),
      `The ${name.lower} tree: a configured tree feature of the ${newLog ? `${name.lower} log` : logLabel} and the ${newLeaves ? `${name.lower} leaves` : leavesLabel} (${shape === 'dark_oak' ? 'straight, as an oak' : shapeLabel}). The leaves are placed with distance 7 and persistent false, so they decay once the log is cut. Open it in the Tree Studio to change the trunk and foliage shapes.`,
    ),
  );
  if (shape === 'dark_oak') {
    elements.push(
      element(
        megaTree,
        KINDS.feature,
        treeData('dark_oak'),
        `The two by two ${name.lower} tree, as a dark oak: four saplings in a square grow it.`,
      ),
    );
  }
  if (grows) {
    const biome =
      BIOMES.find((entry) => entry.tag === stringValue(values, 'biomes')) ??
      (BIOMES[0] as (typeof BIOMES)[number]);
    const count = Math.round(numberValue(values, 'trees_per_chunk'));
    elements.push(
      element(
        placed,
        KINDS.placedFeature,
        {
          feature: shape === 'dark_oak' ? megaTree : tree,
          placement: [
            { type: 'minecraft:count', count },
            { type: 'minecraft:in_square' },
            { type: 'minecraft:surface_water_depth_filter', max_water_depth: 0 },
            { type: 'minecraft:heightmap', heightmap: 'OCEAN_FLOOR' },
            {
              type: 'minecraft:block_predicate_filter',
              predicate: { type: 'minecraft:would_survive', state: sapling },
            },
            { type: 'minecraft:biome' },
          ],
        },
        `Where the tree grows: ${count} ${count === 1 ? 'try' : 'tries'} per chunk on the surface, out of water, only where the sapling would survive. The world addition ${addition} lists it in the biomes.`,
      ),
      element(
        addition,
        KINDS.biomeAddition,
        {
          format: 1,
          biomes: [biome.tag],
          features: [{ feature: placed, step: 'vegetal_decoration' }],
        },
        `A world addition: it adds the placed tree to ${biome.label.toLowerCase()} at the vegetal decoration step, as vanilla trees are, without replacing any vanilla file. Only newly generated chunks get the trees. It needs the Fabric mod jar export.`,
      ),
    );
  }
  if (newLog) {
    elements.push(
      element(
        'minecraft:logs',
        KINDS.tagBlock,
        { values: [log] },
        'Adds the log block to the vanilla block tag of logs: leaves near it do not decay. An element id is either a block tag or an item tag, so the item side goes through minecraft:logs_that_burn.',
      ),
      element(
        'minecraft:logs_that_burn',
        KINDS.tagItem,
        { values: [log] },
        'Adds the log to the vanilla item tag of logs that burn, which minecraft:logs includes: it smelts into charcoal and fuels furnaces. Tags are merged with the vanilla ones.',
      ),
    );
  }

  const parts = [newLog ? 'log' : undefined, newLeaves ? 'leaves' : undefined, 'sapling'].filter(
    (part): part is string => part !== undefined,
  );
  return {
    elements: [
      packElement(namespace, `${projectName}: the ${name.lower} tree`, PACK_NOTES),
      modElement(
        namespace,
        projectName,
        `Adds the ${name.lower} tree: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
      ),
      ...elements,
    ],
    assets: PICTURES.filter((picture) => used.has(picture.id)).map(
      (picture): ContentBundleAsset =>
        pictureTexture(
          namespace,
          `block/${base}${picture.suffix}`,
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
