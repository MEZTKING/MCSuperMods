/**
 * Companion blocks (ADR 0094 D3): `torch`, `sign` and `hanging_sign` register a second block
 * `<path>_wall`, and `stem` registers `<path>_attached`, with the same properties, no item of
 * their own and a loot table that drops the element's item. Each type that has one describes it
 * as a {@link CompanionLowering} on its `TypeLowering.companions`; the companion's models are
 * ordinary model slots of the element (`wall`, `attached`), so they are generated, named and
 * checked as every other slot.
 *
 * Lowering writes for each companion its block state definition
 * `assets/<ns>/blockstates/<path><suffix>.json` (with the element's appearance), the block tags
 * it joins, and with `"loot": "self"` and a block item its loot table
 * `data/<ns>/loot_table/blocks/<path><suffix>.json` (the element's item, surviving explosions,
 * unless the companion has its own table). The generated ids are reserved: a project element
 * with one is `blocks-items.generated-block-clash`.
 */
import type { Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath, dataPath, isRecord, splitResourceLocation } from '../paths';
import { BLOCK_STATE_SCHEMA, LOOT_TABLE_SCHEMA, vanillaTagFile } from '../shared';
import { BLOCK_TYPE_LOWERINGS, type BlockTypeName, blockTypeOf } from './index';
import type { SlotModels, TypeContext } from './models';

export { ATTACHED_COMPANION_SUFFIX, WALL_COMPANION_SUFFIX } from './models';

/** What a companion block's lowering gets: the element's context and the companion's id. */
export interface CompanionContext extends TypeContext {
  /** The companion block's id, `<ns>:<path><suffix>`. */
  companionId: string;
}

/** How one companion block lowers (ADR 0094 D3). */
export interface CompanionLowering {
  /** Appended to the element's id to form the companion's id: `_wall` or `_attached`. */
  readonly suffix: string;
  /** The companion's block state definition from the element's slot models. */
  blockstate(models: SlotModels, context: CompanionContext): JsonObject;
  /** Vanilla block tags (paths under `minecraft:`) the companion joins. */
  readonly blockTags?: readonly string[];
  /** The companion's `self` loot table; default one roll of the element's item. */
  selfLoot?(context: CompanionContext & { itemId: string }): JsonObject;
}

/** The companions of a block of `type`, in registration order; none for most types. */
export function companionsOf(type: BlockTypeName): readonly CompanionLowering[] {
  return BLOCK_TYPE_LOWERINGS[type].companions ?? [];
}

const companionContext = (
  context: TypeContext,
  companion: CompanionLowering,
): CompanionContext => ({ ...context, companionId: `${context.blockId}${companion.suffix}` });

/**
 * The ids of the companion blocks an `msm:block` element registers (ADR 0094 D3): `<id>_wall`
 * for a torch, sign or hanging sign, `<id>_attached` for a stem, none otherwise. Pure; for
 * registry views (the app's `block` ids) and the clash check. Empty when the data is not an
 * object or the type is invalid.
 *
 * @param blockId - The element id.
 * @param data - The element data.
 */
export function blockGeneratedBlockIds(blockId: string, data: Json | undefined): string[] {
  if (!isRecord(data)) return [];
  try {
    return companionsOf(blockTypeOf(data, blockId)).map(
      (companion) => `${blockId}${companion.suffix}`,
    );
  } catch {
    return [];
  }
}

/**
 * The block state definitions of the companions of a block of `type`, written next to the
 * element's own (layer `resourcepack`).
 */
export function companionBlockstateFiles(
  type: BlockTypeName,
  target: Target,
  context: TypeContext,
  models: SlotModels,
): OutputFile[] {
  return companionsOf(type).map((companion) => {
    const own = companionContext(context, companion);
    const { namespace, path } = splitResourceLocation(own.companionId);
    return {
      path: assetPath(target, 'block_definition', namespace, path),
      contents: companion.blockstate(models, own),
      layer: 'resourcepack',
      schema: BLOCK_STATE_SCHEMA,
    };
  });
}

/** The vanilla block tag files the companions of a block of `type` join. */
export function companionTagFiles(
  type: BlockTypeName,
  target: Target,
  context: TypeContext,
): OutputFile[] {
  return companionsOf(type).flatMap((companion) =>
    (companion.blockTags ?? []).map((tag) =>
      vanillaTagFile(target, 'block', tag, `${context.blockId}${companion.suffix}`),
    ),
  );
}

/** One roll of `itemId` that survives explosions, as a companion drops its element's item. */
export function companionDropsItem(context: CompanionContext & { itemId: string }): JsonObject {
  const { namespace, path } = splitResourceLocation(context.companionId);
  return {
    type: 'minecraft:block',
    pools: [
      {
        bonus_rolls: 0,
        condition: { type: 'minecraft:survives_explosion' },
        entries: [{ type: 'minecraft:item', name: context.itemId }],
        rolls: 1,
      },
    ],
    random_sequence: `${namespace}:blocks/${path}`,
  };
}

/**
 * The `self` loot tables of the companions of a block of `type` (layer `datapack`):
 * `loot_table/blocks/<path><suffix>.json`, the element's item unless the companion has its
 * own table (a stem's attached form drops seeds as vanilla's).
 */
export function companionLootFiles(
  type: BlockTypeName,
  target: Target,
  context: TypeContext & { itemId: string },
): OutputFile[] {
  return companionsOf(type).map((companion) => {
    const own = { ...companionContext(context, companion), itemId: context.itemId };
    const { namespace, path } = splitResourceLocation(own.companionId);
    return {
      path: dataPath(target, 'loot_table', namespace, `blocks/${path}`),
      contents: companion.selfLoot?.(own) ?? companionDropsItem(own),
      layer: 'datapack',
      schema: LOOT_TABLE_SCHEMA,
    };
  });
}
