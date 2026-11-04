// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { templateSummary } from '../../../../src/renderer/src/studios/structures/StructureStudio';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { fakeHost, projectOf, readySchema, renderStudio } from './harness';

afterEach(cleanup);

let schema: SchemaContextState;
beforeAll(async () => {
  schema = await readySchema();
});

const hut = element('demo:hut', 'minecraft:structure_template', {
  size: [3, 2, 1],
  palette: ['minecraft:stone', 'minecraft:oak_planks'],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [2, 0, 0, 1],
  ],
  jigsaws: [
    {
      pos: [1, 1, 0],
      pool: 'demo:streets',
      name: 'demo:door',
      target: 'demo:street',
      final_state: 'minecraft:oak_planks',
      joint: 'rollable',
    },
    {
      pos: [0, 1, 0],
      pool: 'demo:gone',
      name: 'demo:back',
      target: 'demo:street',
      final_state: 'minecraft:air',
      placement_priority: 2,
    },
  ],
});

const streets = element('demo:streets', 'minecraft:worldgen/template_pool', {
  fallback: 'minecraft:empty',
  elements: [],
});

describe('templateSummary', () => {
  it('counts blocks per palette entry', () => {
    expect(templateSummary(hut.data)).toEqual({
      size: [3, 2, 1],
      blocks: 3,
      palette: [
        { state: 'minecraft:stone', count: 2 },
        { state: 'minecraft:oak_planks', count: 1 },
      ],
      jigsaws: 2,
    });
    expect(templateSummary(null)).toEqual({ size: [], blocks: 0, palette: [], jigsaws: 0 });
  });
});

describe('Structure Studio', () => {
  it('shows the size, block count, palette and jigsaw table', () => {
    renderStudio({ project: projectOf(hut, streets), subject: hut, schema });
    const studio = screen.getByTestId('structure-studio');
    const summary = screen.getByTestId('structure-summary');
    expect(summary.textContent).toContain('3 × 2 × 1');
    expect(summary.textContent).toContain('Blocks3');
    expect(within(studio).getByRole('list', { name: 'Palette' }).textContent).toContain(
      'minecraft:oak_planks1',
    );
    const first = screen.getByTestId('structure-jigsaw-0');
    expect(within(first).getByLabelText('Pool')).toHaveProperty('value', 'demo:streets');
    expect(screen.getByTestId('structure-jigsaw-0-pool-status').textContent).toBe('In project');
    expect(screen.getByTestId('structure-jigsaw-1-pool-status').textContent).toBe('Missing');
    // Joint choices come from the schema.
    const joint = within(first).getByRole('combobox', { name: 'Joint' }) as HTMLSelectElement;
    expect(joint.value).toBe('rollable');
    expect([...joint.options].map((option) => option.value)).toEqual(['', 'rollable', 'aligned']);
    const second = screen.getByTestId('structure-jigsaw-1');
    expect(within(second).getByRole('spinbutton', { name: 'Placement priority' })).toHaveProperty(
      'value',
      '2',
    );
  });

  it('edits the jigsaw pool and other fields through onChange', async () => {
    const { onChange } = renderStudio({ project: projectOf(hut, streets), subject: hut, schema });
    const user = userEvent.setup();
    const first = screen.getByTestId('structure-jigsaw-0');
    const pool = within(first).getByLabelText('Pool');
    await user.clear(pool);
    await user.type(pool, 'minecraft:empty{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/jigsaws/0/pool', 'minecraft:empty');
    const target = within(first).getByRole('textbox', { name: 'Target' });
    await user.clear(target);
    await user.type(target, 'demo:lane{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/jigsaws/0/target', 'demo:lane');
    fireEvent.change(within(first).getByRole('combobox', { name: 'Joint' }), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith('/jigsaws/0/joint', undefined);
    const second = screen.getByTestId('structure-jigsaw-1');
    fireEvent.change(within(second).getByRole('spinbutton', { name: 'Selection priority' }), {
      target: { value: '4' },
    });
    expect(onChange).toHaveBeenLastCalledWith('/jigsaws/1/selection_priority', 4, {
      coalesce: 'typing:/jigsaws/1/selection_priority',
    });
    fireEvent.change(within(second).getByRole('spinbutton', { name: 'Placement priority' }), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith('/jigsaws/1/placement_priority', undefined, {
      coalesce: 'typing:/jigsaws/1/placement_priority',
    });
  });

  it('runs Replace from file and the exports through the host', async () => {
    const host = fakeHost();
    renderStudio({ project: projectOf(hut), subject: hut, schema, host });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Replace from file…' }));
    expect(host.replaceFromFile).toHaveBeenCalledWith('demo:hut');
    await user.click(screen.getByTestId('structure-export-nbt'));
    await user.click(screen.getByTestId('structure-export-schem'));
    expect(host.exportStructures.mock.calls).toEqual([['nbt'], ['schem']]);
  });

  it('disables the host actions without a host and shows the schema form behind Advanced', async () => {
    renderStudio({ project: projectOf(hut), subject: hut, schema });
    expect(screen.getByRole('button', { name: 'Replace from file…' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.setup().click(screen.getByTestId('structure-advanced-toggle'));
    expect(screen.getByTestId('schema-form')).toBeTruthy();
    expect(screen.queryByTestId('structure-jigsaw-0')).toBeNull();
  });
});
