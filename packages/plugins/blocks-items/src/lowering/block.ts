/**
 * Lowering of `msm:block` (ADR 0025 D1, D5): the runtime definition plus the reloadable
 * vanilla files the editor-only fields stand for.
 */
import type { Element, Json, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { blockItemIdOf } from './block-item';
import { lowerFuelAndCompostInPlace } from './fuel';
import {
  BlocksItemsLoweringError,
  dataPath,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import { lowerShapeInPlace, SHAPE_COMPONENT } from './shape';
import { LOOT_TABLE_SCHEMA, langFile, nonEmptyString, vanillaTagFile } from './shared';
import { needsTierTag } from './tools';
import {
  blockTypeOf,
  blockTypeSelfLoot,
  blockTypeTagFiles,
  lowerBlockAppearance,
  type TypeContext,
} from './types';

/**
 * The element data fields that exist only in the editor: the appearance (`model`, and per type
 * `textures` and `models`), the name, the loot preset and its drops (ADR 0067 D7, ADR 0068
 * D3, D6), `wooden` (ADR 0067 D6) and `villager_plantable` (ADR 0068 D3).
 */
const BLOCK_EDITOR_FIELDS = [
  'model',
  'display_name',
  'loot',
  'textures',
  'models',
  'wooden',
  'crop_drops',
  'leaves_drops',
  'villager_plantable',
] as const;
/** Loot values that are editor presets rather than loot table ids. */
const LOOT_PRESETS: readonly string[] = ['self', 'crop', 'leaves'];
/** The `msm:breakable` fields that exist only in the editor. */
const BREAKABLE_EDITOR_FIELDS = ['tool', 'min_tier'] as const;
/** The definition format this plugin writes. */
export const DEFINITION_FORMAT = 1;

const BREAKABLE = 'msm:breakable';

/** What the editor fields of one block say, read before they are stripped. */
interface BlockEditorFields {
  displayName: string | undefined;
  loot: string | undefined;
  tool: string | undefined;
  minTier: string | undefined;
}

function blockData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: block data must be an object.`);
  }
  return element.data;
}

function readEditorFields(data: JsonObject): BlockEditorFields {
  const components = isRecord(data.components) ? data.components : undefined;
  const breakable = isRecord(components?.[BREAKABLE]) ? components[BREAKABLE] : undefined;
  return {
    displayName: nonEmptyString(data.display_name),
    loot: nonEmptyString(data.loot),
    tool: nonEmptyString(breakable?.tool),
    minTier: nonEmptyString(breakable?.min_tier),
  };
}

/**
 * The runtime block definition: the element data without `model`, `display_name`, `loot`, the
 * `tool` and `min_tier` of `msm:breakable` and the `preset` of `msm:shape`, whose boxes it
 * writes instead (ADR 0059 D2). A tool or tier sets `requires_tool: true`
 * unless the element sets `requires_tool` itself; a `loot` id becomes `loot_table` unless one
 * is set; `format` is always the format this plugin writes. The block item's element-only
 * `fuel` and `compost` (ADR 0060 D4) become vanilla components in its `msm:components`.
 *
 * @param element - An `msm:block` element.
 * @param target - The target supplying the compost providers.
 * @returns The definition, a fresh object.
 * @throws {@link BlocksItemsLoweringError} If the data is not an object, or the item's
 *   `compost` has no provider on `target`.
 */
export function blockDefinition(
  element: Element,
  target?: Pick<TargetFacts, 'id' | 'items'>,
): JsonObject {
  const data = blockData(element);
  const fields = readEditorFields(data);
  const definition = structuredClone(data);
  for (const field of BLOCK_EDITOR_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  const components = definition.components;
  if (isRecord(components)) {
    const breakable = components[BREAKABLE];
    if (isRecord(breakable)) {
      for (const field of BREAKABLE_EDITOR_FIELDS) delete breakable[field];
      const needsTool = fields.tool !== undefined || fields.minTier !== undefined;
      if (needsTool && breakable.requires_tool === undefined) breakable.requires_tool = true;
    }
    const shape = components[SHAPE_COMPONENT];
    if (isRecord(shape)) lowerShapeInPlace(shape);
  }
  if (isRecord(definition.item)) lowerFuelAndCompostInPlace(definition.item, target, element.id);
  if (
    fields.loot !== undefined &&
    !LOOT_PRESETS.includes(fields.loot) &&
    definition.loot_table === undefined
  ) {
    definition.loot_table = fields.loot;
  }
  return definition;
}

/**
 * The "drops itself" loot table: one roll of the block's item that survives explosions, as the
 * game's own block loot tables are written (pools use the singular `condition`, as the
 * current target's schema names it).
 */
export function dropsItselfLootTable(id: string, namespace: string, path: string): Json {
  return {
    type: 'minecraft:block',
    pools: [
      {
        rolls: 1,
        bonus_rolls: 0,
        entries: [{ type: 'minecraft:item', name: id }],
        condition: { type: 'minecraft:survives_explosion' },
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  };
}

/**
 * Lowers an `msm:block` element, in this order:
 *
 * 1. the runtime definition `msm/<ns>/block/<path>.json` (layer `msm`);
 * 2. the appearance of the block's type (ADR 0067 D5, D7): the models generated from
 *    `textures`, the block state definition (a single variant of `model` for a plain block)
 *    and, with a block item, its item model definition at the block item id (ADR 0068 D2;
 *    layer `resourcepack`);
 * 3. with `display_name`: the `block.<ns>.<path>` key of `en_us` (`merge: 'object'`), and the
 *    `item.<ns>.<path>` key of a block item with its own id;
 * 4. with `tool`: `minecraft:mineable/<tool>`, and with `min_tier`: the needs-tier tag
 *    (layer `datapack`, `merge: 'tag'`);
 * 5. the vanilla tags the type always joins (ADR 0067 D6), block tags then item tags;
 * 6. with `"loot": "self"` and a block item: the type's own loot table at
 *    `loot_table/blocks/<path>.json` (drops the item; two from a double slab, a door from its
 *    lower half). A block without an item has nothing to drop.
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe, the data is not an object or
 *   the type is unknown.
 */
export function lowerBlock(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = blockData(element);
  const fields = readEditorFields(data);
  const type = blockTypeOf(data, element.id);
  const itemId = blockItemIdOf(element.id, data);
  const context: TypeContext = { blockId: element.id, itemId, namespace, path, data };
  const files: OutputFile[] = [
    {
      path: definitionPath('block', namespace, path),
      contents: blockDefinition(element, target),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.blockDefinition,
    },
    ...lowerBlockAppearance(type, target, context),
  ];
  if (fields.displayName !== undefined) {
    files.push(
      langFile(target, namespace, descriptionKey('block', namespace, path), fields.displayName),
    );
    if (itemId !== undefined && itemId !== element.id) {
      const item = splitResourceLocation(itemId);
      files.push(
        langFile(
          target,
          item.namespace,
          descriptionKey('item', item.namespace, item.path),
          fields.displayName,
        ),
      );
    }
  }
  if (fields.tool !== undefined)
    files.push(vanillaTagFile(target, 'block', `mineable/${fields.tool}`, element.id));
  const needs = fields.minTier === undefined ? undefined : needsTierTag(fields.minTier);
  if (needs !== undefined) files.push(vanillaTagFile(target, 'block', needs, element.id));
  files.push(...blockTypeTagFiles(type, target, context));
  if (fields.loot === 'self' && itemId !== undefined) {
    files.push({
      path: dataPath(target, 'loot_table', namespace, `blocks/${path}`),
      contents:
        blockTypeSelfLoot(type, { ...context, itemId }) ??
        dropsItselfLootTable(itemId, namespace, path),
      layer: 'datapack',
      schema: LOOT_TABLE_SCHEMA,
    });
  }
  return files;
}
