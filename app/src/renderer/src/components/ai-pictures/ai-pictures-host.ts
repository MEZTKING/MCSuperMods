/**
 * What the AI pictures UI asks of the host (ADR 0093 D6): main's AI pictures services, their
 * status, a way to open Settings, and the picture codec. `App` provides it; without a provider
 * (tests, previews) the "Make with AI" buttons are not shown.
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';
import type { AiPicturesPlatform, AiPicturesStatus } from '../../../../shared/ai-pictures';
import type { RgbaImage } from '../texture-editor/pixels';

/** Decodes and encodes pictures (a canvas in the app; plain code in tests). */
export interface PictureCodec {
  decode(bytes: Uint8Array): Promise<RgbaImage>;
  encode(image: RgbaImage): Uint8Array;
}

/** The host side of AI pictures. */
export interface AiPicturesHost {
  platform: AiPicturesPlatform;
  /** `null` while it loads. */
  status: AiPicturesStatus | null;
  /** Reads the status again (after Settings changed it). */
  refresh(): void;
  /** Opens Settings (at "AI pictures"). */
  openSettings(): void;
  /** Replaces the canvas codec (tests). */
  codec?: PictureCodec;
}

/** Provided by `App`; `null` outside it. */
export const AiPicturesContext = createContext<AiPicturesHost | null>(null);

/** The AI pictures host, or `null` when none is provided. */
export function useAiPictures(): AiPicturesHost | null {
  return useContext(AiPicturesContext);
}

/** Whether the chosen service has a key. */
export function aiPicturesReady(status: AiPicturesStatus | null): boolean {
  return status?.keys[status.service].set === true;
}

/** A request id for one generation. */
export function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `ai-picture-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
