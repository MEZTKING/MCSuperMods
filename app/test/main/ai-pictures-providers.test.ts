import { describe, expect, it, vi } from 'vitest';
import { fakePicture } from '../../src/main/ai-pictures/fake';
import { OPENAI_IMAGE_MODEL, openAiBody, openAiProvider } from '../../src/main/ai-pictures/openai';
import { type CallContext, PictureError } from '../../src/main/ai-pictures/provider';
import {
  RETRO_DIFFUSION_BASE,
  rdBody,
  retroDiffusionProvider,
} from '../../src/main/ai-pictures/retro-diffusion';

const png = Buffer.from(fakePicture(0, false)).toString('base64');

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A fetch that answers each call with the next response and records the calls. */
function scripted(...answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = answers.shift();
    if (next === undefined) throw new Error('No more answers.');
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function context(fetch: typeof globalThis.fetch, signal = new AbortController().signal) {
  return {
    apiKey: 'secret-key-1234',
    fetch,
    signal,
    sleep: async () => {},
  } satisfies CallContext;
}

const input = {
  prompt: 'a ruby gem',
  style: 'item',
  size: 16,
  count: 4,
  transparent: true,
} as const;

async function failureOf(promise: Promise<unknown>): Promise<PictureError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PictureError);
    return error as PictureError;
  }
  throw new Error('Expected a failure.');
}

describe('Retro Diffusion adapter', () => {
  it('asks for the Minecraft styles at four times the texture size', () => {
    expect(rdBody(input)).toEqual({
      prompt: 'a ruby gem',
      prompt_style: 'rd_plus__mc_item',
      width: 64,
      height: 64,
      num_images: 4,
      remove_bg: true,
    });
    expect(rdBody({ ...input, style: 'block', size: 32 })).toMatchObject({
      prompt_style: 'rd_plus__mc_texture',
      width: 128,
      tile_x: true,
      tile_y: true,
    });
    expect(rdBody({ ...input, style: 'block' })).not.toHaveProperty('remove_bg');
  });

  it('submits, polls the task and returns the PNGs', async () => {
    const { fetch, calls } = scripted(
      json(200, { status: 'accepted', task_id: 'task-1', request_id: 'req' }),
      json(200, { status: 'running' }),
      json(200, { status: 'succeeded', result: { base64_images: [png, png] } }),
    );
    const images = await retroDiffusionProvider.generate(input, context(fetch));
    expect(images).toHaveLength(2);
    expect(images[0]?.[1]).toBe(0x50);
    expect(calls[0]?.url).toBe(`${RETRO_DIFFUSION_BASE}/inferences`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-RD-Token']).toBe('secret-key-1234');
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ num_images: 4 });
    expect(calls[2]?.url).toBe(`${RETRO_DIFFUSION_BASE}/inferences/tasks/task-1`);
  });

  it('turns HTTP failures into plain error classes', async () => {
    const cases: [Response, string][] = [
      [json(401, { error: { code: 'invalid_token', message: 'Invalid' } }), 'bad_key'],
      [json(402, { error: { code: 'not_enough_balance', message: 'Top up' } }), 'quota'],
      [
        json(429, { error: { code: 'rate_limited', message: 'Slow' } }, { 'Retry-After': '5' }),
        'rate_limit',
      ],
      [json(400, { error: { code: 'nsfw_content', message: 'No' } }), 'refused'],
      [json(503, { error: { code: 'provider_busy', message: 'Busy' } }), 'server'],
    ];
    for (const [response, errorClass] of cases) {
      const { fetch } = scripted(response);
      const error = await failureOf(retroDiffusionProvider.generate(input, context(fetch)));
      expect(error.errorClass).toBe(errorClass);
      expect(error.message).not.toContain('secret-key');
    }
  });

  it('reports a failed task and a network failure', async () => {
    const failed = scripted(
      json(200, { task_id: 't' }),
      json(200, { status: 'failed', error: { code: 'inference_failed', message: 'Oops' } }),
    );
    expect(
      (await failureOf(retroDiffusionProvider.generate(input, context(failed.fetch)))).errorClass,
    ).toBe('server');
    const offline = scripted(new TypeError('fetch failed'));
    expect(
      (await failureOf(retroDiffusionProvider.generate(input, context(offline.fetch)))).errorClass,
    ).toBe('network');
  });

  it('refuses answers that are not PNG pictures', async () => {
    const { fetch } = scripted(json(200, { base64_images: ['bm90IGEgcG5n'] }));
    expect(
      (await failureOf(retroDiffusionProvider.generate(input, context(fetch)))).errorClass,
    ).toBe('bad_response');
  });

  it('tests a key with the free credits call', async () => {
    const ok = scripted(json(200, { credits: 10, balance: 1.5 }));
    expect(await retroDiffusionProvider.testKey(context(ok.fetch))).toEqual({ ok: true });
    expect(ok.calls[0]?.url).toBe(`${RETRO_DIFFUSION_BASE}/inferences/credits`);
    const bad = scripted(json(401, { error: { code: 'invalid_token', message: 'Invalid' } }));
    expect(await retroDiffusionProvider.testKey(context(bad.fetch))).toMatchObject({
      ok: false,
      errorClass: 'bad_key',
    });
  });
});

describe('OpenAI adapter', () => {
  it('adds the style words and asks for low quality PNGs', () => {
    const body = openAiBody(input);
    expect(body).toMatchObject({
      model: OPENAI_IMAGE_MODEL,
      n: 4,
      size: '1024x1024',
      quality: 'low',
      background: 'transparent',
      output_format: 'png',
    });
    expect(String(body.prompt)).toMatch(/^a ruby gem\n\nA single Minecraft inventory item icon/);
    expect(openAiBody({ ...input, style: 'block' })).toMatchObject({ background: 'opaque' });
  });

  it('returns the base64 pictures with the key as a bearer token', async () => {
    const { fetch, calls } = scripted(json(200, { data: [{ b64_json: png }] }));
    const images = await openAiProvider.generate(input, context(fetch));
    expect(images).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/images/generations');
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer secret-key-1234',
    );
  });

  it('turns failures into plain error classes', async () => {
    const cases: [Response, string][] = [
      [json(401, { error: { code: 'invalid_api_key', message: 'Incorrect API key' } }), 'bad_key'],
      [json(429, { error: { code: 'insufficient_quota', message: 'Quota' } }), 'quota'],
      [json(429, { error: { code: 'rate_limit_exceeded', message: 'Slow' } }), 'rate_limit'],
      [
        json(400, {
          error: { code: 'moderation_blocked', type: 'image_generation_user_error', message: 'No' },
        }),
        'refused',
      ],
      [json(500, { error: { message: 'Server' } }), 'server'],
    ];
    for (const [response, errorClass] of cases) {
      const { fetch } = scripted(response);
      expect((await failureOf(openAiProvider.generate(input, context(fetch)))).errorClass).toBe(
        errorClass,
      );
    }
  });

  it('passes aborts through for the service to name', async () => {
    const controller = new AbortController();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const { fetch } = scripted(abort);
    controller.abort();
    await expect(openAiProvider.generate(input, context(fetch, controller.signal))).rejects.toThrow(
      'aborted',
    );
  });

  it('tests a key by reading the model', async () => {
    const ok = scripted(json(200, { id: OPENAI_IMAGE_MODEL }));
    expect(await openAiProvider.testKey(context(ok.fetch))).toEqual({ ok: true });
    expect(ok.calls[0]?.url).toBe(`https://api.openai.com/v1/models/${OPENAI_IMAGE_MODEL}`);
    const missing = scripted(json(404, { error: { message: 'Not found' } }));
    expect(await openAiProvider.testKey(context(missing.fetch))).toMatchObject({ ok: false });
  });
});
