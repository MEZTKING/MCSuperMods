/**
 * OpenAI's Image API (ADR 0093 D2). API facts from the official reference
 * (developers.openai.com/api/reference/resources/images, read 2026-11-14):
 * `POST https://api.openai.com/v1/images/generations` with `Authorization: Bearer <key>` and a
 * JSON body `{ model, prompt, n (1 to 10), size, quality, background, output_format }`; GPT
 * image models always answer base64 in `data[].b64_json`. `background: 'transparent'` needs
 * `output_format` `png` or `webp`; the GPT-Image-2.6 models (Sunburst, Flare) support it.
 * Errors are `{ error: { message, type, code } }`; a declined prompt has the code
 * `moderation_blocked`. Image output is billed by tokens ($30 per million for 2.5 and 2.6;
 * no per-picture price is published for them: verify at implementation). Latency can reach two
 * minutes, so the service's time-out is longer than that.
 *
 * @packageDocumentation
 */

import type { GenerateInput, PictureProvider } from './provider';
import { errorBody, field, PictureError, pictureError, pngFromBase64, send } from './provider';

/** The API root. */
export const OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * The image model: GPT-Image-2.6 Flare, the guide's "fast, high-quality everyday image
 * generation" model with transparent backgrounds (verify at implementation).
 */
export const OPENAI_IMAGE_MODEL = 'gpt-image-2.6-flare';

/** The size asked for: the smallest square every GPT image model takes. */
export const OPENAI_SIZE = '1024x1024';

/** What each style adds to the description (the model has no Minecraft style of its own). */
export const OPENAI_STYLE_WORDS = Object.freeze({
  block:
    'A single square Minecraft block texture, seamless and tileable, flat front view filling the whole square, chunky 16 by 16 pixel art, limited palette, light from the top left, no text, no border.',
  item: 'A single Minecraft inventory item icon, one object centred on a plain background, chunky 16 by 16 pixel art, limited palette, dark outline, light from the top left, no text.',
  tool: 'A single Minecraft tool icon pointing diagonally from the bottom left to the top right, handle at the bottom left, one object centred on a plain background, chunky 16 by 16 pixel art, limited palette, dark outline, light from the top left, no text.',
  skin: 'A single square seamless tileable Minecraft texture of the creature’s fur, hide or scales, flat, filling the whole square, chunky 16 by 16 pixel art, limited palette, no face, no text, no border.',
  painting:
    'A Minecraft painting: a small framed-free pixel-art scene filling the whole picture, chunky pixels, limited palette, soft muted colours, no text, no border.',
  pattern:
    'A single bold flat emblem or motif, one simple shape centred on a plain background, chunky pixel art, two or three shades, no text, no border.',
  particle:
    'A single tiny Minecraft particle sprite, one small glowing shape centred on a plain background, chunky 8 by 8 pixel art, very few colours, no text.',
} as const);

/** The size asked for a picture of `width` by `height`: square, wide or tall. */
export function openAiSize(width: number, height: number): string {
  if (width >= height * 1.25) return '1536x1024';
  if (height >= width * 1.25) return '1024x1536';
  return OPENAI_SIZE;
}

/** The request body of {@link GenerateInput}. */
export function openAiBody(input: GenerateInput): Record<string, unknown> {
  const transparent =
    input.transparent &&
    input.style !== 'block' &&
    input.style !== 'skin' &&
    input.style !== 'painting';
  return {
    model: OPENAI_IMAGE_MODEL,
    prompt: `${input.prompt.trim()}\n\n${OPENAI_STYLE_WORDS[input.style]}`,
    n: input.count,
    size: openAiSize(input.width ?? input.size, input.height ?? input.size),
    quality: 'low',
    background: transparent ? 'transparent' : 'opaque',
    output_format: 'png',
  };
}

async function failure(response: Response): Promise<PictureError> {
  const body = await errorBody(response);
  const error = field(body, 'error');
  const code = String(field(error, 'code') ?? '');
  const type = String(field(error, 'type') ?? '');
  const message = String(field(error, 'message') ?? '');
  const text = message === '' ? code : message;
  if (response.status === 401 || code === 'invalid_api_key') return pictureError('bad_key', text);
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') {
    return pictureError('quota', text);
  }
  if (response.status === 429) return pictureError('rate_limit', text);
  if (
    code === 'moderation_blocked' ||
    code === 'content_policy_violation' ||
    type === 'image_generation_user_error'
  ) {
    return pictureError('refused', text);
  }
  if (response.status === 403) return pictureError('bad_key', text);
  return pictureError('server', `${response.status} ${text}`.trim());
}

export const openAiProvider: PictureProvider = {
  id: 'openai',
  async generate(input, context) {
    const response = await send(context, `${OPENAI_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAiBody(input)),
    });
    if (!response.ok) throw await failure(response);
    const body = (await response.json().catch(() => null)) as unknown;
    const data = field(body, 'data');
    if (!Array.isArray(data) || data.length === 0) {
      throw pictureError('bad_response', 'the answer has no pictures');
    }
    return data.map((entry) => pngFromBase64(field(entry, 'b64_json')));
  },
  async cost() {
    // OpenAI bills image output by tokens and has no free price check: no price a picture.
    return { usd: null, balanceUsd: null };
  },
  async testKey(context) {
    try {
      const response = await send(
        context,
        `${OPENAI_BASE}/models/${encodeURIComponent(OPENAI_IMAGE_MODEL)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${context.apiKey}` } },
      );
      if (response.status === 404) {
        return {
          ok: false,
          errorClass: 'server',
          error: `The key works, but the model ${OPENAI_IMAGE_MODEL} is not available to this account.`,
        };
      }
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
