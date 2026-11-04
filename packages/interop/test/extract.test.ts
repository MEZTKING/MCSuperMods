import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractPreviewAssets, PREVIEW_ASSET_PATTERNS } from '../src/index';
import { buildSyntheticJar, KEPT_ENTRIES } from './helpers/synthetic-jar';

describe('extractPreviewAssets', () => {
  it('keeps exactly the preview entries, sorted by path, with their bytes', () => {
    const files = extractPreviewAssets(buildSyntheticJar());
    expect(files.map((file) => file.path)).toEqual([
      'assets/minecraft/blockstates/msm_test.json',
      'assets/minecraft/items/msm_test.json',
      'assets/minecraft/lang/en_us.json',
      'assets/minecraft/models/block/msm_test_cube.json',
      'assets/minecraft/textures/block/msm_test.png',
      'assets/minecraft/textures/block/msm_test_anim.png',
      'assets/minecraft/textures/block/msm_test_anim.png.mcmeta',
    ]);
    for (const file of files) expect(file.data).toEqual(KEPT_ENTRIES[file.path]);
  });

  it('keeps animation sidecars next to their textures', () => {
    const files = extractPreviewAssets(buildSyntheticJar());
    const sidecar = files.find(
      (file) => file.path === 'assets/minecraft/textures/block/msm_test_anim.png.mcmeta',
    );
    expect(sidecar).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(sidecar?.data))).toEqual({
      animation: { frametime: 3, frames: [1, { index: 0, time: 5 }] },
    });
  });

  it('accepts custom patterns', () => {
    const files = extractPreviewAssets(buildSyntheticJar(), { patterns: [/\.class$/] });
    expect(files.map((file) => file.path)).toEqual([
      'net/minecraft/Foo.class',
      'net/minecraft/client/Bar.class',
    ]);
  });

  it('skips entries with unsafe names', () => {
    const jar = zipSync({
      'assets/minecraft/models/../../../evil.json': strToU8('{}'),
      'assets/minecraft/models/block/./dot.json': strToU8('{}'),
      'assets/minecraft/models/block/ok.json': strToU8('{}'),
    });
    expect(extractPreviewAssets(jar).map((file) => file.path)).toEqual([
      'assets/minecraft/models/block/ok.json',
    ]);
  });

  it('rejects bytes that are not a zip archive', () => {
    expect(() => extractPreviewAssets(strToU8('not a jar'))).toThrow();
  });

  it('matches the documented preview folders', () => {
    const matches = (path: string) => PREVIEW_ASSET_PATTERNS.some((pattern) => pattern.test(path));
    expect(matches('assets/minecraft/models/item/stick.json')).toBe(true);
    expect(matches('assets/minecraft/textures/item/stick.png')).toBe(true);
    expect(matches('assets/minecraft/lang/en_us.json')).toBe(true);
    expect(matches('assets/minecraft/lang/en_gb.json')).toBe(false);
    expect(matches('assets/minecraft/textures/gui/widgets.png')).toBe(false);
    expect(matches('assets/minecraft/textures/block/water_still.png.mcmeta')).toBe(true);
    expect(matches('assets/minecraft/textures/item/compass.png.mcmeta')).toBe(true);
    expect(matches('assets/minecraft/textures/entity/x.png.mcmeta')).toBe(false);
    expect(matches('assets/minecraft/textures/block/x.mcmeta')).toBe(false);
    expect(matches('assets/other/models/block/x.json')).toBe(false);
  });
});
