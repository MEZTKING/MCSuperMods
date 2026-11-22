/** A library example lowered in memory for a clip, cached per example and target (B566). */

import type { ExampleProject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import {
  clearExampleFilesCache,
  exampleFiles,
  idsOf,
} from '../../../src/renderer/src/showcase/example-files';
import { exampleById, filesOf, TARGETS, theRegistry } from './showcase-fixture';

const WOOD = 'example_msm_wood_set';

describe('exampleFiles', () => {
  it('lowers the wood set for the showcase namespace with no problem on both targets', async () => {
    for (const target of TARGETS) {
      const files = await filesOf(WOOD, target);
      expect(files.exampleId).toBe(WOOD);
      expect(files.target).toBe(target);
      // Without withTypedBlockModels: no lowering conflicts (B565 Z1).
      expect(files.problems).toEqual([]);
      expect(files.files.has('assets/showcase/blockstates/elm_planks.json')).toBe(true);
      expect(files.ids.has('showcase:elm_door')).toBe(true);
      expect(files.ids.has('showcase:elm_log')).toBe(true);
      expect(files.ids.has('showcase:oak_planks')).toBe(false);
      expect(files.ruleBooks).toEqual([]);
      // Pictures come from the bundle, not the lowered files.
      const picture = files.bundle.assets.find((asset) => asset.path.endsWith('.png'));
      expect(picture).toBeDefined();
      if (picture === undefined) return;
      expect(files.files.has(`assets/${picture.namespace}/${picture.path}`)).toBe(false);
      expect(await files.readAsset(picture.namespace, picture.path)).toBe(picture.bytes);
      expect(await files.readAsset('showcase', 'textures/block/none.png')).toBeNull();
    }
  });

  it('builds each example once per target, sharing the promise', async () => {
    clearExampleFilesCache();
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    const first = filesOf(WOOD, target);
    const second = filesOf(WOOD, target);
    expect(second).toBe(first);
    const other = TARGETS[1];
    if (other !== undefined) expect(filesOf(WOOD, other)).not.toBe(first);
    expect((await first).files).toBe((await second).files);
  });

  it('keeps the rule books of an example with rules', async () => {
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    const files = await filesOf('example_msm_rules', target);
    expect(files.problems).toEqual([]);
    expect(files.ruleBooks.length).toBeGreaterThan(0);
  });

  it('does not keep a failed build', async () => {
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    let calls = 0;
    const real = exampleById(WOOD);
    const flaky: ExampleProject = {
      ...real,
      id: 'example_flaky',
      build: (context) => {
        calls += 1;
        if (calls === 1) throw new Error('first build fails');
        return real.build(context);
      },
    };
    const deps = { registry: theRegistry(), plugins: builtInPlugins };
    await expect(exampleFiles(flaky, target, deps)).rejects.toThrow('first build fails');
    const again = await exampleFiles(flaky, target, deps);
    expect(again.problems).toEqual([]);
    expect(calls).toBe(2);
  });

  it('finds the showcase blocks and items of the lowered files', () => {
    const files = new Map<string, string | Uint8Array>([
      ['assets/showcase/blockstates/a_block.json', '{}'],
      ['assets/showcase/items/an_item.json', '{}'],
      ['assets/minecraft/items/stick.json', '{}'],
      ['assets/showcase/models/block/a_block.json', '{}'],
    ]);
    expect([...idsOf(files)].sort()).toEqual(['showcase:a_block', 'showcase:an_item']);
  });
});
