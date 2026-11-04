import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScopedFileSystem } from '../src/main/platform/scoped-fs';
import {
  assertThumbnailRequest,
  createThumbnailService,
  THUMBNAIL_DIR,
  thumbnailCacheKey,
} from '../src/main/platform/thumbnails';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'msm-main-thumbnails-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('thumbnail cache key', () => {
  it('is a SHA-1 that changes with path, mtime and size', () => {
    const key = thumbnailCacheKey('assets/demo/textures/block/a.png', 1000, 64);
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(thumbnailCacheKey('assets/demo/textures/block/a.png', 1000, 64)).toBe(key);
    expect(thumbnailCacheKey('assets/demo/textures/block/b.png', 1000, 64)).not.toBe(key);
    expect(thumbnailCacheKey('assets/demo/textures/block/a.png', 1001, 64)).not.toBe(key);
    expect(thumbnailCacheKey('assets/demo/textures/block/a.png', 1000, 32)).not.toBe(key);
  });
});

describe('thumbnail request validation', () => {
  it('accepts PNGs under assets/ at supported sizes', () => {
    expect(() => assertThumbnailRequest('assets/demo/textures/block/a.png', 64)).not.toThrow();
  });

  it('rejects other paths and sizes', () => {
    for (const path of [
      '../assets/a.png',
      '/assets/a.png',
      'assets/../msm.project.json',
      'content/demo/a.png',
      'assets/demo/textures/block/a.json',
      'assets\\demo\\a.png',
    ]) {
      expect(() => assertThumbnailRequest(path, 64)).toThrow();
    }
    expect(() => assertThumbnailRequest('assets/demo/a.png', 0)).toThrow(/size/);
    expect(() => assertThumbnailRequest('assets/demo/a.png', 12.5)).toThrow(/size/);
    expect(() => assertThumbnailRequest('assets/demo/a.png', 100_000)).toThrow(/size/);
  });
});

describe('thumbnail service', () => {
  it('resizes once and serves the cached file until the texture changes', async () => {
    const fs = createScopedFileSystem(root);
    const source = 'assets/demo/textures/block/a.png';
    await fs.writeFile(source, new Uint8Array([1, 2, 3]));
    let calls = 0;
    const service = createThumbnailService({
      projectFs: () => fs,
      resizePng: (png, size) => {
        calls += 1;
        return new Uint8Array([...png, size]);
      },
    });
    expect(await service.get(source, 16)).toEqual(new Uint8Array([1, 2, 3, 16]));
    expect(await service.get(source, 16)).toEqual(new Uint8Array([1, 2, 3, 16]));
    expect(calls).toBe(1);
    expect((await fs.readDir(THUMBNAIL_DIR)).length).toBe(1);

    await writeFile(
      join(root, 'assets', 'demo', 'textures', 'block', 'a.png'),
      new Uint8Array([9]),
    );
    await utimes(join(root, 'assets', 'demo', 'textures', 'block', 'a.png'), 1, 2_000_000);
    expect(await service.get(source, 16)).toEqual(new Uint8Array([9, 16]));
    expect(calls).toBe(2);
    await expect(service.get('assets/demo/none.png', 16)).rejects.toThrow(/does not exist/);
  });
});
