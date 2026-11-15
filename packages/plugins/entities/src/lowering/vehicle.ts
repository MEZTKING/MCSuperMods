/**
 * Lowering of `msm:vehicle` (ADR 0090 D2, D5, D14): the runtime definition
 * `msm/<ns>/vehicle/<path>.json` (layer `msm`), the language keys of the vehicle and its item,
 * and the item's picture: an item model definition `assets/<ns>/items/<path>.json` pointing at
 * `item.model`, or at a flat `minecraft:item/generated` model of `item.texture` written next to
 * it. The vehicle's item has the vehicle's own id (vanilla's rule for boats), so both language
 * keys use the same path. Nothing is written to vanilla data: a vanilla pack leaves the
 * definition out (it is an `msm` layer file) and ADR 0066 handles data files naming the id.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import {
  DEFINITION_FORMAT,
  DISPLAY_NAME_LANGUAGE,
  ITEM_DEFINITION_SCHEMA,
  LANG_SCHEMA,
  MODEL_SCHEMA,
  SPAWN_EGG_PARENT_MODEL,
} from './entity';
import {
  assetPath,
  descriptionKey,
  EntitiesLoweringError,
  isRecord,
  splitResourceLocation,
} from './paths';

/** The fields of a vehicle element that only the app reads (ADR 0090 D2, B409). */
export const VEHICLE_ELEMENT_ONLY_FIELDS = Object.freeze(['display_name', 'item_display_name']);

/** The parent of a vehicle item's flat model, as vanilla's boat items use it. */
export const VEHICLE_ITEM_PARENT_MODEL = SPAWN_EGG_PARENT_MODEL;

/** The runtime definition path `msm/<namespace>/vehicle/<path>.json` (ADR 0090 D2). */
export function vehicleDefinitionPath(namespace: string, path: string): string {
  return `msm/${namespace}/vehicle/${path}.json`;
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function vehicleData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new EntitiesLoweringError(`Element ${element.id}: vehicle data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime vehicle definition: the element data without the element-only fields
 * (`display_name`, `item_display_name`), with `format` set to the format this plugin writes.
 *
 * @throws {@link EntitiesLoweringError} If the data is not an object.
 */
export function vehicleDefinition(element: Element): JsonObject {
  const definition = structuredClone(vehicleData(element));
  for (const field of VEHICLE_ELEMENT_ONLY_FIELDS) delete definition[field];
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * The item's picture: `{ model }` when `item.model` is set, `{ texture }` when only
 * `item.texture` is, `undefined` when neither is (the item then shows the missing model).
 */
export function vehicleItemPicture(
  data: JsonObject,
): { model: string } | { texture: string } | undefined {
  const item = isRecord(data.item) ? data.item : undefined;
  const model = nonEmptyString(item?.model);
  if (model !== undefined) return { model };
  const texture = nonEmptyString(item?.texture);
  return texture === undefined ? undefined : { texture };
}

/** The language keys: `entity.<ns>.<path>` and `item.<ns>.<path>` (the item's name falls back to the vehicle's). */
function languageKeys(data: JsonObject, namespace: string, path: string): JsonObject {
  const keys: JsonObject = {};
  const name = nonEmptyString(data.display_name);
  if (name !== undefined) keys[descriptionKey('entity', namespace, path)] = name;
  const itemName = nonEmptyString(data.item_display_name) ?? name;
  if (itemName !== undefined) keys[descriptionKey('item', namespace, path)] = itemName;
  return keys;
}

/**
 * Lowers an `msm:vehicle` element: the runtime definition (layer `msm`, schema
 * `msm:vehicle_definition`); the `en_us` keys (`merge: 'object'`) when there are names; and the
 * item's model definition (plus its flat item model when only `item.texture` is set).
 *
 * @param element - The element.
 * @param target - The target supplying the vanilla folder names.
 * @returns The output files.
 * @throws {@link EntitiesLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerVehicle(element: Element, target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  const data = vehicleData(element);
  const files: OutputFile[] = [
    {
      path: vehicleDefinitionPath(namespace, path),
      contents: vehicleDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.vehicleDefinition,
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
  const picture = vehicleItemPicture(data);
  if (picture !== undefined) {
    const model = 'model' in picture ? picture.model : `${namespace}:item/${path}`;
    files.push({
      path: assetPath(target, 'item_definition', namespace, path),
      contents: { model: { type: 'minecraft:model', model } },
      layer: 'resourcepack',
      schema: ITEM_DEFINITION_SCHEMA,
    });
    if ('texture' in picture) {
      files.push({
        path: assetPath(target, 'model', namespace, `item/${path}`),
        contents: { parent: VEHICLE_ITEM_PARENT_MODEL, textures: { layer0: picture.texture } },
        layer: 'resourcepack',
        schema: MODEL_SCHEMA,
      });
    }
  }
  return files;
}
