/**
 * Lowering of `msm:block` (ADR 0025 D1, D5): the runtime definition plus the reloadable
 * vanilla files the editor-only fields stand for.
 */
import type { Element, Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import {
  BlocksItemsLoweringError,
  dataPath,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
  assetPath,
} from './paths';
import {
  BLOCK_STATE_SCHEMA,
  BLOCK_TAG_SCHEMA,
  itemDefinitionFile,
  LOOT_TABLE_SCHEMA,
  langFile,
  nonEmptyString,
} from './shared';
import { needsTierTag } from './tools';

/** The element data fields that exist only in the editor. */
const BLOCK_EDITOR_FIELDS = ['model', 'display_name', 'loot'] as const;
/** The `msm:breakable` fields that exist only in the editor. */
const BREAKABLE_EDITOR_FIELDS = ['tool', 'min_tier'] as const;
/** The definition format this plugin writes. */
export const DEFINITION_FORMAT = 1;

const BREAKABLE = 'msm:breakable';

/** What the editor fields of one block say, read before they are stripped. */
interface BlockEditorFields {
  model: string | undefined;
  displayName: string | undefined;
  loot: string | undefined;
  tool: string | undefined;
  minTier: string | undefined;
  hasItem: boolean;
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
    model: nonEmptyString(data.model),
    displayName: nonEmptyString(data.display_name),
    loot: nonEmptyString(data.loot),
    tool: nonEmptyString(breakable?.tool),
    minTier: nonEmptyString(breakable?.min_tier),
    hasItem: data.item !== false,
  };
}

/**
 * The runtime block definition: the element data without `model`, `display_name`, `loot` and
 * the `tool` and `min_tier` of `msm:breakable`. A tool or tier sets `requires_tool: true`
 * unless the element sets `requires_tool` itself; a `loot` id becomes `loot_table` unless one
 * is set; `format` is always the format this plugin writes.
 *
 * @param element - An `msm:block` element.
 * @returns The definition, a fresh object.
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function blockDefinition(element: Element): JsonObject {
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
  }
  if (fields.loot !== undefined && fields.loot !== 'self' && definition.loot_table === undefined) {
    definition.loot_table = fields.loot;
  }
  return definition;
}

/** A block tag file under `data/minecraft/tags/block/`, declared `merge: 'tag'`. */
function blockTagFile(target: Target, tag: string, id: string): OutputFile {
  return {
    path: `data/minecraft/${target.folders.data.tags}/block/${tag}.json`,
    contents: { values: [id] },
    layer: 'datapack',
    schema: BLOCK_TAG_SCHEMA,
    merge: 'tag',
  };
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
 * 2. with `model`: a single-variant block state definition and, unless `"item": false`, the
 *    block item's model definition (layer `resourcepack`);
 * 3. with `display_name`: the `block.<ns>.<path>` key of `en_us` (`merge: 'object'`);
 * 4. with `tool`: `minecraft:mineable/<tool>`, and with `min_tier`: the needs-tier tag
 *    (layer `datapack`, `merge: 'tag'`);
 * 5. with `"loot": "self"` and a block item: the drops-itself loot table at
 *    `loot_table/blocks/<path>.json` (a block without an item has nothing to drop).
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerBlock(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const fields = readEditorFields(blockData(element));
  const files: OutputFile[] = [
    {
      path: definitionPath('block', namespace, path),
      contents: blockDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.blockDefinition,
    },
  ];
  if (fields.model !== undefined) {
    files.push({
      path: assetPath(target, 'block_definition', namespace, path),
      contents: { variants: { '': { model: fields.model } } },
      layer: 'resourcepack',
      schema: BLOCK_STATE_SCHEMA,
    });
    if (fields.hasItem) files.push(itemDefinitionFile(target, namespace, path, fields.model));
  }
  if (fields.displayName !== undefined) {
    files.push(
      langFile(target, namespace, descriptionKey('block', namespace, path), fields.displayName),
    );
  }
  if (fields.tool !== undefined) files.push(blockTagFile(target, `mineable/${fields.tool}`, element.id));
  const needs = fields.minTier === undefined ? undefined : needsTierTag(fields.minTier);
  if (needs !== undefined) files.push(blockTagFile(target, needs, element.id));
  if (fields.loot === 'self' && fields.hasItem) {
    files.push({
      path: dataPath(target, 'loot_table', namespace, `blocks/${path}`),
      contents: dropsItselfLootTable(element.id, namespace, path),
      layer: 'datapack',
      schema: LOOT_TABLE_SCHEMA,
    });
  }
  return files;
}
