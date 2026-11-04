// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementSidebar } from '../../src/renderer/src/components/ElementSidebar';
import { sampleProject } from './fixtures';

afterEach(cleanup);

describe('ElementSidebar', () => {
  it('asks for a project when none is open', () => {
    render(
      <ElementSidebar project={null} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText(/No project is open/)).toBeTruthy();
  });

  it('groups elements by namespace, then kind, and lists assets', () => {
    render(
      <ElementSidebar
        project={sampleProject()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const demo = screen.getByRole('region', { name: 'Namespace demo' });
    const kinds = within(demo)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(kinds).toEqual(['minecraft:block_definition', 'minecraft:model', 'Assets']);

    const models = within(demo).getByRole('region', { name: 'demo minecraft:model' });
    expect(
      within(models)
        .getAllByRole('button', { name: /^demo:/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['demo:block/ruby_block', 'demo:item/ruby']);

    const assets = within(demo).getByRole('region', { name: 'demo assets' });
    expect(within(assets).getByText('textures/block/ruby_block.png')).toBeTruthy();

    const empty = screen.getByRole('region', { name: 'Namespace empty' });
    expect(within(empty).getByText('No elements.')).toBeTruthy();
    expect(within(empty).getByText('No assets.')).toBeTruthy();
  });

  it('marks the selection and reports clicks', async () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <ElementSidebar
        project={sampleProject()}
        selectedId="demo:item/ruby"
        onSelect={onSelect}
        onRemove={onRemove}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'demo:item/ruby' }).getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'demo:ruby_block' }).getAttribute('aria-current'),
    ).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'demo:ruby_block' }));
    expect(onSelect).toHaveBeenCalledWith('demo:ruby_block');
    await user.click(screen.getByRole('button', { name: 'Remove demo:item/ruby' }));
    expect(onRemove).toHaveBeenCalledWith('demo:item/ruby');
  });
});
