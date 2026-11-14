/**
 * Drag and drop textures (ADR 0054): a texture asset dragged onto an element becomes the
 * texture of the model that element draws with. Pure: the host applies the change as one
 * undoable data edit.
 *
 * - A `minecraft:model` element is changed itself.
 * - An `msm:item` or `msm:block` follows its `model` to the project's model element; a vanilla
 *   model (not in the project) cannot be changed.
 * - A typed `msm:block` without a `model` (stairs, slabs, saplings, leaves, ...; ADR 0067 D7)
 *   is changed itself: its `textures.all`, else the slot it already uses, else its type's first
 *   slot. A crop's stage textures are a list and are not changed by a drop.
 * - The texture slot is `layer0` when the model has one, else `all`, else its first texture,
 *   else a new `layer0` (a flat item model).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { blockTypeOfData, TEXTURE_SLOTS } from '../studios/blocks-items/block-type-model';

/** The drag data type of a texture asset: `<namespace>:<asset path>`. */
export const TEXTURE_DRAG_TYPE = 'application/x-msm-texture';

/** `textures/item/ruby.png` in `demo` as the texture id `demo:item/ruby`, or `null`. */
export function textureIdOf(namespace: string, assetPath: string): string | null {
  const match = /^textures\/(.+)\.png$/.exec(assetPath);
  return match?.[1] === undefined ? null : `${namespace}:${match[1]}`;
}

/** What a drop changes, or why it cannot. */
export type RetextureResult =
  | { ok: true; modelId: string; slot: string; data: Json; previous: string | null }
  | { ok: false; reason: string };

const record = (value: Json | undefined): Record<string, Json> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

function find(project: Project, id: string, kind: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((element) => element.id === id && element.kind === kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The change that makes `element` draw with `textureId`. */
export function retexture(project: Project, element: Element, textureId: string): RetextureResult {
  let model: Element | undefined;
  if (element.kind === 'minecraft:model') {
    model = element;
  } else if (
    element.kind === 'msm:block' &&
    typeof record(element.data)?.model !== 'string' &&
    blockTypeOfData(element.data) !== undefined &&
    blockTypeOfData(element.data) !== 'block'
  ) {
    return typedBlockTexture(element, textureId);
  } else if (element.kind === 'msm:item' || element.kind === 'msm:block') {
    const modelId = record(element.data)?.model;
    if (typeof modelId !== 'string' || modelId === '') {
      return { ok: false, reason: `${element.id} has no model to put the texture on.` };
    }
    model = find(project, modelId, 'minecraft:model');
    if (model === undefined) {
      return {
        ok: false,
        reason: `${element.id} uses the model ${modelId}, which is not in this project (a vanilla model). Give it a model of its own first.`,
      };
    }
  } else {
    return { ok: false, reason: `A texture cannot be dropped on ${element.id} (${element.kind}).` };
  }
  const data = record(model.data) ?? {};
  const textures = record(data.textures) ?? {};
  const keys = Object.keys(textures);
  const slot = 'layer0' in textures ? 'layer0' : 'all' in textures ? 'all' : (keys[0] ?? 'layer0');
  const previous = textures[slot];
  return {
    ok: true,
    modelId: model.id,
    slot,
    data: { ...data, textures: { ...textures, [slot]: textureId } },
    previous: typeof previous === 'string' ? previous : null,
  };
}

/** A typed block's own `textures` with `textureId` in its main slot. */
function typedBlockTexture(element: Element, textureId: string): RetextureResult {
  const type = blockTypeOfData(element.data);
  if (type === undefined || type === 'block') {
    return { ok: false, reason: `${element.id} has no model to put the texture on.` };
  }
  const slots = TEXTURE_SLOTS[type];
  if (slots.length === 0) {
    return {
      ok: false,
      reason: `${element.id} is a crop: set its stage textures in the Block Studio's Crop section.`,
    };
  }
  const data = record(element.data) ?? {};
  const textures = record(data.textures) ?? {};
  const used = slots.find((slot) => typeof textures[slot.key] === 'string');
  const slot = 'all' in textures ? 'all' : (used?.key ?? slots[0]?.key ?? 'all');
  const previous = textures[slot];
  return {
    ok: true,
    modelId: element.id,
    slot,
    data: { ...data, textures: { ...textures, [slot]: textureId } },
    previous: typeof previous === 'string' ? previous : null,
  };
}
