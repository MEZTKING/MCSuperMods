/**
 * The look of an `msm:bundle` item (ADR 0095 D4): the item model definition in vanilla's bundle
 * shape, from the element's editor-only `bundle_textures` (`closed`, `open_back`,
 * `open_front`). In the inventory, while an item inside is selected, the open bundle is drawn
 * as the back picture, the selected item (vanilla's own `minecraft:bundle/selected_item` model
 * type) and the front picture; everywhere else the closed picture.
 *
 * Models written (layer `resourcepack`):
 *
 * - `closed` gives `<ns>:item/<path>` (parent `minecraft:item/generated`); without it the
 *   element's `model` is the closed bundle;
 * - `open_back` gives `<ns>:item/<path>_open_back` and `open_front`
 *   `<ns>:item/<path>_open_front`, parented on vanilla's bundle templates
 *   ({@link BUNDLE_OPEN_BACK_PARENT}, {@link BUNDLE_OPEN_FRONT_PARENT}), which the user's own
 *   client jar supplies. Without `open_back` the closed model stands behind the selected item;
 *   without `open_front` nothing is drawn in front of it.
 *
 * A bundle with neither `closed` nor `model` has no picture and gets no item model definition,
 * as any item without `model`.
 */
import type { Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { isRecord } from './paths';
import { itemDefinitionFile, nonEmptyString } from './shared';
import { GENERATED_ITEM_PARENT, modelFile } from './types/models';

/** The element-only field with the bundle's pictures. */
export const BUNDLE_TEXTURES_FIELD = 'bundle_textures';
/** Vanilla's model template of the open bundle's back (the same on both targets). */
export const BUNDLE_OPEN_BACK_PARENT = 'minecraft:item/template_bundle_open_back';
/** Vanilla's model template of the open bundle's front (the same on both targets). */
export const BUNDLE_OPEN_FRONT_PARENT = 'minecraft:item/template_bundle_open_front';
/** The item model type that draws the selected item of a bundle. */
export const BUNDLE_SELECTED_ITEM_MODEL = 'minecraft:bundle/selected_item';
/** The item model property that tells whether a bundle has a selected item. */
export const BUNDLE_HAS_SELECTED_ITEM = 'minecraft:bundle/has_selected_item';

/** The ids of the models {@link bundleItemFiles} generates, by picture. */
export function bundleModelIds(
  namespace: string,
  path: string,
): { closed: string; open_back: string; open_front: string } {
  const base = `${namespace}:item/${path}`;
  return { closed: base, open_back: `${base}_open_back`, open_front: `${base}_open_front` };
}

const plain = (model: string): JsonObject => ({ type: 'minecraft:model', model });

/**
 * The model files and the item model definition of a bundle, or `undefined` when the item has
 * neither a closed picture nor a `model` (then it has no item model definition at all).
 *
 * @param data - The item element's data (with `bundle_textures` and `model`).
 */
export function bundleItemFiles(
  target: Target,
  namespace: string,
  path: string,
  data: JsonObject,
): OutputFile[] | undefined {
  const textures: JsonObject = isRecord(data[BUNDLE_TEXTURES_FIELD])
    ? (data[BUNDLE_TEXTURES_FIELD] as JsonObject)
    : {};
  const ids = bundleModelIds(namespace, path);
  const files: OutputFile[] = [];
  const picture = (slot: 'closed' | 'open_back' | 'open_front', parent: string) => {
    const texture = nonEmptyString(textures[slot]);
    if (texture === undefined) return undefined;
    files.push(modelFile(target, ids[slot], parent, { layer0: texture }));
    return ids[slot];
  };
  const closed = picture('closed', GENERATED_ITEM_PARENT) ?? nonEmptyString(data.model);
  if (closed === undefined) return undefined;
  const back = picture('open_back', BUNDLE_OPEN_BACK_PARENT) ?? closed;
  const front = picture('open_front', BUNDLE_OPEN_FRONT_PARENT);
  const open: Json[] = [plain(back), { type: BUNDLE_SELECTED_ITEM_MODEL }];
  if (front !== undefined) open.push(plain(front));
  const definition = itemDefinitionFile(target, namespace, path, closed);
  definition.contents = {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:display_context',
      cases: [
        {
          when: 'gui',
          model: {
            type: 'minecraft:condition',
            property: BUNDLE_HAS_SELECTED_ITEM,
            on_true: { type: 'minecraft:composite', models: open },
            on_false: plain(closed),
          },
        },
      ],
      fallback: plain(closed),
    },
  };
  files.push(definition);
  return files;
}
