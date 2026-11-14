/**
 * One round of AI pictures (ADR 0093 D3, D4): ask main for pictures, then clean each one up
 * into a Minecraft-style texture. Also the batch the Creator and "Surprise me" run on "Make it"
 * (D7): one request per texture, with progress and a cancel; a failure keeps the built-in
 * picture and says so.
 *
 * @packageDocumentation
 */

import type {
  AiPictureErrorClass,
  AiPictureStyle,
  AiPicturesPlatform,
} from '../../../../shared/ai-pictures';
import type { ChangeItem } from '../../changeset/changeset';
import type { RgbaImage } from '../texture-editor/pixels';
import { decodePicture, encodePicture, MAX_DECODED_EDGE } from '../texture-editor/png-canvas';
import type { PictureCodec } from './ai-pictures-host';
import { newRequestId } from './ai-pictures-host';
import { cleanUpPicture } from './cleanup';
import { defaultPrompt, styleForTexturePath } from './prompt';

/** The canvas codec of the app. */
export const canvasCodec: PictureCodec = {
  decode: (bytes) => decodePicture(bytes, MAX_DECODED_EDGE),
  encode: encodePicture,
};

/** One picture, before and after the clean-up. */
export interface AiCandidate {
  /** What the service sent. */
  raw: Uint8Array;
  /** The cleaned-up texture's PNG. */
  cleaned: Uint8Array;
  image: RgbaImage;
}

/** What a round asks for. */
export interface AiRound {
  prompt: string;
  style: AiPictureStyle;
  size: number;
  count: number;
  /** Shades per hue cluster (default 6). */
  shades?: number;
  /** A dark outline on items and tools (default on). */
  outline?: boolean;
}

/** A failed round. */
export class AiRoundError extends Error {
  readonly errorClass: AiPictureErrorClass;
  constructor(errorClass: AiPictureErrorClass, message: string) {
    super(message);
    this.name = 'AiRoundError';
    this.errorClass = errorClass;
  }
}

/** Cleans one picture up. */
export async function cleanUpBytes(
  codec: PictureCodec,
  raw: Uint8Array,
  round: Pick<AiRound, 'style' | 'size' | 'shades' | 'outline'>,
): Promise<AiCandidate> {
  const decoded = await codec.decode(raw);
  const image = cleanUpPicture(decoded, {
    size: round.size,
    style: round.style,
    ...(round.shades === undefined ? {} : { shades: round.shades }),
    ...(round.outline === undefined ? {} : { outline: round.outline }),
  });
  return { raw, cleaned: codec.encode(image), image };
}

/**
 * Asks for `round.count` pictures and cleans them up. `onRequest` gets the request id first,
 * so the caller can cancel it. Throws {@link AiRoundError}.
 */
export async function runRound(
  platform: AiPicturesPlatform,
  codec: PictureCodec,
  round: AiRound,
  onRequest?: (requestId: string) => void,
): Promise<AiCandidate[]> {
  const requestId = newRequestId();
  onRequest?.(requestId);
  const result = await platform.generate({
    requestId,
    prompt: round.prompt,
    style: round.style,
    size: round.size,
    count: round.count,
    transparent: round.style !== 'block',
  });
  if (!result.ok) throw new AiRoundError(result.errorClass, result.error);
  const out: AiCandidate[] = [];
  for (const raw of result.images) {
    try {
      out.push(await cleanUpBytes(codec, raw, round));
    } catch {
      // A picture that cannot be read is left out; the others still show.
    }
  }
  if (out.length === 0) {
    throw new AiRoundError('bad_response', 'None of the pictures could be read.');
  }
  return out;
}

// The batch of "Make it" ----------------------------------------------------------------------

/** Texture paths the batch replaces: block and item textures. */
const TEXTURE_PATH = /^textures\/(block|item)\/[^/]+\.png$/;

/** Progress of a batch. */
export interface AiBatchProgress {
  done: number;
  total: number;
  /** The texture being made, as `<namespace>:<path>`. */
  current: string | null;
}

/** What the batch reads of a change item (planned items have no id yet). */
export type AssetItem = Pick<ChangeItem, 'op' | 'asset'>;

/** The outcome of a batch. */
export interface AiBatchResult<T extends AssetItem = ChangeItem> {
  items: T[];
  /** Textures made by AI. */
  made: string[];
  /** Textures that kept the built-in picture, with why. */
  failed: { texture: string; reason: string }[];
  cancelled: boolean;
}

/** Options of {@link aiTextures}. */
export interface AiBatchOptions {
  platform: AiPicturesPlatform;
  codec: PictureCodec;
  /** The theme word added to each description. */
  theme?: string;
  onProgress?(progress: AiBatchProgress): void;
  /** Called with each request id, so a cancel can reach main. */
  onRequest?(requestId: string): void;
  /** Checked before each request; `true` stops the batch (the rest keep their pictures). */
  cancelled?(): boolean;
}

/** Which items the batch would replace. */
export function aiTextureItems<T extends AssetItem>(items: readonly T[]): T[] {
  return items.filter(isAiTextureItem);
}

/** Whether the batch replaces `item`: a block or item texture. */
export function isAiTextureItem(item: AssetItem): boolean {
  return item.op === 'asset' && item.asset !== undefined && TEXTURE_PATH.test(item.asset.path);
}

/**
 * Replaces the bytes of each block and item texture in `items` with a cleaned-up AI picture
 * of the same size, one request per texture. Failures keep the built-in picture.
 */
export async function aiTextures<T extends AssetItem>(
  items: readonly T[],
  options: AiBatchOptions,
): Promise<AiBatchResult<T>> {
  const total = aiTextureItems(items).length;
  const made: string[] = [];
  const failed: { texture: string; reason: string }[] = [];
  let done = 0;
  let cancelled = false;
  const out: T[] = [];
  for (const item of items) {
    if (!isAiTextureItem(item) || item.asset === undefined) {
      out.push(item);
      continue;
    }
    const asset = item.asset;
    const texture = `${asset.namespace}:${asset.path}`;
    if (cancelled || options.cancelled?.() === true) {
      cancelled = true;
      out.push(item);
      continue;
    }
    options.onProgress?.({ done, total, current: texture });
    try {
      const size = await sizeOf(options.codec, asset.bytes);
      const style = styleForTexturePath(asset.path);
      const [first] = await runRound(
        options.platform,
        options.codec,
        { prompt: defaultPrompt(asset.path, style, options.theme), style, size, count: 1 },
        options.onRequest,
      );
      if (first === undefined) throw new Error('No picture came back.');
      out.push({ ...item, asset: { ...asset, bytes: first.cleaned } });
      made.push(texture);
    } catch (error) {
      if (error instanceof AiRoundError && error.errorClass === 'cancelled') cancelled = true;
      else failed.push({ texture, reason: error instanceof Error ? error.message : String(error) });
      out.push(item);
    }
    done += 1;
    options.onProgress?.({ done, total, current: null });
  }
  return { items: out, made, failed, cancelled };
}

/** The texture's edge: 32 for pictures 32 or more wide, else 16. */
async function sizeOf(codec: PictureCodec, bytes: Uint8Array): Promise<number> {
  try {
    const image = await codec.decode(bytes);
    return image.width >= 32 ? 32 : 16;
  } catch {
    return 16;
  }
}

/** A note for the user after a batch, or `null` when every texture was made. */
export function batchNote(result: AiBatchResult<AssetItem>): string | null {
  const parts: string[] = [];
  if (result.made.length > 0) {
    parts.push(
      `AI pictures made ${result.made.length} texture${result.made.length === 1 ? '' : 's'}.`,
    );
  }
  if (result.failed.length > 0) {
    const first = result.failed[0];
    parts.push(
      `${result.failed.length} kept the built-in picture${first === undefined ? '' : `: ${first.reason}`}`,
    );
  }
  if (result.cancelled) parts.push('Stopped: the rest kept the built-in pictures.');
  return parts.length === 0 ? null : parts.join(' ');
}
