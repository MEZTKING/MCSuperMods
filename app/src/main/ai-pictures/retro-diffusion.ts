/**
 * Retro Diffusion (ADR 0093 D2): the pixel-art service, with Minecraft item and texture styles.
 * API facts from the official examples (github.com/Retro-Diffusion/api-examples, read
 * 2026-11-14): `POST https://api.retrodiffusion.ai/v2/inferences` with the key in `X-RD-Token`,
 * a JSON body `{ prompt, prompt_style, width, height, num_images, remove_bg, tile_x, tile_y }`,
 * an `Idempotency-Key` header per paid submission; V2 queues the task and answers
 * `{ status: 'accepted', task_id }`, polled at `GET /v2/inferences/tasks/{task_id}` until
 * `status` is `succeeded` (`result.base64_images`, raw base64 PNGs) or `failed`. Errors are
 * `{ error: { code, message } }` (V1: `{ detail }`); 401 bad key, 402 `not_enough_balance`,
 * 429 rate limited with `Retry-After`. `GET /v2/inferences/credits` checks a key for free.
 * RD Plus draws 64 to 384 pixels (the exact limits of the `mc_*` styles come from
 * `GET /v2/styles/selector`, which needs a key: verify at implementation), $0.06 a picture.
 *
 *
 * Read again 2026-11-22 (the README of github.com/Retro-Diffusion/api-examples): the Minecraft
 * styles are still `rd_plus__mc_item`, `rd_plus__mc_texture` (64 to 384 pixels, batches up to
 * 16) and the cheaper `rd_fast__mc_item`, `rd_fast__mc_texture`, with RD Mini aliases; there is
 * no skin, painting or pattern style. `check_cost: true` on the same request is "a free dry run
 * — returns the price, generates nothing, charges nothing", answering
 * `{ balance_cost, remaining_balance, base64_images: [] }` (whether V2 answers it at once or
 * queues it is not said: both are read). `GET /v2/inferences/credits` answers
 * `{ credits, balance }`. `width` and `height` are set separately; RD Plus's aspect limits are
 * not published (verify at implementation). Failed generations are refunded.
 *
 * Image input (same source, read 2026-11-22): `input_image` (raw base64, RGB without
 * transparency, no `data:` prefix) with `strength` (0 to 1, default 0.75: "low = subtle, high =
 * loose") is the img2img path; whether the input must match `width` and `height` is not said,
 * so MSM scales it to them. `input_palette` (an RGB picture) constrains the output colours.
 * `reference_images` are for RD Core, RD Pro and RD Lite styles only, not RD Plus. `seed`:
 * "same seed + settings ≈ same image". `negative` is "a placeholder — no current model uses
 * it", so what is not wanted is said in the prompt as what is wanted; `bypass_prompt_expansion`
 * is left off as the guide asks. Whether the `mc_*` styles take `input_image` is not listed per
 * style (verify at implementation).
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { encodePng, scaleRgb } from './png';
import type { GenerateInput, PictureProvider } from './provider';
import {
  type CallContext,
  sleep as defaultSleep,
  errorBody,
  field,
  PictureError,
  pictureError,
  pngFromBase64,
  send,
} from './provider';

/** The API root. */
export const RETRO_DIFFUSION_BASE = 'https://api.retrodiffusion.ai/v2';

/**
 * The style of each picture kind (RD Plus; `rd_fast__mc_*` are the cheaper ones). Blocks and a
 * mob's coat (laid on the model's boxes by the renderer) are tileable Minecraft textures;
 * items, tools, particles and patterns (one motif, cut out) Minecraft items; paintings, which
 * have no Minecraft style, RD Plus's default pixel-art style (verify at implementation which
 * RD Plus style suits vanilla's paintings best).
 */
export const RETRO_DIFFUSION_STYLES = Object.freeze({
  block: 'rd_plus__mc_texture',
  item: 'rd_plus__mc_item',
  tool: 'rd_plus__mc_item',
  skin: 'rd_plus__mc_texture',
  painting: 'rd_plus__default',
  pattern: 'rd_plus__mc_item',
  particle: 'rd_plus__mc_item',
} as const);

/** Styles drawn tileable on both axes (`tile_x`, `tile_y`). */
const TILED: ReadonlySet<string> = new Set(['block', 'skin']);

/** Styles whose background is removed (`remove_bg`) when the request asks for transparency. */
const CUT_OUT: ReadonlySet<string> = new Set(['item', 'tool', 'pattern', 'particle']);

/** The smallest and largest edge RD Plus draws (verify at implementation per style). */
export const RD_MIN_EDGE = 64;
export const RD_MAX_EDGE = 384;

/** How often a queued task is polled. */
export const RD_POLL_MS = 1500;

/** The edge asked for a texture of `size`: four times it, within RD Plus's limits. */
export function rdEdge(size: number): number {
  return Math.max(RD_MIN_EDGE, Math.min(RD_MAX_EDGE, Math.round(size * 4)));
}

/**
 * The width and height asked for a picture of `width` by `height`: four times it, the shorter
 * side raised to RD Plus's 64 and the longer one kept within 384, proportions kept as far as
 * those limits allow.
 */
export function rdSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  let scale = 4;
  scale = Math.max(scale, RD_MIN_EDGE / Math.min(w, h));
  scale = Math.min(scale, RD_MAX_EDGE / Math.max(w, h));
  const clamp = (value: number) => Math.max(RD_MIN_EDGE, Math.min(RD_MAX_EDGE, Math.round(value)));
  return { width: clamp(w * scale), height: clamp(h * scale) };
}

/** The request body of {@link GenerateInput}. */
export function rdBody(input: GenerateInput): Record<string, unknown> {
  const size = rdSize(input.width ?? input.size, input.height ?? input.size);
  const tiled = TILED.has(input.style);
  return {
    // The style gives the look; the prompt describes the subject only (the API guide's advice).
    prompt: input.prompt,
    prompt_style: RETRO_DIFFUSION_STYLES[input.style],
    width: size.width,
    height: size.height,
    num_images: input.count,
    ...(tiled ? { tile_x: true, tile_y: true } : {}),
    ...(input.transparent && CUT_OUT.has(input.style) ? { remove_bg: true } : {}),
    ...(input.reference === undefined
      ? {}
      : {
          input_image: base64Png(
            scaleRgb(
              input.reference.rgb,
              input.reference.width,
              input.reference.height,
              size.width,
              size.height,
            ),
            size.width,
            size.height,
          ),
          strength: input.strength ?? RD_REFERENCE_STRENGTH,
        }),
    ...(input.palette === undefined
      ? {}
      : { input_palette: base64Png(input.palette.rgb, input.palette.width, input.palette.height) }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  };
}

/** How much a reference may change by default: enough for the look, not the shape. */
export const RD_REFERENCE_STRENGTH = 0.5;

/** RGB pixels as raw base64 PNG (no `data:` prefix), as the API takes images. */
function base64Png(rgb: Uint8Array, width: number, height: number): string {
  return Buffer.from(encodePng(width, height, rgb, 3)).toString('base64');
}

/** A dollar amount of a response field, or `null`. */
function dollars(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The error class and detail of a failed response. */
async function failure(response: Response): Promise<PictureError> {
  const body = await errorBody(response);
  const error = field(body, 'error');
  const detail = field(body, 'detail');
  const code = String(field(error, 'code') ?? field(detail, 'code') ?? '');
  const message = String(
    field(error, 'message') ??
      field(detail, 'message') ??
      (typeof detail === 'string' ? detail : '') ??
      '',
  );
  const text = [code, message].filter((part) => part !== '').join(': ');
  if (response.status === 401 || response.status === 403 || code === 'invalid_token') {
    return pictureError('bad_key', text);
  }
  if (response.status === 402 || /balance|credit/i.test(code)) return pictureError('quota', text);
  if (response.status === 429) return pictureError('rate_limit', text);
  if (/nsfw|safety|moderation|content/i.test(`${code} ${message}`)) {
    return pictureError('refused', text);
  }
  if (response.status >= 500) return pictureError('server', text);
  return pictureError('server', `${response.status} ${text}`.trim());
}

/** The pictures of a finished result. */
function picturesOf(result: unknown): Uint8Array[] {
  const images = field(result, 'base64_images');
  if (!Array.isArray(images) || images.length === 0) {
    throw pictureError('bad_response', 'the result has no pictures');
  }
  return images.map((image) => pngFromBase64(image));
}

/** The task failure's error class. */
function taskFailure(task: unknown): PictureError {
  const error = field(task, 'error');
  const code = String(field(error, 'code') ?? (typeof error === 'string' ? error : ''));
  const message = String(field(error, 'message') ?? '');
  const text = [code, message].filter((part) => part !== '').join(': ');
  if (/balance|credit/i.test(code)) return pictureError('quota', text);
  if (/nsfw|safety|moderation|content/i.test(text)) return pictureError('refused', text);
  return pictureError('server', text);
}

export const retroDiffusionProvider: PictureProvider = {
  id: 'retro-diffusion',
  async generate(input, context) {
    const headers = {
      'X-RD-Token': context.apiKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    };
    const response = await send(context, `${RETRO_DIFFUSION_BASE}/inferences`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rdBody(input)),
    });
    if (!response.ok) throw await failure(response);
    const accepted = (await response.json().catch(() => null)) as unknown;
    // A synchronous answer (V1 shape) carries the pictures at once.
    if (Array.isArray(field(accepted, 'base64_images'))) return picturesOf(accepted);
    const taskId = field(accepted, 'task_id');
    if (typeof taskId !== 'string' || taskId === '') {
      throw pictureError('bad_response', 'no task id');
    }
    const wait = context.sleep ?? defaultSleep;
    for (;;) {
      await wait(RD_POLL_MS, context.signal);
      const poll = await send(
        context,
        `${RETRO_DIFFUSION_BASE}/inferences/tasks/${encodeURIComponent(taskId)}`,
        { method: 'GET', headers: { 'X-RD-Token': context.apiKey } },
      );
      if (!poll.ok) throw await failure(poll);
      const task = (await poll.json().catch(() => null)) as unknown;
      const status = field(task, 'status');
      if (status === 'succeeded') return picturesOf(field(task, 'result'));
      if (status === 'failed') throw taskFailure(task);
      if (status !== 'pending' && status !== 'running' && status !== 'accepted') {
        throw pictureError('bad_response', `task status ${String(status)}`);
      }
    }
  },
  async cost(input, context) {
    // The free dry run: the same body with `check_cost`, no Idempotency-Key (the guide's rule).
    const response = await send(context, `${RETRO_DIFFUSION_BASE}/inferences`, {
      method: 'POST',
      headers: { 'X-RD-Token': context.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rdBody(input), check_cost: true }),
    });
    if (!response.ok) throw await failure(response);
    let answer = (await response.json().catch(() => null)) as unknown;
    const taskId = field(answer, 'task_id');
    if (field(answer, 'balance_cost') === undefined && typeof taskId === 'string') {
      // Queued after all: read the task once it is done.
      const wait = context.sleep ?? defaultSleep;
      for (;;) {
        await wait(RD_POLL_MS, context.signal);
        const poll = await send(
          context,
          `${RETRO_DIFFUSION_BASE}/inferences/tasks/${encodeURIComponent(taskId)}`,
          { method: 'GET', headers: { 'X-RD-Token': context.apiKey } },
        );
        if (!poll.ok) throw await failure(poll);
        const task = (await poll.json().catch(() => null)) as unknown;
        const status = field(task, 'status');
        if (status === 'succeeded') {
          answer = field(task, 'result');
          break;
        }
        if (status === 'failed') throw taskFailure(task);
      }
    }
    const usd = dollars(field(answer, 'balance_cost'));
    if (usd === null) throw pictureError('bad_response', 'no price in the answer');
    return { usd, balanceUsd: dollars(field(answer, 'remaining_balance')) };
  },
  async testKey(context: CallContext) {
    try {
      const response = await send(context, `${RETRO_DIFFUSION_BASE}/inferences/credits`, {
        method: 'GET',
        headers: { 'X-RD-Token': context.apiKey },
      });
      if (!response.ok) throw await failure(response);
      return { ok: true };
    } catch (error) {
      if (error instanceof PictureError) {
        return { ok: false, error: error.message, errorClass: error.errorClass };
      }
      throw error;
    }
  },
};
