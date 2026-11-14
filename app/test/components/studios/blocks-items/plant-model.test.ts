/**
 * Pure helpers of the plant sections (B272) and texture drops on typed blocks: crop ages and
 * heights, the stage model per age, bone meal bounds, the "New tree" id, leaf tints.
 */
import type { Element, Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  colourHex,
  cropMaxAge,
  cropStageModel,
  defaultStageHeights,
  leafTintOf,
  parseColourHex,
  resizeStageHeights,
  saplingTreeId,
  tintValue,
  treeBlockIds,
  withBonemealBound,
} from '../../../../src/renderer/src/studios/blocks-items/plant-model';
import { retexture } from '../../../../src/renderer/src/textures/retexture';

describe('plant-model', () => {
  it('reads the last age and the default heights', () => {
    expect(cropMaxAge({})).toBe(7);
    expect(cropMaxAge({ max_age: 3 })).toBe(3);
    expect(cropMaxAge({ max_age: 99 })).toBe(7);
    expect(defaultStageHeights(7)).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(defaultStageHeights(3)).toEqual([2, 7, 11, 16]);
    expect(resizeStageHeights([5, 5], 3)).toEqual([5, 5, 11, 16]);
    expect(resizeStageHeights([1, 2, 3, 4, 5], 1)).toEqual([1, 2]);
  });

  it('spreads stage models over the ages, own models included', () => {
    const crop = {
      id: 'demo:beans' as const,
      data: {
        type: 'crop',
        textures: { stages: ['demo:block/a', 'demo:block/b', 'demo:block/c', 'demo:block/d'] },
      },
    };
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((age) => cropStageModel(crop, age))).toEqual([
      'demo:block/beans_stage0',
      'demo:block/beans_stage0',
      'demo:block/beans_stage1',
      'demo:block/beans_stage1',
      'demo:block/beans_stage2',
      'demo:block/beans_stage2',
      'demo:block/beans_stage3',
      'demo:block/beans_stage3',
    ]);
    const own = {
      id: 'demo:beans' as const,
      data: { type: 'crop', models: { stage0: 'demo:block/x' } },
    };
    expect(cropStageModel(own, 7)).toBe('demo:block/x');
    expect(
      cropStageModel({ id: 'demo:beans' as const, data: { type: 'crop' } }, 0),
    ).toBeUndefined();
  });

  it('writes both bone meal bounds', () => {
    expect(withBonemealBound({}, 'min', 1)).toEqual({ min: 1, max: 5 });
    expect(withBonemealBound({ bonemeal_growth: { min: 1, max: 5 } }, 'min', undefined)).toBe(
      undefined,
    );
  });

  it('names the new tree and its blocks after the sapling', () => {
    expect(saplingTreeId('demo:maple_sapling')).toBe('demo:maple_tree');
    expect(saplingTreeId('demo:odd')).toBe('demo:odd_tree');
    expect(treeBlockIds('demo:maple_tree', 'demo')).toEqual({
      log: 'demo:maple_log',
      leaves: 'demo:maple_leaves',
    });
  });

  it('reads and writes leaf tints', () => {
    expect(leafTintOf({})).toBe('none');
    expect(leafTintOf({ tint: 'grass' })).toBe('grass');
    expect(leafTintOf({ tint: 0x123456 })).toBe('colour');
    expect(colourHex(0x00ff00)).toBe('#00ff00');
    expect(parseColourHex('#FF8800')).toBe(0xff8800);
    expect(parseColourHex('red')).toBeUndefined();
    expect(tintValue('colour', { tint: 5 })).toBe(5);
    expect(tintValue('none', {})).toBeUndefined();
  });
});

describe('retexture on typed blocks', () => {
  const project = (elements: Element[]): Project =>
    ({ name: 'demo', namespaces: [{ name: 'demo', elements, assets: [] }] }) as unknown as Project;
  const block = (id: string, data: object) =>
    ({ id, kind: 'msm:block', data, formatVersion: 1, meta: {} }) as unknown as Element;

  it("changes a typed block's own main texture", () => {
    const stairs = block('demo:stairs', { type: 'stairs', textures: { all: 'demo:block/a' } });
    expect(retexture(project([stairs]), stairs, 'demo:block/b')).toEqual({
      ok: true,
      modelId: 'demo:stairs',
      slot: 'all',
      previous: 'demo:block/a',
      data: { type: 'stairs', textures: { all: 'demo:block/b' } },
    });
    const sapling = block('demo:sapling', { type: 'sapling' });
    const result = retexture(project([sapling]), sapling, 'demo:block/s');
    expect(result.ok && result.slot).toBe('sapling');
    const crop = block('demo:crop', { type: 'crop' });
    expect(retexture(project([crop]), crop, 'demo:block/c').ok).toBe(false);
  });
});
