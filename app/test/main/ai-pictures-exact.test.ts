/**
 * Retro Diffusion with MSM's drawing (ADR 0093, 2026-11-22): the reference as `input_image`
 * (RGB, scaled to the request) with `strength`, the palette as `input_palette`, the set's seed,
 * the styles and sizes of skins, paintings, patterns and particles, the free `check_cost` price,
 * OpenAI's sizes and its lack of a price, and the fake service's img2img echo.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { fakeProvider } from '../../src/main/ai-pictures/fake';
import { openAiBody, openAiProvider, openAiSize } from '../../src/main/ai-pictures/openai';
import { encodePng, scaleRgb } from '../../src/main/ai-pictures/png';
import type { CallContext } from '../../src/main/ai-pictures/provider';
import {
  RD_REFERENCE_STRENGTH,
  RETRO_DIFFUSION_BASE,
  rdBody,
  rdSize,
  retroDiffusionProvider,
} from '../../src/main/ai-pictures/retro-diffusion';

const input = {
  prompt: 'golden sun chestplate',
  style: 'item' as const,
  size: 16,
  count: 4,
  transparent: true,
};

/** The width, height and colour type of a PNG. */
function header(base64: string): { width: number; height: number; colourType: number } {
  const bytes = Buffer.from(base64, 'base64');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes[25] ?? -1,
  };
}

function context(fetch: typeof globalThis.fetch): CallContext {
  return { apiKey: 'k', fetch, signal: new AbortController().signal, sleep: async () => {} };
}

describe('Retro Diffusion requests', () => {
  it('sends MSM’s drawing as an RGB input_image at the request size, with strength, palette and seed', () => {
    const reference = {
      width: 2,
      height: 2,
      rgb: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]),
    };
    const palette = { width: 3, height: 1, rgb: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const body = rdBody({ ...input, reference, palette, seed: 42 });
    expect(body).toMatchObject({
      prompt_style: 'rd_plus__mc_item',
      width: 64,
      height: 64,
      remove_bg: true,
      strength: RD_REFERENCE_STRENGTH,
      seed: 42,
    });
    expect(String(body.input_image)).not.toMatch(/^data:/);
    expect(header(String(body.input_image))).toEqual({ width: 64, height: 64, colourType: 2 });
    expect(header(String(body.input_palette))).toEqual({ width: 3, height: 1, colourType: 2 });
    expect(body).not.toHaveProperty('negative');
    expect(body).not.toHaveProperty('bypass_prompt_expansion');
    expect(rdBody({ ...input, reference, strength: 0.35 }).strength).toBe(0.35);
  });

  it('picks the style and size of each kind of picture', () => {
    expect(rdBody({ ...input, style: 'skin', transparent: false })).toMatchObject({
      prompt_style: 'rd_plus__mc_texture',
      tile_x: true,
      tile_y: true,
      width: 64,
    });
    expect(
      rdBody({ ...input, style: 'painting', size: 32, width: 32, height: 16, transparent: false }),
    ).toMatchObject({
      prompt_style: 'rd_plus__default',
      width: 128,
      height: 64,
    });
    expect(rdBody({ ...input, style: 'pattern', width: 20, height: 40 })).toMatchObject({
      prompt_style: 'rd_plus__mc_item',
      remove_bg: true,
    });
    expect(rdBody({ ...input, style: 'particle', size: 8 })).toMatchObject({
      width: 64,
      height: 64,
    });
    expect(rdSize(64, 16)).toEqual({ width: 256, height: 64 });
    expect(rdSize(200, 100)).toEqual({ width: 384, height: 192 });
  });

  it('asks the price with the free check_cost dry run, without an Idempotency-Key', async () => {
    const calls: RequestInit[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(
        JSON.stringify({ balance_cost: 0.24, remaining_balance: 9.5, base64_images: [] }),
        { status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;
    const price = await retroDiffusionProvider.cost(input, context(fetch));
    expect(price).toEqual({ usd: 0.24, balanceUsd: 9.5 });
    expect(JSON.parse(String(calls[0]?.body))).toMatchObject({ check_cost: true, num_images: 4 });
    expect(calls[0]?.headers).not.toHaveProperty('Idempotency-Key');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${RETRO_DIFFUSION_BASE}/inferences`);
  });

  it('reads a queued price from its task', async () => {
    const answers = [
      { task_id: 't1', status: 'accepted' },
      { status: 'succeeded', result: { balance_cost: 0.06, remaining_balance: null } },
    ];
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(answers.shift()), { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    expect(await retroDiffusionProvider.cost(input, context(fetch))).toEqual({
      usd: 0.06,
      balanceUsd: null,
    });
  });
});

describe('OpenAI and the fake service', () => {
  it('OpenAI draws wide and tall pictures and gives no price in advance', async () => {
    expect(openAiSize(32, 16)).toBe('1536x1024');
    expect(openAiSize(16, 32)).toBe('1024x1536');
    expect(openAiSize(16, 16)).toBe('1024x1024');
    expect(
      openAiBody({ ...input, style: 'painting', width: 64, height: 32, transparent: false }),
    ).toMatchObject({ size: '1536x1024', background: 'opaque' });
    expect(await openAiProvider.cost(input, context(vi.fn() as never))).toEqual({
      usd: null,
      balanceUsd: null,
    });
  });

  it('the fake service echoes the reference four times larger, as img2img would', async () => {
    const reference = { width: 2, height: 1, rgb: new Uint8Array([200, 100, 0, 0, 0, 0]) };
    const [picture] = await fakeProvider.generate(
      { ...input, count: 1, reference },
      context(vi.fn() as never),
    );
    const b64 = Buffer.from(picture ?? new Uint8Array()).toString('base64');
    expect(header(b64)).toEqual({ width: 8, height: 4, colourType: 6 });
    expect(await fakeProvider.cost(input, context(vi.fn() as never))).toEqual({
      usd: 0.24,
      balanceUsd: 9.76,
    });
  });

  it('encodes RGB PNGs and scales by whole pixels', () => {
    const png = encodePng(1, 1, new Uint8Array([1, 2, 3]), 3);
    const idat = png.subarray(41, png.length - 16);
    expect([...inflateSync(idat)]).toEqual([0, 1, 2, 3]);
    expect([...scaleRgb(new Uint8Array([1, 2, 3, 4, 5, 6]), 2, 1, 4, 1)]).toEqual([
      1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6,
    ]);
  });
});
