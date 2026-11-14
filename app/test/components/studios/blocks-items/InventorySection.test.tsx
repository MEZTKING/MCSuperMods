// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Block Studio's Inventory section (B318, ADR 0076 D1), rendered lazily in the Block Studio
 * on a command stack: shown only for the simple, pillar and facing types; "Holds items" is one
 * undo step that removes the other component; the storage and machine fields; the recipes
 * table (rows added and removed as one undo step each, seconds shown and ticks saved); the
 * Textures section's "Front when open" and "Front when working" slots and the state models.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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

const ID = 'demo:grinder' as ResourceLocation;

const block = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:block', {
    format: 1,
    display_name: 'Grinder',
    ...(data.type === undefined ? { model: 'minecraft:block/stone' } : {}),
    events: { started: { actions: [] }, done: { actions: [] } },
    ...data,
  });

type Data = { components?: Record<string, Record<string, Json>>; [key: string]: Json | undefined };
const read = (data: () => Json) => data() as Data;
const container = (data: () => Json) => read(data).components?.['msm:container'];
const machine = (data: () => Json) => read(data).components?.['msm:machine'];

const select = (testId: string) => screen.getByTestId(testId) as HTMLSelectElement;
const pick = (testId: string, value: string) =>
  fireEvent.change(select(testId), { target: { value } });
const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
const commit = (testId: string, value: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('Inventory section', () => {
  it('is shown for the simple and facing types, lazily, and hidden for others', async () => {
    renderOnStack(block(), schema);
    expect(await screen.findByTestId('block-inventory')).toBeTruthy();
    expect(select('block-inventory-holds').value).toBe('none');
    expect([...select('block-inventory-holds').options].map((option) => option.text)).toEqual([
      'None',
      'Storage',
      'Machine',
    ]);
    cleanup();
    renderOnStack(block({ type: 'slab', textures: { all: 'minecraft:block/stone' } }), schema);
    await screen.findByTestId('block-studio');
    expect(screen.queryByTestId('block-inventory')).toBeNull();
    expect(screen.queryByTestId('block-inventory-loading')).toBeNull();
  });

  it('switches what the block holds in one undo step, removing the other component', async () => {
    const { stack, data } = renderOnStack(
      block({ components: { 'msm:container': { rows: 6 } } }),
      schema,
    );
    await screen.findByTestId('block-container-layout');
    pick('block-inventory-holds', 'machine');
    expect(container(data)).toBeUndefined();
    expect(machine(data)).toEqual({});
    stack.undo();
    expect(container(data)).toEqual({ rows: 6 });
    expect(machine(data)).toBeUndefined();
    pick('block-inventory-holds', 'none');
    expect(read(data).components).toBeUndefined();
  });

  it('edits the storage fields', async () => {
    const { stack, data } = renderOnStack(block({ components: { 'msm:container': {} } }), schema);
    await screen.findByTestId('block-container-layout');
    expect([...select('block-container-layout').options].map((option) => option.text)).toEqual([
      'Chest',
      'Hopper (5 slots)',
      'Dispenser (3 by 3)',
      'No screen (holder)',
    ]);
    fireEvent.click(screen.getByTestId('block-container-keep-contents'));
    expect(container(data)).toEqual({ keep_contents: true });
    type('block-container-rows', '5');
    expect(container(data)).toEqual({ rows: 5 });
    expect(screen.queryByTestId('block-container-keep-contents')).toBeNull();
    stack.undo();
    expect(container(data)).toEqual({ keep_contents: true });
    pick('block-container-layout', 'none');
    expect(container(data)).toEqual({ layout: 'none' });
    type('block-container-size', '4');
    expect(container(data)).toEqual({ layout: 'none', size: 4 });
    pick('block-container-layout', 'hopper');
    expect(container(data)).toEqual({ layout: 'hopper' });
    fireEvent.click(screen.getByTestId('block-container-hoppers'));
    expect(container(data)).toEqual({ layout: 'hopper', hoppers: false });
    fireEvent.click(screen.getByTestId('block-container-hoppers'));
    expect(container(data)).toEqual({ layout: 'hopper' });
    fireEvent.click(screen.getByTestId('block-container-comparator'));
    expect(container(data)?.comparator).toBe(false);
    commit('block-container-open-sound', 'minecraft:block.chest.open');
    commit('block-container-close-sound', 'minecraft:block.chest.close');
    pick('block-container-on-open', 'started');
    pick('block-container-on-close', 'done');
    expect(container(data)).toEqual({
      layout: 'hopper',
      comparator: false,
      open_sound: 'minecraft:block.chest.open',
      close_sound: 'minecraft:block.chest.close',
      on_open: 'started',
      on_close: 'done',
    });
  });

  it('edits the machine fields', async () => {
    const { data } = renderOnStack(block({ components: { 'msm:machine': {} } }), schema);
    await screen.findByTestId('block-machine-power');
    const own = screen.getByTestId('block-machine-type-own') as HTMLInputElement;
    expect(own.checked).toBe(true);
    for (const id of bundle.target.blocks?.machineRecipeTypes ?? []) {
      expect(
        screen.getByTestId(`block-machine-type-${id.slice(id.indexOf(':') + 1)}`),
      ).toBeTruthy();
    }
    expect(screen.getByText('Campfire cooking')).toBeTruthy();
    // The last type cannot be unticked.
    fireEvent.click(own);
    expect(machine(data)).toEqual({});
    fireEvent.click(screen.getByTestId('block-machine-type-blasting'));
    expect(machine(data)).toEqual({ recipe_types: [ID, 'minecraft:blasting'] });
    expect(select('block-machine-menu').value).toBe('blast_furnace');
    pick('block-machine-menu', 'smoker');
    expect(machine(data)?.menu).toBe('smoker');
    pick('block-machine-menu', 'blast_furnace');
    expect(machine(data)?.menu).toBeUndefined();
    pick('block-machine-power', 'redstone');
    expect(machine(data)?.power).toBe('redstone');
    pick('block-machine-power', 'fuel');
    expect(machine(data)?.power).toBeUndefined();
    type('block-machine-speed', '2');
    expect(machine(data)?.speed).toBe(2);
    expect((screen.getByTestId('block-machine-default-time') as HTMLInputElement).value).toBe('10');
    type('block-machine-default-time', '2.5');
    expect(machine(data)?.default_time).toBe(50);
    pick('block-machine-comparator', 'progress');
    expect(machine(data)?.comparator).toBe('progress');
    type('block-machine-lit-light', '7');
    expect(machine(data)?.lit_light).toBe(7);
    fireEvent.click(screen.getByTestId('block-machine-hoppers'));
    expect(machine(data)?.hoppers).toBe(false);
    fireEvent.click(screen.getByTestId('block-machine-hoppers'));
    expect(machine(data)).not.toHaveProperty('hoppers');
    pick('block-machine-on-start', 'started');
    pick('block-machine-on-finish', 'done');
    expect(machine(data)).toMatchObject({ on_start: 'started', on_finish: 'done' });
  });

  it('adds, edits and removes recipe rows, one undo step each', async () => {
    const { stack, data } = renderOnStack(block({ components: { 'msm:machine': {} } }), schema);
    await screen.findByTestId('block-machine-recipe-add');
    expect(screen.getByTestId('block-machine-recipes-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-machine-recipe-add'));
    expect(read(data).recipes).toEqual([{ ingredient: '', result: '' }]);
    commit('block-machine-recipe-0-ingredient', '#minecraft:logs');
    commit('block-machine-recipe-0-result', 'minecraft:charcoal');
    type('block-machine-recipe-0-result-count', '2');
    type('block-machine-recipe-0-count', '3');
    type('block-machine-recipe-0-time', '5');
    type('block-machine-recipe-0-experience', '0.5');
    expect(read(data).recipes).toEqual([
      {
        ingredient: '#minecraft:logs',
        result: { id: 'minecraft:charcoal', count: 2 },
        count: 3,
        time: 100,
        experience: 0.5,
      },
    ]);
    fireEvent.click(screen.getByTestId('block-machine-recipe-add'));
    expect(read(data).recipes).toHaveLength(2);
    fireEvent.click(screen.getByTestId('block-machine-recipe-1-remove'));
    expect(read(data).recipes).toHaveLength(1);
    stack.undo();
    expect(read(data).recipes).toHaveLength(2);
    stack.undo();
    expect(read(data).recipes).toHaveLength(1);
    fireEvent.click(screen.getByTestId('block-machine-recipe-0-remove'));
    expect(read(data)).not.toHaveProperty('recipes');
  });
});

describe('Textures section state slots', () => {
  it('offers "Front when open" for a facing container', async () => {
    const { data } = renderOnStack(
      block({
        type: 'horizontal',
        textures: { all: 'minecraft:block/barrel_side', front: 'minecraft:block/barrel_top' },
        components: { 'msm:container': {} },
      }),
      schema,
    );
    await screen.findByTestId('block-inventory');
    expect(screen.getByText('Front when open')).toBeTruthy();
    expect(screen.queryByTestId('block-texture-front_lit')).toBeNull();
    commit('block-texture-front_open', 'minecraft:block/barrel_top_open');
    expect((read(data).textures as Record<string, string>).front_open).toBe(
      'minecraft:block/barrel_top_open',
    );
    expect(screen.getByTestId('block-model-row-open').textContent).toContain(
      'demo:block/grinder_open',
    );
    pick('block-inventory-holds', 'machine');
    expect(read(data).textures).not.toHaveProperty('front_open');
    expect(screen.getByText('Front when working')).toBeTruthy();
  });

  it('offers the open and lit models on a simple block', async () => {
    const { data } = renderOnStack(block({ components: { 'msm:machine': {} } }), schema);
    await screen.findByTestId('block-inventory');
    expect(screen.queryByTestId('block-own-model-open')).toBeNull();
    commit('block-own-model-lit', 'demo:block/grinder_on');
    expect(read(data).models).toEqual({ lit: 'demo:block/grinder_on' });
    commit('block-own-model-lit', '');
    expect(read(data)).not.toHaveProperty('models');
  });
});
