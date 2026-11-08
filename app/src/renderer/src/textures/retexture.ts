/**
 * Drag and drop textures (ADR 0054): a texture asset dragged onto an element becomes the
 * texture of the model that element draws with. Pure: the host applies the change as one
 * undoable data edit.
 *
 * - A `minecraft:model` element is changed itself.
 * - An `msm:item` or `msm:block` follows its `model` to the project's model element; a vanilla
 *   model (not in the project) cannot be changed.
 * - The texture slot is `layer0` when the model has one, else `all`, else its first texture,
 *   else a new `layer0` (a flat item model).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';

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
