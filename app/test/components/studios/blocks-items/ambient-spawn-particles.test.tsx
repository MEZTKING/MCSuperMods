// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Editing where particles are used (B353, ADR 0081 D2): the Block Studio's lazy "Ambient
 * particles" section (every type but portals; particle, chance, count, "Where", velocity,
 * "Only when"), the events editor's "Spawn particle" with "Kind", "Motion" and "Show from far
 * away", and the project's particles listed first in the particle pickers.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), {
    // The harness's registry view has no project ids: `wild:spark` stands in for one.
    particle_type: ['minecraft:ash', 'minecraft:end_rod', 'minecraft:flame', 'wild:spark'],
  });
  // The Ambient particles and Portal sections are lazy chunks of the Block Studio: loaded once
  // here, so findBy does not race Vitest transforming them (over its one-second default when
  // the whole suite ran at once).
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/blocks-items/AmbientParticlesSection'),
    () => import('../../../../src/renderer/src/studios/blocks-items/PortalSection'),
  );
}, PRELOAD_TIMEOUT_MS);

/** Waits for a lazy section. */
const LAZY = { timeout: LAZY_CHUNK_TIMEOUT_MS };
afterEach(cleanup);

const BLOCK = 'demo:lamp' as ResourceLocation;
const SPARK = element('demo:spark' as ResourceLocation, 'msm:particle', {
  format: 1,
  textures: ['minecraft:glow'],
});

const block = (data: Record<string, Json> = {}): Element =>
  element(BLOCK, 'msm:block', {
    format: 1,
    display_name: 'Lamp',
    model: 'minecraft:block/stone',
    loot: 'self',
    events: { lit: { actions: [] } },
    ...data,
  });

type Data = { [key: string]: Json | undefined };
const ambient = (data: () => Json) =>
  ((data() as Data).components as Data | undefined)?.['msm:ambient_particles'];

const pick = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
const commit = (testId: string, value: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

describe('Ambient particles section', () => {
  it('is lazy, adds the first project particle and edits every field as one step each', async () => {
    const { stack, data } = renderOnStack(block(), schema, { others: [SPARK] });
    await screen.findByTestId('block-ambient-toggle', undefined, LAZY);
    expect(screen.queryByTestId('block-ambient-chance')).toBeNull();
    click('block-ambient-toggle');
    expect(ambient(data)).toEqual({ particle: 'demo:spark' });
    pick('block-ambient-chance', '0.3');
    pick('block-ambient-count', '2');
    expect(ambient(data)).toEqual({ particle: 'demo:spark', chance: 0.3, count: 2 });
    expect((screen.getByTestId('block-ambient-where') as HTMLSelectElement).value).toBe('whole');
    pick('block-ambient-where', 'top');
    expect(ambient(data)).toMatchObject({ offset: [0.5, 1, 0.5], spread: [0.5, 0, 0.5] });
    pick('block-ambient-where', 'custom');
    pick('block-ambient-offset-x', '0.25');
    expect(ambient(data)).toMatchObject({ offset: [0.25, 1, 0.5] });
    pick('block-ambient-velocity-y', '0.02');
    expect(ambient(data)).toMatchObject({ velocity: [0, 0.02, 0] });
    fireEvent.change(screen.getByTestId('block-ambient-state-property'), {
      target: { value: 'lit' },
    });
    fireEvent.change(screen.getByTestId('block-ambient-state-value'), {
      target: { value: 'true' },
    });
    click('block-ambient-state-add');
    expect(ambient(data)).toMatchObject({ states: { lit: 'true' } });
    expect(screen.getByTestId('block-ambient-state-0').textContent).toBe('lit = true');
    click('block-ambient-state-0-remove');
    expect((ambient(data) as Data).states).toBeUndefined();
    act(() => stack.undo());
    expect(ambient(data)).toMatchObject({ states: { lit: 'true' } });
    click('block-ambient-toggle');
    expect(ambient(data)).toBeUndefined();
  });

  it('takes coloured dust, block pieces or item pieces as its particle', async () => {
    const { data } = renderOnStack(
      block({ components: { 'msm:ambient_particles': { particle: 'minecraft:flame' } } }),
      schema,
    );
    await screen.findByTestId('block-ambient-particle-kind', undefined, LAZY);
    expect(
      [...(screen.getByTestId('block-ambient-particle-kind') as HTMLSelectElement).options].map(
        (option) => option.text,
      ),
    ).toEqual(['A particle', 'Coloured dust', 'Block pieces', 'Item pieces']);
    pick('block-ambient-particle-kind', 'dust');
    expect((ambient(data) as Data).particle).toEqual({
      type: 'minecraft:dust',
      color: 0xff0000,
      scale: 1,
    });
    pick('block-ambient-particle-dust-size', '2');
    expect((ambient(data) as Data).particle).toMatchObject({ scale: 2 });
    pick('block-ambient-particle-kind', 'block');
    commit('block-ambient-particle-block', 'minecraft:dirt');
    expect((ambient(data) as Data).particle).toEqual({
      type: 'minecraft:block',
      block_state: 'minecraft:dirt',
    });
    pick('block-ambient-particle-kind', 'item');
    commit('block-ambient-particle-item', 'minecraft:apple');
    expect((ambient(data) as Data).particle).toEqual({
      type: 'minecraft:item',
      item: { id: 'minecraft:apple' },
    });
    pick('block-ambient-particle-kind', 'particle');
    expect((ambient(data) as Data).particle).toBe('');
  });

  it('is not offered on a portal', async () => {
    renderOnStack(
      block({
        type: 'portal',
        frame: 'minecraft:obsidian',
        destination: 'minecraft:the_nether',
        model: undefined as unknown as Json,
      }),
      schema,
    );
    await screen.findByTestId('block-studio');
    await screen.findByTestId('block-portal', undefined, LAZY);
    expect(screen.queryByTestId('block-ambient')).toBeNull();
    expect(screen.queryByTestId('block-ambient-loading')).toBeNull();
  });
});

describe('Spawn particle in the events editor', () => {
  it('has Kind, Motion and Show from far away, and lists project particles first', async () => {
    const { data } = renderOnStack(
      block({ events: { lit: { actions: [{ type: 'spawn_particle', particle: '' }] } } }),
      schema,
      { others: [SPARK] },
    );
    await screen.findByTestId('block-studio');
    const action = within(screen.getByTestId('msm-event-lit')).getByTestId('msm-action-0');
    const idInput = within(action).getByTestId('spawn-particle-id') as HTMLInputElement;
    const list = document.getElementById(idInput.getAttribute('list') ?? '');
    const offered = [...(list?.querySelectorAll('option') ?? [])].map((option) => option.value);
    expect(offered[0]).toBe('wild:spark');
    expect(offered.slice(1)).toEqual(['minecraft:ash', 'minecraft:end_rod', 'minecraft:flame']);
    const actions = () =>
      ((data() as Data).events as { lit: { actions: Data[] } }).lit.actions as Data[];
    fireEvent.change(idInput, { target: { value: 'demo:spark' } });
    fireEvent.blur(idInput);
    expect(actions()[0]).toEqual({ type: 'spawn_particle', particle: 'demo:spark' });
    fireEvent.change(within(action).getByTestId('spawn-particle-motion-y'), {
      target: { value: '0.1' },
    });
    expect(actions()[0]).toMatchObject({ motion: [0, 0.1, 0] });
    fireEvent.change(within(action).getByTestId('spawn-particle-motion-y'), {
      target: { value: '' },
    });
    expect(actions()[0]?.motion).toBeUndefined();
    fireEvent.click(within(action).getByTestId('spawn-particle-force'));
    expect(actions()[0]).toMatchObject({ force: true });
    fireEvent.change(within(action).getByTestId('spawn-particle-kind'), {
      target: { value: 'dust' },
    });
    expect(actions()[0]).toEqual({
      type: 'spawn_particle',
      particle: { type: 'minecraft:dust', color: 0xff0000, scale: 1 },
      force: true,
    });
    const colour = within(action)
      .getByTestId('spawn-particle-dust-colour')
      .querySelector('input') as HTMLInputElement;
    fireEvent.change(colour, { target: { value: '#00ff00' } });
    expect(actions()[0]?.particle).toMatchObject({ color: 0x00ff00 });
  });
});
