// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B555 (ADR 0116 D4): the Structure Studio's "Chests and containers": containers found by the
 * schema's `Items`, the loot table, seed and items written back as SNBT keeping the other keys.
 */
import { CommandStack, commands, type Json, type Project, type ResourceLocation } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import structuresPlugin from '@msm/plugin-structures';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  containerEntries,
  freeSlot,
  isLootSeed,
  schemaHasInventory,
  withItems,
  withLootSeed,
  withLootTable,
} from '../../../../src/renderer/src/studios/structures/ContainersSection';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { schemaState } from '../blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const TEMPLATE = {
  size: [3, 1, 1],
  palette: [
    'minecraft:chest[facing=north]',
    'minecraft:red_shulker_box',
    'minecraft:oak_sign',
    'minecraft:barrel',
  ],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 1],
    [2, 0, 0, 2],
    [3, 0, 0, 3],
  ],
  block_entities: [
    {
      pos: [0, 0, 0],
      nbt: '{id:"minecraft:chest",Items:[{Slot:0b,id:"minecraft:apple",count:2,components:{"minecraft:rarity":"rare"}}],CustomName:"\\"Box\\""}',
    },
    { pos: [1, 0, 0], nbt: '{}' },
    { pos: [2, 0, 0], nbt: '{id:"minecraft:sign"}' },
    {
      pos: [3, 0, 0],
      nbt: '{id:"minecraft:barrel",LootTable:"minecraft:chests/simple_dungeon",LootTableSeed:42L}',
    },
  ],
};

describe('containers', () => {
  it('finds the block entities with an inventory by the schema', () => {
    if (schema.status !== 'ready') throw new Error('schema');
    const has = schemaHasInventory(schema.context);
    expect(has('chest')).toBe(true);
    expect(has('sign')).toBe(false);
    const entries = containerEntries(TEMPLATE as unknown as Json, has);
    expect(entries.map((entry) => [entry.index, entry.type])).toEqual([
      [0, 'chest'],
      [1, 'shulker_box'],
      [3, 'barrel'],
    ]);
    expect(entries[0]?.items).toEqual([{ slot: 0, item: 'minecraft:apple', count: 2 }]);
    expect(entries[2]).toMatchObject({ lootTable: 'minecraft:chests/simple_dungeon', seed: '42' });
  });

  it('writes loot, seed and items back, keeping the other keys', () => {
    const chest = TEMPLATE.block_entities[0]?.nbt as string;
    const looted = withLootSeed(withLootTable(chest, 'demo:chests/start'), '-9');
    expect(looted).toContain('LootTable:"demo:chests/start"');
    expect(looted).toContain('LootTableSeed:-9L');
    expect(looted).toContain('CustomName');
    expect(withLootTable(looted, undefined)).not.toContain('LootTable');
    const items = withItems(chest, [
      { slot: 0, item: 'minecraft:golden_apple', count: 3 },
      { slot: 1, item: 'minecraft:stick', count: 1 },
    ]);
    expect(items).toContain('{Slot:0b,id:"minecraft:golden_apple",count:3,components:');
    expect(items).toContain('{Slot:1b,id:"minecraft:stick",count:1}');
    expect(withItems(chest, [])).not.toContain('Items');
    expect(isLootSeed('9223372036854775808')).toBe(false);
    expect(freeSlot([{ slot: 0, item: 'x', count: 1 }])).toBe(1);
  });
});

const KINDS: ElementKind[] = [...(structuresPlugin.contributes.elementKinds ?? [])];
const projectOf = (...elements: ReturnType<typeof element>[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

function Harness(props: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => props.stack.subscribe(() => rerender()), [props.stack]);
  const subject = props.stack.state.namespaces[0]?.elements.find((entry) => entry.id === props.id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={props.stack.state}
      element={subject}
      kind={KINDS.find((kind) => kind.id === subject.kind) as ElementKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        props.stack.execute(commands.setElementValue(props.id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

describe('Chests and containers in the Structure Studio', () => {
  it('adds an item to a chest as one undo step', () => {
    const id = 'demo:house' as ResourceLocation;
    const stack = new CommandStack(
      projectOf(element(id, 'minecraft:structure_template', TEMPLATE as unknown as Json)),
    );
    render(<Harness stack={stack} id={id} />);
    expect(screen.getByTestId('structure-containers')).toBeTruthy();
    expect(screen.getByTestId('structure-container-0')).toBeTruthy();
    expect(screen.queryByTestId('structure-container-2')).toBeNull();
    fireEvent.click(screen.getByTestId('structure-container-0-item-add'));
    const nbt = () => {
      const data = stack.state.namespaces[0]?.elements[0]?.data as
        | { block_entities: { nbt: string }[] }
        | undefined;
      return data?.block_entities[0]?.nbt;
    };
    expect(nbt()).toContain('{Slot:1b,id:"minecraft:bread",count:1}');
    act(() => stack.undo());
    expect(nbt()).not.toContain('bread');
  });
});
