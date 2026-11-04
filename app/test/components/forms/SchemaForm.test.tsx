// @vitest-environment happy-dom
/// <reference types="node" />
import type { Json } from '@msm/core';
import { type SchemaIndex, type SchemaNode, validateJson } from '@msm/schemas';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type CompletionSource,
  SchemaForm,
  type SchemaFormHandle,
  type SchemaFormProps,
} from '../../../src/renderer/src/forms';
import { schemaIndex } from './schemas';

const MODEL = '::java::assets::model::Model';
const ITEM_DEFINITION = '::java::assets::item_definition::ItemDefinition';
const PACK = '::java::pack::Pack';

let index: SchemaIndex;

beforeAll(async () => {
  index = await schemaIndex();
});
afterEach(cleanup);

function renderForm(
  ref: string | SchemaNode,
  value: Json | undefined,
  extra: Partial<SchemaFormProps> = {},
) {
  const onChange = vi.fn();
  const node = typeof ref === 'string' ? index.resolveSchemaRef(ref) : ref;
  const result = render(<SchemaForm node={node} value={value} onChange={onChange} {...extra} />);
  return { onChange, node, ...result };
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function errorCount(value: Json, node: SchemaNode): number {
  return validateJson(value, node).filter((problem) => problem.severity === 'error').length;
}

describe('SchemaForm over the model schema', () => {
  it('renders parent and the textures map editor', () => {
    renderForm(MODEL, { parent: 'block/cube_all', textures: { all: 'demo:block/ruby' } });
    expect(input('parent').value).toBe('block/cube_all');
    const textures = screen.getByRole('group', { name: 'textures' });
    expect((within(textures).getByLabelText('Key all in textures') as HTMLInputElement).value).toBe(
      'all',
    );
    expect(within(textures).getByLabelText('New key in textures')).toBeTruthy();
  });

  it('coalesces typing per pointer', async () => {
    const { onChange } = renderForm(MODEL, { parent: '' });
    await userEvent.setup().type(input('parent'), 'ab');
    expect(onChange).toHaveBeenLastCalledWith('/parent', 'ab', { coalesce: 'typing:/parent' });
  });

  it('adds a texture entry at /textures/all', async () => {
    const { onChange } = renderForm(MODEL, { textures: {} });
    const user = userEvent.setup();
    const add = screen.getByRole('button', { name: 'Add entry to textures' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await user.type(input('New key in textures'), 'all');
    await user.click(add);
    expect(onChange).toHaveBeenCalledWith('/textures/all', '');
  });

  it('renames and removes map entries', async () => {
    const { onChange } = renderForm(MODEL, { textures: { all: 'a', side: 'b' } });
    const user = userEvent.setup();
    const key = input('Key all in textures');
    await user.clear(key);
    await user.type(key, 'top{Enter}');
    expect(onChange).toHaveBeenCalledWith('/textures', { top: 'a', side: 'b' });
    await user.click(screen.getByRole('button', { name: 'Remove side' }));
    expect(onChange).toHaveBeenCalledWith('/textures/side', undefined);
  });

  it('adds a list item at /elements/- with a valid default', async () => {
    const { onChange } = renderForm(MODEL, { elements: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add item to elements' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [pointer, value] = onChange.mock.calls[0] as [string, Json];
    expect(pointer).toBe('/elements/-');
    expect(errorCount(value, index.resolve('::java::assets::model::ModelElement'))).toBe(0);
  });

  it('moves and removes list items', async () => {
    const a = { from: [0, 0, 0], to: [1, 1, 1], faces: {} };
    const b = { from: [2, 2, 2], to: [3, 3, 3], faces: {} };
    const { onChange } = renderForm(MODEL, { elements: [a, b] });
    const user = userEvent.setup();
    expect(
      (screen.getByRole('button', { name: 'Move elements item 1 up' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Move elements item 1 down' }));
    expect(onChange).toHaveBeenCalledWith('/elements', [b, a]);
    await user.click(screen.getByRole('button', { name: 'Remove elements item 2' }));
    expect(onChange).toHaveBeenCalledWith('/elements/1', undefined);
  });

  it('renders vectors inline and a slider for a bounded number', () => {
    renderForm(MODEL, {
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {},
          light_emission: 4,
          rotation: { origin: [8, 8, 8], axis: 'y', angle: 22.5 },
        },
      ],
    });
    const element = screen.getByRole('group', { name: 'elements item 1' });
    expect((within(element).getByLabelText('to 3') as HTMLInputElement).value).toBe('16');
    const slider = within(element).getByLabelText('light_emission slider') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect([slider.min, slider.max, slider.value]).toEqual(['0', '15', '4']);
    // `angle` is an unbounded float in this target's schema: a number input without slider.
    const rotation = within(element).getByRole('group', { name: 'rotation' });
    expect((within(rotation).getByLabelText('angle') as HTMLInputElement).value).toBe('22.5');
    expect(within(rotation).queryByLabelText('angle slider')).toBeNull();
  });

  it('edits a number with the slider and coalesces', () => {
    const { onChange } = renderForm(MODEL, {
      elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {}, light_emission: 4 }],
    });
    fireEvent.change(screen.getByLabelText('light_emission slider'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith('/elements/0/light_emission', 9, {
      coalesce: 'typing:/elements/0/light_emission',
    });
  });

  it('renders a literal union as a segmented control', async () => {
    const { onChange } = renderForm(MODEL, { gui_light: 'front' });
    const group = screen.getByRole('radiogroup', { name: 'gui_light' });
    const front = within(group).getByRole('radio', { name: 'front' }) as HTMLInputElement;
    expect(front.checked).toBe(true);
    await userEvent.setup().click(within(group).getByRole('radio', { name: 'side' }));
    expect(onChange).toHaveBeenCalledWith('/gui_light', 'side');
  });

  it('adds an optional field from the "Add field" popover', async () => {
    const { onChange } = renderForm(MODEL, {});
    const user = userEvent.setup();
    expect(screen.queryByLabelText('ambientocclusion')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add field to Data' }));
    const list = await screen.findByRole('list', { name: 'Optional fields of Data' });
    await user.click(within(list).getByRole('button', { name: 'ambientocclusion' }));
    expect(onChange).toHaveBeenCalledWith('/ambientocclusion', false);
  });

  it('removes an optional field', async () => {
    const { onChange } = renderForm(MODEL, { ambientocclusion: true });
    const toggle = screen.getByRole('switch', { name: 'ambientocclusion' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    const user = userEvent.setup();
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith('/ambientocclusion', false);
    await user.click(screen.getByRole('button', { name: 'Remove ambientocclusion' }));
    expect(onChange).toHaveBeenCalledWith('/ambientocclusion', undefined);
  });

  it('offers completions for id strings', () => {
    const completions: CompletionSource = {
      suggest: (registry) => (registry === 'model' ? ['minecraft:block/cube_all'] : []),
      projectIds: (kind) => (kind === 'model' ? ['demo:block/base'] : []),
    };
    renderForm(MODEL, { parent: '' }, { completions });
    const list = input('parent').list;
    expect([...(list?.querySelectorAll('option') ?? [])].map((option) => option.value)).toEqual([
      'demo:block/base',
      'minecraft:block/cube_all',
    ]);
  });

  it('renders problems under the matching control and orphans at the struct', () => {
    renderForm(
      MODEL,
      { parent: 'nope', bogus: 1 },
      {
        problems: [
          { path: '/parent', message: 'Unknown model "nope".', severity: 'error' },
          { path: '/bogus', message: 'Unknown field "bogus".', severity: 'warning' },
          { path: '', message: 'Root problem.', severity: 'error' },
        ],
      },
    );
    const parent = input('parent');
    expect(parent.getAttribute('aria-invalid')).toBe('true');
    const field = parent.closest('[data-pointer="/parent"]') as HTMLElement;
    expect(within(field).getByText('Unknown model "nope".')).toBeTruthy();
    expect(screen.getByText('Unknown field "bogus".')).toBeTruthy();
    expect(screen.getByText('Root problem.')).toBeTruthy();
  });

  it('falls back to JSON beyond maxDepth', () => {
    renderForm(
      MODEL,
      { elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {} }] },
      { maxDepth: 1 },
    );
    expect(screen.getByText(/Nested too deeply/)).toBeTruthy();
    expect(screen.getByLabelText('elements item 1 (JSON)')).toBeTruthy();
  });

  it('focuses a pointer, expanding collapsed sections', async () => {
    const ref = createRef<SchemaFormHandle>();
    const value = {
      elements: [
        {
          from: [0, 0, 0],
          to: [1, 1, 1],
          faces: { north: { texture: '#all', uv: [0, 0, 16, 16] } },
        },
      ],
    };
    renderForm(MODEL, value, { ref });
    // faces/north sits at depth 4 and starts collapsed.
    expect(screen.queryByLabelText('texture')).toBeNull();
    let exact = false;
    await act(async () => {
      exact = (await ref.current?.focusPointer('/elements/0/faces/north/texture')) ?? false;
    });
    expect(exact).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('texture'));
  });
});

describe('SchemaForm unions', () => {
  it('infers and switches the variant of a text component', async () => {
    const { onChange } = renderForm(PACK, { pack: { description: { translate: 'pack.desc' } } });
    const picker = input('description variant') as unknown as HTMLSelectElement;
    const selected = picker.options[picker.selectedIndex]?.textContent ?? '';
    expect(selected).toContain('translatable');
    expect(input('translate').value).toBe('pack.desc');
    const stringOption = [...picker.options].find((option) => option.textContent === 'string');
    await userEvent.setup().selectOptions(picker, stringOption?.value ?? '');
    expect(onChange).toHaveBeenCalledWith('/pack/description', '');
  });

  it('hides hidden paths', () => {
    renderForm(
      PACK,
      { pack: { description: 'Demo', pack_format: 1 } },
      { hiddenPaths: ['/pack/pack_format', '/pack/min_format'] },
    );
    expect(screen.queryByText('pack_format')).toBeNull();
    expect(input('description').value).toBe('Demo');
    // Hidden optional fields are not offered by "Add field" either.
    expect(screen.queryByText('min_format')).toBeNull();
  });
});

describe('SchemaForm dispatchers', () => {
  it('picks the item model type from the dispatcher keys and shows its fields', async () => {
    const node = index.resolveSchemaRef(ITEM_DEFINITION);
    const { onChange } = renderForm(node, {
      model: { type: 'minecraft:model', model: 'demo:item/ruby' },
    });
    const type = input('type') as unknown as HTMLSelectElement;
    const keys = index.dispatcherKeys('minecraft:item_model').filter((key) => !key.startsWith('%'));
    expect([...type.options].map((option) => option.textContent)).toEqual(keys);
    expect(type.options[type.selectedIndex]?.textContent).toBe('model');
    const model = screen.getByRole('group', { name: 'model' });
    expect((within(model).getByLabelText('model') as HTMLInputElement).value).toBe(
      'demo:item/ruby',
    );

    await userEvent.setup().selectOptions(type, String(keys.indexOf('composite')));
    const [pointer, value] = onChange.mock.calls.at(-1) as [string, Json];
    expect(pointer).toBe('/model');
    expect(value).toMatchObject({ type: 'composite' });
    expect(value).not.toHaveProperty('model');
    expect(errorCount({ model: value }, node)).toBe(0);
  });

  it('warns about an unknown dispatcher key and offers JSON', () => {
    renderForm(ITEM_DEFINITION, { model: { type: 'demo:bogus' } });
    expect(screen.getByRole('status').textContent).toMatch(/Unknown minecraft:item_model type/);
    expect(screen.getByLabelText('model (JSON)')).toBeTruthy();
  });
});

describe('SchemaForm fallbacks', () => {
  it('renders an unsupported node as an inline JSON editor', async () => {
    const node: SchemaNode = { kind: 'unsupported', reason: 'not modelled', rawKind: 'mystery' };
    const { onChange } = renderForm(node, { a: 1 }, { rootLabel: 'Mystery' });
    expect(screen.getByText(/cannot edit this part of the schema \(not modelled\)/)).toBeTruthy();
    const textarea = screen.getByLabelText('Mystery (JSON)');
    const user = userEvent.setup();
    await user.clear(textarea);
    await user.type(textarea, '{{"b": 2}');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith('', { b: 2 });
    await user.type(textarea, ',');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert').textContent).toMatch(/^Invalid JSON/);
  });

  it('offers JSON for a value of the wrong shape', () => {
    renderForm(MODEL, { textures: 'oops' });
    expect(screen.getByText(/Expected object but found string/)).toBeTruthy();
  });
});
