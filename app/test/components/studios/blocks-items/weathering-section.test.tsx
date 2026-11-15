// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Block Studio's Weathering section (B452, ADR 0094 D8, D9): the stage and the next block,
 * "Make the next stage" and "Make a waxed copy" as one undo step each, and the chain builder
 * making the four stages and the waxed copies as one undo step.
 */
import type { CommandStack, Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type ChangeItem, planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  nextStageChange,
  stageBlockId,
  waxedBlockId,
  waxedCopyChange,
  weatheringBase,
  weatheringChainChange,
} from '../../../../src/renderer/src/studios/blocks-items/WeatheringSection';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { projectOf, renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const tin = (data: Record<string, Json> = {}): Element =>
  element('demo:tin' as ResourceLocation, 'msm:block', {
    format: 1,
    display_name: 'Tin',
    model: 'minecraft:block/iron_block',
    item: { id: 'demo:tin_item' },
    components: { 'msm:weathering': { stage: 'unaffected' } },
    ...data,
  });

type Block = { components?: Record<string, { stage?: string; next?: string; into?: string }> };
const comps = (data: Json | undefined) => (data as Block).components ?? {};
const ids = (stack: CommandStack) =>
  stack.state.namespaces[0]?.elements.map((entry) => entry.id).sort() ?? [];
const dataOf = (stack: CommandStack, id: string) =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data;

function withHost(subject: Element, others: Element[] = []) {
  let current: CommandStack | undefined;
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (items: readonly ChangeItem[], label: string) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('changed');
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of plan.commands) part.apply(draft);
        },
      });
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  const rendered = renderOnStack(subject, schema, { wrapper, others });
  current = rendered.stack;
  return rendered;
}

describe('weathering ids and changes', () => {
  it('names stages and waxed copies after the base block', () => {
    expect(weatheringBase('waxed_exposed_tin')).toBe('tin');
    expect(stageBlockId('demo:tin', 'exposed')).toBe('demo:exposed_tin');
    expect(stageBlockId('demo:exposed_tin', 'weathered')).toBe('demo:weathered_tin');
    expect(stageBlockId('demo:roof/oxidized_tin', 'unaffected')).toBe('demo:roof/tin');
    expect(waxedBlockId('demo:roof/exposed_tin')).toBe('demo:roof/waxed_exposed_tin');
  });

  it('makes the next stage and links it, or nothing at the last stage', () => {
    const project = projectOf(tin());
    const change = nextStageChange(project, tin());
    expect(change?.created).toEqual(['demo:exposed_tin']);
    const [create, update] = change?.items ?? [];
    expect(create).toMatchObject({ op: 'create', kind: 'msm:block' });
    expect(create?.after).toMatchObject({
      display_name: 'Exposed Tin',
      item: {},
      components: { 'msm:weathering': { stage: 'exposed' } },
    });
    expect(comps(update?.after)['msm:weathering']).toEqual({
      next: 'demo:exposed_tin',
      stage: 'unaffected',
    });
    const last = tin({ components: { 'msm:weathering': { stage: 'oxidized' } } });
    expect(nextStageChange(projectOf(last), last)).toBeUndefined();
  });

  it('makes a waxed copy that never ages', () => {
    const change = waxedCopyChange(projectOf(tin()), tin());
    expect(change?.created).toEqual(['demo:waxed_tin']);
    expect(comps(change?.items[0]?.after)).toEqual({});
    expect((change?.items[0]?.after as { display_name?: string } | undefined)?.display_name).toBe(
      'Waxed Tin',
    );
    expect(comps(change?.items[1]?.after)['msm:waxable']).toEqual({ into: 'demo:waxed_tin' });
  });

  it('builds the whole set: three more stages and four waxed copies, chained', () => {
    const change = weatheringChainChange(projectOf(tin()), tin());
    expect(change?.created).toEqual([
      'demo:exposed_tin',
      'demo:weathered_tin',
      'demo:oxidized_tin',
      'demo:waxed_tin',
      'demo:waxed_exposed_tin',
      'demo:waxed_weathered_tin',
      'demo:waxed_oxidized_tin',
    ]);
    const after = (id: string) => change?.items.find((item) => item.elementId === id)?.after;
    expect(comps(after('demo:exposed_tin'))).toEqual({
      'msm:weathering': { next: 'demo:weathered_tin', stage: 'exposed' },
      'msm:waxable': { into: 'demo:waxed_exposed_tin' },
    });
    expect(comps(after('demo:oxidized_tin'))['msm:weathering']).toEqual({ stage: 'oxidized' });
    expect(comps(after('demo:waxed_weathered_tin'))).toEqual({});
    expect(comps(after('demo:tin'))).toEqual({
      'msm:weathering': { next: 'demo:exposed_tin', stage: 'unaffected' },
      'msm:waxable': { into: 'demo:waxed_tin' },
    });
  });

  it('follows the stages already made and makes only what is missing', () => {
    const first = tin({
      components: { 'msm:weathering': { next: 'demo:exposed_tin', stage: 'unaffected' } },
    });
    const exposed = element('demo:exposed_tin' as ResourceLocation, 'msm:block', {
      format: 1,
      components: {
        'msm:weathering': { stage: 'exposed' },
        'msm:waxable': { into: 'minecraft:waxed_exposed_copper' },
      },
    });
    const change = weatheringChainChange(projectOf(first, exposed), first);
    expect(change?.created).toEqual([
      'demo:weathered_tin',
      'demo:oxidized_tin',
      'demo:waxed_tin',
      'demo:waxed_weathered_tin',
      'demo:waxed_oxidized_tin',
    ]);
    const update = change?.items.find((item) => item.elementId === 'demo:exposed_tin');
    expect(comps(update?.after)['msm:weathering']).toEqual({
      next: 'demo:weathered_tin',
      stage: 'exposed',
    });
  });
});

describe('Weathering section', () => {
  it('turns ageing on and picks the stage', () => {
    const { data } = renderOnStack(tin({ components: {} as Json }), schema);
    fireEvent.click(screen.getByTestId('block-weathering-on'));
    expect(comps(data())['msm:weathering']).toEqual({ stage: 'unaffected' });
    fireEvent.change(screen.getByTestId('block-weathering-stage'), {
      target: { value: 'weathered' },
    });
    expect(comps(data())['msm:weathering']).toEqual({ stage: 'weathered' });
    expect(screen.getByTestId('block-weathering-stage').textContent).toContain('Oxidised');
  });

  it('is not shown on a type that cannot age', () => {
    renderOnStack(
      element('demo:bed' as ResourceLocation, 'msm:block', { format: 1, type: 'bed' }),
      schema,
    );
    expect(screen.queryByTestId('block-weathering')).toBeNull();
  });

  it('makes the next stage and a waxed copy, one undo step each', async () => {
    const { stack } = withHost(tin());
    fireEvent.click(screen.getByTestId('block-weathering-make-next'));
    await waitFor(() => expect(ids(stack)).toEqual(['demo:exposed_tin', 'demo:tin']));
    expect(stack.undoLabel()).toBe('Make the next stage');
    fireEvent.click(screen.getByTestId('block-weathering-make-waxed'));
    await waitFor(() => expect(ids(stack)).toContain('demo:waxed_tin'));
    expect(comps(dataOf(stack, 'demo:tin'))['msm:waxable']).toEqual({ into: 'demo:waxed_tin' });
    stack.undo();
    expect(ids(stack)).toEqual(['demo:exposed_tin', 'demo:tin']);
    stack.undo();
    expect(ids(stack)).toEqual(['demo:tin']);
    expect(comps(dataOf(stack, 'demo:tin'))).toEqual({ 'msm:weathering': { stage: 'unaffected' } });
  });

  it('builds the whole set in one undo step', async () => {
    const { stack } = withHost(tin());
    fireEvent.click(screen.getByTestId('block-weathering-make-set'));
    await waitFor(() => expect(ids(stack)).toHaveLength(8));
    expect(stack.undoLabel()).toBe('Make the whole set');
    expect((screen.getByTestId('block-weathering-make-set') as HTMLButtonElement).disabled).toBe(
      true,
    );
    stack.undo();
    expect(ids(stack)).toEqual(['demo:tin']);
    expect(stack.canUndo).toBe(false);
  });

  it('says which block a waxed copy belongs to', () => {
    const waxed = element('demo:waxed_tin' as ResourceLocation, 'msm:block', {
      format: 1,
      model: 'minecraft:block/iron_block',
    });
    renderOnStack(waxed, schema, {
      others: [
        tin({
          components: {
            'msm:weathering': { stage: 'unaffected' },
            'msm:waxable': { into: 'demo:waxed_tin' },
          },
        }),
      ],
    });
    expect(screen.getByTestId('block-weathering-waxed-of').textContent).toContain('demo:tin');
  });
});
