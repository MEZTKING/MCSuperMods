import { describe, expect, it } from 'vitest';
import {
  parseBlockState,
  structureFromTemplate,
} from '../../../src/renderer/src/preview/structure';

describe('parseBlockState', () => {
  it('adds the minecraft namespace to a bare id and keeps an explicit one', () => {
    expect(parseBlockState('stone')).toEqual({ name: 'minecraft:stone', properties: {} });
    expect(parseBlockState('demo:ruby_block')).toEqual({ name: 'demo:ruby_block', properties: {} });
    expect(parseBlockState(' minecraft:stone[] ')).toEqual({
      name: 'minecraft:stone',
      properties: {},
    });
  });

  it('reads properties in the order they are written, ignoring whitespace', () => {
    const state = parseBlockState('oak_stairs[half=bottom, facing = north]');
    expect(state?.name).toBe('minecraft:oak_stairs');
    expect(state?.properties).toEqual({ half: 'bottom', facing: 'north' });
    expect(Object.keys(state?.properties ?? {})).toEqual(['half', 'facing']);
    // Order does not change the state.
    expect(parseBlockState('oak_stairs[facing=north,half=bottom]')?.properties).toEqual(
      state?.properties,
    );
  });

  it('rejects text that is not a block state', () => {
    for (const text of [
      '',
      'Stone',
      'stone[facing=north',
      'stone[facing]',
      'stone[facing=north,facing=south]',
      'a:b:c',
    ]) {
      expect(parseBlockState(text), text).toBeNull();
    }
  });
});

describe('structureFromTemplate', () => {
  it('places every valid block and keeps the size', () => {
    const result = structureFromTemplate({
      size: [2, 3, 4],
      palette: ['minecraft:stone', 'oak_log[axis=y]', 'minecraft:air'],
      blocks: [
        [0, 0, 0, 0],
        [1, 0, 0, 0],
        [0, 1, 0, 1],
        [1, 2, 3, 2],
      ],
    });
    expect(result.size).toEqual([2, 3, 4]);
    expect(result.structure.getSize()).toEqual([2, 3, 4]);
    expect(result.blockCount).toBe(3);
    expect(result.structure.getBlocks()).toHaveLength(3);
    expect(result.blockIds).toEqual(['minecraft:oak_log', 'minecraft:stone']);
    const log = result.structure.getBlock([0, 1, 0]);
    expect(log?.state.getName().toString()).toBe('minecraft:oak_log');
    expect(log?.state.getProperties()).toEqual({ axis: 'y' });
    expect(result.invalidPalette).toEqual([]);
    expect(result.skippedBlocks).toBe(0);
  });

  it('skips invalid tuples and blocks whose palette entry does not parse', () => {
    const result = structureFromTemplate({
      size: [2, 2, 2],
      palette: ['minecraft:stone', 'Not A Block'],
      blocks: [
        [0, 0, 0, 0],
        [0, 0, 1], // too short
        [0, 0, 1, 0.5], // not an integer
        [2, 0, 0, 0], // outside the size
        [1, 1, 1, 7], // no such palette entry
        [1, 0, 0, 1], // palette entry does not parse
        [0, 0, 0, 0], // duplicate position
        'stone',
      ],
    });
    expect(result.blockCount).toBe(1);
    expect(result.skippedBlocks).toBe(7);
    expect(result.invalidPalette).toEqual(['Not A Block']);
  });

  it('gives an empty 1x1x1 structure for data that is not a template', () => {
    const result = structureFromTemplate(null);
    expect(result.size).toEqual([1, 1, 1]);
    expect(result.blockCount).toBe(0);
    expect(structureFromTemplate({ size: [0, -1, 'x'] }).size).toEqual([1, 1, 1]);
  });
});
