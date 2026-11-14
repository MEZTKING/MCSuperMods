/**
 * The definition reader's block item id (ADR 0068 D2): `item.id` when set, else the block's
 * id, `undefined` for a block without an item.
 */
import type { DefinitionInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { blockItemId } from '../src/java-project/read';

const block = (definition: JsonObject): DefinitionInput => ({
  id: 'demo:tomatoes',
  path: 'msm/demo/block/tomatoes.json',
  definition: { format: 1, ...definition },
});

describe('blockItemId', () => {
  it('is the block id without item.id', () => {
    expect(blockItemId(block({}))).toBe('demo:tomatoes');
    expect(blockItemId(block({ item: { creative_tab: 'minecraft:natural_blocks' } }))).toBe(
      'demo:tomatoes',
    );
  });

  it('is item.id when set (seeds planting a crop)', () => {
    expect(blockItemId(block({ type: 'crop', item: { id: 'demo:tomato_seeds' } }))).toBe(
      'demo:tomato_seeds',
    );
  });

  it('is undefined for a block without an item', () => {
    expect(blockItemId(block({ item: false }))).toBeUndefined();
  });

  it('names the definition when item.id is not an id', () => {
    expect(() => blockItemId(block({ item: { id: 'Tomato Seeds' } }))).toThrow(
      /msm\/demo\/block\/tomatoes\.json \(demo:tomatoes\): item: id 'Tomato Seeds' is not an item id/,
    );
    expect(() => blockItemId(block({ item: { id: 3 } }))).toThrow(/id must be a string/);
  });
});
