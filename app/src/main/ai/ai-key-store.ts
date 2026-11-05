/**
 * The AI helper's API key store (ADR 0041 D1): the key is encrypted with Electron `safeStorage`
 * and kept in `<msmHome>/ai-key.bin`, never in `settings.json`. Only main reads the key; the
 * renderer sees {@link AiKeyStatus} (whether a key is set and its last four characters). The key
 * is never logged. The store uses `safeStorage`'s asynchronous API (`isAsyncEncryptionAvailable`,
 * `encryptStringAsync`, `decryptStringAsync`): the synchronous calls are deprecated in Electron 45
 * and log a warning. Files written by the synchronous `encryptString` still decrypt.
 *
 * @packageDocumentation
 */

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiKeyStatus } from '../../shared/platform';
import { writeFileAtomic } from '../platform/node-platform';

/** The part of Electron's `safeStorage` the store uses (a fake in tests). */
export type SafeStorageLike = Pick<
  Electron.SafeStorage,
  'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'
> &
  Partial<Pick<Electron.SafeStorage, 'getSelectedStorageBackend'>>;

/** How long `status` and `set` wait for `isAsyncEncryptionAvailable` before reading it as `false`. */
export const ENCRYPTION_CHECK_TIMEOUT_MS = 10_000;

/** The key file name below the MSM home directory. */
export const AI_KEY_FILE = 'ai-key.bin';

/** The message `set` rejects with when `safeStorage` cannot encrypt. */
export const ENCRYPTION_UNAVAILABLE_MESSAGE =
  'Encrypted storage is not available on this system, so the key cannot be saved.';

/** How many trailing characters of the key the renderer may see. */
export const AI_KEY_TAIL_LENGTH = 4;

/** Reads and writes the encrypted API key. */
export interface AiKeyStore {
  /** Whether a readable key is stored, its tail and whether encryption is available. */
  status(): Promise<AiKeyStatus>;
  /** Encrypts and stores `key` (trimmed). Rejects when encryption is unavailable or `key` is empty. */
  set(key: string): Promise<void>;
  /** Deletes the key file (no error when there is none). */
  clear(): Promise<void>;
  /** The decrypted key, or `null` when none is stored or it cannot be read. Main only. */
  read(): Promise<string | null>;
}

export interface AiKeyStoreDeps {
  msmHome: string;
  safeStorage: SafeStorageLike;
  /** Reports an unreadable key file (never the key). Defaults to `console.warn`. */
  log?: (message: string) => void;
  /** `process.platform` (for tests). */
  platform?: NodeJS.Platform;
}

/** Creates the key store over `<msmHome>/ai-key.bin`. */
export function createAiKeyStore(deps: AiKeyStoreDeps): AiKeyStore {
  const file = join(deps.msmHome, AI_KEY_FILE);
  const log = deps.log ?? ((message: string) => console.warn(message));

  const encryptionAvailable = async (): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timedOut = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ENCRYPTION_CHECK_TIMEOUT_MS);
      });
      const available = await Promise.race([
        deps.safeStorage.isAsyncEncryptionAvailable(),
        timedOut,
      ]);
      // On Linux without a secret service the asynchronous encryptor reports itself available
      // with the "basic_text" backend, a fixed password; the deprecated synchronous check said
      // "not available" there, and so do we (ADR 0041 D1).
      if (
        available &&
        (deps.platform ?? process.platform) === 'linux' &&
        deps.safeStorage.getSelectedStorageBackend?.() === 'basic_text'
      ) {
        return false;
      }
      return available;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const write = async (key: string): Promise<void> => {
    const encrypted = await deps.safeStorage.encryptStringAsync(key);
    await writeFileAtomic(file, new Uint8Array(encrypted), { mode: 0o600 });
  };

  const read = async (): Promise<string | null> => {
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log(`MSM AI helper: the key file could not be read (${(error as Error).message}).`);
      }
      return null;
    }
    let decrypted: Electron.DecryptStringAsyncReturnValue;
    try {
      decrypted = await deps.safeStorage.decryptStringAsync(bytes);
    } catch {
      decrypted = { result: '', shouldReEncrypt: false };
    }
    const key = decrypted.result.trim();
    if (key !== '') {
      if (decrypted.shouldReEncrypt) {
        // The OS key was rotated or improved: store the key again under the new one.
        try {
          await write(key);
        } catch (error) {
          log(`MSM AI helper: the key could not be encrypted again (${(error as Error).message}).`);
        }
      }
      return key;
    }
    // A corrupt file, or one encrypted under another user or machine: treated as not set.
    log(`MSM AI helper: the stored key in ${file} could not be decrypted; it reads as not set.`);
    return null;
  };

  return {
    async status() {
      const key = await read();
      return {
        set: key !== null,
        tail: key === null ? null : key.slice(-AI_KEY_TAIL_LENGTH),
        encryptionAvailable: await encryptionAvailable(),
      };
    },
    async set(key) {
      const trimmed = key.trim();
      if (trimmed === '') throw new Error('The API key is empty.');
      if (!(await encryptionAvailable())) throw new Error(ENCRYPTION_UNAVAILABLE_MESSAGE);
      await write(trimmed);
    },
    async clear() {
      await rm(file, { force: true });
    },
    read,
  };
}
