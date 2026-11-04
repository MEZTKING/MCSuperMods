/**
 * Extracting preview assets from a client jar (ADR 0011). Only the entries previews need
 * are inflated; everything else in the jar is skipped by fflate's `filter`.
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import { unzipSync } from 'fflate';

/**
 * The jar entries previews need: vanilla models, block and item definitions, block and item
 * textures, and the English lang file.
 */
export const PREVIEW_ASSET_PATTERNS: readonly RegExp[] = Object.freeze([
  /^assets\/minecraft\/(?:models|blockstates|items)\/.+\.json$/,
  /^assets\/minecraft\/textures\/(?:block|item)\/.+\.png$/,
  /^assets\/minecraft\/lang\/en_us\.json$/,
]);

/**
 * Entries larger than this when inflated are skipped. Vanilla preview files are a few
 * kilobytes; the limit guards against a hostile or corrupt jar.
 */
export const MAX_PREVIEW_ENTRY_BYTES = 16 * 1024 * 1024;

/** One extracted jar entry. */
export interface ExtractedFile {
  /** The entry's path inside the jar, such as `assets/minecraft/models/block/stone.json`. */
  path: string;
  data: Uint8Array;
}

/** Options for {@link extractPreviewAssets}. */
export interface ExtractOptions {
  /** Entry path patterns to keep. Defaults to {@link PREVIEW_ASSET_PATTERNS}. */
  patterns?: readonly RegExp[];
}

/**
 * Inflates the jar entries matching the patterns and returns them sorted by path. Entries
 * whose names are not safe relative paths (absolute, backslashes, `.` or `..` segments) or
 * that inflate beyond {@link MAX_PREVIEW_ENTRY_BYTES} are skipped.
 *
 * @throws Error When the bytes are not a readable zip archive.
 */
export function extractPreviewAssets(
  jar: Uint8Array,
  options: ExtractOptions = {},
): ExtractedFile[] {
  const patterns = options.patterns ?? PREVIEW_ASSET_PATTERNS;
  const entries = unzipSync(jar, {
    filter: (file) =>
      file.originalSize <= MAX_PREVIEW_ENTRY_BYTES &&
      isProjectRelativePath(file.name) &&
      patterns.some((pattern) => pattern.test(file.name)),
  });
  return Object.keys(entries)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => ({ path, data: entries[path] as Uint8Array }));
}
