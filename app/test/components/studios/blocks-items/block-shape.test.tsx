// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio "Shape" section (B226, ADR 0059): presets, custom boxes, "From model" as one
 * undo step, walk-through and see-through toggles, the texture layer hint and the outline
 * preview. Rendered through `ElementForm` over the real schema index; undo runs through a real
 * `CommandStack`, as the session does.
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
import blocksItemsPlugin, { SHAPE_PRESET_BOXES, SHAPE_PRESETS } from '@msm/plugin-blocks-items';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  effectiveBoxes,
  shapeFromModel,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
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

const blockKind = (): ElementKind => {
  const kind = blocksItemsPlugin.contributes.elementKinds?.find(
    (entry) => entry.id === 'msm:block',
  );
  if (kind === undefined) throw new Error('No msm:block kind.');
  return kind;
};

const ID = 'demo:thing' as ResourceLocation;

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

const block = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:block', {
    format: 1,
    display_name: 'Thing',
    model: 'demo:block/thing',
    ...data,
  });

function renderStudio(
  subject: Element,
  project = projectOf(subject),
  wrap?: (n: ReactNode) => ReactNode,
) {
  const onChange = vi.fn<StudioProps['onChange']>();
  const form = (
    <ElementForm
      project={project}
      element={subject}
      kind={blockKind()}
      problems={[]}
      schema={schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
  render(wrap === undefined ? form : wrap(form));
  return { onChange };
}

function StackHarness({ stack }: { stack: CommandStack }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === ID);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={blockKind()}
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

const shapeOf = (stack: CommandStack): Json | undefined => {
  const data = stack.state.namespaces[0]?.elements.find((entry) => entry.id === ID)?.data;
  const components = (data as { components?: Record<string, Json> } | undefined)?.components;
  return components?.['msm:shape'];
};

const lastEdit = (spy: { mock: { lastCall?: unknown[] | undefined } }): unknown[] =>
  spy.mock.lastCall?.slice(0, 2) ?? [];

const previewBoxes = () => screen.getAllByTestId('block-shape-preview-box').length;

describe('Block Studio shape section', () => {
  it('shows a full solid cube without msm:shape', () => {
    renderStudio(block());
    expect((screen.getByTestId('block-shape-preset') as HTMLSelectElement).value).toBe('');
    expect(screen.getByTestId('block-shape-preset-label').textContent).toContain('Full solid cube');
    expect(previewBoxes()).toBe(1);
    expect((screen.getByTestId('block-shape-walk-through') as HTMLInputElement).checked).toBe(
      false,
    );
    expect((screen.getByTestId('block-shape-see-through') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId('block-shape-boxes')).toBeNull();
  });

  for (const preset of SHAPE_PRESETS) {
    it(`picks the ${preset} preset as one edit of the component`, () => {
      const { onChange } = renderStudio(block());
      fireEvent.change(screen.getByTestId('block-shape-preset'), { target: { value: preset } });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(lastEdit(onChange)).toEqual([
        '/components/msm:shape',
        preset === 'custom' ? { preset, boxes: [[0, 0, 0, 16, 16, 16]] } : { preset },
      ]);
    });

    it(`renders the ${preset} preset with its boxes and defaults`, () => {
      renderStudio(
        block({
          components: {
            'msm:shape':
              preset === 'custom'
                ? {
                    preset,
                    boxes: [
                      [0, 0, 0, 8, 8, 8],
                      [8, 8, 8, 16, 16, 16],
                    ],
                  }
                : { preset },
          },
        }),
      );
      expect((screen.getByTestId('block-shape-preset') as HTMLSelectElement).value).toBe(preset);
      const expected = preset === 'custom' ? 2 : SHAPE_PRESET_BOXES[preset].length;
      expect(previewBoxes()).toBe(expected);
      expect((screen.getByTestId('block-shape-walk-through') as HTMLInputElement).checked).toBe(
        preset === 'cross',
      );
      expect((screen.getByTestId('block-shape-see-through') as HTMLInputElement).checked).toBe(
        preset !== 'full',
      );
      expect(screen.queryByTestId('block-shape-boxes') !== null).toBe(preset === 'custom');
    });
  }

  it('switching from custom to a preset drops the written boxes', () => {
    const { onChange } = renderStudio(
      block({
        components: {
          'msm:shape': { preset: 'custom', boxes: [[0, 0, 0, 8, 8, 8]], see_through: false },
        },
      }),
    );
    fireEvent.change(screen.getByTestId('block-shape-preset'), { target: { value: 'carpet' } });
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:shape',
      { preset: 'carpet', see_through: false },
    ]);
    fireEvent.change(screen.getByTestId('block-shape-preset'), { target: { value: '' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:shape', undefined]);
  });

  it('edits, adds and removes custom boxes', () => {
    const stack = new CommandStack(
      projectOf(
        block({ components: { 'msm:shape': { preset: 'custom', boxes: [[0, 0, 0, 16, 8, 16]] } } }),
      ),
    );
    render(<StackHarness stack={stack} />);
    fireEvent.change(screen.getByTestId('block-shape-box-0-4'), { target: { value: '4' } });
    expect(shapeOf(stack)).toEqual({ preset: 'custom', boxes: [[0, 0, 0, 16, 4, 16]] });
    expect(screen.getByLabelText('Box 1 to y')).toBeTruthy();
    expect((screen.getByTestId('block-shape-box-0-remove') as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByTestId('block-shape-add-box'));
    expect(shapeOf(stack)).toEqual({
      preset: 'custom',
      boxes: [
        [0, 0, 0, 16, 4, 16],
        [0, 0, 0, 16, 16, 16],
      ],
    });
    expect(previewBoxes()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove box 1' }));
    expect(shapeOf(stack)).toEqual({ preset: 'custom', boxes: [[0, 0, 0, 16, 16, 16]] });
  });

  it('"From model" reads a slab-parented project model as one undo step', () => {
    const model = element('demo:block/thing' as ResourceLocation, 'minecraft:model', {
      parent: 'minecraft:block/slab',
      textures: { bottom: 'demo:block/thing', top: 'demo:block/thing', side: 'demo:block/thing' },
    });
    const stack = new CommandStack(projectOf(block(), model));
    render(<StackHarness stack={stack} />);
    fireEvent.click(screen.getByTestId('block-shape-from-model'));
    expect(shapeOf(stack)).toEqual({ preset: 'custom', boxes: [[0, 0, 0, 16, 8, 16]] });
    expect((screen.getByTestId('block-shape-preset') as HTMLSelectElement).value).toBe('custom');
    expect(stack.undo()).toBe(true);
    expect(shapeOf(stack)).toBeUndefined();
    expect(stack.canUndo).toBe(false);
  });

  it('"From model" reads a model with its own elements, through a project parent', () => {
    const parent = element('demo:block/base' as ResourceLocation, 'minecraft:model', {
      elements: [
        { from: [0, 0, 0], to: [16, 4, 16], faces: {} },
        { from: [6, 4, 6], to: [10, 20, 10], faces: {} },
        { from: [0, 0, 0], to: [16, 0, 16], faces: {} },
      ],
    });
    const model = element('demo:block/thing' as ResourceLocation, 'minecraft:model', {
      parent: 'demo:block/base',
      textures: { all: 'demo:block/thing' },
    });
    const stack = new CommandStack(
      projectOf(block({ components: { 'msm:shape': { see_through: true } } }), parent, model),
    );
    render(<StackHarness stack={stack} />);
    fireEvent.click(screen.getByTestId('block-shape-from-model'));
    // Clamped to the block; the flat element is dropped; see_through is kept.
    expect(shapeOf(stack)).toEqual({
      preset: 'custom',
      see_through: true,
      boxes: [
        [0, 0, 0, 16, 4, 16],
        [6, 4, 6, 10, 16, 10],
      ],
    });
    expect(previewBoxes()).toBe(2);
    expect(stack.undo()).toBe(true);
    expect(shapeOf(stack)).toEqual({ see_through: true });
    expect(stack.canUndo).toBe(false);
  });

  it('"From model" on a cross is walk-through, and explains an unreadable model', () => {
    const { onChange } = renderStudio(block({ model: 'minecraft:block/cross' }));
    fireEvent.click(screen.getByTestId('block-shape-from-model'));
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:shape',
      { preset: 'custom', boxes: [[2, 0, 2, 14, 16, 14]], collision: false },
    ]);
    cleanup();

    const second = renderStudio(block({ model: 'minecraft:block/anvil' }));
    fireEvent.click(screen.getByTestId('block-shape-from-model'));
    expect(second.onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('block-shape-from-model-error').textContent).toContain(
      'minecraft:block/anvil',
    );
  });

  it('toggles walk-through and see-through against their defaults', () => {
    const { onChange } = renderStudio(block({ components: { 'msm:shape': { preset: 'cross' } } }));
    fireEvent.click(screen.getByTestId('block-shape-walk-through'));
    expect(lastEdit(onChange)).toEqual(['/components/msm:shape/collision', true]);
    // A cross is see-through by default: unticking writes false.
    fireEvent.click(screen.getByTestId('block-shape-see-through'));
    expect(lastEdit(onChange)).toEqual(['/components/msm:shape/see_through', false]);
    cleanup();

    const full = renderStudio(block());
    fireEvent.click(screen.getByTestId('block-shape-see-through'));
    expect(lastEdit(full.onChange)).toEqual(['/components/msm:shape/see_through', true]);
    fireEvent.click(screen.getByTestId('block-shape-walk-through'));
    expect(lastEdit(full.onChange)).toEqual(['/components/msm:shape/collision', false]);
  });

  it('shows the layer the textures give and warns on a solid block', async () => {
    const textureLayers = vi.fn<NonNullable<BlocksItemsStudioHost['textureLayers']>>(async () => [
      { texture: 'demo:block/thing', layer: 'cutout' },
    ]);
    const host: BlocksItemsStudioHost = {
      thumbnail: async () => new Uint8Array(),
      revision: 0,
      paintTexture: () => undefined,
      textureLayers,
    };
    renderStudio(block(), undefined, (form) => (
      <BlocksItemsStudioHostContext.Provider value={host}>
        {form}
      </BlocksItemsStudioHostContext.Provider>
    ));
    await waitFor(() =>
      expect(screen.getByTestId('block-shape-layer-demo:block/thing').textContent).toBe(
        'demo:block/thing: cut-out',
      ),
    );
    expect(textureLayers).toHaveBeenCalledWith('demo:block/thing');
    expect(screen.getByTestId('block-shape-layer-warning')).toBeTruthy();
  });
});

describe('shape helpers', () => {
  it('reads vanilla slab and carpet models by name, and cubes as the full cube', () => {
    const project = projectOf();
    expect(shapeFromModel(project, 'minecraft:block/smooth_stone_slab')).toMatchObject({
      ok: true,
      boxes: [[0, 0, 0, 16, 8, 16]],
    });
    expect(shapeFromModel(project, 'block/oak_slab_top')).toMatchObject({
      ok: true,
      boxes: [[0, 8, 0, 16, 16, 16]],
    });
    expect(shapeFromModel(project, 'minecraft:block/white_carpet')).toMatchObject({
      ok: true,
      boxes: [[0, 0, 0, 16, 1, 16]],
    });
    expect(shapeFromModel(project, 'minecraft:block/cube_all')).toMatchObject({
      ok: true,
      boxes: [[0, 0, 0, 16, 16, 16]],
    });
    expect(shapeFromModel(project, '')).toMatchObject({ ok: false });
  });

  it('gives a preset its own boxes and custom its written ones', () => {
    expect(effectiveBoxes({ preset: 'pillar', boxes: [[0, 0, 0, 1, 1, 1]] })).toEqual([
      [4, 0, 4, 12, 16, 12],
    ]);
    expect(effectiveBoxes({ preset: 'custom', boxes: [[0, 0, 0, 1, 1, 1]] })).toEqual([
      [0, 0, 0, 1, 1, 1],
    ]);
    expect(effectiveBoxes(undefined)).toEqual([[0, 0, 0, 16, 16, 16]]);
  });
});
