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
  'crossbow',
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
] as const;

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
export const createTextureInput = z.object({
  namespace: namespaceSchema,
  path: z
    .string()
    .regex(/^[a-z0-9_./-]+$/)
    .max(200)
    .describe(
      'The texture path inside the namespace without extension, for example "block/ruby_ore" or "item/ruby".',
    ),
  pattern: z
    .enum(PLACEHOLDER_PATTERN_NAMES)
    .describe(
      'The placeholder pattern: plain, ore (speckles on stone), gem, disc, egg (spawn egg), sword, pickaxe, axe, shovel, hoe, helmet, chestplate, leggings, boots, ingot, bow, crossbow, shield, spear, mace, bottle, totem, smithing_template, horse_armor, wolf_armor (all 16x16), armor_layer_1 and armor_layer_2 (64x32 worn armour layers, under textures/entity/equipment/humanoid and humanoid_leggings), horse_armor_layer (64x64, under textures/entity/equipment/horse_body) or wolf_armor_layer (64x32, under textures/entity/equipment/wolf_body).',
    ),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe('The main colour as "#rrggbb", for example "#d0103a" for ruby.'),
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
      'Proposes a 16x16 placeholder PNG texture at assets/<namespace>/textures/<path>.png, drawn by the app from a pattern and a colour. This is the only way to create textures: Mojang textures are never copied. Tell the user that textures are placeholders to replace later. Models refer to the texture as "<namespace>:<path>".',
  },
  {
    name: 'add_starter',
    group: 'propose',
    input: addStarterInput,
    description:
      "Proposes a whole starter bundle (elements and placeholder textures) in a namespace, with values for the starter's parameters. The result lists the ids it would create; ids that already exist are reported as conflicts. Prefer a starter over hand-written elements when one matches the request, then adjust its elements with update_element.",
  },
] as const;
