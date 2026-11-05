// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Script Studio (B137b): rendered through `ElementForm` (so the Studio comes from the
 * registry) over the real schema index, with the `msm:script` kind of `@msm/plugin-scripting`
 * and Monaco disabled (the textarea fallback); plus the sidebar group and the `run_script`
 * action of the shared Events editor.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Problem,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import scriptingPlugin, { SCRIPT_KIND } from '@msm/plugin-scripting';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  groupByKind,
  groupOf,
  MODELS_ANIM_GROUP,
  SCRIPTS_GROUP,
} from '../../../../src/renderer/src/components/ElementSidebar';
import {
  ACTIONS,
  ENTITY_ACTIONS,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import { NO_HANDLERS_NOTE } from '../../../../src/renderer/src/studios/blocks-items/EventsEditor';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  SCRIPT_EDIT_DEBOUNCE_MS,
  SCRIPT_SOURCE_COALESCE,
  SCRIPT_SUMMARY_EMPTY,
  SCRIPT_TYPINGS_NOTE,
} from '../../../../src/renderer/src/studios/scripting/ScriptStudio';
import { SCRIPT_STUDIO_ID } from '../../../../src/renderer/src/studios/scripting/studios';
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
beforeEach(() => {
  window.msmNoMonaco = true;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.msmNoMonaco;
});

const kinds: readonly ElementKind[] = [
  ...(scriptingPlugin.contributes.elementKinds ?? []),
  ...(blocksItemsPlugin.contributes.elementKinds ?? []),
];

const kindOf = (id: string): ElementKind => {
  const kind = kinds.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
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

const SCRIPT_LINES = [
  'import { msm } from "msm:runtime";',
  'msm.events.on("block.interact", (e) => {',
  '  msm.log.info(e.block.id);',
  '});',
  'msm.actions.define("demo:glow", (e) => {});',
];

function script(id = 'demo:glow', lines: readonly string[] = SCRIPT_LINES): Element {
  return element(id as ResourceLocation, SCRIPT_KIND, { lines: [...lines] });
}

function renderScript(
  subject: Element,
  options: { problems?: Problem[]; focusPointer?: string | null; onFocused?: () => void } = {},
) {
  const onChange = vi.fn<StudioProps['onChange']>();
  const onFocused = options.onFocused ?? vi.fn();
  const view = render(
    <ElementForm
      project={projectOf(subject)}
      element={subject}
      kind={kindOf(subject.kind)}
      problems={options.problems ?? []}
      schema={schema}
      onChange={onChange}
      focusPointer={options.focusPointer ?? null}
      onFocused={onFocused}
    />,
  );
  return { ...view, onChange, onFocused };
}

const area = (): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: 'Script source' }) as HTMLTextAreaElement;

describe('Script Studio', () => {
  it('is registered for msm:script through the area file', () => {
    const entry = DISCOVERED_STUDIOS.find((studio) => studio.id === SCRIPT_STUDIO_ID);
    expect(entry?.kindId).toBe('msm:script');
    expect(entry?.handlesFocus).toBe(true);
    expect(SCRIPT_STUDIO_ID).toBe('msm.scripting.script');
  });

  it('shows the id, the typings note and the source', () => {
    renderScript(script());
    expect(screen.getByTestId('script-studio')).toBeTruthy();
    expect(screen.getByTestId('script-editor')).toBeTruthy();
    expect(screen.getByTestId('script-id').textContent).toBe('demo:glow');
    expect(screen.getByTestId('script-typings-note').textContent).toBe(
      `Typings: ${SCRIPT_TYPINGS_NOTE}`,
    );
    expect(area().value).toBe(SCRIPT_LINES.join('\n'));
    expect(screen.queryByTestId('schema-form')).toBeNull();
  });

  it('reports a debounced edit as one coalesced /lines change', () => {
    vi.useFakeTimers();
    const { onChange } = renderScript(script());
    fireEvent.change(area(), { target: { value: 'msm.log.info("a");\nmsm.log.info("b");' } });
    act(() => vi.advanceTimersByTime(SCRIPT_EDIT_DEBOUNCE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      '/lines',
      ['msm.log.info("a");', 'msm.log.info("b");'],
      { coalesce: SCRIPT_SOURCE_COALESCE },
    );
    expect(SCRIPT_SOURCE_COALESCE).toBe('script-source');
  });

  it('coalesces typing into one undo step on a real command stack', () => {
    vi.useFakeTimers();
    const id = 'demo:glow' as ResourceLocation;
    const stack = new CommandStack(projectOf(script(id, ['// start'])));
    function Harness() {
      const [, rerender] = useReducer((count: number) => count + 1, 0);
      useEffect(() => stack.subscribe(() => rerender()), []);
      const subject = stack.state.namespaces[0]?.elements[0] as Element;
      return (
        <ElementForm
          project={stack.state}
          element={subject}
          kind={kindOf(SCRIPT_KIND)}
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
    render(<Harness />);
    fireEvent.change(area(), { target: { value: '// start\nm' } });
    act(() => vi.advanceTimersByTime(SCRIPT_EDIT_DEBOUNCE_MS));
    fireEvent.change(area(), { target: { value: '// start\nmsm' } });
    act(() => vi.advanceTimersByTime(SCRIPT_EDIT_DEBOUNCE_MS));
    const lines = (): Json =>
      (stack.state.namespaces[0]?.elements[0]?.data as { lines?: Json } | undefined)?.lines ?? null;
    expect(lines()).toEqual(['// start', 'msm']);
    act(() => {
      stack.undo();
    });
    expect(lines()).toEqual(['// start']);
    expect(area().value).toBe('// start');
  });

  it('lists the session problems with line buttons that focus the line', () => {
    const problems: Problem[] = [
      {
        code: 'typescript.semantic',
        severity: 'warning',
        message: "Property 'nope' does not exist on type 'Msm'.",
        elementId: 'demo:glow' as ResourceLocation,
        path: '/lines/2',
        range: { start: 6, end: 10 },
      },
      {
        code: 'scripting.empty-script',
        severity: 'info',
        message: 'The script is empty.',
        elementId: 'demo:glow' as ResourceLocation,
        path: '/lines',
      },
    ];
    renderScript(script(), { problems });
    const list = screen.getByTestId('script-problems');
    const buttons = within(list).getAllByTestId('problem-line');
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Line 3: Property 'nope' does not exist on type 'Msm'.",
    ]);
    expect(list.textContent).toContain('The script is empty.');
    fireEvent.click(buttons[0] as HTMLElement);
    const text = area();
    expect(document.activeElement).toBe(text);
    const [first = '', second = ''] = SCRIPT_LINES;
    const offset = first.length + 1 + second.length + 1 + 6;
    expect(text.selectionStart).toBe(offset);
  });

  it('focuses the line a Problems navigation asks for and reports it handled', () => {
    const onFocused = vi.fn();
    renderScript(script(), { focusPointer: '/lines/1', onFocused });
    expect(document.activeElement).toBe(area());
    expect(area().selectionStart).toBe((SCRIPT_LINES[0] ?? '').length + 1);
    expect(onFocused).toHaveBeenCalled();
  });

  it('summarises the events and handlers the script registers', () => {
    renderScript(script());
    const summary = screen.getByTestId('script-summary');
    expect(within(summary).getByText('Events and handlers')).toBeTruthy();
    expect(
      within(summary)
        .getAllByTestId('script-summary-event')
        .map((item) => item.textContent),
    ).toEqual(['Event block.interact']);
    expect(
      within(summary)
        .getAllByTestId('script-summary-handler')
        .map((item) => item.textContent),
    ).toEqual(['Handler demo:glow']);
    cleanup();
    renderScript(script('demo:empty', ['// nothing yet']));
    expect(screen.getByTestId('script-summary').textContent).toContain(SCRIPT_SUMMARY_EMPTY);
  });
});

describe('Scripts sidebar group', () => {
  it('groups scripts under "Scripts", after "Models and animations"', () => {
    expect(SCRIPTS_GROUP).toBe('Scripts');
    expect(groupOf('msm:script')).toBe(SCRIPTS_GROUP);
    const groups = groupByKind({
      name: 'demo',
      assets: [],
      elements: [
        script('demo:b'),
        element('demo:m' as ResourceLocation, 'msm:geo_model', {}),
        script('demo:a'),
        element('demo:e' as ResourceLocation, 'msm:entity', {}),
      ],
    });
    const headings = groups.map(([heading]) => heading);
    expect(headings.indexOf(SCRIPTS_GROUP)).toBeGreaterThan(headings.indexOf(MODELS_ANIM_GROUP));
    expect(groups.find(([heading]) => heading === SCRIPTS_GROUP)?.[1].map((e) => e.id)).toEqual([
      'demo:a',
      'demo:b',
    ]);
  });
});

describe('run_script in the Events editor', () => {
  it('is an action of blocks, items and entities with a required handler', () => {
    expect(ACTIONS.find((action) => action.type === 'run_script')).toMatchObject({
      label: 'Run script',
      fields: [{ key: 'handler', type: 'handler', required: true }],
    });
    expect(ENTITY_ACTIONS.some((action) => action.type === 'run_script')).toBe(true);
  });

  function blockWithRunScript(handler: string): Element {
    return element('demo:b' as ResourceLocation, 'msm:block', {
      events: { 'demo:use': { actions: [{ type: 'run_script', handler }] } },
    });
  }

  it("offers the project's defined handlers and free text", () => {
    const block = blockWithRunScript('');
    const project = projectOf(
      block,
      script('demo:glow'),
      script('demo:other', ['msm.actions.define("demo:spark", f);']),
    );
    const onChange = vi.fn<StudioProps['onChange']>();
    render(
      <ElementForm
        project={project}
        element={block}
        kind={kindOf('msm:block')}
        problems={[]}
        schema={schema}
        onChange={onChange}
        focusPointer={null}
        onFocused={vi.fn()}
      />,
    );
    const event = screen.getByTestId('msm-event-demo:use');
    const select = within(event).getByLabelText('demo:use action 1 handler') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'demo:glow',
      'demo:spark',
    ]);
    expect(select.options[0]?.textContent).toBe('(choose a handler)');
    fireEvent.change(select, { target: { value: 'demo:spark' } });
    expect(onChange).toHaveBeenLastCalledWith('/events/demo:use/actions/0/handler', 'demo:spark');

    const text = within(event).getByLabelText('demo:use action 1 handler id') as HTMLInputElement;
    fireEvent.change(text, { target: { value: ' demo:later ' } });
    fireEvent.blur(text);
    expect(onChange).toHaveBeenLastCalledWith('/events/demo:use/actions/0/handler', 'demo:later');
    expect(within(event).queryByText(NO_HANDLERS_NOTE)).toBeNull();
  });

  it('keeps an undefined handler and says when no script defines one', () => {
    const block = blockWithRunScript('demo:missing');
    render(
      <ElementForm
        project={projectOf(block)}
        element={block}
        kind={kindOf('msm:block')}
        problems={[]}
        schema={schema}
        onChange={vi.fn()}
        focusPointer={null}
        onFocused={vi.fn()}
      />,
    );
    const event = screen.getByTestId('msm-event-demo:use');
    const select = within(event).getByLabelText('demo:use action 1 handler') as HTMLSelectElement;
    expect(select.value).toBe('demo:missing');
    expect(within(event).getByText(NO_HANDLERS_NOTE)).toBeTruthy();
  });

  it('adds a run_script action with an empty handler', () => {
    const block = element('demo:b' as ResourceLocation, 'msm:block', {
      events: { 'demo:use': { actions: [] } },
    });
    const onChange = vi.fn<StudioProps['onChange']>();
    render(
      <ElementForm
        project={projectOf(block)}
        element={block}
        kind={kindOf('msm:block')}
        problems={[]}
        schema={schema}
        onChange={onChange}
        focusPointer={null}
        onFocused={vi.fn()}
      />,
    );
    const event = screen.getByTestId('msm-event-demo:use');
    fireEvent.change(within(event).getByLabelText('New action type for demo:use'), {
      target: { value: 'run_script' },
    });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:use' }));
    expect(onChange).toHaveBeenLastCalledWith('/events/demo:use/actions', [
      { type: 'run_script', handler: '' },
    ]);
  });
});
