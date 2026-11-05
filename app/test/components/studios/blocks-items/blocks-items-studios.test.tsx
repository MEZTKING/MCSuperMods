// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio and Item Studio (B97): rendered through `ElementForm` (so the Studio comes from
 * the registry) over the real schema index, with template data from
 * `@msm/plugin-blocks-items`, plus the pure helpers. Undo runs through a real
 * `CommandStack` with `commands.setElementValue`, as the session does.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FormProblem } from '../../../../src/renderer/src/forms';
import {
  eventNames,
  newAction,
  renameEvent,
  suggestEventId,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { StructureStudioHostContext } from '../../../../src/renderer/src/studios/structures/host';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
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

const kindOf = (id: string): ElementKind => {
  const kind = blocksItemsPlugin.contributes.elementKinds?.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
};

function templateData(templateId: string, id = 'demo:sample'): Json {
  const template = blocksItemsPlugin.contributes.elementTemplates?.find(
    (entry) => entry.id === templateId,
  );
  if (template === undefined) throw new Error(`No template ${templateId}.`);
  const context: TemplateContext = {
    id: id as TemplateContext['id'],
    namespace: 'demo',
    path: id.slice(id.indexOf(':') + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
  };
  return template.data(context);
}

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

/** Renders the Form tab for `subject` with a spy `onChange`. */
function renderStudio(
  subject: Element,
  project = projectOf(subject),
  problems: FormProblem[] = [],
) {
  const onChange = vi.fn<StudioProps['onChange']>();
  const result = render(
    <ElementForm
      project={project}
      element={subject}
      kind={kindOf(subject.kind)}
      problems={problems.map((problem) => ({ ...problem, code: 'blocks-items.test' }))}
      schema={schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />,
  );
  return { ...result, onChange };
}

/** `ElementForm` over a real command stack, as the session applies edits. */
function StackHarness({ stack, id }: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={kindOf(subject.kind)}
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

/** The pointer and value of the last edit (`ElementForm` drops absent options). */
const lastEdit = (spy: { mock: { lastCall?: unknown[] | undefined } }): unknown[] =>
  spy.mock.lastCall?.slice(0, 2) ?? [];

const dataOf = (stack: CommandStack, id: string): Json =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data ?? null;

describe('blocks and items Studio helpers', () => {
  it('registers both Studios through the area file, not msm:mod', () => {
    const ids = DISCOVERED_STUDIOS.map((entry) => entry.id);
    expect(ids).toContain('msm.blocks-items.block');
    expect(ids).toContain('msm.blocks-items.item');
    expect(DISCOVERED_STUDIOS.some((entry) => entry.kindId === 'msm:mod')).toBe(false);
  });

  it('renames an event with its trigger and trigger_event references', () => {
    const data = templateData('msm_block_interactive', 'demo:gem');
    const renamed = renameEvent(data, 'msm:block', 'demo:gem_sparkle', 'demo:glint');
    expect(eventNames(renamed)).toEqual(['demo:gem_use', 'demo:glint']);
    expect(renamed.components).toMatchObject({
      'msm:on_step': { event: 'demo:glint', cooldown_ticks: 20 },
      'msm:on_interact': { event: 'demo:gem_use' },
    });
    expect(JSON.stringify(renamed.events)).toContain('"type":"trigger_event","event":"demo:glint"');
    expect(() => renameEvent(data, 'msm:block', 'demo:gem_use', 'demo:gem_sparkle')).toThrow();
    expect(() => renameEvent(data, 'msm:block', 'demo:missing', 'x')).toThrow();
  });

  it('builds new actions and event ids', () => {
    expect(newAction('play_sound', [])).toEqual({ type: 'play_sound', sound: '' });
    expect(newAction('trigger_event', ['a', 'b'], 'a')).toEqual({
      type: 'trigger_event',
      event: 'b',
    });
    expect(suggestEventId('demo:x', ['demo:x_event'])).toBe('demo:x_event_2');
  });
});

describe('Block Studio', () => {
  it('renders template data with schema choices', () => {
    const subject = element(
      'demo:ruby_ore',
      'msm:block',
      templateData('msm_block_glowing_ore', 'demo:ruby_ore'),
    );
    renderStudio(subject);
    expect(screen.getByTestId('block-studio')).toBeTruthy();
    expect((screen.getByTestId('msm-model') as HTMLInputElement).value).toBe(
      'minecraft:block/emerald_ore',
    );
    expect((screen.getByTestId('block-display-name') as HTMLInputElement).value).toBe('Ruby Ore');
    expect((screen.getByTestId('block-hardness') as HTMLInputElement).value).toBe('3');
    expect((screen.getByTestId('block-light') as HTMLInputElement).value).toBe('7');
    const tier = screen.getByTestId('block-min-tier') as HTMLSelectElement;
    expect(tier.value).toBe('iron');
    const tiers = [...tier.options].map((option) => option.value);
    expect(tiers).toContain('diamond');
    const sounds = [...(screen.getByTestId('block-sound-type') as HTMLSelectElement).options].map(
      (option) => option.value,
    );
    expect(sounds).toContain('amethyst');
    expect((screen.getByTestId('block-drops-self') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('block-item-tab')).toBeTruthy();
  });

  it('writes edited fields at their pointers', () => {
    const subject = element('demo:b', 'msm:block', templateData('msm_block_simple', 'demo:b'));
    const { onChange } = renderStudio(subject);
    fireEvent.change(screen.getByTestId('block-hardness'), { target: { value: '4.5' } });
    expect(onChange).toHaveBeenLastCalledWith('/components/msm:breakable/hardness', 4.5, {
      coalesce: 'typing:/components/msm:breakable/hardness',
    });
    fireEvent.change(screen.getByTestId('block-sound-type'), { target: { value: 'wood' } });
    expect(lastEdit(onChange)).toEqual(['/sound_type', 'wood']);
    fireEvent.change(screen.getByTestId('block-light'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith('/components/msm:light_emitter/level', 12, {
      coalesce: 'typing:/components/msm:light_emitter/level',
    });
    fireEvent.click(screen.getByTestId('block-drops-none'));
    expect(lastEdit(onChange)).toEqual(['/loot', undefined]);
  });

  it('turns the block item off as "item": false and back on', () => {
    const subject = element('demo:b', 'msm:block', templateData('msm_block_simple', 'demo:b'));
    const { onChange, unmount } = renderStudio(subject);
    fireEvent.click(screen.getByTestId('block-has-item'));
    expect(lastEdit(onChange)).toEqual(['/item', false]);
    unmount();

    const off = element('demo:b', 'msm:block', {
      ...(templateData('msm_block_simple', 'demo:b') as object),
      item: false,
    });
    const second = renderStudio(off);
    expect((screen.getByTestId('block-has-item') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId('block-item-stack')).toBeNull();
    fireEvent.click(screen.getByTestId('block-has-item'));
    expect(lastEdit(second.onChange)).toEqual(['/item', undefined]);
  });

  it('restores the earlier block item when "Has a block item" is ticked again', () => {
    const id = 'demo:b' as ResourceLocation;
    const item = { creative_tab: 'minecraft:building_blocks', max_stack_size: 16, rarity: 'rare' };
    const stack = new CommandStack(
      projectOf(
        element(id, 'msm:block', {
          ...(templateData('msm_block_simple', id) as object),
          item,
        }),
      ),
    );
    render(<StackHarness stack={stack} id={id} />);
    fireEvent.click(screen.getByTestId('block-has-item'));
    expect((dataOf(stack, id) as { item?: unknown }).item).toBe(false);
    fireEvent.click(screen.getByTestId('block-has-item'));
    expect((dataOf(stack, id) as { item?: unknown }).item).toEqual(item);
  });

  it('adds an event and an action, picks it for on_interact, and undoes', () => {
    const id = 'demo:b' as ResourceLocation;
    const stack = new CommandStack(
      projectOf(element(id, 'msm:block', templateData('msm_block_simple', id))),
    );
    render(<StackHarness stack={stack} id={id} />);

    fireEvent.change(screen.getByLabelText('New event id'), { target: { value: 'demo:ping' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(eventNames(dataOf(stack, id))).toEqual(['demo:ping']);

    const event = screen.getByTestId('msm-event-demo:ping');
    fireEvent.change(within(event).getByLabelText('New action type for demo:ping'), {
      target: { value: 'spawn_particle' },
    });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:ping' }));
    expect(dataOf(stack, id)).toMatchObject({
      events: { 'demo:ping': { actions: [{ type: 'spawn_particle', particle: '' }] } },
    });
    // The count field shows the D4 default and writes the edit.
    const count = within(event).getByLabelText('demo:ping action 1 count') as HTMLInputElement;
    expect(count.value).toBe('1');
    fireEvent.change(count, { target: { value: '5' } });
    expect(dataOf(stack, id)).toMatchObject({
      events: { 'demo:ping': { actions: [{ type: 'spawn_particle', count: 5 }] } },
    });

    const interact = screen.getByTestId('block-on-interact') as HTMLSelectElement;
    expect([...interact.options].map((option) => option.value)).toEqual(['', 'demo:ping']);
    fireEvent.change(interact, { target: { value: 'demo:ping' } });
    expect(dataOf(stack, id)).toMatchObject({
      components: { 'msm:on_interact': { event: 'demo:ping' } },
    });

    act(() => {
      stack.undo();
    });
    expect(
      (dataOf(stack, id) as { components: Record<string, Json> }).components['msm:on_interact'],
    ).toBeUndefined();
    expect((screen.getByTestId('block-on-interact') as HTMLSelectElement).value).toBe('');
    act(() => {
      stack.undo();
      stack.undo();
      stack.undo();
    });
    expect(eventNames(dataOf(stack, id))).toEqual([]);
    expect(screen.queryByTestId('msm-event-demo:ping')).toBeNull();
  });

  it('renames an event in one undo step and reorders actions', () => {
    const id = 'demo:gem' as ResourceLocation;
    const stack = new CommandStack(
      projectOf(element(id, 'msm:block', templateData('msm_block_interactive', id))),
    );
    render(<StackHarness stack={stack} id={id} />);
    const rename = screen.getByLabelText('Event id demo:gem_use');
    fireEvent.change(rename, { target: { value: 'demo:chime' } });
    fireEvent.blur(rename);
    expect(dataOf(stack, id)).toMatchObject({
      components: { 'msm:on_interact': { event: 'demo:chime' } },
    });
    const event = screen.getByTestId('msm-event-demo:chime');
    fireEvent.click(within(event).getByRole('button', { name: 'Move demo:chime action 1 down' }));
    expect(dataOf(stack, id)).toMatchObject({
      events: { 'demo:chime': { actions: [{ type: 'trigger_event' }, { type: 'play_sound' }] } },
    });
    act(() => {
      stack.undo();
      stack.undo();
    });
    expect(eventNames(dataOf(stack, id))).toEqual(['demo:gem_use', 'demo:gem_sparkle']);
  });

  it('shows blocks-items problems inline', () => {
    const subject = element('demo:b', 'msm:block', templateData('msm_block_interactive', 'demo:b'));
    renderStudio(subject, undefined, [
      {
        path: '/components/msm:on_step/event',
        severity: 'error',
        message: 'Event "x" is not declared.',
      },
      { path: '/model', severity: 'warning', message: 'This block has no model.' },
    ]);
    const behaviour = screen.getByTestId('block-behaviour');
    expect(within(behaviour).getByText('Event "x" is not declared.')).toBeTruthy();
    expect(
      within(screen.getByTestId('block-appearance')).getByText('This block has no model.'),
    ).toBeTruthy();
  });

  it('goes to a project model through the host and keeps Advanced reachable', () => {
    const model = element('demo:block/gem', 'minecraft:model', {});
    const subject = element('demo:b', 'msm:block', {
      ...(templateData('msm_block_simple', 'demo:b') as object),
      model: 'demo:block/gem',
    });
    const openElement = vi.fn();
    render(
      <StructureStudioHostContext.Provider
        value={{ openElement, replaceFromFile: vi.fn(), exportStructures: vi.fn() }}
      >
        <ElementForm
          project={projectOf(model, subject)}
          element={subject}
          kind={kindOf('msm:block')}
          problems={[]}
          schema={schema}
          onChange={vi.fn()}
          focusPointer={null}
          onFocused={vi.fn()}
        />
      </StructureStudioHostContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go to model' }));
    expect(openElement).toHaveBeenCalledWith('demo:block/gem');
    fireEvent.click(screen.getByTestId('block-advanced-toggle'));
    expect(screen.queryByTestId('block-hardness')).toBeNull();
    expect(screen.getByTestId('block-studio').querySelector('[data-pointer]')).toBeTruthy();
  });
});

describe('Item Studio', () => {
  it('renders the tool template and forces the stack size to 1 with durability', () => {
    const subject = element('demo:pick', 'msm:item', templateData('msm_item_tool', 'demo:pick'));
    const { onChange } = renderStudio(subject);
    expect(screen.getByTestId('item-studio')).toBeTruthy();
    expect(screen.getByTestId('item-stack-forced').textContent).toBe('1');
    expect(screen.queryByTestId('item-stack')).toBeNull();
    expect((screen.getByTestId('item-tool-type') as HTMLSelectElement).value).toBe('pickaxe');
    const tier = screen.getByTestId('item-tool-tier') as HTMLSelectElement;
    expect(tier.value).toBe('iron');
    fireEvent.change(tier, { target: { value: 'diamond' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:tool/tier', 'diamond']);
    fireEvent.click(screen.getByTestId('item-durability-toggle'));
    expect(lastEdit(onChange)).toEqual(['/components/msm:durability', undefined]);
  });

  it('edits food and on_use with the shared events editor', () => {
    const id = 'demo:wand' as ResourceLocation;
    const stack = new CommandStack(
      projectOf(element(id, 'msm:item', templateData('msm_item_wand', id))),
    );
    render(<StackHarness stack={stack} id={id} />);
    expect((screen.getByTestId('item-on-use') as HTMLSelectElement).value).toBe('demo:wand_use');
    expect((screen.getByTestId('item-on-use-cooldown') as HTMLInputElement).value).toBe('20');
    expect(screen.getByTestId('msm-events')).toBeTruthy();

    fireEvent.click(screen.getByTestId('item-food-toggle'));
    expect(dataOf(stack, id)).toMatchObject({
      components: { 'msm:food': { nutrition: 4, saturation: 0.3 } },
    });
    fireEvent.change(screen.getByTestId('item-stack'), { target: { value: '16' } });
    expect(dataOf(stack, id)).toMatchObject({ max_stack_size: 16 });

    fireEvent.change(screen.getByTestId('item-on-use'), { target: { value: '' } });
    expect(
      (dataOf(stack, id) as { components: Record<string, Json> }).components['msm:on_use'],
    ).toBeUndefined();
    act(() => {
      stack.undo();
    });
    expect((screen.getByTestId('item-on-use') as HTMLSelectElement).value).toBe('demo:wand_use');
  });
});
