/**
 * `msm:block` templates for containers (ADR 0074) and machines (ADR 0075), the eight of ADR
 * 0076 D3. They draw with vanilla models and textures (barrel, hopper, dispenser, furnace,
 * blast furnace and redstone lamp looks, with the vanilla open and lit pictures), use vanilla
 * items in their recipes and take their recipe type from their own id: a machine without
 * `recipe_types` processes its own `recipes`.
 */
import type { ElementTemplate, Json, JsonObject, TemplateContext } from '@msm/plugin-api';
import { BLOCK_KIND } from '../kinds';
import { displayName } from './shared';

const CATEGORY = 'Blocks';

/** A barrel's breaking: mined faster with an axe, dropped by hand. */
const WOODEN = { hardness: 2.5, resistance: 2.5, tool: 'axe', requires_tool: false };
/** A furnace's breaking: needs a pickaxe to drop. */
const STONE = { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' };

/** The fields every container and machine template shares: format, name, item and drops. */
function common(
  context: TemplateContext,
  soundType: string,
  creativeTab: string,
  breakable: JsonObject,
): JsonObject {
  return {
    format: 1,
    display_name: displayName(context.path),
    sound_type: soundType,
    loot: 'self',
    item: { creative_tab: creativeTab },
    components: { 'msm:breakable': { ...breakable } },
  };
}

/** A template of the blocks category whose data `build` makes. */
function template(
  id: string,
  title: string,
  description: string,
  build: (context: TemplateContext) => JsonObject,
): ElementTemplate {
  return {
    id,
    kind: BLOCK_KIND,
    category: CATEGORY,
    title,
    description,
    data: (context): Json => build(context),
  };
}

/** `base` with `component` added to its `components`. */
function withComponent(base: JsonObject, id: string, component: JsonObject): JsonObject {
  const components = base.components as JsonObject;
  return { ...base, components: { ...components, [id]: component } };
}

const storage = (context: TemplateContext): JsonObject =>
  common(context, 'wood', 'minecraft:functional_blocks', WOODEN);
const furnaceLike = (context: TemplateContext): JsonObject =>
  common(context, 'stone', 'minecraft:functional_blocks', STONE);

/** The furnace's look, with the lit front while it works. */
const FURNACE_TEXTURES = {
  front: 'minecraft:block/furnace_front',
  front_lit: 'minecraft:block/furnace_front_on',
  side: 'minecraft:block/furnace_side',
  top: 'minecraft:block/furnace_top',
};

/** The blast furnace's look, with the lit front while it works. */
const BLAST_FURNACE_TEXTURES = {
  front: 'minecraft:block/blast_furnace_front',
  front_lit: 'minecraft:block/blast_furnace_front_on',
  side: 'minecraft:block/blast_furnace_side',
  top: 'minecraft:block/blast_furnace_top',
};

export const containerTemplates: readonly ElementTemplate[] = [
  template(
    'msm_block_storage_crate',
    'Storage crate',
    'A barrel-like crate with the 27 slots of a chest. Its lid opens while someone looks inside; hoppers fill and empty it, and comparators read how full it is.',
    (context) => ({
      ...withComponent(storage(context), 'msm:container', { layout: 'chest', rows: 3 }),
      model: 'minecraft:block/barrel',
      models: { open: 'minecraft:block/barrel_open' },
    }),
  ),
  template(
    'msm_block_small_crate',
    'Small crate (1 row)',
    'A small crate with one row of 9 slots that turns its lid towards you when placed and opens it while someone looks inside.',
    (context) => ({
      ...withComponent(storage(context), 'msm:container', { layout: 'chest', rows: 1 }),
      type: 'horizontal',
      textures: {
        front: 'minecraft:block/barrel_top',
        front_open: 'minecraft:block/barrel_top_open',
        side: 'minecraft:block/barrel_side',
        top: 'minecraft:block/barrel_bottom',
      },
    }),
  ),
  template(
    'msm_block_item_holder',
    'Item holder',
    'A pedestal that holds one stack and opens no screen: use it with an item to put the item in, and with an empty hand to take it back. Hoppers, comparators, commands and scripts reach it too.',
    (context) => ({
      ...withComponent(furnaceLike(context), 'msm:container', { layout: 'none', size: 1 }),
      model: 'minecraft:block/lodestone',
    }),
  ),
  template(
    'msm_block_hopper_box',
    'Hopper box',
    "A box with a hopper's 5 slots and screen. It stores items only and does not move them itself; place hoppers around it to pass items through. It stands along the axis you place it on.",
    (context) => ({
      ...withComponent(
        common(context, 'metal', 'minecraft:functional_blocks', {
          hardness: 3,
          resistance: 4.8,
          tool: 'pickaxe',
        }),
        'msm:container',
        { layout: 'hopper' },
      ),
      type: 'pillar',
      textures: { side: 'minecraft:block/hopper_outside', end: 'minecraft:block/hopper_top' },
    }),
  ),
  template(
    'msm_block_dispenser_box',
    'Dispenser box',
    "A box with a dispenser's 3 by 3 slots and screen that faces any of six directions. It stores items only: it neither shoots nor drops them.",
    (context) => ({
      ...withComponent(furnaceLike(context), 'msm:container', { layout: 'dispenser' }),
      type: 'directional',
      model: 'minecraft:block/dispenser',
      models: { vertical: 'minecraft:block/dispenser_vertical' },
    }),
  ),
  template(
    'msm_block_grinder_machine',
    'Grinder machine',
    'A machine with its own recipes that burns fuel as a furnace does: it grinds cobblestone into gravel, gravel into flint or sand, and bones into bone meal, in half the time a furnace takes. Edit its recipes to grind anything else.',
    (context) => ({
      ...withComponent(furnaceLike(context), 'msm:machine', { power: 'fuel', default_time: 100 }),
      type: 'horizontal',
      textures: { ...BLAST_FURNACE_TEXTURES },
      recipes: [
        { ingredient: 'minecraft:cobblestone', result: 'minecraft:gravel' },
        { ingredient: 'minecraft:gravel', result: 'minecraft:flint', experience: 0.1 },
        {
          name: 'sand_from_gravel',
          ingredient: 'minecraft:gravel',
          count: 2,
          result: { id: 'minecraft:sand', count: 2 },
        },
        { ingredient: 'minecraft:bone', result: { id: 'minecraft:bone_meal', count: 4 } },
      ],
    }),
  ),
  template(
    'msm_block_fast_furnace',
    'Fast furnace',
    "A furnace that smelts everything a furnace smelts at twice the speed. It burns fuel and uses the furnace's own recipes, so it needs none of its own.",
    (context) => ({
      ...withComponent(furnaceLike(context), 'msm:machine', {
        recipe_types: ['minecraft:smelting'],
        speed: 2,
      }),
      type: 'horizontal',
      textures: { ...FURNACE_TEXTURES },
    }),
  ),
  template(
    'msm_block_redstone_machine',
    'Redstone machine',
    'A machine that smelts what a furnace smelts, but only while it receives a redstone signal, and burns no fuel. It lights up like a redstone lamp while it works.',
    (context) => ({
      ...withComponent(
        common(context, 'glass', 'minecraft:redstone_blocks', {
          hardness: 0.3,
          resistance: 0.3,
        }),
        'msm:machine',
        { recipe_types: ['minecraft:smelting'], power: 'redstone', lit_light: 15 },
      ),
      model: 'minecraft:block/redstone_lamp',
      models: { lit: 'minecraft:block/redstone_lamp_on' },
    }),
  ),
];
