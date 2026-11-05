/**
 * Fabric API downloads (ADR 0026 D5): the Fabric Maven URL, a SHA-512 checked download and a
 * cache folder in the app's user-data folder. The downloader and hasher are injected; the
 * defaults use the global `fetch` and Web Crypto, so this module has no Node imports.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { assertSafeVersion, type Downloader, FabricTestError, type Sha512 } from './types';

/** The Fabric Maven, which publishes Fabric API with `.sha1`, `.sha256` and `.sha512` files. */
export const FABRIC_MAVEN = 'https://maven.fabricmc.net';

/** The largest download accepted, in bytes (Fabric API is a few MB). */
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

/** Fabric API's jar on the Fabric Maven; append `.sha512` for its published checksum. */
export function fabricApiUrl(version: string): string {
  assertSafeVersion(version, 'Fabric API');
  const part = encodeURIComponent(version);
  return `${FABRIC_MAVEN}/net/fabricmc/fabric-api/fabric-api/${part}/fabric-api-${part}.jar`;
}

/** The file name the app gives Fabric API in `mods/`: `fabric-api-<version>.jar`. */
export function fabricApiFileName(version: string): string {
  assertSafeVersion(version, 'Fabric API');
  return `fabric-api-${version}.jar`;
}

/**
 * The hex digest in a Maven checksum file: the first whitespace-separated word, lower-cased.
 * Returns `null` unless it is `length` hex characters.
 */
export function parseChecksumFile(text: string, length: number): string | null {
  const word = text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return word.length === length && /^[0-9a-f]+$/.test(word) ? word : null;
}

interface WebCryptoLike {
  subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> };
}

/** SHA-512 over Web Crypto (`globalThis.crypto.subtle`, present in Node and Electron). */
export const webCryptoSha512: Sha512 = async (bytes) => {
  const crypto = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (crypto?.subtle === undefined) throw new Error('Web Crypto is not available.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * A {@link Downloader} over the global `fetch`: HTTPS only, redirects followed, at most
 * {@link MAX_DOWNLOAD_BYTES}.
 */
export const fetchDownloader: Downloader = async (url) => {
  if (!url.startsWith('https://')) throw new Error(`Refusing to download ${url}: not HTTPS.`);
  const fetchFn = (
    globalThis as {
      fetch?: (url: string, init: { redirect: 'follow' }) => Promise<FetchResponseLike>;
    }
  ).fetch;
  if (fetchFn === undefined) throw new Error('fetch is not available.');
  const response = await fetchFn(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`${url} is too large.`);
  return bytes;
};

/** What {@link cachedFabricApi} needs. */
export interface FabricApiCacheDeps {
  fs: InstallFileSystem;
  /** The download cache folder (absolute), such as `<userData>/downloads`. */
  cacheDir: string;
  download: Downloader;
  sha512?: Sha512;
}

/** Fabric API's bytes and where they came from. */
export interface FabricApiJar {
  version: string;
  bytes: Uint8Array;
  /** Lower-case hex SHA-512, equal to the published checksum. */
  sha512: string;
  /** `true` when the jar came from the cache without a download. */
  cached: boolean;
}

/**
 * Fabric API `version`, from `<cacheDir>/fabric-api/<version>/` when a verified copy is there
 * (its bytes still match the SHA-512 stored beside it), otherwise downloaded from the Fabric
 * Maven, checked against the published `.sha512` and cached. A mismatch is
 * `fabric.checksum-mismatch` and nothing is cached; a network failure is
 * `fabric.download-failed`.
 */
export async function cachedFabricApi(
  deps: FabricApiCacheDeps,
  version: string,
): Promise<FabricApiJar> {
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const url = fabricApiUrl(version);
  const dir = joinInstallPath(deps.cacheDir, 'fabric-api', version);
  const jarPath = joinInstallPath(dir, fabricApiFileName(version));
  const hashPath = `${jarPath}.sha512`;

  if ((await deps.fs.exists(jarPath)) && (await deps.fs.exists(hashPath))) {
    try {
      const stored = parseChecksumFile(
        new TextDecoder().decode(await deps.fs.readFile(hashPath)),
        128,
      );
      const bytes = await deps.fs.readFile(jarPath);
      const actual = await sha512(bytes);
      if (stored !== null && actual === stored) {
        return { version, bytes, sha512: actual, cached: true };
      }
    } catch {
      // A damaged cache entry is downloaded again.
    }
  }

  let published: string | null;
  let bytes: Uint8Array;
  try {
    published = parseChecksumFile(
      new TextDecoder().decode(await deps.download(`${url}.sha512`)),
      128,
    );
    bytes = await deps.download(url);
  } catch (error) {
    throw new FabricTestError(
      'fabric.download-failed',
      `Fabric API ${version} could not be downloaded from the Fabric Maven: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (published === null) {
    throw new FabricTestError(
      'fabric.download-failed',
      `The Fabric Maven published no valid SHA-512 checksum for Fabric API ${version}.`,
    );
  }
  const actual = await sha512(bytes);
  if (actual !== published) {
    throw new FabricTestError(
      'fabric.checksum-mismatch',
      `The downloaded Fabric API ${version} does not match its published SHA-512 checksum; nothing was installed.`,
    );
  }
  await deps.fs.remove(dir);
  await deps.fs.mkdirp(dir);
  await deps.fs.writeFile(jarPath, bytes);
  await deps.fs.writeFile(hashPath, new TextEncoder().encode(`${actual}\n`));
  return { version, bytes, sha512: actual, cached: false };
}
