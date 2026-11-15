// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The "World addition" and "Extra drops" Studios (B239, ADR 0060 D2, D3): registered for their
 * kinds, every edit one undo step, schema choices for steps and categories, the loot table
 * picker narrowed by group, the simple drop row reading and writing whole pools, and pools
 * beyond it left to "Advanced (all fields)" and Raw JSON. Rendered through `ElementForm` over
 * the real schema index.
 */
import type { CommandStack, Json, ResourceLocation } from '@msm/core';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type ChangeItem, planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import {
  guessConfiguredFeature,
  planOwnCopy,
  vanillaPlacedFeature,
} from '../../../../src/renderer/src/studios/blocks-items/AdditionStudios';
import {
  readSimpleDrop,
  simpleDropsSupported,
  suggestTablesIn,
  tableGroupLabel,
  writeSimpleDrop,
} from '../../../../src/renderer/src/studios/blocks-items/additions-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex, schemaIndexFor } from '../../forms/schemas';
import { kindOf, projectOf, renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
const VANILLA = {
  loot_table: ['entities/zombie', 'entities/skeleton', 'blocks/stone', 'chests/simple_dungeon'],
  item: ['emerald', 'diamond'],
  'worldgen/configured_feature': ['ore_coal', 'ore_coal_buried', 'flower_plains'],
};
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), VANILLA);
});
afterEach(cleanup);

const templateData = (id: string): Json => {
  const template = blocksItemsPlugin.contributes.elementTemplates?.find((entry) => entry.id === id);
  if (template === undefined || typeof template.data !== 'function') {
    throw new Error(`No template ${id}.`);
  }
  return template.data({ id: 'demo:ruby_ore', namespace: 'demo' } as never) as Json;
};

const undoAll = (stack: { canUndo: boolean; undo(): boolean }): number => {
  let steps = 0;
  while (stack.canUndo) {
    stack.undo();
    steps++;
  }
  return steps;
};

describe('Addition Studios registration', () => {
  it('registers a Studio for each addition kind', () => {
    const ids = DISCOVERED_STUDIOS.map((entry) => [entry.id, entry.kindId]);
    expect(ids).toContainEqual(['msm.blocks-items.biome-addition', 'msm:biome_addition']);
    expect(ids).toContainEqual(['msm.blocks-items.loot-addition', 'msm:loot_addition']);
  });
});

describe('World addition Studio', () => {
  const id = 'demo:ruby_ore' as ResourceLocation;
  const start = (data: Json) => renderOnStack(element(id, 'msm:biome_addition', data), schema);

  it('edits biomes, features and spawns, one undo step each', () => {
    const original = templateData('msm_biome_addition_overworld_ore');
    const { stack, data } = start(original);
    expect(screen.getByTestId('world-addition-studio')).toBeTruthy();
    expect(screen.getByLabelText('Biomes 1')).toHaveProperty('value', '#minecraft:is_overworld');

    const step = screen.getByTestId('world-addition-feature-0-step') as HTMLSelectElement;
    expect(step.value).toBe('underground_ores');
    const steps = [...step.options].map((option) => option.value);
    expect(steps).toContain('vegetal_decoration');
    expect(steps).toHaveLength(11);
    fireEvent.change(step, { target: { value: 'underground_decoration' } });
    expect(data()).toMatchObject({ features: [{ step: 'underground_decoration' }] });

    const feature = screen.getByTestId('world-addition-feature-0-id');
    fireEvent.change(feature, { target: { value: 'demo:ruby_ore_placed_2' } });
    fireEvent.blur(feature);
    expect(data()).toMatchObject({ features: [{ feature: 'demo:ruby_ore_placed_2' }] });

    fireEvent.click(screen.getByTestId('world-addition-add-spawn'));
    const spawns = (data() as { spawns: Json[] }).spawns;
    expect(spawns).toEqual([
      { entity: '', category: 'monster', weight: 10, min_group: 1, max_group: 4 },
    ]);
    const category = screen.getByTestId('world-addition-spawn-0-category') as HTMLSelectElement;
    expect([...category.options].map((option) => option.value)).toContain('creature');
    fireEvent.change(category, { target: { value: 'creature' } });
    fireEvent.change(screen.getByTestId('world-addition-spawn-0-weight'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByTestId('world-addition-spawn-0-weight'), {
      target: { value: '50' },
    });
    expect(data()).toMatchObject({ spawns: [{ category: 'creature', weight: 50 }] });

    fireEvent.click(screen.getByTestId('world-addition-add-feature'));
    expect((data() as { features: Json[] }).features).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Remove Feature 2'));
    fireEvent.click(screen.getByLabelText('Remove Spawn 1'));
    expect(data()).toEqual({
      ...(original as object),
      features: [{ feature: 'demo:ruby_ore_placed_2', step: 'underground_decoration' }],
    });

    // step, feature, add spawn, category, weight (typing merged), add feature, two removals.
    expect(undoAll(stack)).toBe(8);
    expect(data()).toEqual(original);
  });

  it('shows the generic form under Advanced', () => {
    start(templateData('msm_biome_addition_overworld_ore'));
    fireEvent.click(screen.getByTestId('world-addition-advanced'));
    expect(screen.queryByTestId('world-addition-features')).toBeNull();
  });
});

describe('World addition Studio: Make my own copy (ADR 0097 D3)', () => {
  const id = 'demo:coal_more' as ResourceLocation;
  const addition = {
    format: 1,
    biomes: ['#minecraft:is_overworld'],
    features: [
      { feature: 'demo:ruby_ore_placed', step: 'underground_ores' },
      { feature: 'minecraft:ore_coal_upper', step: 'underground_ores' },
    ],
  } as Json;
  const VANILLA_FILE = {
    feature: 'minecraft:ore_coal',
    placement: [{ type: 'minecraft:count', count: 30 }, { type: 'minecraft:in_square' }],
  };

  /** A host whose `applyChanges` applies the items as one step, and a vanilla cache reader. */
  const hostFor = (
    stack: () => CommandStack,
    files: Record<string, unknown>,
    reads: string[],
  ): BlocksItemsStudioHost => ({
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    modelPreview: {
      folders: bundle.target.folders.resource,
      readProjectAsset: async () => null,
      vanilla: {
        readAsset: async (path) => {
          reads.push(path);
          const file = files[path];
          return file === undefined ? null : new TextEncoder().encode(JSON.stringify(file));
        },
      },
    },
    applyChanges: async (items: readonly ChangeItem[], label: string) => {
      const plan = planChangeItems(stack().state, items);
      if (plan.skipped.length > 0) throw new Error('The project changed meanwhile.');
      const parts = plan.commands;
      stack().execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of parts) part.apply(draft);
        },
      });
    },
  });

  const startWith = (files: Record<string, unknown>) => {
    const reads: string[] = [];
    let current: CommandStack | undefined;
    const host = hostFor(() => current as CommandStack, files, reads);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlocksItemsStudioHostContext.Provider value={host}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    );
    const rendered = renderOnStack(element(id, 'msm:biome_addition', addition), schema, {
      wrapper,
    });
    current = rendered.stack;
    const find = (elementId: string): Json | undefined =>
      rendered.stack.state.namespaces[0]?.elements.find((entry) => entry.id === elementId)?.data;
    return { ...rendered, reads, find };
  };

  it('offers the copy only on a vanilla feature row', () => {
    startWith({});
    expect(screen.queryByTestId('world-addition-feature-0-copy')).toBeNull();
    expect(screen.getByTestId('world-addition-feature-1-copy').textContent).toContain(
      'Make my own copy',
    );
  });

  it("copies the game's placed feature into the project and points the row at it, in one undo step", async () => {
    const { stack, data, reads, find } = startWith({
      'data/minecraft/worldgen/placed_feature/ore_coal_upper.json': VANILLA_FILE,
    });
    fireEvent.click(screen.getByTestId('world-addition-feature-1-copy'));
    const note = await screen.findByTestId('world-addition-copy-note');
    expect(note.textContent).toContain(
      'Made demo:ore_coal_upper, a copy of minecraft:ore_coal_upper',
    );
    expect(reads).toEqual(['data/minecraft/worldgen/placed_feature/ore_coal_upper.json']);
    expect(find('demo:ore_coal_upper')).toEqual(VANILLA_FILE);
    expect(
      stack.state.namespaces[0]?.elements.find((entry) => entry.id === 'demo:ore_coal_upper')?.kind,
    ).toBe('minecraft:worldgen/placed_feature');
    expect(data()).toMatchObject({
      features: [
        { feature: 'demo:ruby_ore_placed' },
        { feature: 'demo:ore_coal_upper', step: 'underground_ores' },
      ],
    });
    // The row now names a project feature: no more copy button.
    expect(screen.queryByTestId('world-addition-feature-1-copy')).toBeNull();
    expect(undoAll(stack)).toBe(1);
    expect(data()).toEqual(addition);
    expect(find('demo:ore_coal_upper')).toBeUndefined();
  });

  it('falls back to the configured feature by id, with no placement, when the file cannot be read', async () => {
    const { find } = startWith({});
    fireEvent.click(screen.getByTestId('world-addition-feature-1-copy'));
    const note = await screen.findByTestId('world-addition-copy-note');
    expect(note.textContent).toContain('has no placement yet');
    expect(find('demo:ore_coal_upper')).toEqual({ feature: 'minecraft:ore_coal', placement: [] });
  });

  it('plans a free id and leaves project rows alone', () => {
    const taken = element('demo:ore_coal_upper' as ResourceLocation, 'msm:item', {});
    const project = projectOf(element(id, 'msm:biome_addition', addition), taken);
    const plan = planOwnCopy({
      project,
      addition: { id, kind: 'msm:biome_addition', data: addition },
      index: 1,
      vanilla: VANILLA_FILE as Json,
      configured: [],
    });
    expect(plan?.id).toBe('demo:ore_coal_upper_copy');
    expect(plan?.items.map((item) => item.op)).toEqual(['create', 'update']);
    expect(
      planOwnCopy({
        project,
        addition: { id, kind: 'msm:biome_addition', data: addition },
        index: 0,
        vanilla: null,
        configured: [],
      }),
    ).toBeUndefined();
    expect(vanillaPlacedFeature('ore_coal_upper')).toBe('minecraft:ore_coal_upper');
    expect(vanillaPlacedFeature('#minecraft:x')).toBeUndefined();
    expect(guessConfiguredFeature('ore_coal_upper', ['ore_coal', 'ore'])).toBe(
      'minecraft:ore_coal',
    );
    expect(guessConfiguredFeature('flower_plains', ['flower_plains'])).toBe(
      'minecraft:flower_plains',
    );
  });
});

describe('Extra drops Studio', () => {
  const id = 'demo:zombie_ruby' as ResourceLocation;
  const start = (data: Json) => renderOnStack(element(id, 'msm:loot_addition', data), schema);

  it('reads the template pool as one simple row and writes whole pools, one undo step each', () => {
    const original = templateData('msm_loot_addition_mob_drop');
    const { stack, data } = start(original);
    expect((screen.getByTestId('extra-drops-0-item') as HTMLInputElement).value).toBe(
      'minecraft:emerald',
    );
    expect((screen.getByTestId('extra-drops-0-chance') as HTMLInputElement).value).toBe('10');
    expect((screen.getByTestId('extra-drops-0-player-kill') as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByTestId('extra-drops-table-groups').textContent).toContain(
      'minecraft:entities/zombie (Mobs)',
    );

    fireEvent.change(screen.getByTestId('extra-drops-0-max'), { target: { value: '3' } });
    expect(data()).toMatchObject({
      pools: [
        {
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:emerald',
              modifier: {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: 1, max: 3 },
              },
            },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByTestId('extra-drops-0-player-kill'));
    expect((data() as { pools: { condition: Json }[] }).pools[0]?.condition).toEqual({
      type: 'minecraft:random_chance',
      chance: 0.1,
    });
    fireEvent.change(screen.getByTestId('extra-drops-0-chance'), { target: { value: '100' } });
    expect(Object.hasOwn((data() as { pools: object[] }).pools[0] ?? {}, 'condition')).toBe(false);

    fireEvent.click(screen.getByTestId('extra-drops-add'));
    expect((data() as { pools: Json[] }).pools[1]).toEqual({
      rolls: 1,
      entries: [{ type: 'minecraft:item', name: '' }],
    });
    const item = screen.getByTestId('extra-drops-1-item');
    fireEvent.change(item, { target: { value: 'minecraft:diamond' } });
    fireEvent.blur(item);
    expect((data() as { pools: Json[] }).pools[1]).toEqual({
      rolls: 1,
      entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }],
    });

    // max, player kill, chance, add, item.
    expect(undoAll(stack)).toBe(5);
    expect(data()).toEqual(original);
  });

  it('adds a table from the picker narrowed to chests', () => {
    const { data } = start(templateData('msm_loot_addition_mob_drop'));
    fireEvent.change(screen.getByTestId('extra-drops-table-group'), {
      target: { value: 'Chests' },
    });
    const draft = screen.getByLabelText('New entry in Loot tables');
    fireEvent.change(draft, { target: { value: 'minecraft:chests/simple_dungeon' } });
    fireEvent.click(screen.getByLabelText('Add to Loot tables'));
    expect((data() as { tables: string[] }).tables).toEqual([
      'minecraft:entities/zombie',
      'minecraft:chests/simple_dungeon',
    ]);
  });

  it('leaves a pool beyond the simple row to Advanced and Raw JSON', () => {
    start({
      format: 1,
      tables: ['minecraft:entities/zombie'],
      pools: [
        {
          rolls: 2,
          entries: [
            { type: 'minecraft:item', name: 'minecraft:emerald' },
            { type: 'minecraft:item', name: 'minecraft:diamond' },
          ],
        },
      ],
    });
    expect(screen.getByTestId('extra-drops-0-custom').textContent).toContain('Raw JSON');
    expect(screen.queryByTestId('extra-drops-0-item')).toBeNull();
    fireEvent.click(screen.getByTestId('extra-drops-advanced'));
    expect(screen.queryByTestId('extra-drops-pools')).toBeNull();
  });
});

describe('additions model', () => {
  it('round-trips simple drops', () => {
    const drops = [
      { item: 'minecraft:emerald', min: 1, max: 1, chance: 1, playerKill: false },
      { item: 'demo:ruby', min: 2, max: 2, chance: 0.5, playerKill: false },
      { item: 'demo:ruby', min: 1, max: 4, chance: 0.25, playerKill: true },
      { item: 'demo:ruby', min: 1, max: 1, chance: 1, playerKill: true },
    ];
    for (const drop of drops) expect(readSimpleDrop(writeSimpleDrop(drop))).toEqual(drop);
    expect(writeSimpleDrop(drops[1] as (typeof drops)[number])).toEqual({
      rolls: 1,
      entries: [
        {
          type: 'minecraft:item',
          name: 'demo:ruby',
          modifier: { type: 'minecraft:set_count', count: 2 },
        },
      ],
      condition: { type: 'minecraft:random_chance', chance: 0.5 },
    });
  });

  it('refuses pools beyond the simple row', () => {
    const base = writeSimpleDrop({ item: 'a:b', min: 1, max: 1, chance: 1, playerKill: false });
    expect(readSimpleDrop({ ...base, bonus_rolls: 1 })).toBeUndefined();
    expect(readSimpleDrop({ ...base, rolls: 2 })).toBeUndefined();
    expect(
      readSimpleDrop({ ...base, condition: { type: 'minecraft:killed_by_player', inverse: true } }),
    ).toBeUndefined();
    expect(readSimpleDrop({ ...base, entries: [{ type: 'minecraft:tag', name: 'a:b' }] })).toBe(
      undefined,
    );
  });

  it('finds the simple pool shape in every built-in target', async () => {
    const kind = kindOf('msm:loot_addition');
    for (const each of builtInTargets) {
      const index = await schemaIndexFor(each);
      const node = index.resolveSchemaRef(kind.schema);
      expect(simpleDropsSupported(node, kind.defaultData ?? {}), each.target.id).toBe(true);
    }
  });

  it('groups and narrows loot tables', () => {
    expect(tableGroupLabel('minecraft:entities/zombie')).toBe('Mobs');
    expect(tableGroupLabel('minecraft:blocks/stone')).toBe('Blocks');
    expect(tableGroupLabel('minecraft:chests/simple_dungeon')).toBe('Chests');
    expect(tableGroupLabel('minecraft:gameplay/fishing')).toBe('Other');
    const all = ['minecraft:entities/zombie', 'minecraft:blocks/stone', 'minecraft:blocks/zinc'];
    const suggest = (_registry: string, prefix: string) =>
      all.filter((id) => id.startsWith(prefix) || id.slice(10).startsWith(prefix));
    expect(suggestTablesIn(suggest, 'entities')('loot_table', 'z')).toEqual([
      'minecraft:entities/zombie',
    ]);
    expect(suggestTablesIn(suggest, 'blocks')('loot_table', '')).toEqual([
      'minecraft:blocks/stone',
      'minecraft:blocks/zinc',
    ]);
    expect(suggestTablesIn(suggest, '')('loot_table', '')).toEqual(all);
  });
});
