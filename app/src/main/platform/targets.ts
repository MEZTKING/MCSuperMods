/**
 * Serves the built-in targets' vendored data files to the renderer, which cannot read
 * `file://` URLs from its sandbox (plan D10).
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { targetById } from '@msm/targets';
import type { VendoredKeyName } from '../../shared/ipc-channels';

/** The main-process targets service. */
export interface TargetsService {
  readVendored(targetId: string, key: VendoredKeyName): Promise<Uint8Array>;
}

async function readUrl(url: URL): Promise<Uint8Array> {
  const buffer = await readFile(fileURLToPath(url));
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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
      return read(bundle.vendored[key]);
    },
  };
}
