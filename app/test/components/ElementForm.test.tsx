// @vitest-environment happy-dom
import type { Element, Problem } from '@msm/core';
import { dataPackKinds } from '@msm/plugin-datapack';
import { langKind, modelKind, packMcmetaKind } from '@msm/plugin-resourcepack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ElementForm,
  type ElementFormProps,
  focusedLine,
  functionProblems,
  recipeCategories,
} from '../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element, sampleProject } from './fixtures';
import { schemaIndex } from './forms/schemas';

afterEach(cleanup);

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: {},
      registries: () => registries,
    },
  };
});

function renderForm(subject: Element, overrides: Partial<ElementFormProps> = {}) {
  const props: ElementFormProps = {
    project: sampleProject(),
    element: subject,
    kind: [modelKind, langKind, packMcmetaKind].find((kind) => kind.id === subject.kind),
    problems: [],
    schema,
    onChange: vi.fn(),
    focusPointer: null,
    onFocused: vi.fn(),
    ...overrides,
  };
  render(<ElementForm {...props} />);
  return props;
}

const model = element('demo:block/ruby_block', 'minecraft:model', {
  parent: 'minecraft:block/cube_all',
  textures: { all: 'demo:block/ruby_block' },
});

function textureInput(): HTMLInputElement {
  const field = document.querySelector('[data-pointer="/textures/all"]');
  const input = field?.querySelector('input[type="text"]:not([aria-label^="Key "])');
  if (!(input instanceof HTMLInputElement)) throw new Error('No /textures/all input.');
  return input;
}

describe('ElementForm', () => {
  it('edits through pointers with typing coalesced', async () => {
    const props = renderForm(model);
    expect(screen.getByTestId('schema-form')).toBeTruthy();
    const user = userEvent.setup();
    await user.type(textureInput(), 'x');
    expect(props.onChange).toHaveBeenLastCalledWith('/textures/all', 'demo:block/ruby_blockx', {
      coalesce: 'typing:/textures/all',
    });
  });

  it('shows problems under the field and focuses a requested pointer', async () => {
    const problem: Problem = {
      severity: 'error',
      code: 'schema.type',
      elementId: model.id,
      path: '/textures/all',
      message: 'Texture is wrong.',
    };
    const props = renderForm(model, { problems: [problem], focusPointer: '/textures/all' });
    expect(screen.getByText('Texture is wrong.')).toBeTruthy();
    await waitFor(() => expect(props.onFocused).toHaveBeenCalled());
    // The form focuses the entry's value control, not the map key input.
    expect(document.activeElement).toBe(textureInput());
  });

  it('says when the schemas failed to load', () => {
    renderForm(model, { schema: { status: 'failed', message: 'boom' } });
    expect(screen.getByRole('alert').textContent).toMatch(/boom/);
  });

  it('wraps language files with search and Add key', async () => {
    const lang = element('demo:en_us', 'minecraft:lang', {
      'block.demo.ruby_block': 'Ruby Block',
      'item.demo.ruby': 'Ruby',
    });
    const props = renderForm(lang);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('lang-search'), 'item.demo.sapphire');
    expect(screen.getByText(/2 key\(s\), 0 shown/)).toBeTruthy();
    await user.click(screen.getByTestId('lang-add-key'));
    expect(props.onChange).toHaveBeenCalledWith('/item.demo.sapphire', '');
  });

  it('shows pack settings with the target and hides pack formats', () => {
    const pack = element('demo:pack', 'minecraft:pack_mcmeta', {
      pack: { description: 'Demo', pack_format: 1 },
    });
    renderForm(pack);
    expect(screen.getByTestId('pack-target').textContent).toContain(target.id);
    expect(document.querySelector('[data-pointer="/pack/description"]')).not.toBeNull();
    expect(document.querySelector('[data-pointer="/pack/pack_format"]')).toBeNull();
  });
});

describe('ElementForm Studio routing', () => {
  const kindOf = (id: string) => dataPackKinds.find((kind) => kind.id === id);
  const shaped = element('demo:ruby_block', 'minecraft:recipe', {
    type: 'minecraft:crafting_shaped',
    pattern: ['#'],
    key: { '#': 'minecraft:emerald' },
    result: { id: 'minecraft:emerald_block', count: 1 },
  });

  it('shows the Recipe Studio for shaped recipes, with the schema form behind Advanced', async () => {
    renderForm(shaped, { kind: kindOf('minecraft:recipe') });
    expect(screen.getByTestId('recipe-studio')).toBeTruthy();
    expect(screen.queryByTestId('schema-form')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('recipe-advanced-toggle'));
    expect(screen.getByTestId('schema-form')).toBeTruthy();
  });

  it('keeps the schema form for recipe types the Studio does not edit', () => {
    const other = element('demo:trim', 'minecraft:recipe', {
      type: 'minecraft:smithing_trim',
    });
    renderForm(other, { kind: kindOf('minecraft:recipe') });
    expect(screen.queryByTestId('recipe-studio')).toBeNull();
    expect(screen.getByTestId('schema-form')).toBeTruthy();
  });

  it('makes each grid edit its own undo step (per-gesture coalescing keys)', async () => {
    const props = renderForm(shaped, { kind: kindOf('minecraft:recipe') });
    const user = userEvent.setup();
    for (const cell of ['recipe-cell-0-1', 'recipe-cell-0-2']) {
      const input = screen.getByTestId(cell);
      await user.click(input);
      await user.type(input, 'minecraft:emerald{Enter}');
    }
    const keys = vi
      .mocked(props.onChange)
      .mock.calls.map((call) => call[2]?.coalesce)
      .filter((key): key is string => key?.startsWith('recipe-grid') === true);
    expect(keys.length).toBeGreaterThanOrEqual(4);
    // `pattern` and `key` of one edit share a key; the next edit gets another.
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBeGreaterThanOrEqual(2);
  });

  it('derives the recipe categories from the schema', async () => {
    const node = (await schemaIndex()).resolveSchemaRef('resource:recipe');
    const categories = recipeCategories(node, shaped.data);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain('misc');
  });

  it('shows the Tag Studio for tag kinds', () => {
    const tag = element('demo:gems', 'minecraft:tag/item', { values: ['minecraft:emerald'] });
    renderForm(tag, { kind: kindOf('minecraft:tag/item') });
    expect(screen.getByTestId('tag-studio')).toBeTruthy();
    expect(screen.getByTestId('tag-entry-0')).toBeTruthy();
  });

  it('shows the function editor with line problems and focuses a navigated line', async () => {
    window.msmNoMonaco = true;
    const fn = element('demo:greet', 'minecraft:function', { lines: ['say hi', 'bogus'] });
    const problem: Problem = {
      severity: 'error',
      code: 'mcfunction.parse',
      message: 'Expected a command.',
      elementId: 'demo:greet',
      path: '/lines/1',
      range: { start: 0, end: 5 },
    };
    const props = renderForm(fn, {
      kind: kindOf('minecraft:function'),
      problems: [problem],
      focusPointer: '/lines/1',
    });
    const editor = (await screen.findByTestId('function-editor-fallback')) as HTMLTextAreaElement;
    expect(screen.getByText(/Line 2: Expected a command/)).toBeTruthy();
    await waitFor(() => expect(props.onFocused).toHaveBeenCalled());
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe('say hi\n'.length);
  });

  it('maps pointers and problems for the function editor', () => {
    expect(focusedLine('/lines/3')).toEqual({ line: 3 });
    expect(focusedLine('/lines')).toBeNull();
    expect(focusedLine(null)).toBeNull();
    expect(
      functionProblems([
        {
          severity: 'warning',
          code: 'x',
          message: 'm',
          path: '/lines/0',
          range: { start: 1, end: 2 },
        },
      ]),
    ).toEqual([
      { path: '/lines/0', message: 'm', severity: 'warning', range: { start: 1, end: 2 } },
    ]);
  });
});
