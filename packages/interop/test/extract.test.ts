import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  dataFolderPatterns,
  extractPreviewAssets,
  LOOKS_ASSET_PATTERNS,
  mergeDataFolders,
  PREVIEW_ASSET_PATTERNS,
} from '../src/index';
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
      'data/minecraft/worldgen/placed_feature/msm_test_flower.json',
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

  it('keeps the JSON files of the given data folders, subfolders included (ADR 0119 D4)', () => {
    // A made-up folder list over the synthetic jar: the target supplies the real one.
    const files = extractPreviewAssets(buildSyntheticJar(), {
      dataFolders: ['worldgen/configured_feature', 'worldgen/placed_feature'],
    });
    const data = files.map((file) => file.path).filter((path) => path.startsWith('data/'));
    expect(data).toEqual([
      'data/minecraft/worldgen/configured_feature/msm_test_flower.json',
      'data/minecraft/worldgen/placed_feature/msm_test_flower.json',
      'data/minecraft/worldgen/placed_feature/nested/msm_test.json',
    ]);
    // The preview assets stay, and nothing outside the folders or not JSON is kept.
    expect(files).toHaveLength(10);
    expect(files.some((file) => file.path.endsWith('.txt'))).toBe(false);
    expect(files.some((file) => file.path.startsWith('data/minecraft/recipe/'))).toBe(false);
  });

  it('joins the host folder lists into one sorted list (ADR 0120 D11)', () => {
    // Made-up lists: the host passes the target's and the live views' own.
    expect(
      mergeDataFolders(['made_up/b', 'tags/made_up'], null, ['made_up/a', 'made_up/b']),
    ).toEqual(['made_up/a', 'made_up/b', 'tags/made_up']);
    expect(mergeDataFolders()).toEqual([]);
    expect(() => mergeDataFolders(['ok'], ['../escape'])).toThrow();
  });

  it('refuses data folder names that are not plain folders', () => {
    for (const folder of ['', '../x', '/abs', 'a/../b', 'a.b', 'a\\b', 'A', 'a/']) {
      expect(() => dataFolderPatterns([folder]), folder).toThrow();
    }
    expect(
      dataFolderPatterns(['tags/worldgen/biome'])[0]?.test(
        'data/minecraft/tags/worldgen/biome/is_ocean.json',
      ),
    ).toBe(true);
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
    expect(matches('data/minecraft/worldgen/placed_feature/flower_plains.json')).toBe(true);
    expect(matches('data/minecraft/worldgen/placed_feature/sub/flower_plains.json')).toBe(false);
    expect(matches('data/minecraft/worldgen/configured_feature/flower_plains.json')).toBe(false);
    expect(matches('data/minecraft/worldgen/placed_feature/flower_plains.txt')).toBe(false);
    expect(matches('assets/minecraft/textures/gui/widgets.png')).toBe(false);
    expect(matches('assets/minecraft/textures/block/water_still.png.mcmeta')).toBe(true);
    expect(matches('assets/minecraft/textures/item/compass.png.mcmeta')).toBe(true);
    expect(matches('assets/minecraft/textures/entity/x.png.mcmeta')).toBe(false);
    expect(matches('assets/minecraft/textures/block/x.mcmeta')).toBe(false);
    expect(matches('assets/other/models/block/x.json')).toBe(false);
  });

  it("matches the looks and sounds views' jar entries (ADR 0121 D3, B619 3S4)", () => {
    const matches = (path: string) => PREVIEW_ASSET_PATTERNS.some((pattern) => pattern.test(path));
    const looks = (path: string) => LOOKS_ASSET_PATTERNS.some((pattern) => pattern.test(path));
    for (const path of [
      'assets/minecraft/textures/entity/wolf/wolf.png',
      'assets/minecraft/textures/entity/cat/cat_baby/tabby.png',
      'assets/minecraft/textures/entity/villager/profession/farmer.png.mcmeta',
      'assets/minecraft/textures/entity/sulfur_cube/sulfur_cube.png',
      'assets/minecraft/textures/entity/banner/creeper.png',
      'assets/minecraft/textures/entity/shield/base.png',
      'assets/minecraft/textures/entity/decorated_pot/angler_pottery_pattern.png',
      'assets/minecraft/textures/entity/equipment/humanoid/iron.png',
      'assets/minecraft/textures/painting/kebab.png',
      'assets/minecraft/textures/trims/entity/humanoid/coast.png',
      'assets/minecraft/textures/trims/entity/humanoid/coast.png.mcmeta',
      'assets/minecraft/textures/palettes/trim_base.png',
      'assets/minecraft/textures/mob_effect/speed.png',
      'assets/minecraft/textures/particle/flame.png',
      'assets/minecraft/textures/font/ascii.png',
      'assets/minecraft/textures/gui/sprites/hud/locator_bar_dot/default_0.png',
      'assets/minecraft/textures/gui/sprites/hud/locator_bar_background.png',
      'assets/minecraft/textures/gui/sprites/hud/locator_bar_arrow_up.png.mcmeta',
      'assets/minecraft/textures/gui/sprites/hud/effect_background.png',
      'assets/minecraft/textures/gui/sprites/hud/effect_background_ambient.png',
      'assets/minecraft/textures/gui/sprites/container/inventory/effect_background.png',
      'assets/minecraft/textures/gui/sprites/container/creative_inventory/tab_top_selected_1.png',
      'assets/minecraft/textures/gui/container/creative_inventory/tab_items.png',
      'assets/minecraft/font/default.json',
      'assets/minecraft/font/include/space.json',
      'assets/minecraft/particles/flame.json',
      'assets/minecraft/waypoint_style/default.json',
      'assets/minecraft/equipment/iron.json',
      'assets/minecraft/post_effect/blur.json',
      'assets/minecraft/shaders/post/blur.fsh',
      'assets/minecraft/shaders/core/screenquad.vsh',
      'assets/minecraft/shaders/include/fog.glsl',
    ]) {
      expect(looks(path), path).toBe(true);
      expect(matches(path), path).toBe(true);
    }
    for (const path of [
      'assets/minecraft/textures/entity/zombie/zombie.png',
      'assets/minecraft/textures/entity/wolfish/x.png',
      'assets/minecraft/textures/gui/sprites/hud/heart/full.png',
      'assets/minecraft/textures/gui/sprites/hud/locator_bar_dot.json',
      'assets/minecraft/textures/painting/kebab.txt',
      'assets/minecraft/font/unifont.zip',
      'assets/minecraft/font/default.ttf',
      'assets/minecraft/shaders/post/blur.txt',
      'assets/minecraft/sounds.json',
      'assets/minecraft/sounds/mob/wolf/bark1.ogg',
      'assets/minecraft/lang/de_de.json',
      'assets/other/textures/entity/wolf/wolf.png',
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
