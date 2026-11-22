/**
 * Lowering of the `msm:bucketable` entity component (ADR 0109 D1, as amended after the B524
 * spike). The component itself passes through to the runtime definition (the runtime registers
 * the bucket item `<ns>:<path>_bucket`, stacking to 1, and defaults `item_name`); lowering adds
 * the files vanilla reads for that item:
 *
 * - the item definition `assets/<ns>/items/<path>_bucket.json` and its item model
 *   `assets/<ns>/models/item/<path>_bucket.json` (`minecraft:item/generated`), whose picture is
 *   the element-only `bucket_texture`, else vanilla's water bucket (`water` true, the default) or
 *   empty bucket picture, named, never bundled;
 * - the item's name under `item_name` (default `item.<ns>.<path>_bucket`): the element-only
 *   `bucket_display_name`, else "Bucket of " and the entity's display name; no key when neither
 *   is set.
 *
 * `bucket_display_name` and `bucket_texture` are stripped from the definition by `entityDefinition`.
 */
import type { Element, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { assetPath, descriptionKey, isRecord, splitResourceLocation } from './paths';

/** Component name of mobs caught in a bucket. */
export const BUCKETABLE_COMPONENT = 'msm:bucketable';
/** The element-only fields of the bucket item (ADR 0109 D1). */
export const BUCKET_ELEMENT_ONLY_FIELDS = Object.freeze(['bucket_display_name', 'bucket_texture']);
/** The parent model of the bucket's item model, as vanilla's fish buckets use it. */
export const BUCKET_PARENT_MODEL = 'minecraft:item/generated';
/** The picture of a bucket holding water when `bucket_texture` is absent (vanilla's, named). */
export const DEFAULT_WATER_BUCKET_TEXTURE = 'minecraft:item/water_bucket';
/** The picture of a bucket without water when `bucket_texture` is absent (vanilla's, named). */
export const DEFAULT_EMPTY_BUCKET_TEXTURE = 'minecraft:item/bucket';

/** Schema of vanilla item model definitions (the reference blocks-items uses). */
const ITEM_DEFINITION_SCHEMA = '::java::assets::item_definition::ItemDefinition';
/** Schema reference of vanilla models. */
const MODEL_SCHEMA = 'resource:model';

/** The path of the bucket item derived from an entity path: `<path>_bucket`. */
export const bucketItemPath = (path: string): string => `${path}_bucket`;

/** The bucket item id of an entity id: `<ns>:<path>_bucket`. */
export const bucketItemId = (id: string): string => `${id}_bucket`;

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** The entity's `msm:bucketable` component, or `undefined`. */
export function bucketableOf(data: JsonObject): JsonObject | undefined {
  const components = isRecord(data.components) ? data.components : undefined;
  const bucketable = components?.[BUCKETABLE_COMPONENT];
  return isRecord(bucketable) ? bucketable : undefined;
}

/** The picture of the bucket item: `bucket_texture`, else vanilla's water or empty bucket. */
export function bucketTexture(data: JsonObject): string {
  const own = nonEmpty(data.bucket_texture);
  if (own !== undefined) return own;
  return bucketableOf(data)?.water === false
    ? DEFAULT_EMPTY_BUCKET_TEXTURE
    : DEFAULT_WATER_BUCKET_TEXTURE;
}

/** The language key of the bucket item's name: `item_name`, else `item.<ns>.<path>_bucket`. */
export function bucketNameKey(data: JsonObject, namespace: string, path: string): string {
  return (
    nonEmpty(bucketableOf(data)?.item_name) ??
    descriptionKey('item', namespace, bucketItemPath(path))
  );
}

/**
 * The bucket item's language keys: `bucket_display_name`, else "Bucket of <display name>";
 * empty when the entity is not bucketable or has neither name.
 */
export function bucketLanguageKeys(data: JsonObject, namespace: string, path: string): JsonObject {
  if (bucketableOf(data) === undefined) return {};
  const display = nonEmpty(data.display_name);
  const name =
    nonEmpty(data.bucket_display_name) ??
    (display === undefined ? undefined : `Bucket of ${display}`);
  return name === undefined ? {} : { [bucketNameKey(data, namespace, path)]: name };
}

/**
 * The bucket item's item definition and item model (see the module comment); empty when the
 * entity has no `msm:bucketable` object.
 *
 * @param element - The entity element (its data an object).
 * @param target - The target supplying the vanilla folder names.
 */
export function bucketItemFiles(element: Element, target: Target): OutputFile[] {
  const data = isRecord(element.data) ? element.data : {};
  if (bucketableOf(data) === undefined) return [];
  const { namespace, path } = splitResourceLocation(element.id);
  const itemPath = bucketItemPath(path);
  return [
    {
      path: assetPath(target, 'item_definition', namespace, itemPath),
      contents: { model: { type: 'minecraft:model', model: `${namespace}:item/${itemPath}` } },
      layer: 'resourcepack',
      schema: ITEM_DEFINITION_SCHEMA,
    },
    {
      path: assetPath(target, 'model', namespace, `item/${itemPath}`),
      contents: { parent: BUCKET_PARENT_MODEL, textures: { layer0: bucketTexture(data) } },
      layer: 'resourcepack',
      schema: MODEL_SCHEMA,
    },
  ];
}
