/**
 * Proposal tools (ADR 0041 D4, D5): every call adds items to the run's changeset. Nothing changes
 * in the project until the user reviews the changeset and applies it.
 */
import { z } from 'zod';
import { elementDataSchema, kindIdSchema, namespaceSchema, resourceIdSchema } from './common';

/**
 * The placeholder texture patterns of the library's generator (`PlaceholderPattern` in
 * `@msm/plugin-library`); kept in step by hand because `@msm/ai` may not depend on plugins.
 */
export const PLACEHOLDER_PATTERN_NAMES = [
  'plain',
  'ore',
  'gem',
  'disc',
  'egg',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'ingot',
  'armor_layer_1',
  'armor_layer_2',
  'bow',
  'bow_pulling_0',
  'bow_pulling_1',
  'bow_pulling_2',
  'crossbow',
  'crossbow_pulling_0',
  'crossbow_pulling_1',
  'crossbow_pulling_2',
  'crossbow_arrow',
  'crossbow_firework',
  'shield',
  'spear',
  'mace',
  'bottle',
  'totem',
  'smithing_template',
  'horse_armor',
  'wolf_armor',
  'horse_armor_layer',
  'wolf_armor_layer',
  'ball',
  'knife',
  'boomerang',
  'flask',
  'effect_icon',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'planks',
  'door_top',
  'door_bottom',
  'trapdoor',
  'leaves',
  'sapling',
  'stone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'crop_stage0',
  'crop_stage1',
  'crop_stage2',
  'crop_stage3',
  'seeds',
  'produce',
  'block_front',
  'portal',
  'portal_frame',
  'particle_spark',
  'particle_orb',
  'particle_puff',
  'particle_leaf',
] as const;

/**
 * The recipes of the library's drawn art (`ART_RECIPE_IDS` in `@msm/plugin-library`, ADR 0092 D7,
 * D15), in the table's order; kept in step by hand like {@link PLACEHOLDER_PATTERN_NAMES}.
 */
export const ART_RECIPE_NAMES = [
  'plain',
  'stone',
  'cobblestone',
  'polished_stone',
  'bricks',
  'pillar_side',
  'pillar_top',
  'ore',
  'deepslate_ore',
  'block',
  'block_front',
  'bark',
  'log_top',
  'stripped_log',
  'stripped_log_top',
  'planks',
  'door_top',
  'door_bottom',
  'trapdoor',
  'leaves',
  'sapling',
  'crop_stage0',
  'crop_stage1',
  'crop_stage2',
  'crop_stage3',
  'portal',
  'portal_frame',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'gravel',
  'strand',
  'stalk',
  'lichen',
  'dripleaf',
  'pot',
  'gem',
  'ingot',
  'disc',
  'spawn_egg',
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'spear',
  'mace',
  'knife',
  'boomerang',
  'ball',
  'bow',
  'bow_pulling_0',
  'bow_pulling_1',
  'bow_pulling_2',
  'crossbow',
  'crossbow_pulling_0',
  'crossbow_pulling_1',
  'crossbow_pulling_2',
  'crossbow_arrow',
  'crossbow_firework',
  'shield',
  'bottle',
  'flask',
  'totem',
  'smithing_template',
  'horse_armor',
  'wolf_armor',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'fruit',
  'pie',
  'seeds',
  'produce',
  'pattern_sheet',
  'pottery_sherd',
  'glider',
  'boat',
  'armor_layer_1',
  'armor_layer_2',
  'horse_armor_layer',
  'wolf_armor_layer',
  'banner_pattern',
  'shield_pattern',
  'trim_layer_1',
  'trim_layer_2',
  'glider_wings',
  'pot_pattern',
  'boat_layer',
  'chest_boat_layer',
  'villager_robe',
  'effect_icon',
  'particle_spark',
  'particle_orb',
  'particle_puff',
  'particle_leaf',
] as const;

/** Most a `create_texture` seed may be. */
export const TEXTURE_SEED_MAX = 999_999;

/** Most elements one `create_elements` call may propose. */
export const CREATE_ELEMENTS_MAX = 64;

export const createElementsInput = z.object({
  elements: z
    .array(
      z.object({
        id: resourceIdSchema,
        kind: kindIdSchema,
        data: elementDataSchema,
      }),
    )
    .min(1)
    .max(CREATE_ELEMENTS_MAX),
});
export const updateElementInput = z.object({
  id: resourceIdSchema,
  data: elementDataSchema.describe(
    "The element's complete new data (not a patch). Read the element first and change only what is needed.",
  ),
});
export const deleteElementInput = z.object({
  id: resourceIdSchema,
});
export const renameElementInput = z.object({
  from: resourceIdSchema,
  to: resourceIdSchema,
});
const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const createTextureInput = z
  .object({
    namespace: namespaceSchema,
    path: z
      .string()
      .regex(/^[a-z0-9_./-]+$/)
      .max(200)
      .describe(
        'The texture path inside the namespace without extension, for example "block/frost_ore" or "item/frost_sword".',
      ),
    recipe: z
      .enum(ART_RECIPE_NAMES)
      .optional()
      .describe(
        'What to draw (the system prompt lists the recipes in words). Blocks, 16x16 under textures/block: plain, stone, cobblestone, polished_stone, bricks, pillar_side, pillar_top, ore (speckles on stone), deepslate_ore, block (storage block; finishes gem, metal, rough), block_front (furnace-like front), bark, log_top, stripped_log, stripped_log_top, planks, door_top, door_bottom, trapdoor, leaves, sapling (also the item texture), crop_stage0 to crop_stage3 (sprouts to ripe), portal (see-through portal surface), portal_frame, dirt, grass_top, grass_side, sand, gravel. Items, 16x16 under textures/item: gem, ingot, disc, spawn_egg, sword, pickaxe, axe, shovel, hoe, spear, mace, knife, boomerang, ball, bow and bow_pulling_0 to bow_pulling_2, crossbow, crossbow_pulling_0 to crossbow_pulling_2, crossbow_arrow, crossbow_firework, shield, bottle, flask, totem, smithing_template, horse_armor, wolf_armor, helmet, chestplate, leggings, boots, fruit, pie, seeds, produce. Worn armour: armor_layer_1 and armor_layer_2 (64x32, under textures/entity/equipment/humanoid and humanoid_leggings), horse_armor_layer (64x64, textures/entity/equipment/horse_body), wolf_armor_layer (64x32, textures/entity/equipment/wolf_body). effect_icon (18x18 status effect icon under textures/mob_effect; finishes drop, heart, star, flame, swirl). particle_spark, particle_orb, particle_puff, particle_leaf (8x8 under textures/particle; the first of four frames).',
      ),
    pattern: z
      .enum(PLACEHOLDER_PATTERN_NAMES)
      .optional()
      .describe(
        'Older name for what to draw, still accepted: a placeholder pattern, drawn with its recipe (egg is spawn_egg; every other pattern has the recipe of the same name). Give recipe instead; recipe wins when both are given.',
      ),
    colour: hexColour
      .optional()
      .describe('The main colour as "#rrggbb", for example "#7fd4f0" for frost.'),
    accent: hexColour
      .optional()
      .describe(
        "The second colour as \"#rrggbb\", for recipes that take one (a disc's label, a spawn egg's spots, a fruit's or vegetable's leaves, a ripe crop, a rocket); each has its own default.",
      ),
    finish: z
      .string()
      .regex(/^[a-z_]+$/)
      .max(32)
      .optional()
      .describe(
        "One of the recipe's finishes: block takes gem, metal or rough; effect_icon takes drop, heart, star, flame or swirl. Other recipes have none.",
      ),
    seed: z
      .number()
      .int()
      .min(0)
      .max(TEXTURE_SEED_MAX)
      .optional()
      .describe(
        "The variation: the same inputs always draw the same picture, another seed another one. Omit it for the picture's own default (from the namespace, path and recipe).",
      ),
  })
  .refine((input) => input.recipe !== undefined || input.pattern !== undefined, {
    message: 'Give recipe (or the older pattern).',
    path: ['recipe'],
  });
export const addStarterInput = z.object({
  starterId: z.string().min(1).max(200).describe('A starter id from list_starters.'),
  namespace: namespaceSchema.describe('The namespace the starter content is created in.'),
  values: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Values for the starter's parameters by parameter id; omitted ones use defaults."),
});

export type CreateElementsInput = z.infer<typeof createElementsInput>;
export type UpdateElementInput = z.infer<typeof updateElementInput>;
export type DeleteElementInput = z.infer<typeof deleteElementInput>;
export type RenameElementInput = z.infer<typeof renameElementInput>;
export type CreateTextureInput = z.infer<typeof createTextureInput>;
export type AddStarterInput = z.infer<typeof addStarterInput>;

export const PROPOSE_TOOLS = [
  {
    name: 'create_elements',
    group: 'propose',
    input: createElementsInput,
    description:
      'Proposes new elements (1 to 64 per call; batch related elements, for example a block with its item, loot table and recipes, in one call). Each needs an unused id "namespace:path" outside the reserved "minecraft" and "msm" namespaces, a kind from list_kinds and data matching the kind\'s schema. The host checks every element and returns, per element, whether it was added to the changeset and its problems; fix the rejected ones and call again. Run run_checks after every batch.',
  },
  {
    name: 'update_element',
    group: 'propose',
    input: updateElementInput,
    description:
      'Proposes new data for an existing element (the whole data, not a patch); the user sees a diff before applying. Read the element first. Also works on an element you proposed earlier in this run.',
  },
  {
    name: 'delete_element',
    group: 'propose',
    input: deleteElementInput,
    description:
      'Proposes deleting an element. The result lists the elements that reference it, which would then have dangling references; say so to the user.',
  },
  {
    name: 'rename_element',
    group: 'propose',
    input: renameElementInput,
    description:
      'Proposes renaming an element to a new id; references to it in other elements are updated as a manual rename would.',
  },
  {
    name: 'create_texture',
    group: 'propose',
    input: createTextureInput,
    description:
      'Proposes a PNG texture at assets/<namespace>/textures/<path>.png, drawn by MSM in a Minecraft-like style from a recipe (what it is), a colour, an optional second colour, finish and seed; the size follows the recipe (16x16 for blocks and items). This is the only way to create textures: Mojang textures are never copied, traced or recoloured. The pictures are MSM\'s own drawings; the user can redraw them (Draw...) or paint over them. Models refer to the texture as "<namespace>:<path>". The result gives the recipe and seed used; call again on a new path with another seed for another variation.',
  },
  {
    name: 'add_starter',
    group: 'propose',
    input: addStarterInput,
    description:
      "Proposes a whole starter bundle (elements and textures) in a namespace, with values for the starter's parameters. The result lists the ids it would create; ids that already exist are reported as conflicts. Prefer a starter over hand-written elements when one matches the request, then adjust its elements with update_element.",
  },
] as const;
