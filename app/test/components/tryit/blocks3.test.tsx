// @vitest-environment happy-dom
/**
 * Vanilla parity 3, batch 1 in the Try it view (B519): MSM's fallback parents for the vanilla
 * templates of the growing and climbing plants and the flower pot, the Lightning tool, and a
 * double chest opening the mock-up screen of both halves over a real area.
 */
import { SIM_TOOLS, type SimFiles } from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TRYIT_FALLBACK_MODELS } from '../../../src/renderer/src/tryit/blocks2/fallback-parents';
import { BLOCKS3_FALLBACK_PARENTS } from '../../../src/renderer/src/tryit/blocks3/fallback-parents';
import { MockScreen } from '../../../src/renderer/src/tryit/MockScreen';
import { TryItArea } from '../../../src/renderer/src/tryit/session-source';
import { NS, TARGET } from './tryit-fixture';

afterEach(cleanup);

function files(): SimFiles {
  const entries: Record<string, unknown> = {
    [`msm/${NS}/block/oak_crate.json`]: {
      format: 1,
      type: 'horizontal',
      components: { 'msm:container': { double: true } },
    },
    [`msm/${NS}/block/clay_pot.json`]: {
      format: 1,
      type: 'flower_pot',
      plants: ['minecraft:dandelion'],
    },
  };
  return new Map(Object.entries(entries).map(([path, json]) => [path, JSON.stringify(json)]));
}

describe('Try it, vanilla parity 3', () => {
  it('has a fallback parent for every vanilla template the five plant types name', () => {
    const paths = [
      ...[1, 2, 3, 4].flatMap((n) => [`block/bamboo${n}_age0`, `block/bamboo${n}_age1`]),
      'block/bamboo_small_leaves',
      'block/bamboo_large_leaves',
      'block/cactus',
      'block/glow_lichen',
      'block/big_dripleaf',
      'block/big_dripleaf_partial_tilt',
      'block/big_dripleaf_full_tilt',
      'block/big_dripleaf_stem',
      'block/small_dripleaf_top',
      'block/small_dripleaf_bottom',
      'block/flower_pot',
    ];
    for (const path of paths) {
      expect(BLOCKS3_FALLBACK_PARENTS[path], path).toBeDefined();
      expect(TRYIT_FALLBACK_MODELS[path]).toBe(BLOCKS3_FALLBACK_PARENTS[path]);
    }
    // The texture variables the lowered models fill.
    expect(JSON.stringify(BLOCKS3_FALLBACK_PARENTS['block/cactus'])).toContain('#side');
    expect(JSON.stringify(BLOCKS3_FALLBACK_PARENTS['block/flower_pot'])).toContain('#dirt');
    expect(TRYIT_FALLBACK_MODELS['block/flower_pot_cross']).toBeDefined();
  });

  it('offers the Lightning tool', () => {
    expect(SIM_TOOLS.map((tool) => tool.id)).toContain('lightning');
  });

  it('opens both halves of a double chest as one six-row mock-up', () => {
    const tryIt = new TryItArea({ files: files(), target: TARGET, seed: 2 });
    const source = tryIt.source;
    const crate = `${NS}:oak_crate`;
    for (const x of [3, 4]) {
      source.act({
        type: 'place',
        pos: { x, y: -1, z: 3 },
        face: 'up',
        hit: { x: 0.5, y: 1, z: 0.5 },
        block: crate,
      });
    }
    expect(source.world.get({ x: 3, y: 0, z: 3 })?.properties.type).not.toBe('single');
    source.act({
      type: 'use',
      pos: { x: 3, y: 0, z: 3 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
    });
    const open = source.screen;
    expect(open?.spec).toMatchObject({ kind: 'container', rows: 6 });
    render(<MockScreen screen={open as NonNullable<typeof open>} onClose={() => {}} />);
    expect(screen.getByText(/6 rows of 9/)).toBeTruthy();
    tryIt.dispose();
  });
});
