// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Potion Studio and "Make a potion" (B253, ADR 0063 D9): rendered through `ElementForm` over
 * the real schema index on a `CommandStack`, so each edit is one undo step. Every element
 * field is shown and written back; the brewing chain and names come from the plugin's own
 * step list; "Make a potion" in the Effect Studio adds an `msm:potion` in one undo step.
 */
import { CommandStack, commands, createElement, type Json, type ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  brewingSteps,
  durationText,
  MAKE_POTION_REAGENT,
  newPotionFor,
  potionIds,
  potionItemNames,
  projectPotions,
  stepSummary,
} from '../../../../src/renderer/src/studios/blocks-items/potion-model';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { kindOf, projectOf, renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), {
    mob_effect: ['speed', 'slowness'],
    item: ['snowball', 'redstone', 'glowstone_dust'],
    potion: ['awkward', 'mundane'],
  });
});
afterEach(cleanup);

const FULL: Json = {
  format: 1,
  name: 'demo.frost',
  display_name: 'Frost',
  effects: [
    {
      id: 'minecraft:slowness',
      duration_ticks: 3600,
      amplifier: 1,
      ambient: true,
      show_particles: false,
      show_icon: false,
    },
  ],
  brewing: { base: 'minecraft:mundane', reagent: 'minecraft:snowball' },
  long: { duration_ticks: 9600, reagent: 'minecraft:sugar' },
  strong: { amplifier: 2, duration_ticks: 1800, reagent: 'minecraft:blaze_powder' },
  splash: false,
  lingering: false,
};

const id = 'demo:frost' as ResourceLocation;
const value = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value;
const checked = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).checked;
const commit = (testId: string, text: string) => {
  const input = screen.getByTestId(testId);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

describe('Potion Studio registration', () => {
  it('registers a Studio for msm:potion', () => {
    expect(DISCOVERED_STUDIOS.map((entry) => [entry.id, entry.kindId])).toContainEqual([
      'msm.blocks-items.potion',
      'msm:potion',
    ]);
  });
});

describe('Potion Studio', () => {
  it('shows every element field', () => {
    renderOnStack(element(id, 'msm:potion', FULL), schema);
    expect(screen.getByTestId('potion-studio')).toBeTruthy();
    expect(value('potion-display-name')).toBe('Frost');
    expect(value('potion-name')).toBe('demo.frost');
    expect(value('potion-effect-0-id')).toBe('minecraft:slowness');
    expect(value('potion-effect-0-duration')).toBe('3600');
    expect(value('potion-effect-0-level')).toBe('2');
    expect(checked('potion-effect-0-ambient')).toBe(true);
    expect(checked('potion-effect-0-particles')).toBe(false);
    expect(checked('potion-effect-0-icon')).toBe(false);
    expect(value('potion-brewing-reagent')).toBe('minecraft:snowball');
    expect(value('potion-brewing-base')).toBe('minecraft:mundane');
    expect(checked('potion-long')).toBe(true);
    expect(value('potion-long-duration')).toBe('9600');
    expect(value('potion-long-reagent')).toBe('minecraft:sugar');
    expect(checked('potion-strong')).toBe(true);
    expect(value('potion-strong-level')).toBe('3');
    expect(value('potion-strong-duration')).toBe('1800');
    expect(value('potion-strong-reagent')).toBe('minecraft:blaze_powder');
    expect(checked('potion-splash')).toBe(false);
    expect(checked('potion-lingering')).toBe(false);
    expect(screen.getByTestId('potion-preview-ids').textContent).toContain(
      'demo:frost, demo:long_frost, demo:strong_frost',
    );
    expect(screen.getByTestId('potion-preview-names').textContent).toContain('Potion of Frost');
    // Only drinkable bottles: base, long and strong steps.
    expect(screen.getByTestId('potion-chain-steps').children).toHaveLength(3);
  });

  it('writes every field back, one undo step each, and round-trips to the same data', () => {
    const { stack, data } = renderOnStack(element(id, 'msm:potion', FULL), schema);
    const edits: [() => void, (d: Record<string, Json>) => Json][] = [];
    const check = (act: () => void, read: (d: Record<string, Json>) => Json, want: Json) => {
      act();
      expect(read(data() as Record<string, Json>)).toEqual(want);
      edits.push([act, read]);
    };
    type D = Record<string, Json>;
    const effect = (d: D) => (d.effects as D[])[0] as D;
    const typed = (testId: string, text: string) => () =>
      fireEvent.change(screen.getByTestId(testId), { target: { value: text } });
    const click = (testId: string) => () => fireEvent.click(screen.getByTestId(testId));

    check(typed('potion-display-name', 'Ice'), (d) => d.display_name ?? null, 'Ice');
    check(typed('potion-name', 'demo.ice'), (d) => d.name ?? null, 'demo.ice');
    check(
      () => commit('potion-effect-0-id', 'minecraft:speed'),
      (d) => effect(d).id ?? null,
      'minecraft:speed',
    );
    check(typed('potion-effect-0-duration', '400'), (d) => effect(d).duration_ticks ?? null, 400);
    check(typed('potion-effect-0-level', '4'), (d) => effect(d).amplifier ?? null, 3);
    check(click('potion-effect-0-ambient'), (d) => effect(d).ambient ?? null, null);
    check(click('potion-effect-0-particles'), (d) => effect(d).show_particles ?? null, null);
    check(click('potion-effect-0-icon'), (d) => effect(d).show_icon ?? null, null);
    check(
      () => commit('potion-brewing-reagent', 'minecraft:redstone'),
      (d) => (d.brewing as D).reagent ?? null,
      'minecraft:redstone',
    );
    check(
      () => commit('potion-brewing-base', ''),
      (d) => (d.brewing as D).base ?? null,
      null,
    );
    check(
      typed('potion-long-duration', '12000'),
      (d) => (d.long as D).duration_ticks ?? null,
      12000,
    );
    check(
      () => commit('potion-long-reagent', ''),
      (d) => (d.long as D).reagent ?? null,
      null,
    );
    check(typed('potion-strong-level', '2'), (d) => (d.strong as D).amplifier ?? null, 1);
    check(
      typed('potion-strong-duration', '900'),
      (d) => (d.strong as D).duration_ticks ?? null,
      900,
    );
    check(
      () => commit('potion-strong-reagent', ''),
      (d) => (d.strong as D).reagent ?? null,
      null,
    );
    check(click('potion-splash'), (d) => d.splash ?? null, null);
    check(click('potion-lingering'), (d) => d.lingering ?? null, null);
    check(click('potion-long'), (d) => d.long ?? null, null);
    check(click('potion-strong'), (d) => d.strong ?? null, null);
    check(
      () => commit('potion-brewing-reagent', ''),
      (d) => d.brewing ?? null,
      null,
    );
    expect(screen.getByTestId('potion-not-brewed')).toBeTruthy();

    // Each gesture was one undo step; undoing all of them restores the data exactly.
    let steps = 0;
    while (stack.canUndo) {
      stack.undo();
      steps++;
    }
    expect(steps).toBe(edits.length);
    expect(data()).toEqual(FULL);
  });

  it('adds and removes effects, at most eight, never the last one', () => {
    const one = { format: 1, effects: [{ id: 'minecraft:speed', duration_ticks: 20 }] };
    const { data } = renderOnStack(element(id, 'msm:potion', one), schema);
    expect(screen.getByLabelText('Remove effect 1')).toHaveProperty('disabled', true);
    for (let n = 1; n < 8; n++) fireEvent.click(screen.getByTestId('potion-add-effect'));
    expect((data() as { effects: Json[] }).effects).toHaveLength(8);
    expect(screen.getByTestId('potion-add-effect')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('Remove effect 2'));
    expect((data() as { effects: Json[] }).effects).toHaveLength(7);
  });

  it('ticks the longer and stronger versions from the first effect time', () => {
    const one = { format: 1, effects: [{ id: 'minecraft:speed', duration_ticks: 600 }] };
    const { data } = renderOnStack(element(id, 'msm:potion', one), schema);
    fireEvent.click(screen.getByTestId('potion-long'));
    fireEvent.click(screen.getByTestId('potion-strong'));
    expect(data()).toMatchObject({
      long: { duration_ticks: 1200 },
      strong: { amplifier: 1, duration_ticks: 300 },
    });
  });

  it('keeps everything else behind Advanced (all fields)', () => {
    renderOnStack(element(id, 'msm:potion', FULL), schema);
    fireEvent.click(screen.getByTestId('potion-advanced-toggle'));
    expect(screen.queryByTestId('potion-effects')).toBeNull();
    expect(screen.getByTestId('potion-studio')).toBeTruthy();
  });
});

describe('potion-model', () => {
  const potion = element(id, 'msm:potion', FULL);

  it('reads ids, names and steps from the plugin', () => {
    expect(potionIds(potion)).toEqual(['demo:frost', 'demo:long_frost', 'demo:strong_frost']);
    expect(potionItemNames(potion).map((entry) => entry.text)).toEqual([
      'Potion of Frost',
      'Splash Potion of Frost',
      'Lingering Potion of Frost',
      'Arrow of Frost',
    ]);
    const [first] = brewingSteps(potion);
    if (first === undefined) throw new Error('no step');
    expect(stepSummary(first)).toEqual({
      input: 'Potion (Mundane)',
      reagent: 'Snowball',
      output: 'Potion (Frost)',
    });
    expect(potionIds(element(id, 'msm:potion', 'bad'))).toEqual(['demo:frost']);
    expect(brewingSteps(element(id, 'msm:potion', 'bad'))).toEqual([]);
  });

  it('formats durations', () => {
    expect(durationText(3600)).toBe('3:00');
    expect(durationText(10)).toBe('0.5 s');
    expect(durationText(undefined)).toBe('');
  });

  it('makes a potion for an effect with a free id and a free ingredient', () => {
    const effect = element('demo:frost' as ResourceLocation, 'msm:effect', {
      format: 1,
      display_name: 'Frost Bite',
    });
    const first = newPotionFor(projectOf(effect), effect);
    expect(first).toEqual({
      id: 'demo:frost_potion',
      kind: 'msm:potion',
      data: {
        format: 1,
        display_name: 'Frost Bite',
        effects: [{ id: 'demo:frost', duration_ticks: 3600 }],
        brewing: { reagent: MAKE_POTION_REAGENT },
      },
    });
    const taken = element(first.id, 'msm:potion', first.data);
    const second = newPotionFor(projectOf(effect, taken), effect);
    expect(second.id).toBe('demo:frost_potion_2');
    // The awkward and amethyst pair is taken: no brewing, so no duplicate recipe.
    expect(second.data.brewing).toBeUndefined();
    expect(projectPotions(projectOf(effect, taken))).toEqual(['demo:frost_potion']);
  });
});

function EffectHarness(props: { stack: CommandStack; host: BlocksItemsStudioHost }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => props.stack.subscribe(() => rerender()), [props.stack]);
  const subject = props.stack.state.namespaces[0]?.elements.find((e) => e.id === 'demo:frost');
  if (subject === undefined) return null;
  return (
    <BlocksItemsStudioHostContext.Provider value={props.host}>
      <ElementForm
        project={props.stack.state}
        element={subject}
        kind={kindOf('msm:effect')}
        problems={[]}
        schema={schema}
        onChange={(pointer, next, options) =>
          props.stack.execute(commands.setElementValue(subject.id, pointer, next, options ?? {}))
        }
        focusPointer={null}
        onFocused={vi.fn()}
      />
    </BlocksItemsStudioHostContext.Provider>
  );
}

describe('Effect Studio: Make a potion', () => {
  it('adds an msm:potion for the effect in one undo step and lists it', () => {
    const effect = element('demo:frost' as ResourceLocation, 'msm:effect', {
      format: 1,
      category: 'harmful',
      color: 1,
      display_name: 'Frost Bite',
    });
    const stack = new CommandStack(projectOf(effect));
    const opened: string[] = [];
    const host: BlocksItemsStudioHost = {
      thumbnail: async () => new Uint8Array(),
      revision: 0,
      paintTexture: vi.fn(),
      addElement: (input) => {
        stack.execute(commands.addElement(createElement(input)));
        opened.push(input.id);
      },
    };
    render(<EffectHarness stack={stack} host={host} />);
    act(() => {
      fireEvent.click(screen.getByTestId('effect-make-potion'));
    });
    const potion = stack.state.namespaces[0]?.elements.find((e) => e.kind === 'msm:potion');
    expect(potion?.id).toBe('demo:frost_potion');
    expect(potion?.data).toMatchObject({ effects: [{ id: 'demo:frost' }] });
    expect(opened).toEqual(['demo:frost_potion']);
    expect(screen.getByTestId('effect-potions').textContent).toContain('demo:frost_potion');
    expect(stack.undo()).toBe(true);
    expect(stack.canUndo).toBe(false);
    expect(stack.state.namespaces[0]?.elements.map((e) => e.id)).toEqual(['demo:frost']);
  });

  it('is disabled without a host that adds elements', () => {
    const effect = element('demo:frost' as ResourceLocation, 'msm:effect', {
      format: 1,
      category: 'harmful',
      color: 1,
    });
    renderOnStack(effect, schema);
    expect(screen.getByTestId('effect-make-potion')).toHaveProperty('disabled', true);
  });
});
