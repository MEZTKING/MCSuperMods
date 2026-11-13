/**
 * The texture layer of a PNG and the session's
 * `blocks-items.transparent-texture-on-solid-block` warning (ADR 0059 D4, B226).
 */
import { deflateSync } from 'node:zlib';
import { createMemoryFileSystem, type Problem } from '@msm/core';
import { encodePng } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { pngLayer, TextureLayerCache } from '../src/renderer/src/session/texture-layers';
import { newSession } from './session-fixture';

const CODE = 'blocks-items.transparent-texture-on-solid-block';

/** A 2 by 2 RGBA PNG whose pixels have the given alphas. */
const rgba = (alphas: readonly number[]): Uint8Array => {
  const pixels = new Uint8Array(16);
  for (const [i, alpha] of alphas.entries()) pixels.set([200, 30, 40, alpha], i * 4);
  return encodePng(pixels, 2, 2);
};

/** A PNG from raw chunks (CRCs are not read), with filter-0 scanlines. */
function rawPng(
  ihdr: { width: number; height: number; depth: number; colour: number },
  rows: readonly number[][],
  extra: readonly [string, number[]][] = [],
): Uint8Array {
  const chunk = (type: string, body: Uint8Array | number[]) => {
    const data = Uint8Array.from(body);
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    return out;
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, ihdr.width);
  view.setUint32(4, ihdr.height);
  header.set([ihdr.depth, ihdr.colour, 0, 0, 0], 8);
  const raw = Uint8Array.from(rows.flatMap((row) => [0, ...row]));
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...extra.map(([type, body]) => chunk(type, body)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', []),
  ];
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

describe('pngLayer', () => {
  it('reads solid, cut-out and see-through RGBA pictures', async () => {
    expect(await pngLayer(rgba([255, 255, 255, 255]))).toBe('solid');
    expect(await pngLayer(rgba([255, 0, 255, 0]))).toBe('cutout');
    expect(await pngLayer(rgba([255, 128, 0, 255]))).toBe('translucent');
  });

  it('reads palette transparency per used index', async () => {
    const plte: [string, number[]] = ['PLTE', [0, 0, 0, 255, 255, 255, 9, 9, 9]];
    const trns: [string, number[]] = ['tRNS', [255, 0, 100]];
    const size = { width: 2, height: 1, depth: 8, colour: 3 };
    expect(await pngLayer(rawPng(size, [[0, 0]], [plte, trns]))).toBe('solid');
    expect(await pngLayer(rawPng(size, [[0, 1]], [plte, trns]))).toBe('cutout');
    expect(await pngLayer(rawPng(size, [[1, 2]], [plte, trns]))).toBe('translucent');
    // Two bits per index: indices 0 and 1 in one byte (0b00_01_00_00).
    const packed = { width: 2, height: 1, depth: 2, colour: 3 };
    expect(await pngLayer(rawPng(packed, [[0b0001_0000]], [plte, trns]))).toBe('cutout');
  });

  it('treats an RGB colour key as fully transparent and RGB without tRNS as solid', async () => {
    const size = { width: 2, height: 1, depth: 8, colour: 2 };
    const pixels = [[1, 2, 3, 4, 5, 6]];
    expect(await pngLayer(rawPng(size, pixels))).toBe('solid');
    expect(await pngLayer(rawPng(size, pixels, [['tRNS', [0, 4, 0, 5, 0, 6]]]))).toBe('cutout');
    expect(await pngLayer(rawPng(size, pixels, [['tRNS', [0, 9, 0, 9, 0, 9]]]))).toBe('solid');
  });

  it('rejects bytes that are not a PNG', async () => {
    await expect(pngLayer(new Uint8Array([1, 2, 3]))).rejects.toThrow('Not a PNG');
  });
});

describe('TextureLayerCache', () => {
  it('reads each file once until cleared', async () => {
    const cache = new TextureLayerCache();
    let reads = 0;
    const read = async () => {
      reads += 1;
      return rgba([255, 0, 255, 255]);
    };
    const texture = { texture: 'demo:block/a', namespace: 'demo', path: 'textures/block/a.png' };
    expect(await cache.layer(texture, read)).toBe('cutout');
    expect(await cache.layer(texture, read)).toBe('cutout');
    expect(reads).toBe(1);
    cache.clear();
    expect(await cache.layer(texture, read)).toBe('cutout');
    expect(reads).toBe(2);
    expect(await cache.layer(texture, async () => new Uint8Array([0]))).toBe('cutout');
  });
});

describe('ProjectSession: transparent texture on a solid block (ADR 0059 D4)', () => {
  async function withGlass(alphas: readonly number[]) {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    await session.importAssets(
      'demo',
      [{ name: 'glass.png', data: rgba(alphas) }],
      'textures/block',
    );
    session.addElement({
      id: 'demo:block/glass',
      kind: 'minecraft:model',
      data: { parent: 'minecraft:block/cube_all', textures: { all: 'demo:block/glass' } },
    });
    session.addElement({
      id: 'demo:glass',
      kind: 'msm:block',
      data: { format: 1, display_name: 'Glass', model: 'demo:block/glass' },
    });
    await session.flushValidation();
    return session;
  }
  const warnings = (problems: readonly Problem[]) =>
    problems.filter((problem) => problem.code === CODE);

  it('warns about a solid block whose texture has transparent pixels', async () => {
    const session = await withGlass([255, 0, 255, 120]);
    expect(warnings(session.problemsFor('demo:glass'))).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: CODE,
        elementId: 'demo:glass',
        path: '/model',
      }),
    ]);
    expect(warnings(session.problemsFor('demo:glass'))[0]?.message).toContain('demo:block/glass');
    expect(await session.textureLayers('demo:block/glass')).toEqual([
      { texture: 'demo:block/glass', layer: 'translucent' },
    ]);
  }, 60_000);

  it('drops the warning once the block is see-through, and has none for opaque pixels', async () => {
    const session = await withGlass([255, 0, 255, 255]);
    expect(warnings(session.problemsFor('demo:glass'))).toHaveLength(1);
    session.setElementValue('demo:glass', '/components', {
      'msm:shape': { see_through: true },
    });
    await session.flushValidation();
    expect(warnings(session.problemsFor('demo:glass'))).toEqual([]);

    const opaque = await withGlass([255, 255, 255, 255]);
    expect(warnings(opaque.problemsFor('demo:glass'))).toEqual([]);
    expect(await opaque.textureLayers('demo:block/glass')).toEqual([
      { texture: 'demo:block/glass', layer: 'solid' },
    ]);
  }, 60_000);

  it('re-reads a texture whose bytes were replaced', async () => {
    const session = await withGlass([255, 255, 255, 255]);
    expect(warnings(session.problemsFor('demo:glass'))).toEqual([]);
    await session.importAssets(
      'demo',
      [{ name: 'glass.png', data: rgba([0, 255, 255, 255]) }],
      'textures/block',
    );
    await session.flushValidation();
    expect(warnings(session.problemsFor('demo:glass'))).toHaveLength(1);
  }, 60_000);
});
