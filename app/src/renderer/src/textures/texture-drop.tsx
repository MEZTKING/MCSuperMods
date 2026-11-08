/**
 * The drop side of drag and drop textures (ADR 0054): a context the host fills with what
 * happens when a texture asset lands on an element, and a hook that makes any element a drop
 * target with a highlight.
 *
 * @packageDocumentation
 */

import { createContext, type DragEvent, useContext, useState } from 'react';
import { TEXTURE_DRAG_TYPE } from './retexture';

/** Called with the element id and the dropped asset (`<namespace>:<asset path>`). */
export type TextureDropHandler = (elementId: string, asset: string) => void;

export const TextureDropContext = createContext<TextureDropHandler | null>(null);

/** Whether a drag carries a texture asset. */
export function carriesTexture(event: DragEvent): boolean {
  return [...event.dataTransfer.types].includes(TEXTURE_DRAG_TYPE);
}

/**
 * Drop target props for `elementId` (none without a handler or element) and whether a
 * texture is over it.
 */
export function useTextureDrop(elementId: string | null): {
  over: boolean;
  dropProps: {
    onDragOver?(event: DragEvent): void;
    onDragLeave?(): void;
    onDrop?(event: DragEvent): void;
  };
} {
  const handler = useContext(TextureDropContext);
  const [over, setOver] = useState(false);
  if (handler === null || elementId === null) return { over: false, dropProps: {} };
  return {
    over,
    dropProps: {
      onDragOver(event) {
        if (!carriesTexture(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      },
      onDragLeave() {
        setOver(false);
      },
      onDrop(event) {
        if (!carriesTexture(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const asset = event.dataTransfer.getData(TEXTURE_DRAG_TYPE);
        if (asset !== '') handler(elementId, asset);
      },
    },
  };
}
