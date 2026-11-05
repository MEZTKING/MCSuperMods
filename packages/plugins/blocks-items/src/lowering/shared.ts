/**
 * Output files shared by block and item lowering: language keys and item model definitions.
 */
import type { JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath } from './paths';

/** The language file display names are written to. */
export const DISPLAY_NAME_LANGUAGE = 'en_us';

/** Schema of vanilla language files. */
export const LANG_SCHEMA = '::java::assets::lang::Lang';
/** Schema of vanilla block state definitions. */
export const BLOCK_STATE_SCHEMA = '::java::assets::block_state_definition::BlockStateDefinition';
/** Schema of vanilla item model definitions. */
export const ITEM_DEFINITION_SCHEMA = '::java::assets::item_definition::ItemDefinition';
/** Schema reference of block tags. */
export const BLOCK_TAG_SCHEMA = 'tag:block';
/** Schema reference of item tags. */
export const ITEM_TAG_SCHEMA = 'tag:item';
/** Schema reference of loot tables. */
export const LOOT_TABLE_SCHEMA = 'resource:loot_table';

/**
 * One key of `assets/<namespace>/lang/en_us.json`, declared `merge: 'object'` so every
 * element's display name lands in the same file (ADR 0027).
 */
export function langFile(target: Target, namespace: string, key: string, name: string): OutputFile {
  const contents: JsonObject = { [key]: name };
  return {
    path: assetPath(target, 'lang', namespace, DISPLAY_NAME_LANGUAGE),
    contents,
    layer: 'resourcepack',
    schema: LANG_SCHEMA,
    merge: 'object',
  };
}

/** The item model definition `assets/<namespace>/items/<path>.json` showing `model`. */
export function itemDefinitionFile(
  target: Target,
  namespace: string,
  path: string,
  model: string,
): OutputFile {
  return {
    path: assetPath(target, 'item_definition', namespace, path),
    contents: { model: { type: 'minecraft:model', model } },
    layer: 'resourcepack',
    schema: ITEM_DEFINITION_SCHEMA,
  };
}

/** A non-empty string, or `undefined`. */
export const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
