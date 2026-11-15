// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Item Studio's Inventory section (B453, ADR 0095 D1, D4): the three choices as one undo
 * step each, the bag fields, the bundle pictures and the conflict hints.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bagSlots,
  inventoryHints,
  itemHolds,
  withItemHolds,
} from '../../../../src/renderer/src/studios/blocks-items/ItemInventorySection';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const item = (data: Record<string, Json> = {}): Element =>
  element('demo:satchel' as ResourceLocation, 'msm:item', {
    format: 1,
    display_name: 'Satchel',
    events: { opened: { actions: [] } },
    ...data,
  });
type Data = { components?: Record<string, Json>; bundle_textures?: Record<string, Json> };
const read = (data: () => Json) => data() as Data;
const holds = () => screen.getByTestId('item-inventory-holds') as HTMLSelectElement;
const pick = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('item inventory model', () => {
  it('reads the choice and the slots', () => {
    expect(itemHolds({})).toBe('none');
    expect(itemHolds({ components: { 'msm:item_inventory': {} } })).toBe('bag');
    expect(itemHolds({ components: { 'msm:bundle': {} } })).toBe('bundle');
    expect(itemHolds({ components: { 'msm:bundle': {}, 'msm:item_inventory': {} } })).toBe('both');
    expect(bagSlots({})).toBe(27);
    expect(bagSlots({ rows: 6 })).toBe(54);
    expect(bagSlots({ layout: 'hopper', rows: 6 })).toBe(5);
    expect(bagSlots({ layout: 'dispenser' })).toBe(9);
  });

  it('gives no hints for a plain item or a clean bag', () => {
    expect(inventoryHints({ max_stack_size: 16 })).toEqual([]);
    expect(inventoryHints({ components: { 'msm:item_inventory': {} } })).toEqual([]);
    expect(
      inventoryHints({ max_stack_size: 1, components: { 'msm:bundle': {}, 'msm:durability': {} } }),
    ).toEqual([]);
  });

  it('hints at a stack size above 1, the conflicting components and both choices', () => {
    expect(inventoryHints({ max_stack_size: 16, components: { 'msm:bundle': {} } })[0]).toContain(
      'must be 1',
    );
    const hints = inventoryHints({
      components: { 'msm:item_inventory': {}, 'msm:food': {}, 'msm:tool': {} },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('food');
    expect(hints[0]).toContain('a tool');
    expect(
      inventoryHints({ components: { 'msm:item_inventory': {}, 'msm:bundle': {} } })[0],
    ).toContain('both a bag and a bundle');
  });

  it('switches the choice and removes the other one with its pictures', () => {
    const bundleData = {
      bundle_textures: { closed: 'demo:item/b' },
      components: { 'msm:bundle': {} },
    };
    expect(withItemHolds(bundleData, 'bag')).toEqual({ components: { 'msm:item_inventory': {} } });
    expect(withItemHolds(bundleData, 'none')).toEqual({});
  });
});

describe('Item Studio Inventory section', () => {
  it('turns a bag on and off in one undo step each', () => {
    const { stack, data } = renderOnStack(item(), schema);
    expect(holds().value).toBe('none');
    pick('item-inventory-holds', 'bag');
    expect(read(data).components).toEqual({ 'msm:item_inventory': {} });
    expect(screen.getByTestId('item-bag-picture').getAttribute('data-slots')).toBe('27');
    pick('item-inventory-holds', 'none');
    expect(read(data).components).toBeUndefined();
    stack.undo();
    expect(read(data).components).toEqual({ 'msm:item_inventory': {} });
    stack.undo();
    expect(read(data).components).toBeUndefined();
  });

  it('edits the bag: layout, rows, open, sounds, events', () => {
    const { stack, data } = renderOnStack(
      item({ components: { 'msm:item_inventory': {} } }),
      schema,
    );
    const bag = () => read(data).components?.['msm:item_inventory'] as Record<string, Json>;
    fireEvent.change(screen.getByTestId('item-bag-rows'), { target: { value: '5' } });
    expect(bag().rows).toBe(5);
    expect(screen.getByTestId('item-bag-picture').getAttribute('data-slots')).toBe('45');
    pick('item-bag-open', 'sneak_use');
    expect(bag().open).toBe('sneak_use');
    pick('item-bag-open', 'use');
    expect(bag().open).toBeUndefined();
    pick('item-bag-on-open', 'opened');
    expect(bag().on_open).toBe('opened');
    const sound = screen.getByTestId('item-bag-open-sound') as HTMLInputElement;
    fireEvent.change(sound, { target: { value: 'minecraft:block.chest.open' } });
    fireEvent.blur(sound);
    expect(bag().open_sound).toBe('minecraft:block.chest.open');
    pick('item-bag-layout', 'hopper');
    expect(bag().layout).toBe('hopper');
    expect(screen.queryByTestId('item-bag-rows')).toBeNull();
    expect(screen.getByTestId('item-bag-rows-ignored')).toBeTruthy();
    expect(screen.getByTestId('item-bag-picture').getAttribute('data-slots')).toBe('5');
    stack.undo();
    expect(bag().layout).toBeUndefined();
    pick('item-bag-layout', 'chest');
    expect(bag().layout).toBeUndefined();
  });

  it('switches to a bundle, drops the bag, and sets the three pictures', () => {
    const { stack, data } = renderOnStack(
      item({ components: { 'msm:item_inventory': { rows: 2 } } }),
      schema,
    );
    pick('item-inventory-holds', 'bundle');
    expect(read(data).components).toEqual({ 'msm:bundle': {} });
    expect(screen.queryByTestId('item-bag-layout')).toBeNull();
    for (const [id, key] of [
      ['item-bundle-closed', 'closed'],
      ['item-bundle-open-back', 'open_back'],
      ['item-bundle-open-front', 'open_front'],
    ] as const) {
      const input = screen.getByTestId(id) as HTMLInputElement;
      fireEvent.change(input, { target: { value: `demo:item/${key}` } });
      fireEvent.blur(input);
      expect(read(data).bundle_textures?.[key]).toBe(`demo:item/${key}`);
    }
    const closed = screen.getByTestId('item-bundle-closed') as HTMLInputElement;
    fireEvent.change(closed, { target: { value: '' } });
    fireEvent.blur(closed);
    expect(read(data).bundle_textures?.closed).toBeUndefined();
    pick('item-inventory-holds', 'none');
    expect(read(data).bundle_textures).toBeUndefined();
    stack.undo();
    expect(read(data).components).toEqual({ 'msm:bundle': {} });
  });

  it('shows the conflict hints from the element', () => {
    renderOnStack(
      item({
        max_stack_size: 16,
        components: { 'msm:item_inventory': {}, 'msm:bundle': {}, 'msm:food': { nutrition: 2 } },
      }),
      schema,
    );
    const hints = screen.getAllByTestId('item-inventory-conflict').map((node) => node.textContent);
    expect(hints).toHaveLength(3);
    expect(holds().value).toBe('both');
  });

  it('shows no hint for a clean item', () => {
    renderOnStack(item({ components: { 'msm:item_inventory': {} } }), schema);
    expect(screen.queryByTestId('item-inventory-conflict')).toBeNull();
  });
});
