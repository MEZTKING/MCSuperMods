/**
 * Lowering of `msm:entity` (ADR 0028 D1, D3): the runtime definition under `msm/`, the language
 * keys of the entity and its spawn egg, and the egg's item definition and item model when the
 * egg has a texture. No loot table is generated; `loot_table` passes through to the runtime.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import {
  assetPath,
  definitionPath,
  descriptionKey,
  EntitiesLoweringError,
  isRecord,
  spawnEggPath,
  splitResourceLocation,
} from './paths';

/** The definition format this plugin writes (ADR 0025 D2, ADR 0028 D2). */
export const DEFINITION_FORMAT = 1;

/** The language file display names are written to. */
export const DISPLAY_NAME_LANGUAGE = 'en_us';

/** Schema of vanilla language files. */
export const LANG_SCHEMA = '::java::assets::lang::Lang';
/** Schema of vanilla item model definitions (the reference blocks-items uses). */
export const ITEM_DEFINITION_SCHEMA = '::java::assets::item_definition::ItemDefinition';
/** Schema reference of vanilla models. */
export const MODEL_SCHEMA = 'resource:model';
/** The parent model of a spawn egg's item model, as vanilla eggs use it. */
export const SPAWN_EGG_PARENT_MODEL = 'minecraft:item/generated';

/** A non-empty string, or `undefined`. */
const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function entityData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new EntitiesLoweringError(`Element ${element.id}: entity data must be an object.`);
  }
  return element.data;
}

/** True when the entity registers a spawn egg: `spawn_egg` absent or an object, not `false`. */
export function hasSpawnEgg(data: JsonObject): boolean {
  return data.spawn_egg === undefined || isRecord(data.spawn_egg);
}

/**
 * The runtime entity definition: the element data without the editor-only fields
 * (`display_name`, `spawn_egg.texture`, `spawn_egg.display_name`), with `format` set to the
 * format this plugin writes.
 *
 * @throws {@link EntitiesLoweringError} If the data is not an object.
 */
export function entityDefinition(element: Element): JsonObject {
  const definition = structuredClone(entityData(element));
  delete definition.display_name;
  const egg = definition.spawn_egg;
  if (isRecord(egg)) {
    delete egg.texture;
    delete egg.display_name;
  }
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/** The language keys of an entity: its own name and, with an egg, the egg's name. */
function languageKeys(data: JsonObject, namespace: string, path: string): JsonObject {
  const keys: JsonObject = {};
  const name = nonEmptyString(data.display_name);
  if (name !== undefined) keys[descriptionKey('entity', namespace, path)] = name;
  if (hasSpawnEgg(data)) {
    const egg = isRecord(data.spawn_egg) ? data.spawn_egg : {};
    const eggName =
      nonEmptyString(egg.display_name) ?? (name === undefined ? undefined : `${name} Spawn Egg`);
    if (eggName !== undefined) {
      keys[descriptionKey('item', namespace, spawnEggPath(path))] = eggName;
    }
  }
  return keys;
}

/**
 * Lowers an `msm:entity` element: the runtime definition `msm/<ns>/entity/<path>.json` (layer
 * `msm`); the `entity.<ns>.<path>` and `item.<ns>.<path>_spawn_egg` keys of `en_us`
 * (`merge: 'object'`) when there are names to write (the egg's name defaults to
 * "<display name> Spawn Egg"); with an egg whose `texture` is set, the egg's item definition
 * and its `minecraft:item/generated` item model.
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link EntitiesLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerEntity(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = entityData(element);
  const files: OutputFile[] = [
    {
      path: definitionPath(namespace, path),
      contents: entityDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.entityDefinition,
    },
  ];
  const keys = languageKeys(data, namespace, path);
  if (Object.keys(keys).length > 0) {
    files.push({
      path: assetPath(target, 'lang', namespace, DISPLAY_NAME_LANGUAGE),
      contents: keys,
      layer: 'resourcepack',
      schema: LANG_SCHEMA,
      merge: 'object',
    });
  }
  const eggTexture = isRecord(data.spawn_egg) ? nonEmptyString(data.spawn_egg.texture) : undefined;
  if (eggTexture !== undefined) {
    const eggPath = spawnEggPath(path);
    files.push(
      {
        path: assetPath(target, 'item_definition', namespace, eggPath),
        contents: { model: { type: 'minecraft:model', model: `${namespace}:item/${eggPath}` } },
        layer: 'resourcepack',
        schema: ITEM_DEFINITION_SCHEMA,
      },
      {
        path: assetPath(target, 'model', namespace, `item/${eggPath}`),
        contents: { parent: SPAWN_EGG_PARENT_MODEL, textures: { layer0: eggTexture } },
        layer: 'resourcepack',
        schema: MODEL_SCHEMA,
      },
    );
  }
  return files;
}
