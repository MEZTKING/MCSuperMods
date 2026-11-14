/**
 * What the blocks and items Studios ask of the host beyond `StudioProps`: project texture
 * thumbnails, opening the texture editor on a project texture (painting an effect icon,
 * ADR 0055 D6), the Block Studio's texture layer hint (ADR 0059 D4) and adding an element
 * ("Make a potion", ADR 0063 D9), a new element from a template (a sapling's "New tree") and
 * the 3D preview of a typed block's models (B272). `App` provides it around the Form tab; without a provider the Effect Studio
 * shows no thumbnail and points to "New texture…" instead of painting.
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from '@msm/core';
import { createContext, useContext } from 'react';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';

/** The host actions of the blocks and items Studios. */
export interface BlocksItemsStudioHost {
  /** A PNG thumbnail of a project texture (`assets/<ns>/...png`), at most `size` pixels. */
  thumbnail(assetPath: string, size: number): Promise<Uint8Array>;
  /** Changes when asset bytes may have changed, so thumbnails reload. */
  revision: number;
  /**
   * Opens the texture editor on `assets/<namespace>/<path>`: the existing picture, or a blank
   * one of `size` when the namespace has no such asset yet (saved as a new asset).
   */
  paintTexture(namespace: string, path: string, size: { width: number; height: number }): void;
  /**
   * The layer each project texture of block model `model` draws in, from its pixels (ADR 0059
   * D4): `solid`, `cutout` or `translucent`. Absent where the host cannot read textures.
   */
  textureLayers?(
    model: string,
  ): Promise<readonly { texture: string; layer: 'solid' | 'cutout' | 'translucent' }[]>;
  /**
   * Adds a new element in one undo step and opens it ("Make a potion" in the Effect Studio,
   * ADR 0063 D9). Absent where the host cannot add elements.
   */
  addElement?(input: { id: ResourceLocation; kind: string; data: Json }): void;
  /**
   * Adds a new element `id` from the library template `templateId` in one undo step and opens
   * it (the sapling's "New tree", B272). Absent where the host cannot add elements.
   */
  newFromTemplate?(templateId: string, id: ResourceLocation): void;
  /**
   * What the Block Studio's 3D preview of a typed block's models reads (B272): the target's
   * resource folders, the project's assets and the vanilla cache. Absent: no preview.
   */
  modelPreview?: {
    folders: ResourceFolders;
    readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
    vanilla: VanillaAssetReader | null;
  };
}

/** Provided by `App`; `null` outside it (tests, previews). */
export const BlocksItemsStudioHostContext = createContext<BlocksItemsStudioHost | null>(null);

/** The blocks and items Studio host, or `null` when none is provided. */
export function useBlocksItemsStudioHost(): BlocksItemsStudioHost | null {
  return useContext(BlocksItemsStudioHostContext);
}
