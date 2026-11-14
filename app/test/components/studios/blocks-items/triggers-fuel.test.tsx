// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The "Triggers" sections of the Item, Block and Mob Studios (B239, ADR 0061) inside the shared
 * events editor, and "Fuel and compost" in the Item Studio and the block's item part (ADR 0060
 * D4): each pick or field edit is one undo step, choices come from the schema, renaming an event
 * rewrites the new trigger fields, and the notes for an unworn item and a full block.
 */
import type { Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  renameEvent,
  TRIGGERS,
  triggerTestId,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
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

const EVENTS = { 'demo:zap': { actions: [] }, 'demo:glow': { actions: [] } };

const undoAll = (stack: { canUndo: boolean; undo(): boolean }): number => {
  let steps = 0;
  while (stack.canUndo) {
    stack.undo();
    steps++;
  }
  return steps;
};

const select = (testId: string) => screen.getByTestId(testId) as HTMLSelectElement;

describe('Item Studio triggers', () => {
  const id = 'demo:wand' as ResourceLocation;

  it('sets each item trigger inside the events editor, one undo step per edit', () => {
    const original: Json = { model: 'demo:item/wand', events: EVENTS };
    const { stack, data } = renderOnStack(element(id, 'msm:item', original), schema);
    const triggers = screen.getByTestId('msm-triggers');
    expect(within(screen.getByTestId('msm-events')).getByTestId('msm-triggers')).toBe(triggers);
    for (const spec of TRIGGERS['msm:item'] ?? []) {
      expect(within(triggers).getByTestId(triggerTestId(spec.component))).toBeTruthy();
    }

    fireEvent.change(select('trigger-on-hit'), { target: { value: 'demo:zap' } });
    fireEvent.change(select('trigger-while-held'), { target: { value: 'demo:glow' } });
    const interval = screen.getByTestId('trigger-while-held-interval') as HTMLInputElement;
    expect(interval.value).toBe('20');
    fireEvent.change(interval, { target: { value: '4' } });
    fireEvent.change(interval, { target: { value: '40' } });
    const hand = select('trigger-while-held-hand');
    expect([...hand.options].map((option) => option.value)).toEqual(['', 'main', 'off', 'either']);
    fireEvent.change(hand, { target: { value: 'either' } });
    fireEvent.change(select('trigger-on-use-on-block'), { target: { value: 'demo:zap' } });
    fireEvent.change(screen.getByTestId('trigger-on-use-on-block-cooldown'), {
      target: { value: '10' },
    });
    expect(data()).toMatchObject({
      components: {
        'msm:on_hit': { event: 'demo:zap' },
        'msm:while_held': { event: 'demo:glow', interval_ticks: 40, hand: 'either' },
        'msm:on_use_on_block': { event: 'demo:zap', cooldown_ticks: 10 },
      },
    });
    fireEvent.change(select('trigger-on-hit'), { target: { value: '' } });
    expect(Object.hasOwn((data() as { components: object }).components, 'msm:on_hit')).toBe(false);
    // on hit, while held, interval (typing merged), hand, on use on block, cooldown, clear.
    expect(undoAll(stack)).toBe(7);
    expect(data()).toEqual(original);
  });

  it('warns that a worn trigger needs armour', () => {
    renderOnStack(
      element(id, 'msm:item', {
        events: EVENTS,
        components: { 'msm:while_worn': { event: 'demo:glow' } },
      }),
      schema,
    );
    expect(screen.getByTestId('trigger-while-worn-no-armour').textContent).toContain('armour');
    expect((screen.getByTestId('trigger-while-worn-interval') as HTMLInputElement).value).toBe(
      '20',
    );
  });

  it('renames events in the new trigger fields', () => {
    const renamed = renameEvent(
      {
        events: EVENTS,
        components: {
          'msm:on_hit': { event: 'demo:zap' },
          'msm:while_worn': { event: 'demo:zap', interval_ticks: 10 },
        },
      },
      'msm:item',
      'demo:zap',
      'demo:bolt',
    );
    expect(renamed.components).toEqual({
      'msm:on_hit': { event: 'demo:bolt' },
      'msm:while_worn': { event: 'demo:bolt', interval_ticks: 10 },
    });
  });
});

describe('Item Studio fuel and compost', () => {
  it('writes fuel seconds and the compost chance, one undo step each', () => {
    const id = 'demo:log' as ResourceLocation;
    const original: Json = { model: 'demo:item/log' };
    const { stack, data } = renderOnStack(element(id, 'msm:item', original), schema);
    expect(screen.getByTestId('item-fuel-compost')).toBeTruthy();
    expect(screen.queryByTestId('item-fuel-seconds')).toBeNull();
    fireEvent.click(screen.getByTestId('item-fuel-toggle'));
    expect(data()).toEqual({ ...(original as object), fuel: { burn_seconds: 10 } });
    fireEvent.change(screen.getByTestId('item-fuel-seconds'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('item-fuel-seconds'), { target: { value: '15' } });
    const compost = select('item-compost');
    expect([...compost.options].map((option) => option.value)).toEqual([
      '',
      '30%',
      '50%',
      '65%',
      '85%',
      '100%',
    ]);
    fireEvent.change(compost, { target: { value: '65%' } });
    expect(data()).toEqual({
      model: 'demo:item/log',
      fuel: { burn_seconds: 15 },
      compost: '65%',
    });
    fireEvent.change(compost, { target: { value: '' } });
    expect(Object.hasOwn(data() as object, 'compost')).toBe(false);
    // toggle, seconds (typing merged), compost, clear.
    expect(undoAll(stack)).toBe(4);
    expect(data()).toEqual(original);
  });
});

describe('Block Studio triggers and block item fuel', () => {
  const id = 'demo:crystal' as ResourceLocation;

  it('sets block triggers and the block item fuel and compost', () => {
    const original: Json = { model: 'demo:block/crystal', events: EVENTS };
    const { stack, data } = renderOnStack(element(id, 'msm:block', original), schema);
    for (const spec of TRIGGERS['msm:block'] ?? []) {
      expect(screen.getByTestId(triggerTestId(spec.component))).toBeTruthy();
    }
    fireEvent.change(select('trigger-on-break'), { target: { value: 'demo:zap' } });
    fireEvent.change(select('trigger-on-random-tick'), { target: { value: 'demo:glow' } });
    fireEvent.change(screen.getByTestId('trigger-on-random-tick-chance'), {
      target: { value: '0.25' },
    });
    fireEvent.change(select('trigger-on-entity-inside'), { target: { value: 'demo:zap' } });
    expect(screen.getByTestId('trigger-on-entity-inside-full')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-item-fuel-toggle'));
    fireEvent.change(select('block-item-compost'), { target: { value: '30%' } });
    expect(data()).toMatchObject({
      item: { fuel: { burn_seconds: 10 }, compost: '30%' },
      components: {
        'msm:on_break': { event: 'demo:zap' },
        'msm:on_random_tick': { event: 'demo:glow', chance: 0.25 },
        'msm:on_entity_inside': { event: 'demo:zap' },
      },
    });
    expect(undoAll(stack)).toBe(6);
    expect(data()).toEqual(original);
  });

  it('drops the full-block note for a walk-through shape and hides fuel without an item', () => {
    renderOnStack(
      element(id, 'msm:block', {
        events: EVENTS,
        item: false,
        components: {
          'msm:shape': { preset: 'cross' },
          'msm:on_entity_inside': { event: 'demo:zap' },
        },
      }),
      schema,
    );
    expect(screen.queryByTestId('trigger-on-entity-inside-full')).toBeNull();
    expect(screen.queryByTestId('block-item-fuel-compost')).toBeNull();
  });
});

describe('Mob Studio triggers', () => {
  it('sets on tick with its interval and on spawn', () => {
    const id = 'demo:gloom' as ResourceLocation;
    const original: Json = {
      components: { 'msm:animated_model': { model: 'demo:entity/gloom' } },
      events: EVENTS,
    };
    const { stack, data } = renderOnStack(element(id, 'msm:entity', original), schema);
    fireEvent.change(select('trigger-on-tick'), { target: { value: 'demo:glow' } });
    fireEvent.change(screen.getByTestId('trigger-on-tick-interval'), { target: { value: '100' } });
    fireEvent.change(select('trigger-on-spawn'), { target: { value: 'demo:zap' } });
    expect(data()).toMatchObject({
      components: {
        'msm:on_tick': { event: 'demo:glow', interval_ticks: 100 },
        'msm:on_spawn': { event: 'demo:zap' },
      },
    });
    expect(renameEvent(data(), 'msm:entity', 'demo:glow', 'demo:pulse').components).toMatchObject({
      'msm:on_tick': { event: 'demo:pulse' },
    });
    expect(undoAll(stack)).toBe(3);
    expect(data()).toEqual(original);
  });
});
