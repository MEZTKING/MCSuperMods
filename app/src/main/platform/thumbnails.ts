/**
 * Texture thumbnails for the asset browser. Thumbnails are cached in the project under
 * `.msm/thumbnails/<sha1(path, mtime, size)>.png`; the resize itself is injected (Electron's
 * `nativeImage` in the app), so this module runs under plain Node.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { assertProjectRelativePath } from '@msm/plugin-api';
import { THUMBNAIL_MAX_SIZE, THUMBNAIL_MIN_SIZE } from '../../shared/ipc-contract';
import type { ScopedFileSystem } from './scoped-fs';

/** The project folder that holds cached thumbnails. */
export const THUMBNAIL_DIR = '.msm/thumbnails';

/**
 * The cache key of a thumbnail: lower-case hex SHA-1 over the asset path, the source file's
 * modification time and the requested size, so an edited texture gets a new thumbnail.
 */
export function thumbnailCacheKey(assetPath: string, mtimeMs: number, size: number): string {
  return createHash('sha1').update(`${assetPath}\n${mtimeMs}\n${size}`).digest('hex');
}

/** Throws unless the request names a project PNG under `assets/` and a supported size. */
export function assertThumbnailRequest(assetPath: string, size: number): void {
  assertProjectRelativePath(assetPath);
  if (!assetPath.startsWith('assets/') || !assetPath.toLowerCase().endsWith('.png')) {
    throw new Error(`${JSON.stringify(assetPath)} is not a PNG under assets/.`);
  }
  if (!Number.isInteger(size) || size < THUMBNAIL_MIN_SIZE || size > THUMBNAIL_MAX_SIZE) {
    throw new Error(
      `Thumbnail size must be an integer from ${THUMBNAIL_MIN_SIZE} to ${THUMBNAIL_MAX_SIZE}.`,
    );
  }
}

/** The main-process thumbnail service. */
export interface ThumbnailService {
  get(assetPath: string, size: number): Promise<Uint8Array>;
}

/**
 * Creates the thumbnail service.
 *
 * @param deps.projectFs - The open project's file system; throws when no project is open.
 * @param deps.resizePng - Scales PNG bytes so the longer edge is `size` pixels.
 */
export function createThumbnailService(deps: {
  projectFs(): ScopedFileSystem;
  resizePng(png: Uint8Array, size: number): Uint8Array | Promise<Uint8Array>;
}): ThumbnailService {
  return {
    async get(assetPath, size) {
      assertThumbnailRequest(assetPath, size);
      const fs = deps.projectFs();
      const source = await fs.stat(assetPath);
      if (source === null || source.kind !== 'file') {
        throw new Error(`${assetPath} does not exist in the project.`);
      }
      const cached = `${THUMBNAIL_DIR}/${thumbnailCacheKey(assetPath, source.mtimeMs, size)}.png`;
      if (await fs.exists(cached)) return fs.readFile(cached);
      const thumbnail = await deps.resizePng(await fs.readFile(assetPath), size);
      await fs.writeFile(cached, thumbnail);
      return thumbnail;
    },
  };
}
