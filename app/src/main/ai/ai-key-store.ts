/**
 * The AI helper's API key store (ADR 0041 D1): the key is encrypted with Electron `safeStorage`
 * and kept in `<msmHome>/ai-key.bin`, never in `settings.json`. Only main reads the key; the
 * renderer sees {@link AiKeyStatus} (whether a key is set and its last four characters). The key
 * is never logged.
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
  'isEncryptionAvailable' | 'encryptString' | 'decryptString'
>;

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
}

/** Creates the key store over `<msmHome>/ai-key.bin`. */
export function createAiKeyStore(deps: AiKeyStoreDeps): AiKeyStore {
  const file = join(deps.msmHome, AI_KEY_FILE);
  const log = deps.log ?? ((message: string) => console.warn(message));

  const encryptionAvailable = (): boolean => {
    try {
      return deps.safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
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
    try {
      const key = deps.safeStorage.decryptString(bytes).trim();
      if (key === '') throw new Error('empty');
      return key;
    } catch {
      // A corrupt file, or one encrypted under another user or machine: treated as not set.
      log(`MSM AI helper: the stored key in ${file} could not be decrypted; it reads as not set.`);
      return null;
    }
  };

  return {
    async status() {
      const key = await read();
      return {
        set: key !== null,
        tail: key === null ? null : key.slice(-AI_KEY_TAIL_LENGTH),
        encryptionAvailable: encryptionAvailable(),
      };
    },
    async set(key) {
      const trimmed = key.trim();
      if (trimmed === '') throw new Error('The API key is empty.');
      if (!encryptionAvailable()) throw new Error(ENCRYPTION_UNAVAILABLE_MESSAGE);
      const encrypted = deps.safeStorage.encryptString(trimmed);
      await writeFileAtomic(file, new Uint8Array(encrypted), { mode: 0o600 });
    },
    async clear() {
      await rm(file, { force: true });
    },
    read,
  };
}
