// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Item Studio's "Throwable" section (B205, ADR 0056 D1): switched on and off, its fields
 * written at their pointers, the two hit events picked from the item's events and renamed with
 * them, and the conflict note. Rendered through `ElementForm` over the real schema index.
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
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renameEvent } from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: { target, schemaIndex: index, vanillaRegistries: {}, registries: () => registries },
  };
});
afterEach(cleanup);

const itemKind = blocksItemsPlugin.contributes.elementKinds?.find(
  (entry) => entry.id === 'msm:item',
) as ElementKind;

const DART: Json = {
  model: 'demo:item/dart',
  components: {
    'msm:throwable': { damage: 4, after_throw: 'drop', on_hit_entity: { event: 'demo:dart_hit' } },
  },
  events: { 'demo:dart_hit': { actions: [] }, 'demo:dart_land': { actions: [] } },
};

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements, assets: [] }],
  };
}

function renderStudio(subject: Element) {
  const onChange = vi.fn<StudioProps['onChange']>();
  render(
    <ElementForm
      project={projectOf(subject)}
      element={subject}
      kind={itemKind}
      problems={[]}
      schema={schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />,
  );
  return { onChange };
}

function StackHarness({ stack, id }: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={itemKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

const lastEdit = (spy: { mock: { lastCall?: unknown[] | undefined } }): unknown[] =>
  spy.mock.lastCall?.slice(0, 2) ?? [];

const dataOf = (stack: CommandStack, id: string): Json =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data ?? null;

describe('Item Studio throwable section', () => {
  it('switches the component on with snowball defaults and off again, with Undo', () => {
    const id = 'demo:ball' as ResourceLocation;
    const stack = new CommandStack(projectOf(element(id, 'msm:item', { model: 'demo:item/ball' })));
    render(<StackHarness stack={stack} id={id} />);
    expect(screen.queryByTestId('item-throwable-damage')).toBeNull();
    fireEvent.click(screen.getByTestId('item-throwable-toggle'));
    expect(dataOf(stack, id)).toEqual({
      model: 'demo:item/ball',
      components: { 'msm:throwable': {} },
    });
    expect((screen.getByTestId('item-throwable-speed') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('item-throwable-dispensable') as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.change(screen.getByTestId('item-throwable-damage'), { target: { value: '3' } });
    expect(dataOf(stack, id)).toMatchObject({ components: { 'msm:throwable': { damage: 3 } } });
    stack.undo();
    stack.undo();
    expect(dataOf(stack, id)).toEqual({ model: 'demo:item/ball' });
  });

  it('writes its fields at their pointers', () => {
    const subject = element('demo:dart' as ResourceLocation, 'msm:item', DART);
    const { onChange } = renderStudio(subject);
    expect((screen.getByTestId('item-throwable-damage') as HTMLInputElement).value).toBe('4');
    const after = screen.getByTestId('item-throwable-after') as HTMLSelectElement;
    expect(after.value).toBe('drop');
    expect([...after.options].map((option) => option.value)).toEqual([
      '',
      'consume',
      'keep',
      'drop',
      'return',
    ]);
    fireEvent.change(after, { target: { value: 'return' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/after_throw', 'return']);
    fireEvent.change(screen.getByTestId('item-throwable-speed'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith('/components/msm:throwable/speed', 2.5, {
      coalesce: 'typing:/components/msm:throwable/speed',
    });
    fireEvent.change(screen.getByTestId('item-throwable-gravity'), { target: { value: '0.1' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/gravity', 0.1]);
    fireEvent.change(screen.getByTestId('item-throwable-charge'), { target: { value: '10' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/charge_ticks', 10]);
    fireEvent.change(screen.getByTestId('item-throwable-cooldown'), { target: { value: '20' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/cooldown_ticks', 20]);
    fireEvent.click(screen.getByTestId('item-throwable-dispensable'));
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/dispensable', false]);
    const sound = screen.getByTestId('item-throwable-sound');
    fireEvent.change(sound, { target: { value: 'minecraft:entity.egg.throw' } });
    fireEvent.blur(sound);
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:throwable/sound',
      'minecraft:entity.egg.throw',
    ]);
  });

  it('picks the hit events from the item events and renames them', () => {
    const subject = element('demo:dart' as ResourceLocation, 'msm:item', DART);
    const { onChange } = renderStudio(subject);
    expect((screen.getByTestId('item-throwable-hit-entity') as HTMLSelectElement).value).toBe(
      'demo:dart_hit',
    );
    fireEvent.change(screen.getByTestId('item-throwable-hit-block'), {
      target: { value: 'demo:dart_land' },
    });
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:throwable/on_hit_block/event',
      'demo:dart_land',
    ]);
    fireEvent.change(screen.getByTestId('item-throwable-hit-entity'), { target: { value: '' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:throwable/on_hit_entity', undefined]);

    const renamed = renameEvent(DART, 'msm:item', 'demo:dart_hit', 'demo:stick');
    expect(renamed.components).toEqual({
      'msm:throwable': { damage: 4, after_throw: 'drop', on_hit_entity: { event: 'demo:stick' } },
    });
  });

  it('notes a conflict with food', () => {
    const subject = element('demo:pie' as ResourceLocation, 'msm:item', {
      components: { 'msm:throwable': {}, 'msm:food': { nutrition: 4, saturation: 0.3 } },
    });
    renderStudio(subject);
    expect(screen.getByTestId('item-throwable-conflict').textContent).toContain('food');
  });
});
