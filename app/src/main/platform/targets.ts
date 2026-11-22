/**
 * Serves the built-in targets' vendored data files to the renderer, which cannot read
 * `file://` URLs from its sandbox (plan D10).
 *
 * In the built app the vendored JSON is stored gzipped (`*.json.gz`, ADR 0123): the main build
 * compacts and compresses each file and points the target's URL at the `.gz` copy. This service
 * decodes it, so callers always receive the JSON bytes, as in development, where the URLs name
 * the pretty-printed sources.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { targetById } from '@msm/targets';
import type { VendoredKeyName } from '../../shared/ipc-channels';

const gunzipAsync = promisify(gunzip);

/** The main-process targets service. */
export interface TargetsService {
  readVendored(targetId: string, key: VendoredKeyName): Promise<Uint8Array>;
}

/** The file name suffix of a vendored file the build stored gzipped (ADR 0123). */
export const GZIPPED_VENDORED_SUFFIX = '.gz';

async function readUrl(url: URL): Promise<Uint8Array> {
  const buffer = await readFile(fileURLToPath(url));
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * The bytes a vendored file at `url` stands for: gunzipped when the URL names a `.gz` file (the
 * built app, ADR 0123), the read bytes as they are otherwise (the sources, in development and
 * tests). Decoding runs on zlib's thread pool, so the main process is not blocked.
 *
 * @throws Error - When a `.gz` file is not valid gzip; the message names the file.
 */
export async function decodeVendored(url: URL, bytes: Uint8Array): Promise<Uint8Array> {
  if (!url.pathname.endsWith(GZIPPED_VENDORED_SUFFIX)) return bytes;
  try {
    const buffer = await gunzipAsync(bytes);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Vendored file ${url.pathname} is not valid gzip: ${message}`);
  }
}

/**
 * Creates the targets service.
 *
 * @param read - Reads a vendored file URL. Defaults to `fs.readFile(fileURLToPath(url))`.
 */
export function createTargetsService(
  read: (url: URL) => Promise<Uint8Array> = readUrl,
): TargetsService {
  return {
    async readVendored(targetId, key) {
      const bundle = targetById(targetId);
      if (bundle === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
      const url = bundle.vendored[key];
      return decodeVendored(url, await read(url));
    },
  };
}
