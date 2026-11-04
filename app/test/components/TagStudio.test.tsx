// @vitest-environment happy-dom
import type { Json } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTagEntry, TagStudio, writeTagEntry } from '../../src/renderer/src/studios/TagStudio';

afterEach(cleanup);

const suggest = (registry: string, prefix: string): string[] => {
  const ids: Record<string, string[]> = {
    item: ['minecraft:stone', 'minecraft:stick'],
    'tag/item': ['minecraft:logs', 'demo:gems'],
  };
  return (ids[registry] ?? []).filter((id) => id.startsWith(prefix));
};

function renderTag(data: Json) {
  const onChange = vi.fn();
  render(
    <TagStudio
      data={data}
      registry="item"
      onChange={onChange}
      suggest={suggest}
      problems={[{ path: '/values/1', message: 'Unknown item', severity: 'warning' }]}
    />,
  );
  return onChange;
}

describe('tag entries', () => {
  it('reads and writes both entry forms', () => {
    expect(readTagEntry('minecraft:stone')).toEqual({ id: 'minecraft:stone', required: true });
    expect(readTagEntry({ id: '#demo:gems', required: false })).toEqual({
      id: '#demo:gems',
      required: false,
    });
    expect(readTagEntry({ required: false })).toBeUndefined();
    expect(writeTagEntry({ id: 'a:b', required: true })).toBe('a:b');
    expect(writeTagEntry({ id: 'a:b', required: false })).toEqual({ id: 'a:b', required: false });
  });
});

describe('TagStudio', () => {
  it('lists entries with their problems', () => {
    renderTag({ values: ['minecraft:stone', { id: 'demo:ruby', required: false }] });
    expect(screen.getByTestId('tag-studio')).toBeTruthy();
    expect((screen.getByLabelText('Entry 1') as HTMLInputElement).value).toBe('minecraft:stone');
    expect((screen.getByLabelText('Entry 2 optional') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('tag-entry-1').textContent).toContain('Unknown item');
  });

  it('adds an entry, appending to the list', async () => {
    const onChange = renderTag({ replace: false, values: ['minecraft:stone'] });
    const user = userEvent.setup();
    const add = screen.getByTestId('tag-add') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await user.type(screen.getByTestId('tag-new-entry'), '#minecraft:logs');
    await user.click(add);
    expect(onChange).toHaveBeenLastCalledWith('/values/-', '#minecraft:logs');
  });

  it('creates the values list when it is missing', async () => {
    const onChange = renderTag({});
    await userEvent.setup().type(screen.getByTestId('tag-new-entry'), 'minecraft:stick{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/values', ['minecraft:stick']);
  });

  it('removes, reorders and toggles entries', async () => {
    const onChange = renderTag({ values: ['a:one', 'a:two'] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove Entry 1' }));
    expect(onChange).toHaveBeenLastCalledWith('/values/0', undefined);
    await user.click(screen.getByRole('button', { name: 'Move Entry 2 up' }));
    expect(onChange).toHaveBeenLastCalledWith('/values', ['a:two', 'a:one']);
    await user.click(screen.getByLabelText('Entry 2 optional'));
    expect(onChange).toHaveBeenLastCalledWith('/values/1', { id: 'a:two', required: false });
    await user.click(screen.getByTestId('tag-replace'));
    expect(onChange).toHaveBeenLastCalledWith('/replace', true);
  });

  it('renames an entry on Enter', async () => {
    const onChange = renderTag({ values: ['a:one'] });
    const user = userEvent.setup();
    const input = screen.getByLabelText('Entry 1');
    await user.clear(input);
    await user.type(input, 'a:uno{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('/values/0', 'a:uno');
  });

  it('suggests ids, and tags with a # prefix', async () => {
    renderTag({ values: [] });
    const user = userEvent.setup();
    const input = screen.getByTestId('tag-new-entry');
    const options = () =>
      [...document.querySelectorAll(`datalist[id="${input.getAttribute('list')}"] option`)].map(
        (option) => option.getAttribute('value'),
      );
    await user.type(input, 'minecraft:st');
    expect(options()).toEqual(['minecraft:stone', 'minecraft:stick']);
    await user.clear(input);
    await user.type(input, '#');
    expect(options()).toEqual(['#minecraft:logs', '#demo:gems']);
  });
});
