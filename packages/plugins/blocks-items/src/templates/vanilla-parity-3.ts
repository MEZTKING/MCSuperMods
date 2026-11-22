/**
 * Templates of vanilla parity 3, batch 1 (ADR 0112 D2; B518): one per growing and climbing plant
 * (ADR 0103 D1: a vine with glowing berries, a kelp-like water plant, a weeping vine, a cane, a
 * cactus, a bamboo-like stalk, a glow-lichen-like plant, a big dripleaf), a flower pot of the
 * project's own (D2), a lightning-rod-like rod that ages as copper (ADR 0104 D1), a double chest
 * and a per-player chest (D4, D5), a block with its own sounds and a door with its own door
 * sounds (ADR 0105 D1, D2), and rules for vanilla blocks (D4). They draw with vanilla textures by
 * id (from the user's own game), use vanilla ids for everything they name and derive the rest
 * (the berries item) from the element's own id. A small dripleaf names the big one it grows into,
 * a block of the project, so it has no template of its own; the Desert plants flow makes both.
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { BLOCK_KIND, VANILLA_BLOCK_RULES_KIND } from '../kinds';
import { displayName } from './shared';

const PLANTS = 'Blocks: plants';
const BLOCKS = 'Blocks';
const COPPER = 'Copper';
const ADDITIONS = 'Additions';

/** Plants that break at once by hand, as vanilla's strands. */
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
      components: structuredClone(components),
      ...fields(context),
    }),
  };
}

/** The block templates, in picker order: plants, the pot, storage, sounds, then copper. */
export const vanillaParity3BlockTemplates: readonly ElementTemplate[] = [
  blockTemplate(
    'msm_block_berry_vine',
    PLANTS,
    'Vine with glowing berries',
    'A vine that hangs from a ceiling and grows down, bearing berries that glow at light 14 and are picked by using it, as cave vines. The berries are its block item, edible, and plant the vine.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': INSTANT },
    (context) => ({
      type: 'growing_plant',
      direction: 'down',
      berries: { item: `${context.id}_berries`, light: 14 },
      textures: {
        head: 'minecraft:block/cave_vines',
        body: 'minecraft:block/cave_vines_plant',
        head_berries: 'minecraft:block/cave_vines_lit',
        body_berries: 'minecraft:block/cave_vines_plant_lit',
        item: 'minecraft:item/glow_berries',
      },
      item: {
        id: `${context.id}_berries`,
        creative_tab: 'minecraft:food_and_drinks',
        components: {
          'msm:components': {
            'minecraft:consumable': {},
            'minecraft:food': { nutrition: 2, saturation: 0.4 },
          },
        },
      },
    }),
  ),
  blockTemplate(
    'msm_block_water_strand',
    PLANTS,
    'Kelp-like water plant',
    'A plant that grows up in water a block at a time, as kelp: always under water, placed only in water, and broken when the water goes.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': INSTANT },
    () => ({
      type: 'growing_plant',
      needs_water: true,
      textures: { head: 'minecraft:block/kelp', body: 'minecraft:block/kelp_plant' },
    }),
  ),
  blockTemplate(
    'msm_block_hanging_strand',
    PLANTS,
    'Weeping vine',
    'A climbable vine that hangs from the underside of a block and grows down a block at a time, as weeping vines.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': INSTANT },
    () => ({
      type: 'growing_plant',
      direction: 'down',
      textures: {
        head: 'minecraft:block/weeping_vines',
        body: 'minecraft:block/weeping_vines_plant',
      },
    }),
  ),
  blockTemplate(
    'msm_block_cane',
    PLANTS,
    'Cane',
    'A stalk that grows three blocks tall on sand, dirt or grass with water beside it, as sugar cane.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': INSTANT },
    () => ({
      type: 'column_plant',
      style: 'cane',
      textures: { all: 'minecraft:block/sugar_cane' },
    }),
  ),
  blockTemplate(
    'msm_block_cactus',
    PLANTS,
    'Cactus',
    'A spiny column that grows three blocks tall on sand and hurts whatever touches it, as cactus.',
    'minecraft:natural_blocks',
    'wool',
    { 'msm:breakable': { hardness: 0.4, resistance: 0.4 } },
    () => ({
      type: 'column_plant',
      style: 'cactus',
      textures: {
        top: 'minecraft:block/cactus_top',
        side: 'minecraft:block/cactus_side',
        bottom: 'minecraft:block/cactus_bottom',
      },
    }),
  ),
  blockTemplate(
    'msm_block_bamboo_stalk',
    PLANTS,
    'Bamboo-like stalk',
    'A woody stalk that grows from a shoot (the generated block <id>_shoot) to 12 to 16 blocks, with leaves near its top, as bamboo.',
    'minecraft:natural_blocks',
    'bamboo',
    { 'msm:breakable': { hardness: 1, resistance: 1, tool: 'axe', requires_tool: false } },
    () => ({
      type: 'column_plant',
      style: 'bamboo',
      textures: {
        stalk: 'minecraft:block/bamboo_stalk',
        leaves_small: 'minecraft:block/bamboo_small_leaves',
        leaves_large: 'minecraft:block/bamboo_large_leaves',
        shoot: 'minecraft:block/bamboo_stage0',
      },
    }),
  ),
  blockTemplate(
    'msm_block_glowing_lichen',
    PLANTS,
    'Glowing lichen',
    'A thin growth that covers any side of the blocks around it, glows at light 7 and spreads with bone meal, as glow lichen.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { hardness: 0.2, resistance: 0.2 } },
    () => ({ type: 'multiface', textures: { texture: 'minecraft:block/glow_lichen' } }),
  ),
  blockTemplate(
    'msm_block_tipping_leaf',
    PLANTS,
    'Big dripleaf',
    'A big leaf on a stem (the generated block <id>_stem) that tips under whoever stands on it and drops them, as big dripleaf. Bone meal grows it taller.',
    'minecraft:natural_blocks',
    'grass',
    { 'msm:breakable': { hardness: 0.1, resistance: 0.1, tool: 'axe', requires_tool: false } },
    () => ({
      type: 'dripleaf',
      size: 'big',
      textures: {
        top: 'minecraft:block/big_dripleaf_top',
        side: 'minecraft:block/big_dripleaf_side',
        tip: 'minecraft:block/big_dripleaf_tip',
        stem: 'minecraft:block/big_dripleaf_stem',
      },
    }),
  ),
  blockTemplate(
    'msm_block_flower_pot',
    PLANTS,
    'Flower pot',
    'An empty flower pot of its own that takes the plants it lists (here four flowers); each becomes a potted block <id>_<plant>. Vanilla pots are not changed, and other plants do not go in.',
    'minecraft:functional_blocks',
    'stone',
    { 'msm:breakable': INSTANT },
    () => ({
      type: 'flower_pot',
      plants: [
        'minecraft:dandelion',
        'minecraft:poppy',
        'minecraft:cornflower',
        'minecraft:lily_of_the_valley',
      ],
    }),
  ),
  blockTemplate(
    'msm_block_double_chest',
    BLOCKS,
    'Double chest',
    'A chest of 27 slots that joins a chest of its kind beside it into one double chest of 54, as vanilla chests do; sneak to keep them apart. Hoppers and comparators work with each half.',
    'minecraft:functional_blocks',
    'wood',
    {
      'msm:breakable': { hardness: 2.5, resistance: 2.5, tool: 'axe', requires_tool: false },
      'msm:container': { layout: 'chest', rows: 3, double: true },
    },
    () => ({
      type: 'horizontal',
      textures: {
        front: 'minecraft:block/barrel_top',
        side: 'minecraft:block/oak_planks',
        top: 'minecraft:block/oak_planks',
      },
    }),
  ),
  blockTemplate(
    'msm_block_player_chest',
    BLOCKS,
    'Chest for every player',
    'A chest in which every player finds their own items, as an ender chest: every chest of this kind opens the same store for that player, nothing drops when it is broken, and hoppers do not reach it.',
    'minecraft:functional_blocks',
    'stone',
    {
      'msm:breakable': { hardness: 22.5, resistance: 600, tool: 'pickaxe' },
      'msm:container': { layout: 'chest', rows: 3, per_player: true },
    },
    () => ({ model: 'minecraft:block/crying_obsidian' }),
  ),
  blockTemplate(
    'msm_block_own_sounds',
    BLOCKS,
    'Block with its own sounds',
    'A block that sounds like amethyst when broken, walked on, placed, hit and fallen on, a little higher: each event of block_sounds replaces its sound_type event.',
    'minecraft:building_blocks',
    'stone',
    { 'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' } },
    () => ({
      model: 'minecraft:block/calcite',
      block_sounds: {
        break: 'minecraft:block.amethyst_block.break',
        step: 'minecraft:block.amethyst_block.step',
        place: 'minecraft:block.amethyst_block.place',
        hit: 'minecraft:block.amethyst_block.hit',
        fall: 'minecraft:block.amethyst_block.fall',
        volume: 1,
        pitch: 1.2,
      },
    }),
  ),
  blockTemplate(
    'msm_block_door_own_sounds',
    BLOCKS,
    'Door with its own sounds',
    'A wooden door that opens by hand but sounds like an iron door: its set type is its own (set_type base wood with the iron door sounds).',
    'minecraft:building_blocks',
    'wood',
    { 'msm:breakable': { hardness: 3, resistance: 3, tool: 'axe', requires_tool: false } },
    () => ({
      type: 'door',
      set_type: {
        base: 'wood',
        sounds: {
          open: 'minecraft:block.iron_door.open',
          close: 'minecraft:block.iron_door.close',
        },
      },
      textures: {
        top: 'minecraft:block/spruce_door_top',
        bottom: 'minecraft:block/spruce_door_bottom',
      },
    }),
  ),
  blockTemplate(
    'msm_block_copper_rod',
    COPPER,
    'Copper-like rod',
    "A rod that faces any of six ways, as a lightning rod, and gives no light. It is the first of four copper stages: it ages to vanilla's exposed lightning rod in time, honeycomb waxes it into vanilla's waxed lightning rod, and lightning nearby scrapes it back. For a whole set, use the Copper set flow.",
    'minecraft:redstone_blocks',
    'copper',
    {
      'msm:breakable': { hardness: 3, resistance: 6, tool: 'pickaxe', requires_tool: true },
      'msm:light_emitter': { level: 0 },
      'msm:weathering': { stage: 'unaffected', next: 'minecraft:exposed_lightning_rod' },
      'msm:waxable': { into: 'minecraft:waxed_lightning_rod' },
    },
    () => ({ type: 'rod', textures: { texture: 'minecraft:block/lightning_rod' } }),
  ),
];

/** The rules for vanilla blocks template (ADR 0105 D4). */
export const vanillaParity3AdditionTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_vanilla_block_rules',
    kind: VANILLA_BLOCK_RULES_KIND,
    category: ADDITIONS,
    title: 'Rules for vanilla blocks',
    description:
      'An axe scrapes the moss off mossy cobblestone and stone bricks, a shovel packs mud, a hoe turns a moss block into dirt and leaves a moss carpet, and huge mushroom blocks burn. None of these is a vanilla pair, so nothing vanilla does is replaced. Needs the Fabric mod jar.',
    data: (): Json => ({
      format: 1,
      strip: [
        { block: 'minecraft:mossy_cobblestone', into: 'minecraft:cobblestone' },
        { block: 'minecraft:mossy_stone_bricks', into: 'minecraft:stone_bricks' },
      ],
      flatten: [{ block: 'minecraft:mud', into: 'minecraft:packed_mud' }],
      till: [
        { block: 'minecraft:moss_block', into: 'minecraft:dirt', drops: 'minecraft:moss_carpet' },
      ],
      burn: [
        { block: 'minecraft:brown_mushroom_block', burn_odds: 5, ignite_odds: 5 },
        { block: 'minecraft:red_mushroom_block', burn_odds: 5, ignite_odds: 5 },
      ],
    }),
  },
];
