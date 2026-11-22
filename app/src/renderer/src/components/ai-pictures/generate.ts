/**
 * One round of AI pictures (ADR 0093 D3, D4): ask main for pictures, then clean each one up
 * into a Minecraft-style texture. Also the batch the Creator and "Surprise me" run on "Make it"
 * (D7): one request per texture, with progress and a cancel; a failure keeps the built-in
 * picture and says so.
 *
 * @packageDocumentation
 */

import {
  AI_PICTURES_REFERENCE_MAX_EDGE,
  type AiPictureCost,
  type AiPictureCostRequest,
  type AiPictureErrorClass,
  type AiPictureRaster,
  type AiPictureServiceId,
  type AiPictureStyle,
  type AiPicturesPlatform,
} from '../../../../shared/ai-pictures';
import type { ChangeItem } from '../../changeset/changeset';
import type { RgbaImage } from '../texture-editor/pixels';
import { decodePicture, encodePicture, MAX_DECODED_EDGE } from '../texture-editor/png-canvas';
import type { PictureCodec } from './ai-pictures-host';
import { newRequestId } from './ai-pictures-host';
import { type AiCheck, checkPicture, checkWords, dominantColour, withArticle } from './checks';
import { cleanUpPicture, type SeamCheck, seamCheck } from './cleanup';
import { buildPrompt, colourWords, slotOf, styleForTexturePath, wordsOf } from './prompt';
import { type AiPictureShape, applyLayout } from './shapes';

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
  /** A block texture's seam check (tileable `mc_texture` pictures only). */
  seam?: SeamCheck;
  /** The checks it passed or failed (checked rounds). */
  check?: AiCheck;
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
  /**
   * What the picture is made for when it is not a square block, item or tool texture: its
   * request size, clean-up size and layout (`shapes.ts`). Its style wins over `style`.
   */
  shape?: AiPictureShape;
  /** MSM's drawing as the reference, how much it may change, the palette and the seed. */
  reference?: AiPictureRaster;
  strength?: number;
  palette?: AiPictureRaster;
  seed?: number;
}

/** The request fields of a round (style, sizes, transparency), as main takes them. */
export function roundRequest(round: AiRound): AiPictureCostRequest {
  const shape = round.shape;
  const style = shape?.style ?? round.style;
  const square = shape === undefined || shape.width === shape.height;
  return {
    prompt: round.prompt,
    style,
    size: shape === undefined ? round.size : Math.max(8, Math.min(64, shape.width)),
    ...(square ? {} : { width: shape.width, height: shape.height }),
    count: round.count,
    transparent: style !== 'block' && style !== 'skin' && style !== 'painting',
    ...(round.reference === undefined ? {} : { reference: round.reference }),
    ...(round.strength === undefined ? {} : { strength: round.strength }),
    ...(round.palette === undefined ? {} : { palette: round.palette }),
    ...(round.seed === undefined ? {} : { seed: round.seed }),
  };
}

/** The price of a round before it is sent, or `null` when main cannot say. */
export async function roundCost(
  platform: AiPicturesPlatform,
  round: AiRound,
): Promise<AiPictureCost | null> {
  if (platform.cost === undefined) return null;
  try {
    return await platform.cost(roundRequest(round));
  } catch {
    return null;
  }
}

/** A price in words: "4 pictures cost $0.24 on your account (balance $9.76)." */
export function costWords(
  cost: AiPictureCost | null,
  count: number,
  service: AiPictureServiceId | null,
): string {
  const pictures = `${count} picture${count === 1 ? '' : 's'}`;
  if (cost === null) {
    return `The price of ${pictures} could not be checked; it is charged to your own account.`;
  }
  if (!cost.ok) return `The price could not be checked: ${cost.error}`;
  if (cost.usd === null) {
    return service === 'openai'
      ? `OpenAI charges ${pictures} by image tokens and gives no price in advance (about $30 per million output tokens).`
      : `${pictures}: the service gives no price in advance.`;
  }
  const balance = cost.balanceUsd === null ? '' : ` (balance $${cost.balanceUsd.toFixed(2)})`;
  return `${pictures} cost $${cost.usd.toFixed(2)} on your account${balance}.`;
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
  round: Pick<AiRound, 'style' | 'size' | 'shades' | 'outline' | 'shape'>,
): Promise<AiCandidate> {
  const decoded = await codec.decode(raw);
  const shape = round.shape;
  const style = shape?.style ?? round.style;
  const cleaned = cleanUpPicture(decoded, {
    size: shape === undefined ? round.size : shape.width,
    ...(shape === undefined ? {} : { width: shape.width, height: shape.height }),
    style,
    ...(round.shades === undefined ? {} : { shades: round.shades }),
    ...(round.outline === undefined ? {} : { outline: round.outline }),
  });
  const image = shape === undefined ? cleaned : applyLayout(cleaned, shape);
  const seam = style === 'block' ? seamCheck(cleaned) : undefined;
  return { raw, cleaned: codec.encode(image), image, ...(seam === undefined ? {} : { seam }) };
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
  const result = await platform.generate({ requestId, ...roundRequest(round) });
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
  /** The set's seed (default: one random seed for the whole batch). */
  seed?: number;
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
 * Replaces the bytes of each block and item texture in `items` with a checked AI picture of the
 * same size, one checked round per texture (ADR 0093, 2026-11-22). The batch is one set: every
 * piece gets one seed and one palette (the colours of all the built-in pictures, which MSM drew
 * in the flow's colour), so the pieces match. Each texture's built-in picture, MSM's drawing of
 * that slot, is its reference and the shape its result is checked against; the prompt names
 * the slot, its material and colour. A texture whose pictures fail twice, or whose request
 * fails, keeps MSM's drawing, and the note says why.
 */
export async function aiTextures<T extends AssetItem>(
  items: readonly T[],
  options: AiBatchOptions,
): Promise<AiBatchResult<T>> {
  const textures = aiTextureItems(items);
  const total = textures.length;
  const made: string[] = [];
  const failed: { texture: string; reason: string }[] = [];
  let done = 0;
  let cancelled = false;
  const out: T[] = [];
  const builtIn = new Map<T, RgbaImage>();
  for (const item of textures) {
    if (item.asset === undefined) continue;
    try {
      builtIn.set(item, await options.codec.decode(item.asset.bytes));
    } catch {
      // A built-in picture that cannot be read is sent without a reference.
    }
  }
  const palette = paletteRaster([...builtIn.values()]);
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000);
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
      const reference = builtIn.get(item);
      const size = reference === undefined ? 16 : reference.width >= 32 ? 32 : 16;
      const style = styleForTexturePath(asset.path);
      const colour = reference === undefined ? undefined : dominantColour(reference);
      const subject = {
        name: asset.path,
        style,
        ...(colour === undefined ? {} : { colour }),
        ...(options.theme === undefined ? {} : { theme: options.theme }),
      };
      const slot = slotOf(asset.path, style);
      const result = await runCheckedRound(
        options.platform,
        options.codec,
        { prompt: buildPrompt(subject), style, size, count: 1 },
        {
          noun: slot?.noun ?? (wordsOf(asset.path) || 'picture'),
          ...(reference === undefined ? {} : { reference, referencePng: asset.bytes }),
          ...(colour === undefined ? {} : { colour, colourName: colourWords(colour) }),
          face: style === 'block',
          ...(palette === undefined ? {} : { palette }),
          seed,
          strongPrompt: buildPrompt({ ...subject, strong: true }),
        },
        options.onRequest,
      );
      const first = result.candidates[0];
      if (first === undefined) {
        failed.push({ texture, reason: result.note ?? 'No picture passed the check.' });
        out.push(item);
      } else {
        out.push({ ...item, asset: { ...asset, bytes: first.cleaned } });
        made.push(texture);
      }
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

// Checked rounds (2026-11-22) ----------------------------------------------------------------

/** `image` flattened on `background` as RGB (Retro Diffusion takes no transparency). */
export function rasterOf(
  image: RgbaImage,
  background: readonly [number, number, number] = [255, 255, 255],
): AiPictureRaster {
  const rgb = new Uint8Array(image.width * image.height * 3);
  for (let at = 0, to = 0; at < image.data.length; at += 4, to += 3) {
    const a = (image.data[at + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c += 1) {
      rgb[to + c] = Math.round((image.data[at + c] ?? 0) * a + (background[c] ?? 0) * (1 - a));
    }
  }
  return { width: image.width, height: image.height, rgb };
}

/**
 * The colours of `images` as a palette picture (one pixel each, in one row; at most `most`, the
 * commonest first), or `undefined` when they have none. A set shares one, so its pieces match.
 */
export function paletteRaster(
  images: readonly RgbaImage[],
  most = AI_PICTURES_REFERENCE_MAX_EDGE,
): AiPictureRaster | undefined {
  const counts = new Map<number, number>();
  for (const image of images) {
    for (let at = 0; at < image.data.length; at += 4) {
      if ((image.data[at + 3] ?? 0) < 128) continue;
      const key =
        ((image.data[at] ?? 0) << 16) |
        ((image.data[at + 1] ?? 0) << 8) |
        (image.data[at + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const colours = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, Math.max(1, Math.min(most, AI_PICTURES_REFERENCE_MAX_EDGE)))
    .map(([key]) => key);
  if (colours.length === 0) return undefined;
  const rgb = new Uint8Array(colours.length * 3);
  colours.forEach((key, index) => {
    rgb.set([(key >> 16) & 255, (key >> 8) & 255, key & 255], index * 3);
  });
  return { width: colours.length, height: 1, rgb };
}

/** What a checked round is checked against and helped by. */
export interface AiGuard {
  /** What the thing is called in the plain line ("chestplate"). */
  noun: string;
  /** MSM's drawing of the thing (the reference and the shape). */
  reference?: RgbaImage;
  /** Its PNG, shown and used when every picture fails. */
  referencePng?: Uint8Array;
  /** The asked colour and its words. */
  colour?: readonly [number, number, number];
  colourName?: string;
  /** A block face: checked for a seam, not for a shape. */
  face?: boolean;
  /** The set's palette and seed (shared by every piece of a set). */
  palette?: AiPictureRaster | undefined;
  seed?: number;
  /** The prompt of the second attempt. */
  strongPrompt?: string;
}

/** How much the service may change the reference: the first attempt and the stronger one. */
export const REFERENCE_STRENGTH = 0.5;
export const STRONG_REFERENCE_STRENGTH = 0.35;

/** A picture that failed its check, with why. */
export interface AiRejected {
  candidate: AiCandidate;
  words: string;
}

/** The outcome of {@link runCheckedRound}. */
export interface AiCheckedRound {
  /** Pictures that passed their checks. */
  candidates: AiCandidate[];
  rejected: AiRejected[];
  /** MSM's drawing, when every picture failed twice. */
  fallback?: AiCandidate;
  /** A plain line for the user, or `null`. */
  note: string | null;
  /** How many requests were sent (1, or 2 after a retry). */
  requests: number;
}

/** The plain line shown in place of failed pictures (`words`: why they failed). */
export function fallbackLine(noun: string, words?: string): string {
  const why = words ?? `did not look like ${withArticle(noun)}`;
  return `The AI picture ${why}, so here is MSM's drawing; try again or edit it.`;
}

/**
 * A round whose pictures are checked before they are shown (ADR 0093, 2026-11-22): sent with
 * MSM's drawing as the reference (and the set's palette and seed), each cleaned picture checked
 * for its shape, colour and seams; when none passes, one more request with the stronger prompt
 * and a subtler change; when none passes again, MSM's drawing with a plain line. Never a wrong
 * picture without saying so. Throws {@link AiRoundError} as {@link runRound} does.
 */
export async function runCheckedRound(
  platform: AiPicturesPlatform,
  codec: PictureCodec,
  round: AiRound,
  guard: AiGuard,
  onRequest?: (requestId: string) => void,
): Promise<AiCheckedRound> {
  // The drawing goes through the same clean-up as the pictures (crop, fit, outline), so their
  // outlines are compared like for like.
  const style = round.shape?.style ?? round.style;
  const compared =
    guard.reference === undefined || guard.face === true
      ? guard.reference
      : cleanUpPicture(guard.reference, { size: round.size, style });
  const target = {
    ...(compared === undefined ? {} : { reference: compared }),
    ...(guard.colour === undefined ? {} : { colour: guard.colour }),
    // A face whose own drawing does not tile (a framed block) is not held to the seam check.
    ...(guard.face === undefined
      ? {}
      : {
          face: guard.face && (guard.reference === undefined || seamCheck(guard.reference).tiles),
        }),
  };
  const rejected: AiRejected[] = [];
  let requests = 0;
  for (const strong of [false, true]) {
    const attempt: AiRound = {
      ...round,
      ...(strong && guard.strongPrompt !== undefined ? { prompt: guard.strongPrompt } : {}),
      ...(guard.reference === undefined
        ? {}
        : {
            reference: rasterOf(guard.reference),
            strength: strong ? STRONG_REFERENCE_STRENGTH : REFERENCE_STRENGTH,
          }),
      ...(guard.palette === undefined ? {} : { palette: guard.palette }),
      ...(guard.seed === undefined ? {} : { seed: strong ? guard.seed + 1 : guard.seed }),
    };
    requests += 1;
    const made = await runRound(platform, codec, attempt, onRequest);
    const passed: AiCandidate[] = [];
    for (const candidate of made) {
      const check = checkPicture(candidate.image, target);
      const checked = { ...candidate, check };
      if (check.ok) passed.push(checked);
      else
        rejected.push({
          candidate: checked,
          words: checkWords(check, guard.noun, guard.colourName),
        });
    }
    if (passed.length > 0) {
      const left = rejected.length;
      return {
        candidates: passed,
        rejected,
        note:
          left === 0
            ? null
            : `${left} picture${left === 1 ? '' : 's'} ${rejected[0]?.words ?? 'failed the check'}, so ${left === 1 ? 'it was' : 'they were'} left out.`,
        requests,
      };
    }
  }
  if (guard.reference !== undefined && guard.referencePng !== undefined) {
    return {
      candidates: [],
      rejected,
      fallback: { raw: guard.referencePng, cleaned: guard.referencePng, image: guard.reference },
      note: fallbackLine(guard.noun, rejected[0]?.words),
      requests,
    };
  }
  return {
    candidates: [],
    rejected,
    note: `The AI pictures ${rejected[0]?.words ?? 'failed the check'}; try again with another description.`,
    requests,
  };
}
