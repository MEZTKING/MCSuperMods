// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B538 (ADR 0108 D1–D3, ADR 0111 D2, D5–D7, ADR 0112 D1): the Fluid Studio's mixing, cauldron and
 * bottle with its Very easy list; the Creative tab Studio's own order; the Command Studio's
 * argument types from the target; the Game rule and Statistic Studios. Rendered through
 * `ElementForm` over a command stack.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import scriptingPlugin from '@msm/plugin-scripting';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  handOrderOf,
  movedItem,
  tabMembers,
  withTabOrder,
} from '../../../../src/renderer/src/studios/blocks-items/creative-tab-model';
import { mixingRulesOf } from '../../../../src/renderer/src/studios/blocks-items/fluid-model';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  ARGUMENT_TYPE_LABELS,
  offeredArgumentTypes,
} from '../../../../src/renderer/src/studios/scripting/command-model';
import { withGameRuleKind } from '../../../../src/renderer/src/studios/scripting/GameRuleStudio';
import { statCriterionOf } from '../../../../src/renderer/src/studios/scripting/StatStudio';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { FLUID_VERY_EASY_SECTIONS } from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
const target = bundle.target;
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/blocks-items/FluidStudio'),
    () => import('../../../../src/renderer/src/studios/blocks-items/CreativeTabStudio'),
    () => import('../../../../src/renderer/src/studios/scripting/CommandStudio'),
    () => import('../../../../src/renderer/src/studios/scripting/GameRuleStudio'),
    () => import('../../../../src/renderer/src/studios/scripting/StatStudio'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const KINDS: ElementKind[] = [
  ...(blocksItemsPlugin.contributes.elementKinds ?? []),
  ...(scriptingPlugin.contributes.elementKinds ?? []),
];
const kindOf = (id: string): ElementKind => {
  const kind = KINDS.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
};
const projectOf = (...elements: Element[]): Project => ({
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
      kind={kindOf(subject.kind)}
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

function renderOn(subject: Element, others: Element[] = []) {
  const stack = new CommandStack(projectOf(subject, ...others));
  render(<Harness stack={stack} id={subject.id} />);
  const data = () =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === subject.id)?.data as {
      [key: string]: Json;
    };
  return { stack, data };
}

const find = (testId: string) =>
  screen.findByTestId(testId, {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });

describe('Fluid Studio, batch 2', () => {
  const OIL = element('demo:oil' as ResourceLocation, 'msm:fluid', {
    format: 1,
    display_name: 'Oil',
  });

  it('adds a mixing rule and edits what it meets and becomes', async () => {
    const { stack, data } = renderOn(OIL, [
      element('demo:tar' as ResourceLocation, 'msm:fluid', { format: 1 }),
    ]);
    fireEvent.click(await find('fluid-mixing-add'));
    expect(mixingRulesOf(data())).toEqual([{ with: 'lava', source: 'minecraft:stone' }]);
    const meets = screen.getByTestId('fluid-mixing-0-with') as HTMLSelectElement;
    expect([...meets.options].map((option) => option.value)).toEqual(['water', 'lava', 'demo:tar']);
    fireEvent.change(meets, { target: { value: 'demo:tar' } });
    const flowing = screen.getByTestId('fluid-mixing-0-flowing');
    fireEvent.change(flowing, { target: { value: 'minecraft:gravel' } });
    fireEvent.blur(flowing);
    expect(mixingRulesOf(data())).toEqual([
      { with: 'demo:tar', source: 'minecraft:stone', flowing: 'minecraft:gravel' },
    ]);
    fireEvent.click(screen.getByTestId('fluid-mixing-0-remove'));
    expect(data().mixing).toBeUndefined();
    act(() => stack.undo());
    expect(mixingRulesOf(data())).toHaveLength(1);
  });

  it('gives it a cauldron with levels and a bottle that fills hunger', async () => {
    const { data } = renderOn(OIL);
    fireEvent.click(await find('fluid-cauldron-on'));
    fireEvent.click(screen.getByTestId('fluid-cauldron-levels'));
    expect(data().cauldron).toEqual({ levels: true });
    fireEvent.click(screen.getByTestId('fluid-bottle-on'));
    fireEvent.click(screen.getByTestId('fluid-bottle-food-on'));
    expect(data().bottle).toEqual({ food: { nutrition: 2, saturation: 0.3 } });
    fireEvent.change(screen.getByTestId('fluid-bottle-name'), { target: { value: 'Oil Flask' } });
    expect(data().bottle_display_name).toBe('Oil Flask');
  });

  it('says a lava-like cauldron is always full', async () => {
    renderOn(
      element('demo:tar' as ResourceLocation, 'msm:fluid', {
        format: 1,
        behaves_like: 'lava',
        cauldron: {},
      }),
    );
    expect(await find('fluid-cauldron-full-only')).toBeTruthy();
    expect(screen.queryByTestId('fluid-cauldron-levels')).toBeNull();
  });

  it('shows its beginner sections in Very easy, with no ids', async () => {
    expect(FLUID_VERY_EASY_SECTIONS).toEqual(
      expect.arrayContaining(['fluid-mixing', 'fluid-cauldron-bottle']),
    );
    const before = usePreferences.getState().mode;
    usePreferences.setState({ mode: 'very-easy' as never });
    try {
      renderOn(OIL);
      expect(await find('fluid-mixing')).toBeTruthy();
      expect(screen.getByTestId('fluid-cauldron-bottle')).toBeTruthy();
      expect(screen.queryByTestId('fluid-inside')).toBeNull();
      expect(screen.queryByTestId('fluid-also-makes')).toBeNull();
    } finally {
      usePreferences.setState({ mode: before });
    }
  });
});

describe('Creative tab Studio, your own order', () => {
  const TAB = 'demo:gems' as ResourceLocation;
  const items = [
    element('demo:ruby' as ResourceLocation, 'msm:item', {
      display_name: 'Ruby',
      creative_tab: 'demo:gems',
    }),
    element('demo:wand' as ResourceLocation, 'msm:item', {
      display_name: 'Wand',
      creative_tab: 'demo:gems',
    }),
  ];
  const tab = (data: Record<string, Json> = {}) =>
    element(TAB, 'msm:creative_tab', { format: 1, icon: 'demo:ruby', ...data });

  it('orders the members by the hand order, the rest after', () => {
    const project = projectOf(tab(), ...items);
    expect(
      tabMembers(project, TAB, 'by_hand', ['demo:wand']).map((member) => member.itemId),
    ).toEqual(['demo:wand', 'demo:ruby']);
    expect(withTabOrder(project, TAB, tab().data, 'by_hand')).toMatchObject({
      order: 'by_hand',
      items: ['demo:ruby', 'demo:wand'],
    });
    expect(withTabOrder(project, TAB, { items: ['demo:ruby'] }, 'by_name')).toEqual({
      order: 'by_name',
    });
    expect(movedItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(handOrderOf({ items: ['stick'] })).toEqual(['minecraft:stick']);
  });

  it('starts the order from the members, moves and adds items in one step each', async () => {
    const { stack, data } = renderOn(tab(), items);
    const order = (await find('creative-tab-order')) as HTMLSelectElement;
    expect([...order.options].map((option) => option.textContent)).toContain('In your own order');
    fireEvent.change(order, { target: { value: 'by_hand' } });
    expect(data()).toMatchObject({ order: 'by_hand', items: ['demo:ruby', 'demo:wand'] });
    fireEvent.click(screen.getByTestId('creative-tab-hand-1-up'));
    expect(data().items).toEqual(['demo:wand', 'demo:ruby']);
    const add = screen.getByTestId('creative-tab-hand-add');
    fireEvent.change(add, { target: { value: 'minecraft:diamond' } });
    fireEvent.blur(add);
    expect(data().items).toEqual(['demo:wand', 'demo:ruby', 'minecraft:diamond']);
    expect(screen.getByTestId('creative-tab-hand-2').textContent).toContain('Diamond');
    act(() => stack.undo());
    act(() => stack.undo());
    act(() => stack.undo());
    expect(data().order).toBeUndefined();
    expect(data().items).toBeUndefined();
  });
});

describe('Command Studio argument types', () => {
  it("offers the target's 44 types in plain words", async () => {
    const types = offeredArgumentTypes(target.commands);
    expect(types).toHaveLength(44);
    for (const type of types) expect(ARGUMENT_TYPE_LABELS).toHaveProperty(type);
    expect(offeredArgumentTypes(undefined)).toHaveLength(44);
    renderOn(
      element('demo:gems' as ResourceLocation, 'msm:command', {
        format: 1,
        name: 'gems',
        arguments: [{ name: 'where', type: 'dimension' }],
      }),
    );
    const type = (await find('command-argument-0-type')) as HTMLSelectElement;
    expect(type.options).toHaveLength(44);
    expect(type.selectedOptions[0]?.textContent).toBe('A dimension');
  });
});

describe('Game rule and Statistic Studios', () => {
  it('edits a game rule and drops the other kind’s fields when the kind changes', async () => {
    expect(withGameRuleKind({ kind: 'integer', default: 3, min: 0, max: 9 }, 'boolean')).toEqual({
      kind: 'boolean',
    });
    const { data } = renderOn(
      element('demo:gem_drops' as ResourceLocation, 'msm:game_rule', { kind: 'boolean' }),
    );
    fireEvent.click(await find('game-rule-default-boolean'));
    expect(data().default).toBe(true);
    fireEvent.change(screen.getByTestId('game-rule-kind'), { target: { value: 'integer' } });
    expect(data()).toEqual({ kind: 'integer' });
    fireEvent.change(screen.getByTestId('game-rule-max'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('game-rule-category'), { target: { value: 'drops' } });
    expect(data()).toEqual({ kind: 'integer', max: 10, category: 'drops' });
    expect(screen.getByTestId('game-rule-command').textContent).toContain(
      '/gamerule demo:gem_drops',
    );
  });

  it('edits a statistic and shows its scoreboard criterion outside Very easy', async () => {
    expect(statCriterionOf('demo:gems_found', target)).toBe('minecraft.custom:demo.gems_found');
    const { data } = renderOn(element('demo:gems_found' as ResourceLocation, 'msm:stat', {}));
    fireEvent.change(await find('stat-format'), { target: { value: 'time' } });
    expect(data().formatter).toBe('time');
    expect(screen.getByTestId('stat-criterion').textContent).toContain(
      'minecraft.custom:demo.gems_found',
    );
    cleanup();
    const before = usePreferences.getState().mode;
    usePreferences.setState({ mode: 'very-easy' as never });
    try {
      renderOn(element('demo:gems_found' as ResourceLocation, 'msm:stat', {}));
      expect(await find('stat-general')).toBeTruthy();
      expect(screen.queryByTestId('stat-criterion')).toBeNull();
    } finally {
      usePreferences.setState({ mode: before });
    }
  });
});
