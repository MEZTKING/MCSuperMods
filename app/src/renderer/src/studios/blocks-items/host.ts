/**
 * What the blocks and items Studios ask of the host beyond `StudioProps`: project texture
 * thumbnails and opening the texture editor on a project texture (painting an effect icon,
 * ADR 0055 D6). `App` provides it around the Form tab; without a provider the Effect Studio
 * shows no thumbnail and points to "New texture…" instead of painting.
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';

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
}

/** Provided by `App`; `null` outside it (tests, previews). */
export const BlocksItemsStudioHostContext = createContext<BlocksItemsStudioHost | null>(null);

/** The blocks and items Studio host, or `null` when none is provided. */
export function useBlocksItemsStudioHost(): BlocksItemsStudioHost | null {
  return useContext(BlocksItemsStudioHostContext);
}
