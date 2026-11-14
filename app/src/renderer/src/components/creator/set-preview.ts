/**
 * The pure model of the Creator's block previews for typed blocks (B272, ADR 0069 D5): which
 * model and texture each block of a bundle shows (typed blocks have `textures` and no `model`,
 * so their models come from the lowering's own tables through `block-type-model.ts`), the
 * bundle with those generated models added, and the whole set as a row of blocks: a structure
 * template with one block definition per piece (a door stands as both halves), all previewed
 * from memory over the project. Also the bundle element behind an item id, so a seeds id
 * (ADR 0068 D2) finds the crop it plants.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { ContentBundle, ContentBundleElement, ResourceLocation } from '@msm/plugin-api';
import { blockItemIdOf } from '@msm/plugin-blocks-items';
import {
  bundleAssetBytes,
  elementModel,
  elementTextureBytes,
  texturePath,
} from '../../preview/bundle-source';
import type { ResourceFolders } from '../../preview/model-chain';
import {
  appearanceTexture,
  blockTypeOfData,
  generatedModelBundle,
  slotModelRows,
} from '../../studios/blocks-items/block-type-model';
import { cropMaxAge, cropStageModel } from '../../studios/blocks-items/plant-model';

const ITEM_KIND = 'msm:item';
const BLOCK_KIND = 'msm:block';
const BLOCK_DEFINITION_KIND = 'minecraft:block_definition';

/** The model slots shown in the inventory, preferred for a piece's picture of its type. */
const SHOWN_SLOTS: readonly string[] = ['inventory'];

/** What one block of a set shows: its model, and a door's upper half. */
export interface PieceModels {
  model: string;
  upper?: string;
}

/**
 * The models a bundle block shows: the Model field for a simple block; for a typed block the
 * inventory model where the type has one (walls, fences, buttons), a crop's grown stage, a
 * door's two left halves, else the first model. `undefined` without any model.
 */
export function pieceModels(
  piece: Pick<ContentBundleElement, 'id' | 'data'>,
): PieceModels | undefined {
  const type = blockTypeOfData(piece.data);
  if (type === undefined || type === 'block') {
    const model = elementModel(piece.data);
    return model === undefined ? undefined : { model };
  }
  if (type === 'crop') {
    const model = cropStageModel(piece, cropMaxAge(piece.data));
    return model === undefined ? undefined : { model };
  }
  const rows = slotModelRows(piece).filter((row) => row.model !== undefined && row.slot !== 'item');
  const model = (name: string) => rows.find((row) => row.slot === name)?.model;
  if (type === 'door') {
    const lower = model('bottom_left');
    const upper = model('top_left');
    if (lower === undefined) return undefined;
    return upper === undefined ? { model: lower } : { model: lower, upper };
  }
  const shown = SHOWN_SLOTS.map(model).find((entry) => entry !== undefined) ?? rows[0]?.model;
  return shown === undefined ? undefined : { model: shown };
}

/** The bundle with the generated models of its typed blocks added (bundle models win). */
export function withTypedBlockModels(bundle: ContentBundle): ContentBundle {
  const ids = new Set(bundle.elements.map((entry) => entry.id));
  const added: ContentBundleElement[] = [];
  for (const piece of bundle.elements) {
    if (piece.kind !== BLOCK_KIND) continue;
    for (const model of generatedModelBundle(piece).elements) {
      if (ids.has(model.id)) continue;
      ids.add(model.id);
      added.push(model);
    }
  }
  return added.length === 0 ? bundle : { ...bundle, elements: [...bundle.elements, ...added] };
}

/** The texture id that pictures a typed block: a crop's last stage, else its main texture. */
function typedPieceTexture(data: Json): string | undefined {
  if (blockTypeOfData(data) === 'crop') {
    const stages = (data as { textures?: { stages?: Json } }).textures?.stages;
    if (Array.isArray(stages)) {
      const last = [...stages].reverse().find((entry) => typeof entry === 'string' && entry !== '');
      if (typeof last === 'string') return last;
    }
  }
  return appearanceTexture(null, data);
}

/**
 * The bytes of the picture of a bundle item or block: its model's first texture (as
 * `elementTextureBytes`), or for a typed block its own main texture; read from the bundle.
 */
export function pieceTextureBytes(
  bundle: ContentBundle,
  piece: Pick<ContentBundleElement, 'kind' | 'data'>,
  folders: ResourceFolders,
): Uint8Array | undefined {
  const own = elementTextureBytes(bundle, piece.data, folders);
  if (own !== undefined || piece.kind !== BLOCK_KIND) return own;
  const type = blockTypeOfData(piece.data);
  if (type === undefined || type === 'block') return undefined;
  const texture = typedPieceTexture(piece.data);
  if (texture === undefined) return undefined;
  const { namespace, path } = texturePath(texture, folders);
  return bundleAssetBytes(bundle, namespace, path);
}

/**
 * The bundle item or block an item id names: an `msm:item` of that id, else an `msm:block`
 * whose block item has it (its own id, or `item.id` for seeds), else a block of that id.
 */
export function bundlePieceForItem(
  bundle: ContentBundle,
  id: string,
): ContentBundleElement | undefined {
  return (
    bundle.elements.find((entry) => entry.kind === ITEM_KIND && entry.id === id) ??
    bundle.elements.find(
      (entry) => entry.kind === BLOCK_KIND && blockItemIdOf(entry.id, entry.data) === id,
    ) ??
    bundle.elements.find((entry) => entry.kind === BLOCK_KIND && entry.id === id)
  );
}

/** The whole set as a row of blocks: the structure data and the bundle that draws it. */
export interface SetRow {
  /** The blocks in the row, in bundle order (those without a model are left out). */
  pieces: { id: string; models: PieceModels }[];
  /** A structure template: one block per piece, a gap between them. */
  structure: Json;
  /** The bundle plus generated models and one preview block definition per piece. */
  bundle: ContentBundle;
}

/** The preview-only block id standing for piece `id` (never clashes with a project id). */
export function setPreviewBlockId(id: string): string {
  const colon = id.indexOf(':');
  return `${id.slice(0, colon)}:msm_set_preview/${id.slice(colon + 1)}`;
}

/**
 * The bundle's blocks as a row (ADR 0069 D5: the Creator previews the whole set), or `null`
 * when fewer than two blocks have a model.
 */
export function setRow(bundle: ContentBundle): SetRow | null {
  const pieces = bundle.elements.flatMap((entry) => {
    if (entry.kind !== BLOCK_KIND) return [];
    const models = pieceModels(entry);
    return models === undefined ? [] : [{ id: entry.id, models }];
  });
  if (pieces.length < 2) return null;
  const palette: string[] = [];
  const blocks: number[][] = [];
  const definitions: ContentBundleElement[] = [];
  let tall = false;
  pieces.forEach((piece, index) => {
    const block = setPreviewBlockId(piece.id);
    const x = index * 2;
    if (piece.models.upper === undefined) {
      definitions.push({
        id: block as ResourceLocation,
        kind: BLOCK_DEFINITION_KIND,
        data: { variants: { '': { model: piece.models.model } } },
      });
      blocks.push([x, 0, 0, palette.length]);
      palette.push(block);
      return;
    }
    tall = true;
    definitions.push({
      id: block as ResourceLocation,
      kind: BLOCK_DEFINITION_KIND,
      data: {
        variants: {
          'half=lower': { model: piece.models.model },
          'half=upper': { model: piece.models.upper },
        },
      },
    });
    blocks.push([x, 0, 0, palette.length], [x, 1, 0, palette.length + 1]);
    palette.push(`${block}[half=lower]`, `${block}[half=upper]`);
  });
  const withModels = withTypedBlockModels(bundle);
  return {
    pieces,
    structure: { size: [pieces.length * 2 - 1, tall ? 2 : 1, 1], palette, blocks },
    bundle: { ...withModels, elements: [...withModels.elements, ...definitions] },
  };
}
