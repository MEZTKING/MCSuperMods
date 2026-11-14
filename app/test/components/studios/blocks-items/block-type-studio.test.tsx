// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio types (B268, ADR 0069 D5): the Type picker changes the type in one undo step and
 * drops the old type's fields; the building types' own fields (base block, set type from the
 * target facts, press time, weighted maximum, wood type, wooden fence); the Textures section
 * with slots in words, the models made from them and own models per slot; sections a type does
 * not take (shape, redstone) are replaced by a note.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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

const ID = 'demo:brick' as ResourceLocation;

const block = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:block', {
    format: 1,
    display_name: 'Brick',
    model: 'minecraft:block/bricks',
    sound_type: 'stone',
    components: {
      'msm:breakable': { hardness: 2 },
      'msm:redstone': { emit: 15 },
    },
    ...data,
  });

const select = (testId: string) => screen.getByTestId(testId) as HTMLSelectElement;
const pick = (testId: string, value: string) =>
  fireEvent.change(select(testId), { target: { value } });

describe('Block Studio Type section', () => {
  it('shows a simple block with the model field, shape and redstone', () => {
    renderOnStack(block(), schema);
    expect(select('block-type-picker').value).toBe('block');
    expect(within(select('block-type-picker')).getByText('Stairs')).toBeTruthy();
    expect(screen.queryByTestId('block-textures')).toBeNull();
    expect(screen.getByTestId('block-shape-preset')).toBeTruthy();
    expect(screen.getByTestId('block-redstone-emit')).toBeTruthy();
    expect(screen.getByTestId('msm-model')).toBeTruthy();
  });

  it('changes the type in one undo step, carrying the look and dropping shape-only parts', () => {
    const { stack, data } = renderOnStack(block(), schema);
    pick('block-type-picker', 'stairs');
    expect(data()).toEqual({
      format: 1,
      display_name: 'Brick',
      sound_type: 'stone',
      components: { 'msm:breakable': { hardness: 2 } },
      type: 'stairs',
      textures: { all: 'minecraft:block/bricks' },
    });
    expect(screen.queryByTestId('block-shape-preset')).toBeNull();
    expect(screen.getByTestId('block-shape-from-type')).toBeTruthy();
    expect(screen.getByTestId('block-redstone-own')).toBeTruthy();
    expect(screen.queryByTestId('msm-model')).toBeNull();
    stack.undo();
    expect(data()).toEqual(block().data);
  });

  it('edits the stairs base block', () => {
    const { data } = renderOnStack(block({ type: 'stairs' }), schema);
    const input = screen.getByTestId('block-base-block') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'minecraft:stone_bricks' } });
    fireEvent.blur(input);
    expect((data() as { base_block?: string }).base_block).toBe('minecraft:stone_bricks');
  });

  it('offers the target set types for a door and sets one', () => {
    const { data } = renderOnStack(block(), schema);
    pick('block-type-picker', 'door');
    expect((data() as { set_type?: string }).set_type).toBe(
      bundle.target.blocks?.setTypes[0] ?? 'wood',
    );
    const options = [...select('block-set-type').options].map((option) => option.value);
    for (const name of bundle.target.blocks?.setTypes ?? []) expect(options).toContain(name);
    pick('block-set-type', 'iron');
    expect((data() as { set_type?: string }).set_type).toBe('iron');
  });

  it('edits a button press time and a weighted plate', () => {
    const { data } = renderOnStack(block({ type: 'button', set_type: 'stone' }), schema);
    expect(screen.getByText(/empty means 20 ticks/)).toBeTruthy();
    fireEvent.change(screen.getByTestId('block-press-ticks'), { target: { value: '12' } });
    expect((data() as { press_ticks?: number }).press_ticks).toBe(12);
    pick('block-type-picker', 'pressure_plate');
    expect((data() as { press_ticks?: number }).press_ticks).toBeUndefined();
    fireEvent.click(screen.getByTestId('block-weighted'));
    expect((data() as { weighted_max?: number }).weighted_max).toBe(15);
    fireEvent.click(screen.getByTestId('block-weighted'));
    expect((data() as { weighted_max?: number }).weighted_max).toBeUndefined();
  });

  it('edits a fence gate wood type and a fence wooden choice', () => {
    const { data } = renderOnStack(block({ type: 'fence_gate', wood_type: 'oak' }), schema);
    pick('block-wood-type', 'birch');
    expect((data() as { wood_type?: string }).wood_type).toBe('birch');
    pick('block-type-picker', 'fence');
    expect((data() as { wood_type?: string }).wood_type).toBeUndefined();
    expect(select('block-fence-wooden').options[0]?.textContent).toContain('no');
    pick('block-fence-wooden', 'yes');
    expect((data() as { wooden?: boolean }).wooden).toBe(true);
    pick('block-fence-wooden', '');
    expect((data() as { wooden?: boolean }).wooden).toBeUndefined();
  });
});

describe('Block Studio Textures section', () => {
  it('lists the slots in words and the models made from them', () => {
    const { data } = renderOnStack(
      block({
        type: 'slab',
        model: undefined as unknown as Json,
        textures: { all: 'demo:block/brick' },
      }),
      schema,
    );
    expect(screen.getByText('Every face')).toBeTruthy();
    expect(screen.getByTestId('block-model-row-bottom').textContent).toContain('demo:block/brick');
    expect(screen.getByTestId('block-model-row-double').textContent).toContain(
      'demo:block/brick_double',
    );
    expect(screen.getByTestId('block-model-row-double').textContent).toContain('made from');
    const top = screen.getByTestId('block-texture-top') as HTMLInputElement;
    fireEvent.change(top, { target: { value: 'demo:block/brick_top' } });
    fireEvent.blur(top);
    expect((data() as { textures?: Json }).textures).toEqual({
      all: 'demo:block/brick',
      top: 'demo:block/brick_top',
    });
  });

  it('sets an own model for one slot', () => {
    const { data } = renderOnStack(
      block({ type: 'trapdoor', set_type: 'wood', textures: { all: 'demo:block/door' } }),
      schema,
    );
    fireEvent.click(screen.getByTestId('block-own-models-toggle'));
    const open = screen.getByTestId('block-own-model-open') as HTMLInputElement;
    fireEvent.change(open, { target: { value: 'demo:block/my_open' } });
    fireEvent.blur(open);
    expect((data() as { models?: Json }).models).toEqual({ open: 'demo:block/my_open' });
    expect(screen.getByTestId('block-model-row-open').textContent).toContain('your own model');
  });
});
