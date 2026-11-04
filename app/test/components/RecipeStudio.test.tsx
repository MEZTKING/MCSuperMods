// @vitest-environment happy-dom
import type { Json } from '@msm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompletionSource } from '../../src/renderer/src/forms';
import {
  RECIPE_GRID_COALESCE,
  RecipeStudio,
  recipeLayout,
} from '../../src/renderer/src/studios/RecipeStudio';

afterEach(cleanup);

const completions: CompletionSource = {
  suggest: (registry, prefix) => {
    const ids: Record<string, string[]> = {
      item: ['minecraft:stick', 'minecraft:stone', 'minecraft:diamond'],
      'tag/item': ['minecraft:planks', 'minecraft:logs'],
    };
    return (ids[registry] ?? []).filter((id) => id.startsWith(prefix));
  },
  projectIds: () => [],
};

function renderStudio(data: Json, extra: { children?: React.ReactNode } = {}) {
  const onChange = vi.fn();
  render(
    <RecipeStudio
      data={data}
      onChange={onChange}
      completions={completions}
      problems={[{ path: '/key', message: 'Key problem', severity: 'error' }]}
    >
      {extra.children}
    </RecipeStudio>,
  );
  return onChange;
}

const shaped = {
  type: 'minecraft:crafting_shaped',
  pattern: ['D', 'D', 'S'],
  key: { D: 'minecraft:diamond', S: '#minecraft:planks' },
  result: { id: 'minecraft:diamond_sword', count: 1 },
};

describe('recipeLayout', () => {
  it('maps the supported types with or without a namespace', () => {
    expect(recipeLayout('minecraft:crafting_shaped')).toBe('shaped');
    expect(recipeLayout('crafting_shapeless')).toBe('shapeless');
    expect(recipeLayout('minecraft:campfire_cooking')).toBe('cooking');
    expect(recipeLayout('minecraft:stonecutting')).toBeUndefined();
    expect(recipeLayout(undefined)).toBeUndefined();
  });
});

describe('RecipeStudio', () => {
  it('shows a shaped recipe in the grid with its result and grid problems', () => {
    renderStudio(shaped);
    expect((screen.getByTestId('recipe-cell-0-0') as HTMLInputElement).value).toBe(
      'minecraft:diamond',
    );
    expect((screen.getByTestId('recipe-cell-2-0') as HTMLInputElement).value).toBe(
      '#minecraft:planks',
    );
    expect((screen.getByTestId('recipe-cell-0-1') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('recipe-result') as HTMLInputElement).value).toBe(
      'minecraft:diamond_sword',
    );
    expect(screen.getByText('Key problem')).toBeTruthy();
  });

  it('emits pattern then key in one coalesced step for a cell edit', async () => {
    const onChange = renderStudio(shaped);
    const user = userEvent.setup();
    const cell = screen.getByTestId('recipe-cell-1-1');
    await user.type(cell, 'minecraft:stick{Enter}');
    expect(onChange.mock.calls).toEqual([
      ['/pattern', ['D ', 'DA', 'S '], { coalesce: RECIPE_GRID_COALESCE }],
      [
        '/key',
        { D: 'minecraft:diamond', S: '#minecraft:planks', A: 'minecraft:stick' },
        { coalesce: RECIPE_GRID_COALESCE },
      ],
    ]);
  });

  it('clears a cell and trims the pattern', async () => {
    const onChange = renderStudio(shaped);
    const user = userEvent.setup();
    await user.clear(screen.getByTestId('recipe-cell-2-0'));
    await user.tab();
    expect(onChange).toHaveBeenNthCalledWith(1, '/pattern', ['D', 'D'], {
      coalesce: RECIPE_GRID_COALESCE,
    });
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      '/key',
      { D: 'minecraft:diamond' },
      {
        coalesce: RECIPE_GRID_COALESCE,
      },
    );
  });

  it('offers item and #tag suggestions in the cells', async () => {
    renderStudio(shaped);
    const user = userEvent.setup();
    const cell = screen.getByTestId('recipe-cell-0-2');
    await user.type(cell, '#');
    const listId = cell.getAttribute('list');
    const options = [...document.querySelectorAll(`datalist[id="${listId}"] option`)].map(
      (option) => option.getAttribute('value'),
    );
    expect(options).toEqual(['#minecraft:planks', '#minecraft:logs']);
  });

  it('edits the result id and count', async () => {
    const onChange = renderStudio(shaped);
    const user = userEvent.setup();
    const result = screen.getByTestId('recipe-result');
    await user.clear(result);
    await user.type(result, 'minecraft:stone{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/result/id', 'minecraft:stone');
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    // Controlled by `data`, which this test does not update: set the value in one event.
    fireEvent.change(count, { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith('/result/count', 4);
  });

  it('edits shapeless ingredients', async () => {
    const onChange = renderStudio({
      type: 'minecraft:crafting_shapeless',
      ingredients: ['minecraft:diamond', '#minecraft:logs'],
      result: { id: 'minecraft:emerald' },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('recipe-ingredient-new'), 'minecraft:stick{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/ingredients', [
      'minecraft:diamond',
      '#minecraft:logs',
      'minecraft:stick',
    ]);
    await user.click(screen.getByRole('button', { name: 'Remove ingredient 1' }));
    expect(onChange).toHaveBeenLastCalledWith('/ingredients', ['#minecraft:logs']);
    await user.click(screen.getByRole('button', { name: 'Move ingredient 1 down' }));
    expect(onChange).toHaveBeenLastCalledWith('/ingredients', [
      '#minecraft:logs',
      'minecraft:diamond',
    ]);
  });

  it('edits the cooking fields', async () => {
    const onChange = renderStudio({
      type: 'minecraft:smelting',
      ingredient: 'minecraft:raw_iron',
      result: { id: 'minecraft:iron_ingot' },
      experience: 0.7,
      cookingtime: 200,
    });
    expect((screen.getByTestId('recipe-ingredient') as HTMLInputElement).value).toBe(
      'minecraft:raw_iron',
    );
    const time = screen.getByRole('spinbutton', { name: 'Cooking time (ticks)' });
    fireEvent.change(time, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('/cookingtime', undefined, {
      coalesce: 'typing:/cookingtime',
    });
    fireEvent.change(time, { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith('/cookingtime', 100, {
      coalesce: 'typing:/cookingtime',
    });
  });

  it('gives the cooking result item field a fixed width', () => {
    renderStudio({
      type: 'minecraft:blasting',
      ingredient: 'minecraft:raw_iron',
      result: { id: 'minecraft:iron_ingot' },
    });
    const field = screen.getByTestId('recipe-result');
    // The input fills its wrapper (`w-full`), so the wrapper must carry the width; without
    // it the wrapper shrinks to its content in the flex row.
    expect(field.className).toContain('w-full');
    expect(field.className).not.toContain('w-72');
    const wrapper = field.parentElement as HTMLElement;
    expect(wrapper.className.split(' ')).toEqual(expect.arrayContaining(['w-72', 'max-w-full']));
  });

  it('shows only a notice for other recipe types', () => {
    renderStudio({ type: 'minecraft:stonecutting' }, { children: <p>Schema form</p> });
    expect(screen.getByRole('status').textContent).toContain('minecraft:stonecutting');
    expect(screen.queryByText('Schema form')).toBeNull();
    expect(screen.queryByTestId('recipe-advanced-toggle')).toBeNull();
  });

  it('shows the host schema form when Advanced is on', async () => {
    renderStudio(shaped, { children: <p>Schema form</p> });
    expect(screen.queryByText('Schema form')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('recipe-advanced-toggle'));
    expect(screen.getByText('Schema form')).toBeTruthy();
    expect(screen.queryByTestId('recipe-cell-0-0')).toBeNull();
  });
});
