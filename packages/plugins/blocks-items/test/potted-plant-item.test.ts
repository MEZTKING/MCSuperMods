/**
 * B462a: the potted plant's pot loot drops the plant block's item (through the project
 * expander), the definition says `item: false`, and a bundle's closed picture counts as a model.
 */
import type { Element, Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { blockKind, expandPottedPlants } from '../src/index';
import { element } from './support';

const target = builtInTargets[0]?.target;
if (target === undefined) throw new Error('no target');

const bush = element('msm:block', 'example:blue_berry_bush', {
  format: 1,
  type: 'berry_bush',
  berry: 'example:blue_berries',
  item: { id: 'example:blue_berries' },
  loot: 'self',
});
const pot = element('msm:block', 'example:potted_bush', {
  format: 1,
  type: 'potted_plant',
  plant: 'example:blue_berry_bush',
  loot: 'self',
});

const lowerPot = (data: Json): OutputFile[] =>
  blockKind.lower({ ...pot, data } as Element, target) as OutputFile[];

const names = (files: OutputFile[]): unknown[] => {
  const file = files.find((f) => f.path.endsWith('/loot_table/blocks/potted_bush.json'));
  const loot = file?.contents as { pools: { entries: JsonObject[] }[] };
  return loot.pools.map((p) => p.entries[0]?.name);
};

describe('potted plant item (B462a)', () => {
  it('expands to the plant block item id and the loot drops it', () => {
    const { patches } = expandPottedPlants({ elements: [bush, pot], target: target as never });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      elementId: 'example:potted_bush',
      path: ['plant_item'],
      value: 'example:blue_berries',
    });
    const patched = { ...(pot.data as JsonObject), plant_item: 'example:blue_berries' };
    expect(names(lowerPot(patched))).toEqual(['minecraft:flower_pot', 'example:blue_berries']);
  });

  it('does not patch a vanilla plant or a plant whose item has its own id', () => {
    const plain = element('msm:block', 'example:ruby_sprout', { format: 1, type: 'crop' });
    const pot2 = element('msm:block', 'example:potted_sprout', {
      format: 1,
      type: 'potted_plant',
      plant: 'example:ruby_sprout',
    });
    const vanilla = element('msm:block', 'example:potted_grass', {
      format: 1,
      type: 'potted_plant',
      plant: 'minecraft:short_grass',
    });
    const result = expandPottedPlants({
      elements: [plain, pot2, vanilla],
      target: target as never,
    });
    expect(result.patches).toEqual([]);
    expect(names(lowerPot(pot.data as Json))).toEqual([
      'minecraft:flower_pot',
      'example:blue_berry_bush',
    ]);
  });

  it('is contributed by the plugin and strips plant_item from the definition', () => {
    expect(plugin.contributes.projectExpanders?.map((e) => e.id)).toEqual([
      'msm.blocks-items.potted-plant-item',
    ]);
    const files = lowerPot({ ...(pot.data as JsonObject), plant_item: 'example:blue_berries' });
    const def = files.find((f) => f.path === 'msm/example/block/potted_bush.json')
      ?.contents as JsonObject;
    expect(def.plant_item).toBeUndefined();
  });

  it('writes item false for a potted plant without item, and keeps a given item', () => {
    const def = (data: Json): JsonObject =>
      lowerPot(data).find((f) => f.path === 'msm/example/block/potted_bush.json')
        ?.contents as JsonObject;
    expect(def(pot.data as Json).item).toBe(false);
    expect(def({ ...(pot.data as JsonObject), item: { max_stack_size: 16 } }).item).toEqual({
      max_stack_size: 16,
    });
  });
});
