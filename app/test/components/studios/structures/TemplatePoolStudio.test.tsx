// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { fakeHost, projectOf, readySchema, renderStudio } from './harness';

afterEach(cleanup);

let schema: SchemaContextState;
beforeAll(async () => {
  schema = await readySchema();
});

const startPool = element('demo:start', 'minecraft:worldgen/template_pool', {
  fallback: 'minecraft:empty',
  elements: [
    {
      weight: 2,
      element: {
        element_type: 'minecraft:single_pool_element',
        location: 'demo:hut',
        processors: 'minecraft:empty',
        projection: 'rigid',
      },
    },
    { weight: 1, element: { element_type: 'minecraft:empty_pool_element' } },
  ],
});

const hut = element('demo:hut', 'minecraft:structure_template', {
  size: [1, 1, 1],
  palette: ['minecraft:stone'],
  blocks: [[0, 0, 0, 0]],
  jigsaws: [
    {
      pos: [0, 0, 0],
      pool: 'demo:start',
      name: 'demo:door',
      target: 'demo:door',
      final_state: 'minecraft:stone',
    },
    {
      pos: [0, 0, 0],
      pool: 'minecraft:village/plains/streets',
      name: 'demo:street',
      target: 'minecraft:street',
      final_state: 'minecraft:stone',
    },
    {
      pos: [0, 0, 0],
      pool: 'demo:missing',
      name: 'demo:lost',
      target: 'demo:any',
      final_state: 'minecraft:stone',
    },
  ],
});

const castle = element('demo:castle', 'minecraft:worldgen/structure', { start_pool: 'demo:start' });

describe('Template Pool Studio', () => {
  it('is chosen for template pools and shows the fallback and pieces', () => {
    renderStudio({ project: projectOf(startPool, hut), subject: startPool, schema });
    const studio = screen.getByTestId('pool-studio');
    expect(within(studio).getByLabelText('Fallback pool')).toHaveProperty(
      'value',
      'minecraft:empty',
    );
    expect(screen.getByTestId('pool-fallback-status').textContent).toBe('Vanilla');
    expect(within(studio).getByRole('list', { name: 'Pieces' })).toBeTruthy();
    const first = screen.getByTestId('pool-piece-0');
    expect(within(first).getByRole('spinbutton', { name: 'Weight' })).toHaveProperty('value', '2');
    expect(within(first).getByLabelText('Location')).toHaveProperty('value', 'demo:hut');
    expect(within(first).getByLabelText('Processors')).toBeTruthy();
    // Projection values come from the schema enum.
    const projection = within(first).getByRole('combobox', { name: 'Projection' });
    expect([...(projection as HTMLSelectElement).options].map((option) => option.value)).toEqual(
      expect.arrayContaining(['rigid', 'terrain_matching']),
    );
    // Element types: the schema's dispatcher keys plus the vanilla registry.
    const type = within(first).getByRole('combobox', { name: 'Element type' });
    expect([...(type as HTMLSelectElement).options].map((option) => option.value)).toEqual([
      'minecraft:empty_pool_element',
      'minecraft:feature_pool_element',
      'minecraft:legacy_single_pool_element',
      'minecraft:list_pool_element',
      'minecraft:single_pool_element',
    ]);
    // An empty pool element has no location, processors or projection.
    const second = screen.getByTestId('pool-piece-1');
    expect(within(second).queryByLabelText('Location')).toBeNull();
    expect(within(second).queryByRole('combobox', { name: 'Projection' })).toBeNull();
  });

  it('edits a weight, the element type, the location and the fallback through onChange', async () => {
    const { onChange } = renderStudio({
      project: projectOf(startPool, hut),
      subject: startPool,
      schema,
    });
    const first = screen.getByTestId('pool-piece-0');
    fireEvent.change(within(first).getByRole('spinbutton', { name: 'Weight' }), {
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenLastCalledWith('/elements/0/weight', 5, {
      coalesce: 'typing:/elements/0/weight',
    });
    fireEvent.change(within(first).getByRole('combobox', { name: 'Element type' }), {
      target: { value: 'minecraft:legacy_single_pool_element' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      '/elements/0/element/element_type',
      'minecraft:legacy_single_pool_element',
    );
    const user = userEvent.setup();
    const location = within(first).getByLabelText('Location');
    await user.clear(location);
    await user.type(location, 'demo:other{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/elements/0/element/location', 'demo:other');
    const fallback = screen.getByLabelText('Fallback pool');
    await user.clear(fallback);
    await user.type(fallback, 'demo:start{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/fallback', 'demo:start');
  });

  it('adds, moves and removes pieces', async () => {
    const { onChange } = renderStudio({
      project: projectOf(startPool, hut),
      subject: startPool,
      schema,
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('pool-add-piece'));
    expect(onChange).toHaveBeenLastCalledWith(
      '/elements/-',
      expect.objectContaining({ weight: 1, element: expect.any(Object) }),
    );
    await user.click(screen.getByRole('button', { name: 'Move Piece 1 down' }));
    expect(onChange.mock.lastCall?.[0]).toBe('/elements');
    const moved = (onChange.mock.lastCall?.[1] ?? []) as { weight: number }[];
    expect(moved.map((piece) => piece.weight)).toEqual([1, 2]);
    await user.click(screen.getByRole('button', { name: 'Remove Piece 2' }));
    expect(onChange).toHaveBeenLastCalledWith('/elements/1', undefined);
  });

  it('renders connection statuses and the users with go-to buttons', async () => {
    const host = fakeHost();
    renderStudio({ project: projectOf(startPool, hut, castle), subject: startPool, schema, host });
    const connections = screen.getByRole('region', { name: 'Connections' });
    expect(within(connections).getByRole('table')).toBeTruthy();
    const rows = [0, 1, 2].map((n) => screen.getByTestId(`pool-connection-${n}`));
    expect(rows.map((row) => row.querySelector('[data-status]')?.textContent)).toEqual([
      'In project',
      'Vanilla',
      'Missing',
    ]);
    expect(rows.map((row) => row.querySelector('[data-target-found]')?.textContent)).toEqual([
      'demo:door found',
      'Not checked',
      'Not checked',
    ]);
    const usedBy = screen.getByTestId('pool-used-by');
    expect(within(usedBy).getByRole('heading', { name: 'Used by' })).toBeTruthy();
    await userEvent
      .setup()
      .click(within(usedBy).getByRole('button', { name: 'Go to demo:castle' }));
    expect(host.openElement).toHaveBeenCalledWith('demo:castle');
    // The pool's own jigsaw targets it, so it uses itself.
    expect(within(usedBy).getByRole('button', { name: 'Go to demo:start' })).toBeTruthy();
  });

  it('shows the schema form behind the Advanced toggle', async () => {
    renderStudio({ project: projectOf(startPool), subject: startPool, schema });
    expect(screen.queryByTestId('schema-form')).toBeNull();
    expect(screen.getByText(/No piece of this pool is a structure template/)).toBeTruthy();
    expect(screen.getByText('Nothing in the project uses this pool.')).toBeTruthy();
    await userEvent.setup().click(screen.getByTestId('pool-advanced-toggle'));
    expect(screen.getByTestId('schema-form')).toBeTruthy();
    expect(screen.queryByTestId('pool-piece-0')).toBeNull();
  });
});
