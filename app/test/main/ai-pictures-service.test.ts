import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAiKeyStore, type SafeStorageLike } from '../../src/main/ai/ai-key-store';
import {
  AI_PICTURES_SETTINGS_FILE,
  aiPicturesKeyFile,
  createAiPicturesService,
} from '../../src/main/ai-pictures/ai-pictures-service';
import { fakePicture, fakeProvider } from '../../src/main/ai-pictures/fake';
import type { PictureProvider } from '../../src/main/ai-pictures/provider';
import { createIpcHandlers } from '../../src/main/ipc';
import type { MainPlatform } from '../../src/main/platform/node-platform';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';

let temp: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-ai-pictures-'));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const fakeSafeStorage: SafeStorageLike = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (text: string) =>
    Buffer.from(`enc:${[...text].reverse().join('')}`, 'utf8'),
  decryptStringAsync: async (bytes: Buffer) => ({
    result: [...bytes.toString('utf8').slice(4)].reverse().join(''),
    shouldReEncrypt: false,
  }),
};

const KEY = 'rdpk-very-secret-key-WXYZ';

function serviceWith(
  providers: Partial<Record<'retro-diffusion' | 'openai', PictureProvider>>,
  timeoutMs?: number,
) {
  return createAiPicturesService({
    msmHome: temp,
    keyStore: (service) =>
      createAiKeyStore({
        msmHome: temp,
        safeStorage: fakeSafeStorage,
        fileName: aiPicturesKeyFile(service),
      }),
    providers,
    log: () => {},
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

const request = {
  requestId: 'r1',
  prompt: 'a ruby',
  style: 'item',
  size: 16,
  count: 2,
  transparent: true,
} as const;

/** A provider that waits until its signal aborts. */
const hanging: PictureProvider = {
  id: 'retro-diffusion',
  generate: (_input, context) =>
    new Promise((_resolve, reject) => {
      context.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  testKey: async () => ({ ok: true }),
};

describe('AI pictures service', () => {
  it('stores each key encrypted in its own file and reports only the tail', async () => {
    const service = serviceWith({});
    await service.setKey('retro-diffusion', `  ${KEY}\n`);
    const status = await service.status();
    expect(status).toEqual({
      service: 'retro-diffusion',
      keys: { 'retro-diffusion': { set: true, tail: 'WXYZ' }, openai: { set: false, tail: null } },
      encryptionAvailable: true,
    });
    // What the renderer receives never holds the key, and the contract would refuse it.
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(ipcContract[InvokeChannels.aiPicturesStatus].response.safeParse(status).success).toBe(
      true,
    );
    const stored = await readFile(join(temp, aiPicturesKeyFile('retro-diffusion')), 'utf8');
    expect(stored).not.toContain(KEY);
    expect(await readdir(temp)).not.toContain('ai-key.bin');
    await service.clearKey('retro-diffusion');
    expect((await service.status()).keys['retro-diffusion'].set).toBe(false);
  });

  it('remembers the chosen service in a plain settings file', async () => {
    const service = serviceWith({});
    await service.setService('openai');
    expect((await service.status()).service).toBe('openai');
    expect(JSON.parse(await readFile(join(temp, AI_PICTURES_SETTINGS_FILE), 'utf8'))).toEqual({
      service: 'openai',
    });
  });

  it('says no_key without a key and sends the key only to the provider', async () => {
    const seen: string[] = [];
    const provider: PictureProvider = {
      id: 'retro-diffusion',
      generate: async (_input, context) => {
        seen.push(context.apiKey);
        return [fakePicture(0, false), fakePicture(1, false)];
      },
      testKey: async () => ({ ok: true }),
    };
    const service = serviceWith({ 'retro-diffusion': provider });
    expect(await service.generate(request)).toMatchObject({ ok: false, errorClass: 'no_key' });
    expect(await service.testKey('retro-diffusion')).toMatchObject({ errorClass: 'no_key' });
    await service.setKey('retro-diffusion', KEY);
    const result = await service.generate(request);
    expect(result.ok && result.images.length).toBe(2);
    expect(seen).toEqual([KEY]);
    expect(await service.testKey('retro-diffusion')).toEqual({ ok: true });
  });

  it('cancels a running request', async () => {
    const service = serviceWith({ 'retro-diffusion': hanging });
    await service.setKey('retro-diffusion', KEY);
    const pending = service.generate(request);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(service.active()).toEqual(['r1']);
    await service.cancel('r1');
    expect(await pending).toMatchObject({ ok: false, errorClass: 'cancelled' });
    expect(service.active()).toEqual([]);
  });

  it('times out a slow request', async () => {
    const service = serviceWith({ 'retro-diffusion': hanging }, 20);
    await service.setKey('retro-diffusion', KEY);
    expect(await service.generate(request)).toMatchObject({ ok: false, errorClass: 'timeout' });
  });

  it('serves the fake service without a key (e2e)', async () => {
    const service = createAiPicturesService({
      msmHome: temp,
      keyStore: () => {
        throw new Error('No key store in e2e.');
      },
      fake: fakeProvider,
    });
    expect((await service.status()).keys.openai).toEqual({ set: true, tail: 'e2e!' });
    const result = await service.generate({ ...request, count: 4 });
    expect(result.ok && result.images.length).toBe(4);
  });

  it('serves every channel through the IPC handlers', async () => {
    const service = serviceWith({});
    const handlers = createIpcHandlers(
      {} as unknown as MainPlatform,
      {} as never,
      {} as never,
      {} as never,
      service,
    );
    const context = { sendProgress() {}, sender: {} as never };
    await handlers[InvokeChannels.aiPicturesSetKey]({ service: 'openai', key: KEY }, context);
    const status = await handlers[InvokeChannels.aiPicturesStatus](undefined, context);
    expect(status.keys.openai).toEqual({ set: true, tail: 'WXYZ' });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });
});
