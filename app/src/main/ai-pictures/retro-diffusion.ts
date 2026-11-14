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
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
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

/** The style of each picture kind (RD Plus; `rd_fast__mc_*` are the cheaper ones). */
export const RETRO_DIFFUSION_STYLES = Object.freeze({
  block: 'rd_plus__mc_texture',
  item: 'rd_plus__mc_item',
  tool: 'rd_plus__mc_item',
} as const);

/** The smallest and largest edge RD Plus draws (verify at implementation per style). */
export const RD_MIN_EDGE = 64;
export const RD_MAX_EDGE = 384;

/** How often a queued task is polled. */
export const RD_POLL_MS = 1500;

/** The edge asked for a texture of `size`: four times it, within RD Plus's limits. */
export function rdEdge(size: number): number {
  return Math.max(RD_MIN_EDGE, Math.min(RD_MAX_EDGE, Math.round(size * 4)));
}

/** The request body of {@link GenerateInput}. */
export function rdBody(input: GenerateInput): Record<string, unknown> {
  const edge = rdEdge(input.size);
  const block = input.style === 'block';
  return {
    // The style gives the look; the prompt describes the subject only (the API guide's advice).
    prompt: input.prompt,
    prompt_style: RETRO_DIFFUSION_STYLES[input.style],
    width: edge,
    height: edge,
    num_images: input.count,
    ...(block ? { tile_x: true, tile_y: true } : {}),
    ...(input.transparent && !block ? { remove_bg: true } : {}),
  };
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
