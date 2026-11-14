// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Block Studio's Portal section (B337, ADR 0078 D1), rendered lazily in the Block Studio on
 * a command stack: shown only for `type: portal`; the Type picker offers "Portal" and switching
 * is one undo step; every Frame, Travel and Looks field is one undoable edit that leaves no
 * empty group; a portal's own Textures, Behaviour and Block item rules; "Light a portal" in the
 * events editor with the project's portals.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), {
    dimension: ['overworld', 'the_nether', 'the_end', 'demo:sky'],
  });
});
afterEach(cleanup);

const ID = 'demo:gate' as ResourceLocation;

const portal = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:block', {
    format: 1,
    display_name: 'Gate',
    type: 'portal',
    frame: 'minecraft:crying_obsidian',
    destination: 'minecraft:the_nether',
    events: { arrived: { actions: [] } },
    ...data,
  });

type Data = { [key: string]: Json | undefined };
const read = (data: () => Json) => data() as Data;

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
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

describe('Portal section', () => {
  it('is shown only for portals, lazily, and the Type picker offers "Portal"', async () => {
    const { stack, data } = renderOnStack(
      element(ID, 'msm:block', {
        format: 1,
        display_name: 'Gate',
        model: 'minecraft:block/stone',
        loot: 'self',
        components: { 'msm:on_interact': { event: 'arrived' } },
        events: { arrived: { actions: [] } },
      }),
      schema,
    );
    await screen.findByTestId('block-studio');
    expect(screen.queryByTestId('block-portal')).toBeNull();
    const options = [...select('block-type-picker').options].map((option) => option.text);
    expect(options).toContain('Portal');
    pick('block-type-picker', 'portal');
    expect(read(data)).toEqual({
      format: 1,
      display_name: 'Gate',
      type: 'portal',
      frame: 'minecraft:crying_obsidian',
      destination: 'minecraft:the_nether',
      events: { arrived: { actions: [] } },
    });
    expect(await screen.findByTestId('block-portal')).toBeTruthy();
    act(() => stack.undo());
    expect(read(data).type).toBeUndefined();
    expect(read(data).components).toEqual({ 'msm:on_interact': { event: 'arrived' } });
  });

  it('edits the frame and the igniter', async () => {
    const { stack, data } = renderOnStack(portal(), schema);
    await screen.findByTestId('block-portal-frame');
    expect(screen.queryByTestId('block-portal-frame-block')).toBeNull();
    commit('block-portal-frame', '#demo:frames');
    expect(read(data).frame).toBe('#demo:frames');
    commit('block-portal-frame-block', 'minecraft:obsidian');
    expect(read(data).frame_block).toBe('minecraft:obsidian');
    commit('block-portal-frame', 'minecraft:quartz_block');
    expect(read(data).frame).toBe('minecraft:quartz_block');
    expect(read(data).frame_block).toBeUndefined();
    act(() => stack.undo());
    expect(read(data).frame_block).toBe('minecraft:obsidian');
    commit('block-portal-igniter', 'minecraft:fire_charge');
    expect(read(data).igniter).toBe('minecraft:fire_charge');
    click('block-portal-igniter-none');
    expect(read(data).igniter).toBe(false);
    expect(screen.queryByTestId('block-portal-igniter')).toBeNull();
    click('block-portal-igniter-none');
    expect(read(data).igniter).toBeUndefined();
  });

  it('edits the travel fields, removing the group with its last field', async () => {
    const { stack, data } = renderOnStack(portal(), schema);
    await screen.findByTestId('block-portal-destination');
    expect([...select('block-portal-destination').options].map((option) => option.value)).toEqual([
      '',
      'demo:sky',
      'minecraft:overworld',
      'minecraft:the_end',
      'minecraft:the_nether',
    ]);
    pick('block-portal-destination', 'demo:sky');
    expect(read(data).destination).toBe('demo:sky');
    pick('block-portal-return-to', 'minecraft:the_nether');
    expect(read(data).return_to).toBe('minecraft:the_nether');
    pick('block-portal-return-to', '');
    expect(read(data).return_to).toBeUndefined();

    expect(select('block-portal-scale-mode').value).toBe('dimensions');
    click('block-portal-scale-nether');
    expect(read(data).travel).toEqual({ scale: 8 });
    expect(select('block-portal-scale-mode').value).toBe('number');
    type('block-portal-scale', '3');
    expect(read(data).travel).toEqual({ scale: 3 });
    pick('block-portal-scale-mode', 'dimensions');
    expect(read(data).travel).toBeUndefined();
    act(() => stack.undo());
    expect(read(data).travel).toEqual({ scale: 3 });
    pick('block-portal-scale-mode', 'dimensions');

    pick('block-portal-arrival', 'surface');
    type('block-portal-delay', '0');
    type('block-portal-cooldown', '100');
    click('block-portal-players-only');
    click('block-portal-overlay');
    expect(read(data).travel).toEqual({
      arrival: 'surface',
      delay_ticks: 0,
      cooldown_ticks: 100,
      players_only: true,
      overlay: false,
    });
    pick('block-portal-arrival', 'portal');
    type('block-portal-delay', '');
    type('block-portal-cooldown', '');
    click('block-portal-players-only');
    click('block-portal-overlay');
    expect(read(data).travel).toBeUndefined();

    pick('block-portal-on-travel', 'arrived');
    expect(read(data).on_travel).toBe('arrived');
    pick('block-portal-on-travel', '');
    expect(read(data).on_travel).toBeUndefined();
  });

  it('edits the looks: particle, dust colour, count and sounds with None', async () => {
    const { stack, data } = renderOnStack(portal(), schema);
    await screen.findByTestId('block-portal-particle');
    fireEvent.input(screen.getByTestId('block-portal-colour'), { target: { value: '#e0561c' } });
    fireEvent.change(screen.getByTestId('block-portal-colour'), { target: { value: '#e0561c' } });
    expect(read(data).particles).toEqual({ color: 0xe0561c });
    type('block-portal-particle-count', '8');
    expect(read(data).particles).toEqual({ color: 0xe0561c, count: 8 });
    click('block-portal-colour-clear');
    expect(read(data).particles).toEqual({ count: 8 });
    commit('block-portal-particle', 'minecraft:reverse_portal');
    expect(read(data).particles).toEqual({ count: 8, type: 'minecraft:reverse_portal' });
    // Only dust takes a colour.
    expect(screen.queryByTestId('block-portal-colour')).toBeNull();
    act(() => stack.undo());
    expect(screen.getByTestId('block-portal-colour')).toBeTruthy();

    click('block-portal-ambient-sound-none');
    expect(read(data).sounds).toEqual({ ambient: false });
    expect(screen.queryByTestId('block-portal-ambient-sound')).toBeNull();
    commit('block-portal-travel-sound', 'minecraft:block.portal.trigger');
    expect(read(data).sounds).toEqual({ ambient: false, travel: 'minecraft:block.portal.trigger' });
    click('block-portal-ambient-sound-none');
    commit('block-portal-travel-sound', '');
    expect(read(data).sounds).toBeUndefined();
  });

  it("applies a portal's own rules to the other sections", async () => {
    const { data } = renderOnStack(portal(), schema);
    await screen.findByTestId('block-portal');
    // Textures: the portal surface only, no own models.
    expect(screen.getByTestId('block-texture-portal')).toBeTruthy();
    expect(screen.queryByTestId('block-own-models-toggle')).toBeNull();
    expect(screen.queryByTestId('block-model-row-item')).toBeNull();
    expect(screen.getByTestId('block-model-row-ns').textContent).toContain('demo:block/gate_ns');
    // Behaviour: no interact, step or redstone triggers.
    expect(screen.getByTestId('block-behaviour-portal')).toBeTruthy();
    expect(screen.queryByTestId('block-on-interact')).toBeNull();
    // No block item until asked for one, which is then an object; off removes it.
    const hasItem = screen.getByTestId('block-has-item') as HTMLInputElement;
    expect(hasItem.checked).toBe(false);
    click('block-has-item');
    expect(read(data).item).toEqual({});
    click('block-has-item');
    expect(read(data).item).toBeUndefined();
    expect(within(select('block-sound-type')).getByText('(default: glass)')).toBeTruthy();
  });

  it('adds "Light a portal" with the project\'s portals to pick from', async () => {
    const other = element('demo:arch' as ResourceLocation, 'msm:block', {
      format: 1,
      type: 'portal',
      frame: 'minecraft:quartz_block',
      destination: 'minecraft:the_end',
    });
    const { data } = renderOnStack(portal(), schema, { others: [other] });
    const event = await screen.findByTestId('msm-event-arrived');
    const newType = within(event).getByLabelText(
      'New action type for arrived',
    ) as HTMLSelectElement;
    expect([...newType.options].map((option) => option.text)).toContain(
      'Light a portal (light_portal)',
    );
    fireEvent.change(newType, { target: { value: 'light_portal' } });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to arrived' }));
    expect((read(data).events as Data).arrived).toEqual({
      actions: [{ type: 'light_portal', portal: 'demo:arch' }],
    });
    const portalPicker = within(event).getByLabelText(
      'arrived action 1 portal',
    ) as HTMLSelectElement;
    expect([...portalPicker.options].map((option) => option.value)).toEqual([
      '',
      'demo:arch',
      'demo:gate',
    ]);
    fireEvent.change(portalPicker, { target: { value: 'demo:gate' } });
    expect((read(data).events as Data).arrived).toEqual({
      actions: [{ type: 'light_portal', portal: 'demo:gate' }],
    });
  });
});
