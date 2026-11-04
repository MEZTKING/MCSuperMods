/**
 * Turns an output file's contents into bytes.
 *
 * @packageDocumentation
 */

import { stableStringify, utf8 } from '@msm/core';
import type { OutputFile } from '@msm/plugin-api';

/**
 * The bytes of an output file: raw bytes as-is, a JSON value serialised with
 * `stableStringify` (sorted keys, two-space indent, trailing newline) and UTF-8 encoded.
 */
export function outputFileBytes(file: OutputFile): Uint8Array {
  return file.contents instanceof Uint8Array
    ? file.contents
    : utf8.encode(stableStringify(file.contents));
}
