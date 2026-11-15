/**
 * Templates of the vanilla parity block types and the bag items (ADR 0101 D3; B461): one per new
 * block type (beds to candles), waterlogging, weathering with waxing, and the satchel, pouch and
 * bundle items. They draw with vanilla textures by id, use vanilla ids for everything they name
 * and derive the rest (a stem's seeds) from the element's own id. A template makes one element,
 * so the four copper stages come as the first stage naming vanilla's next one; the Copper roof
 * example holds the whole set.
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { BLOCK_KIND, ITEM_KIND } from '../kinds';
import { displayName } from './shared';

const FURNITURE = 'Blocks: furniture and lights';
const PLANTS = 'Blocks: plants';
const COPPER = 'Copper';
const ITEMS = 'Items';

/** Wooden things break faster with an axe and burn as planks (ADR 0067 D3). */
const WOODEN: JsonObject = { hardness: 2, resistance: 3, tool: 'axe', requires_tool: false };
/** Plants and light things break by hand at once. */
const INSTANT: JsonObject = { hardness: 0, resistance: 0 };

/** A block template: the shared fields (format, name, drops itself, creative tab), then `fields`. */
function blockTemplate(
  id: string,
  category: string,
  title: string,
  description: string,
  tab: string,
  sound: string,
  components: JsonObject,
  fields: (context: TemplateContext) => JsonObject,
): ElementTemplate {
  return {
    id,
    kind: BLOCK_KIND,
    category,
    title,
    description,
    data: (context): Json => ({
      format: 1,
      display_name: displayName(context.path),
      sound_type: sound,
      loot: 'self',
      item: { creative_tab: tab },
      components,
      ...fields(context),
    }),
  };
}

/** An item template: the shared fields, then `fields`. */
function itemTemplate(
  id: string,
  title: string,
  description: string,
  fields: JsonObject,
): ElementTemplate {
  return {
    id,
    kind: ITEM_KIND,
    category: ITEMS,
    title,
    description,
    data: (context): Json => ({
      format: 1,
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      ...structuredClone(fields),
    }),
  };
}

export const vanillaParityBlockTemplates: readonly ElementTemplate[] = [
  blockTemplate(
    'msm_block_sleeping_bag',
    FURNITURE,
    'Sleeping bag',
    'A bed of two halves that you sleep in and that sets your spawn, following the straw bed rule: it works by day too. Villagers do not use project beds.',
    'minecraft:colored_blocks',
    'wool',
    { 'msm:breakable': { hardness: 0.2, resistance: 0.2 } },
    () => ({
      type: 'bed',
      rule: 'straw_bed',
      colour: 'green',
      textures: { bed: 'minecraft:block/green_bed_head_up' },
    }),
  ),
  blockTemplate(
    'msm_block_pie',
    FURNITURE,
    'Pie',
    'A cake-like block eaten slice by slice (seven bites), with the cake sounds. Right-click with an empty hand to eat; a comparator reads what is left.',
    'minecraft:food_and_drinks',
    'wool',
    { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
    () => ({
      type: 'cake',
      food: { nutrition: 2, saturation: 0.1 },
      textures: {
        top: 'minecraft:block/cake_top',
        bottom: 'minecraft:block/cake_bottom',
        side: 'minecraft:block/cake_side',
        inside: 'minecraft:block/cake_inner',
      },
    }),
  ),
  blockTemplate(
    'msm_block_berry_bush',
    PLANTS,
    'Berry bush',
    'A prickly bush with four ages that gives vanilla sweet berries when ripe, grows slowly on grass and dirt and hurts what walks through it. Bees grow it.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'berry_bush',
      berry: 'minecraft:sweet_berries',
      textures: {
        stages: [
          'minecraft:block/sweet_berry_bush_stage0',
          'minecraft:block/sweet_berry_bush_stage1',
          'minecraft:block/sweet_berry_bush_stage2',
          'minecraft:block/sweet_berry_bush_stage3',
        ],
      },
    }),
  ),
  blockTemplate(
    'msm_block_tall_flower',
    PLANTS,
    'Tall flower',
    'A flower two blocks high that places both halves at once, drops one flower from the lower half and can be copied with bone meal, as a lilac.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'tall_plant',
      textures: {
        top: 'minecraft:block/lilac_top',
        bottom: 'minecraft:block/lilac_bottom',
      },
    }),
  ),
  blockTemplate(
    'msm_block_rope_ladder',
    FURNITURE,
    'Rope ladder',
    'A ladder that climbs on a wall, turns to the wall you place it against and is climbable like a vanilla ladder.',
    'minecraft:functional_blocks',
    'ladder',
    { 'msm:breakable': { hardness: 0.4, resistance: 0.4, tool: 'axe', requires_tool: false } },
    () => ({ type: 'ladder', textures: { texture: 'minecraft:block/ladder' } }),
  ),
  blockTemplate(
    'msm_block_torch',
    FURNITURE,
    'Torch',
    'A torch for the floor and, as its own wall form, for walls, giving light 14 and flame particles. Change the particle to any simple particle.',
    'minecraft:functional_blocks',
    'wood',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'torch',
      particle: 'minecraft:flame',
      textures: { texture: 'minecraft:block/torch' },
    }),
  ),
  blockTemplate(
    'msm_block_lantern',
    FURNITURE,
    'Lantern',
    'A lantern that stands on a block or hangs from one (placed under a block or a chain), giving light 15.',
    'minecraft:functional_blocks',
    'lantern',
    { 'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe', requires_tool: true } },
    () => ({
      type: 'lantern',
      textures: {
        texture: 'minecraft:block/lantern',
        item: 'minecraft:item/lantern',
      },
    }),
  ),
  blockTemplate(
    'msm_block_chain',
    FURNITURE,
    'Chain',
    'A thin chain that places along the face you aim at (up and down, north and south or east and west) and holds up lanterns.',
    'minecraft:building_blocks',
    'metal',
    { 'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe', requires_tool: true } },
    () => ({
      type: 'chain',
      textures: {
        all: 'minecraft:block/iron_chain',
        item: 'minecraft:item/iron_chain',
      },
    }),
  ),
  blockTemplate(
    'msm_block_candle',
    FURNITURE,
    'Candle',
    'A candle you stack up to four in one block, light with flint and steel and put out with a click, giving light 3 for each lit one. It shows two pictures, plain and lit.',
    'minecraft:colored_blocks',
    'wool',
    { 'msm:breakable': { hardness: 0.1, resistance: 0.1 } },
    () => ({
      type: 'candle',
      textures: {
        candle: 'minecraft:block/candle',
        lit: 'minecraft:block/candle_lit',
        item: 'minecraft:item/candle',
      },
    }),
  ),
  blockTemplate(
    'msm_block_wooden_sign',
    FURNITURE,
    'Wooden sign',
    'A sign you write on, standing on the floor in sixteen turns and, as its own wall form, on walls. Both sides take text, dye, glow ink and wax. The oak wood type gives its sounds.',
    'minecraft:functional_blocks',
    'wood',
    { 'msm:breakable': { ...WOODEN } },
    () => ({
      type: 'sign',
      wood_type: 'oak',
      textures: { all: 'minecraft:block/oak_planks' },
    }),
  ),
  blockTemplate(
    'msm_block_hanging_sign',
    FURNITURE,
    'Hanging sign',
    'A sign that hangs from a block or a chain, or sticks out from a wall, with text on both sides. The oak wood type gives its sounds.',
    'minecraft:functional_blocks',
    'wood',
    { 'msm:breakable': { ...WOODEN } },
    () => ({
      type: 'hanging_sign',
      wood_type: 'oak',
      textures: { all: 'minecraft:block/oak_planks' },
    }),
  ),
  blockTemplate(
    'msm_block_potted_sapling',
    PLANTS,
    'Potted plant',
    'A flower pot holding a plant, which drops the pot and the plant. It needs no item of its own: use the pot on the plant. Vanilla grass here; name your own sapling or flower in "plant".',
    'minecraft:functional_blocks',
    'grass',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'potted_plant',
      plant: 'minecraft:short_grass',
      textures: { plant: 'minecraft:block/short_grass' },
      item: false,
    }),
  ),
  blockTemplate(
    'msm_block_sea_pickle',
    PLANTS,
    'Glow pod (sea pickle-like)',
    'A cluster of one to four pods that glows brighter with each pod, 6, 9, 12 and 15 in water and not at all dry. Bone meal spreads it on corals.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'sea_pickle',
      textures: { all: 'minecraft:block/sea_pickle', texture: 'minecraft:block/sea_pickle' },
    }),
  ),
  blockTemplate(
    'msm_block_vine',
    PLANTS,
    'Vine',
    'A vine that clings to the sides of blocks, grows down and spreads slowly, and is climbable. It drops itself when broken.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { hardness: 0.2, resistance: 0.2, tool: 'axe', requires_tool: false } },
    () => ({
      type: 'vine',
      textures: { all: 'minecraft:block/vine', texture: 'minecraft:block/vine' },
    }),
  ),
  blockTemplate(
    'msm_block_rug',
    FURNITURE,
    'Rug',
    'A rug one sixteenth of a block high, as a carpet, that sits on the floor and breaks when its floor goes.',
    'minecraft:colored_blocks',
    'wool',
    { 'msm:breakable': { hardness: 0.1, resistance: 0.1 } },
    () => ({ type: 'carpet', textures: { texture: 'minecraft:block/red_wool' } }),
  ),
  blockTemplate(
    'msm_block_snow_layers',
    PLANTS,
    'Snow-like layers',
    'A block of eight layers: place more on the top to build it up one layer at a time (the eighth is a full block). It never melts.',
    'minecraft:natural_blocks',
    'snow',
    { 'msm:breakable': { hardness: 0.1, resistance: 0.1, tool: 'shovel', requires_tool: false } },
    () => ({ type: 'layers', textures: { texture: 'minecraft:block/snow' } }),
  ),
  blockTemplate(
    'msm_block_glow_rod',
    FURNITURE,
    'Glow rod',
    'A slim rod that points in six directions, away from the face you place it on, and shines at light 14, as an end rod.',
    'minecraft:functional_blocks',
    'glass',
    { 'msm:breakable': { ...INSTANT } },
    () => ({ type: 'rod', textures: { texture: 'minecraft:block/end_rod' } }),
  ),
  blockTemplate(
    'msm_block_melon_stem',
    PLANTS,
    'Melon-like stem',
    'A stem of eight ages on farmland that grows vanilla melons beside it. Its seeds are an item with this id plus "_seeds"; the bent stem is its own companion block.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { ...INSTANT } },
    (context) => ({
      type: 'stem',
      fruit: 'minecraft:melon',
      textures: {
        stem: 'minecraft:block/melon_stem',
        attached: 'minecraft:block/attached_melon_stem',
      },
      item: { id: `${context.id}_seeds`, creative_tab: 'minecraft:natural_blocks' },
    }),
  ),
  blockTemplate(
    'msm_block_cocoa_pod',
    PLANTS,
    'Cocoa-like pod',
    'A pod that grows through three ages on the side of a jungle log, turned to the log it hangs on, and drops more when ripe.',
    'minecraft:natural_blocks',
    'wood',
    { 'msm:breakable': { hardness: 0.2, resistance: 3, tool: 'axe', requires_tool: false } },
    () => ({
      type: 'cocoa',
      support: '#minecraft:supports_cocoa',
      textures: {
        stages: [
          'minecraft:block/cocoa_stage0',
          'minecraft:block/cocoa_stage1',
          'minecraft:block/cocoa_stage2',
        ],
      },
    }),
  ),
  blockTemplate(
    'msm_block_scaffold',
    FURNITURE,
    'Scaffold',
    'A scaffolding you build up in a column and out in a row up to six blocks, that you climb and that falls when its support goes, as bamboo scaffolding.',
    'minecraft:building_blocks',
    'bamboo',
    { 'msm:breakable': { ...INSTANT } },
    () => ({
      type: 'scaffolding',
      textures: {
        top: 'minecraft:block/scaffolding_top',
        side: 'minecraft:block/scaffolding_side',
        bottom: 'minecraft:block/scaffolding_bottom',
      },
    }),
  ),
  blockTemplate(
    'msm_block_copper_block',
    COPPER,
    'Copper-like block',
    'The first of four copper stages: it ages to vanilla exposed copper in time and honeycomb waxes it into vanilla waxed copper. For a whole set of four stages and their waxed copies, copy the Copper roof example.',
    'minecraft:building_blocks',
    'copper',
    {
      'msm:breakable': { hardness: 3, resistance: 6, tool: 'pickaxe', requires_tool: true },
      'msm:weathering': { stage: 'unaffected', next: 'minecraft:exposed_copper' },
      'msm:waxable': { into: 'minecraft:waxed_copper_block' },
    },
    () => ({ model: 'minecraft:block/copper_block' }),
  ),
  blockTemplate(
    'msm_block_waterlogged_lamp',
    FURNITURE,
    'Waterlogged lamp',
    'A glowing block that holds water: use a water bucket on it and it keeps its light under the water. Only plain, pillar, facing and directional blocks can hold water.',
    'minecraft:functional_blocks',
    'glass',
    {
      'msm:breakable': { hardness: 0.3, resistance: 0.3 },
      'msm:waterloggable': {},
      'msm:light_emitter': { level: 12 },
    },
    () => ({ model: 'minecraft:block/sea_lantern' }),
  ),
];

export const vanillaParityItemTemplates: readonly ElementTemplate[] = [
  itemTemplate(
    'msm_item_satchel',
    'Satchel',
    'A bag that holds 27 stacks, as a chest: sneak and use it to open it. Its contents stay in the bag, and a bag cannot go inside another bag. It stacks to one.',
    {
      model: 'minecraft:item/leather',
      components: {
        'msm:item_inventory': { layout: 'chest', rows: 3, open: 'sneak_use' },
      },
    },
  ),
  itemTemplate(
    'msm_item_pouch',
    'Pouch',
    'A small bag of five slots, as a hopper: use it to open it. Its contents stay in the bag.',
    {
      model: 'minecraft:item/rabbit_hide',
      components: { 'msm:item_inventory': { layout: 'hopper', open: 'use' } },
    },
  ),
  itemTemplate(
    'msm_item_quiver_bundle',
    'Quiver-like bundle',
    'An item that holds a mix of items, as a bundle: click items onto it to put them in and right-click to take them out. It shows its open and closed pictures.',
    {
      model: 'minecraft:item/bundle',
      bundle_textures: {
        closed: 'minecraft:item/bundle',
        open_back: 'minecraft:item/bundle_open_back',
        open_front: 'minecraft:item/bundle_open_front',
      },
      components: { 'msm:bundle': {} },
    },
  ),
];
