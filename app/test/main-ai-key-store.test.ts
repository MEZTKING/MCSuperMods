import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_KEY_FILE,
  createAiKeyStore,
  ENCRYPTION_UNAVAILABLE_MESSAGE,
  type SafeStorageLike,
} from '../src/main/ai/ai-key-store';

let temp: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-ai-key-'));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** A reversible fake: a marker plus the reversed UTF-8 bytes. */
function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text: string) => Buffer.from(`enc:${[...text].reverse().join('')}`, 'utf8'),
    decryptString: (bytes: Buffer) => {
      const text = bytes.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext');
      return [...text.slice(4)].reverse().join('');
    },
  };
}

describe('AI key store', () => {
  const key = 'sk-ant-api03-secret-WXYZ';

  it('is not set without a file and reports encryption availability', async () => {
    const store = createAiKeyStore({ msmHome: temp, safeStorage: fakeSafeStorage() });
    expect(await store.status()).toEqual({ set: false, tail: null, encryptionAvailable: true });
    expect(await store.read()).toBeNull();
  });

  it('round-trips an encrypted key and shows only its tail', async () => {
    const store = createAiKeyStore({ msmHome: join(temp, 'home'), safeStorage: fakeSafeStorage() });
    await store.set(`  ${key}\n`);
    expect(await store.read()).toBe(key);
    expect(await store.status()).toEqual({ set: true, tail: 'WXYZ', encryptionAvailable: true });
    const bytes = await readFile(join(temp, 'home', AI_KEY_FILE));
    expect(bytes.toString('utf8')).not.toContain(key);
    if (process.platform !== 'win32') {
      expect((await stat(join(temp, 'home', AI_KEY_FILE))).mode & 0o777).toBe(0o600);
    }
    // Never in settings.json.
    await expect(stat(join(temp, 'home', 'settings.json'))).rejects.toThrow();
  });

  it('refuses to save when encryption is unavailable', async () => {
    const store = createAiKeyStore({ msmHome: temp, safeStorage: fakeSafeStorage(false) });
    await expect(store.set(key)).rejects.toThrow(ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(await store.status()).toEqual({ set: false, tail: null, encryptionAvailable: false });
    await expect(stat(join(temp, AI_KEY_FILE))).rejects.toThrow();
  });

  it('refuses an empty key', async () => {
    const store = createAiKeyStore({ msmHome: temp, safeStorage: fakeSafeStorage() });
    await expect(store.set('   ')).rejects.toThrow('empty');
  });

  it('reads a corrupt file as not set and logs it without the content', async () => {
    const logged: string[] = [];
    const store = createAiKeyStore({
      msmHome: temp,
      safeStorage: fakeSafeStorage(),
      log: (message) => logged.push(message),
    });
    await mkdir(temp, { recursive: true });
    await writeFile(join(temp, AI_KEY_FILE), 'garbage-bytes');
    expect(await store.status()).toEqual({ set: false, tail: null, encryptionAvailable: true });
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain('garbage');
  });

  it('clears the key, also when none is stored', async () => {
    const store = createAiKeyStore({ msmHome: temp, safeStorage: fakeSafeStorage() });
    await store.clear();
    await store.set(key);
    await store.clear();
    expect(await store.status()).toEqual({ set: false, tail: null, encryptionAvailable: true });
    await expect(stat(join(temp, AI_KEY_FILE))).rejects.toThrow();
  });
});
