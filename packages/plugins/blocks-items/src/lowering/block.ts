/**
 * Lowering of `msm:block` (ADR 0025 D1, D5): the runtime definition plus the reloadable
 * vanilla files the editor-only fields stand for.
 */
import type { Element, Json, JsonObject, OutputFile, Target, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { blockItemIdOf } from './block-item';
import { lowerFuelAndCompostInPlace } from './fuel';
import { lowerMachineRecipes } from './machine-recipes';
import {
  assetPath,
  BlocksItemsLoweringError,
  dataPath,
  definitionPath,
  descriptionKey,
  isRecord,
  splitResourceLocation,
} from './paths';
import { lowerShapeInPlace, SHAPE_COMPONENT } from './shape';
import { LOOT_TABLE_SCHEMA, langFile, nonEmptyString, vanillaTagFile } from './shared';
import { blockSoundFiles } from './sounds';
import { needsTierTag } from './tools';
import {
  type BlockTypeName,
  blockTypeOf,
  blockTypeSelfLoot,
  blockTypeTagFiles,
  CONTAINER_BLOCK_TYPES,
  containerOf,
  lowerBlockAppearance,
  machineOf,
  type TypeContext,
} from './types';
import { parseVariantKey, variantKey } from './types/blockstates';
import { companionLootFiles } from './types/companions';
import {
  isPlantLootPreset,
  keepContentsLootTable,
  keepsContents,
  plantLootTable,
} from './types/loot-presets';
import { lowerWaterloggingInPlace } from './waterlog';
import { lowerWeatheringInPlace } from './weathering';

/**
 * The element data fields that exist only in the editor: the appearance (`model`, and per type
 * `textures` and `models`), the name, the loot preset and its drops (ADR 0067 D7, ADR 0068
 * D3, D6), `wooden` (ADR 0067 D6), `villager_plantable` (ADR 0068 D3) and the machine
 * `recipes` (ADR 0075 D8).
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
  'recipes',
  'plant_item',
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
 * writes instead (ADR 0059 D2); `next` of `msm:weathering` and `into` of `msm:waxable` are
 * written as full ids (ADR 0094 D8, D9). A tool or tier sets `requires_tool: true`
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
  // The runtime gives every block an item unless `item: false`; a potted plant has none unless
  // `item` is given (ITEMLESS_TYPES), so the definition says so (B462a).
  if (data.type === 'potted_plant' && data.item === undefined) definition.item = false;
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
    lowerWeatheringInPlace(components);
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

/** The block state property of a double chest's halves (ADR 0104 D4), with its values. */
export const CHEST_TYPE_PROPERTY = 'type';
export const CHEST_TYPE_VALUES = Object.freeze(['single', 'left', 'right'] as const);
/** The container state a double chest does not have: vanilla's chest family has no `open`. */
const OPEN_PROPERTY = 'open';
const DEFAULT_CHEST_ROWS = 3;

/**
 * Whether a block of `type` with `data` is a double chest at runtime (ADR 0104 D4): an
 * `msm:container` (and no `msm:machine`, which wins) on one of the {@link CONTAINER_BLOCK_TYPES},
 * in the `chest` layout with 3 rows, `double: true` and no `keep_contents`, as the runtime takes
 * it (it turns `double` off otherwise, and `per_player` off when both are set).
 */
export function isDoubleChest(type: BlockTypeName, data: Json | undefined): boolean {
  if (!CONTAINER_BLOCK_TYPES.includes(type) || machineOf(data) !== undefined) return false;
  const container = containerOf(data);
  if (container === undefined || container.double !== true) return false;
  const layout = container.layout ?? 'chest';
  const rows = container.rows ?? DEFAULT_CHEST_ROWS;
  return layout === 'chest' && rows === DEFAULT_CHEST_ROWS && container.keep_contents !== true;
}

/**
 * A container's `variants` block state as a double chest's (ADR 0104 D4): the closed variants
 * only, without `open` (vanilla's chest family has no such state, and a key naming a property the
 * block lacks matches nothing), each written for `type=single`, `type=left` and `type=right` with
 * the same model (no block entity renderer draws the lid, ADR 0074 C9; each half is its own
 * block model). A multipart definition is returned as it is.
 */
export function withDoubleChestVariants(blockstate: JsonObject): JsonObject {
  const entries = blockstate.variants;
  if (!isRecord(entries)) return blockstate;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    const properties = parseVariantKey(key);
    if (properties[OPEN_PROPERTY] === 'true') continue;
    delete properties[OPEN_PROPERTY];
    for (const half of CHEST_TYPE_VALUES) {
      out[variantKey({ ...properties, [CHEST_TYPE_PROPERTY]: half })] = structuredClone(value);
    }
  }
  return { variants: out };
}

/** Rewrites the block state among `files` as a double chest's when the block is one. */
function lowerDoubleChestInPlace(
  files: OutputFile[],
  type: BlockTypeName,
  data: Json | undefined,
  target: Target,
  namespace: string,
  path: string,
): void {
  if (!isDoubleChest(type, data)) return;
  const statePath = assetPath(target, 'block_definition', namespace, path);
  const file = files.find((candidate) => candidate.path === statePath);
  const contents = file?.contents;
  if (file === undefined || contents instanceof Uint8Array || !isRecord(contents)) return;
  file.contents = withDoubleChestVariants(contents);
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
 *    layer `resourcepack`); a waterloggable block (ADR 0094 D7) has every variant twice,
 *    `waterlogged=false` and `waterlogged=true` with the same model; a double chest (ADR 0104
 *    D4) has its closed variants once per half, `type=single`, `type=left` and `type=right`;
 *    On a target whose block sounds are data, a block with `block_sounds` (ADR 0105 D1)
 *    gets its `block_sound_set` entry `data/<ns>/block_sound_set/<path>.json` (layer `datapack`);
 * 3. with `display_name`: the `block.<ns>.<path>` key of `en_us` (`merge: 'object'`), and the
 *    `item.<ns>.<path>` key of a block item with its own id;
 * 4. with `tool`: `minecraft:mineable/<tool>`, and with `min_tier`: the needs-tier tag
 *    (layer `datapack`, `merge: 'tag'`);
 * 5. the vanilla tags the type always joins (ADR 0067 D6), block tags then item tags;
 * 6. with `"loot": "self"` and a block item: the type's own loot table at
 *    `loot_table/blocks/<path>.json` (drops the item; two from a double slab, a door from its
 *    lower half; a torch, sign, hanging sign or stem also writes its companion's table,
 *    ADR 0094 D3). A block without an item has nothing to drop, except a potted plant (the
 *    pot and the plant). With `"loot": "crop"` (crops)
 *    or `"leaves"`: the preset's table in vanilla wheat's or oak leaves' shape (ADR 0068 D3,
 *    D6). A container that keeps its contents (ADR 0074 D6) takes the keep-contents form of
 *    `self` instead, in vanilla's shulker box shape;
 * 7. a machine's `recipes` (ADR 0075 D8): `data/<ns>/recipe/<path>/<name>.json` each, with
 *    `type` the block's id (layer `datapack`, schema `msm:machine_recipe`).
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
  lowerDoubleChestInPlace(files, type, data, target, namespace, path);
  lowerWaterloggingInPlace(files, type, data, target, namespace, path);
  files.push(...blockSoundFiles(target, namespace, path, data));
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
  // A potted plant has no item but drops the pot and the plant (ADR 0094 D10; B448).
  const lootItemId = itemId ?? (type === 'potted_plant' ? element.id : undefined);
  if (fields.loot === 'self' && lootItemId !== undefined) {
    const lootContext = { ...context, itemId: lootItemId };
    files.push({
      path: dataPath(target, 'loot_table', namespace, `blocks/${path}`),
      contents: keepsContents(type, data)
        ? keepContentsLootTable(lootContext)
        : (blockTypeSelfLoot(type, lootContext) ??
          dropsItselfLootTable(lootItemId, namespace, path)),
      layer: 'datapack',
      schema: LOOT_TABLE_SCHEMA,
    });
    // The companions' tables (ADR 0094 D3; B448).
    if (itemId !== undefined) files.push(...companionLootFiles(type, target, lootContext));
  } else if (isPlantLootPreset(fields.loot)) {
    const table = plantLootTable(type, fields.loot, context);
    if (table !== undefined) {
      files.push({
        path: dataPath(target, 'loot_table', namespace, `blocks/${path}`),
        contents: table,
        layer: 'datapack',
        schema: LOOT_TABLE_SCHEMA,
      });
    }
  }
  files.push(...lowerMachineRecipes(type, element.id, data, target));
  return files;
}
