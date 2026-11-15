// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Command Studio (B460, ADR 0096 D1, ADR 0101 D1): the pure helpers of `command-model.ts` (the
 * chat line preview, the argument rows, what the command runs) and the Studio rendered through
 * `ElementForm` (so it comes lazily from the registry) on a real `CommandStack`, so each edit is
 * checked as one undo step, argument reordering included.
 */
import { CommandStack, commands, type Element, type Json, type ResourceLocation } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import scriptingPlugin, { COMMAND_KIND } from '@msm/plugin-scripting';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groupLabel } from '../../../../src/renderer/src/components/ElementSidebar';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  ARGUMENT_TYPE_LABELS,
  ARGUMENT_TYPES,
  aliasUsages,
  argumentTypeLabel,
  commandRuns,
  commandUsage,
  followEventRename,
  newArgumentName,
  PERMISSION_LABELS,
  permissionOf,
  withArgumentAdded,
  withArgumentMoved,
  withArgumentRemoved,
  withArgumentType,
  withRuns,
} from '../../../../src/renderer/src/studios/scripting/command-model';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
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

const commandKind = scriptingPlugin.contributes.elementKinds?.find(
  (entry) => entry.id === COMMAND_KIND,
) as ElementKind;

const ID = 'demo:give_gems' as ResourceLocation;

const GIVE: Json = {
  format: 1,
  name: 'gems',
  aliases: ['g'],
  permission: 2,
  arguments: [
    { name: 'who', type: 'player' },
    { name: 'count', type: 'integer', min: 1, max: 64 },
    { name: 'note', type: 'text', optional: true },
  ],
  event: 'give',
  events: { give: { actions: [{ type: 'play_sound', sound: 'minecraft:entity.player.levelup' }] } },
  feedback_text: 'Gems given.',
};

function Harness({ stack }: { stack: CommandStack }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === ID);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={commandKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(ID, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

async function renderOnStack(data: Json = GIVE) {
  const subject: Element = element(ID, COMMAND_KIND, data);
  const stack = new CommandStack({
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements: [subject], assets: [] }],
  });
  render(<Harness stack={stack} />);
  const studio = await screen.findByTestId('command-studio');
  const data$ = (): Json =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === ID)?.data ?? null;
  return { stack, data: data$, studio };
}

const argumentNames = (data: Json): string[] =>
  ((data as { arguments?: { name: string }[] }).arguments ?? []).map((entry) => entry.name);

describe('Command Studio helpers', () => {
  it('registers the Command Studio and labels the sidebar groups', () => {
    expect(DISCOVERED_STUDIOS.find((entry) => entry.id === 'msm.scripting.command')).toMatchObject({
      kindId: 'msm:command',
    });
    expect(groupLabel('msm:command')).toBe('Commands');
    expect(groupLabel('msm:creative_tab')).toBe('Creative tabs');
  });

  it('previews the chat line with required and optional arguments', () => {
    expect(commandUsage(GIVE)).toBe('/gems <who> <count> [note]');
    expect(aliasUsages(GIVE)).toEqual(['/g <who> <count> [note]']);
    expect(commandUsage({ name: 'hello' })).toBe('/hello');
    expect(commandUsage({})).toBe('/command');
  });

  it('names every argument type and permission level in plain words', () => {
    expect(ARGUMENT_TYPES).toHaveLength(12);
    for (const type of ARGUMENT_TYPES) {
      expect(ARGUMENT_TYPE_LABELS[type]).toMatch(/^[A-Z]/);
      expect(ARGUMENT_TYPE_LABELS[type]).not.toMatch(/_/);
    }
    expect(argumentTypeLabel('integer')).toBe('A whole number');
    expect(PERMISSION_LABELS[0]).toBe('Every player');
    expect(PERMISSION_LABELS).toHaveLength(5);
    expect(permissionOf(GIVE)).toBe(2);
    expect(permissionOf({})).toBe(0);
  });

  it('adds, removes, moves and retypes argument rows', () => {
    const list = [
      { name: 'a', type: 'word' },
      { name: 'value', type: 'word', optional: true },
    ];
    expect(newArgumentName(list)).toBe('value_2');
    expect(withArgumentAdded(list)[2]).toEqual({ name: 'value_2', type: 'word', optional: true });
    expect(withArgumentAdded([])).toEqual([{ name: 'value', type: 'word' }]);
    expect(withArgumentRemoved(list, 0)).toEqual([list[1]]);
    expect(withArgumentMoved(list, 1, 0).map((entry) => entry.name)).toEqual(['value', 'a']);
    expect(withArgumentMoved(list, 1, 2)).toEqual(list);
    expect(withArgumentType({ name: 'n', type: 'integer', min: 1, max: 3 }, 'word')).toEqual({
      name: 'n',
      type: 'word',
    });
    expect(withArgumentType({ name: 'n', type: 'integer', min: 1 }, 'number')).toEqual({
      name: 'n',
      type: 'number',
      min: 1,
    });
  });

  it('switches what it runs in one edit and follows an event rename', () => {
    expect(commandRuns(GIVE)).toBe('event');
    const asFunction = withRuns(GIVE, 'function');
    expect(asFunction.event).toBeUndefined();
    expect(asFunction.function).toBe('');
    expect(commandRuns(asFunction)).toBe('function');
    const back = withRuns(asFunction, 'event');
    expect(back.event).toBe('give');
    expect(back.function).toBeUndefined();
    const fresh = withRuns({ name: 'home' }, 'event');
    expect(fresh.event).toBe('home');
    expect(fresh.events).toEqual({ home: { actions: [] } });
    expect(commandRuns(withRuns(GIVE, 'nothing'))).toBe('nothing');

    const renamed = { ...(GIVE as object), events: { gift: { actions: [] } } } as Json;
    expect((followEventRename(GIVE, renamed) as { event: string }).event).toBe('gift');
    const added = {
      ...(GIVE as object),
      events: { give: { actions: [] }, more: { actions: [] } },
    } as Json;
    expect(followEventRename(GIVE, added)).toBe(added);
  });
});

describe('Command Studio', () => {
  it('shows the chat line, the argument rows and the plain words', async () => {
    const { studio } = await renderOnStack();
    expect(screen.getByTestId('command-usage').textContent).toBe('/gems <who> <count> [note]');
    expect(screen.getByTestId('command-alias-usages').textContent).toContain('/g <who>');
    const type = screen.getByTestId('command-argument-1-type') as HTMLSelectElement;
    expect(type.value).toBe('integer');
    expect(type.selectedOptions[0]?.textContent).toBe('A whole number');
    expect((screen.getByTestId('command-argument-1-min') as HTMLInputElement).value).toBe('1');
    expect(screen.queryByTestId('command-argument-0-min')).toBeNull();
    expect((screen.getByTestId('command-argument-2-optional') as HTMLInputElement).checked).toBe(
      true,
    );
    const permission = screen.getByTestId('command-permission') as HTMLSelectElement;
    expect(permission.selectedOptions[0]?.textContent).toContain('Operators');
    expect((screen.getByTestId('command-runs') as HTMLSelectElement).value).toBe('event');
    expect((screen.getByTestId('command-feedback') as HTMLInputElement).value).toBe('Gems given.');
    expect(within(studio).getByTestId('msm-events')).toBeTruthy();
    // No Rules trigger for commands in the catalogue yet: the section stays out.
    expect(screen.queryByTestId('rules-slot')).toBeNull();
  });

  it('reorders arguments as one undo step each and updates the preview', async () => {
    const { stack, data } = await renderOnStack();
    act(() => {
      fireEvent.click(screen.getByTestId('command-argument-1-up'));
    });
    expect(argumentNames(data())).toEqual(['count', 'who', 'note']);
    expect(screen.getByTestId('command-usage').textContent).toBe('/gems <count> <who> [note]');
    expect((screen.getByTestId('command-argument-0-up') as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      fireEvent.click(screen.getByTestId('command-argument-0-down'));
    });
    expect(argumentNames(data())).toEqual(['who', 'count', 'note']);
    act(() => stack.undo());
    expect(argumentNames(data())).toEqual(['count', 'who', 'note']);
    act(() => stack.undo());
    expect(argumentNames(data())).toEqual(['who', 'count', 'note']);
    expect(stack.canUndo).toBe(false);
  });

  it('adds, retypes and removes arguments, each one undo step', async () => {
    const { stack, data } = await renderOnStack();
    act(() => {
      fireEvent.click(screen.getByTestId('command-add-argument'));
    });
    expect(argumentNames(data())).toEqual(['who', 'count', 'note', 'value']);
    expect((data() as { arguments: Json[] }).arguments[3]).toEqual({
      name: 'value',
      type: 'word',
      optional: true,
    });
    act(() => {
      fireEvent.change(screen.getByTestId('command-argument-1-type'), {
        target: { value: 'word' },
      });
    });
    expect((data() as { arguments: Json[] }).arguments[1]).toEqual({ name: 'count', type: 'word' });
    act(() => {
      fireEvent.click(screen.getByTestId('command-argument-0-remove'));
    });
    expect(argumentNames(data())).toEqual(['count', 'note', 'value']);
    act(() => stack.undo());
    act(() => stack.undo());
    expect((data() as { arguments: Json[] }).arguments[1]).toEqual({
      name: 'count',
      type: 'integer',
      min: 1,
      max: 64,
    });
    act(() => stack.undo());
    expect(data()).toEqual(GIVE);
  });

  it('writes the name, permission and what it runs at their paths', async () => {
    const { stack, data } = await renderOnStack();
    act(() => {
      fireEvent.change(screen.getByTestId('command-permission'), { target: { value: '0' } });
    });
    expect((data() as { permission?: number }).permission).toBeUndefined();
    act(() => {
      fireEvent.change(screen.getByTestId('command-runs'), { target: { value: 'function' } });
    });
    expect((data() as { event?: string }).event).toBeUndefined();
    expect((data() as { function?: string }).function).toBe('');
    expect(screen.getByTestId('command-everyone-note')).toBeTruthy();
    act(() => stack.undo());
    expect((data() as { event?: string }).event).toBe('give');
    act(() => {
      fireEvent.change(screen.getByTestId('command-name'), { target: { value: 'gem' } });
    });
    expect((data() as { name: string }).name).toBe('gem');
    expect(screen.getByTestId('command-usage').textContent).toBe('/gem <who> <count> [note]');
  });
});
