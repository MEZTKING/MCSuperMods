// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementSidebar } from '../../src/renderer/src/components/ElementSidebar';
import { element, sampleProject } from './fixtures';

afterEach(cleanup);

describe('ElementSidebar', () => {
  it('asks for a project when none is open', () => {
    render(
      <ElementSidebar project={null} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText(/No project is open/)).toBeTruthy();
  });

  it('lists recent projects in the empty state with Open buttons', async () => {
    const onOpenRecent = vi.fn();
    const onRemoveRecent = vi.fn();
    render(
      <ElementSidebar
        project={null}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        recentProjects={[
          { root: '/p/beta', name: 'Beta', openedAt: '2', exists: true },
          { root: '/p/alpha', name: 'Alpha', openedAt: '1', exists: false },
        ]}
        onOpenRecent={onOpenRecent}
        onRemoveRecent={onRemoveRecent}
      />,
    );
    const list = screen.getByTestId('recent-projects');
    expect(screen.getByRole('heading', { name: 'Recent projects' })).toBeTruthy();
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'recent-row-0',
      'recent-row-1',
    ]);
    const first = screen.getByTestId('recent-row-0');
    expect(within(first).getByText('Beta')).toBeTruthy();
    expect(within(first).getByText('/p/beta')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(first).getByRole('button', { name: 'Open Beta' }));
    expect(onOpenRecent).toHaveBeenCalledWith('/p/beta');

    const missing = screen.getByTestId('recent-row-1');
    expect(within(missing).getByText('(missing)')).toBeTruthy();
    const open = within(missing).getByRole('button', {
      name: 'Open Alpha (missing)',
    }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    await user.click(screen.getByTestId('recent-remove-1'));
    expect(onRemoveRecent).toHaveBeenCalledWith('/p/alpha');
  });

  it('shows no recent list when it is empty or a project is open', () => {
    const { rerender } = render(
      <ElementSidebar project={null} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByTestId('recent-projects')).toBeNull();
    rerender(
      <ElementSidebar
        project={sampleProject()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        recentProjects={[{ root: '/p/a', name: 'A', openedAt: '1', exists: true }]}
      />,
    );
    expect(screen.queryByTestId('recent-projects')).toBeNull();
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

describe('ElementSidebar tags', () => {
  it('groups every tag kind under one Tags heading, by registry then id', () => {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    demo.elements.push(
      element('demo:stones', 'minecraft:tag/item'),
      element('demo:gems', 'minecraft:tag/item'),
      element('demo:ores', 'minecraft:tag/block'),
    );
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    const region = screen.getByRole('region', { name: 'Namespace demo' });
    const headings = within(region)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings.filter((text) => text?.includes('tag'))).toEqual([]);
    expect(headings).toContain('Tags');
    const tags = within(region).getByRole('region', { name: 'demo Tags' });
    const rows = within(tags).getAllByRole('button', { name: /^demo:/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'demo:ores',
      'demo:gems',
      'demo:stones',
    ]);
    expect(rows[0]?.textContent).toBe('blockores');
  });
});

describe('ElementSidebar worldgen and structures', () => {
  it('groups worldgen kinds and dimensions under Worldgen, structure templates under Structures', () => {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    demo.elements.push(
      element('demo:plains_plus', 'minecraft:worldgen/biome'),
      element('demo:village/start', 'minecraft:worldgen/template_pool'),
      element('demo:sky', 'minecraft:dimension'),
      element('demo:hut', 'minecraft:structure_template'),
      element('demo:biomes', 'minecraft:tag/worldgen/biome'),
    );
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    const region = screen.getByRole('region', { name: 'Namespace demo' });
    const headings = within(region)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Structures', 'Tags', 'Worldgen']));
    expect(
      headings.filter((text) => text?.includes('worldgen') || text?.includes('dimension')),
    ).toEqual([]);
    const worldgen = within(region).getByRole('region', { name: 'demo Worldgen' });
    const rows = within(worldgen).getAllByRole('button', { name: /^demo:/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      'dimensionsky',
      'biomeplains_plus',
      'template_poolvillage/start',
    ]);
    const structures = within(region).getByRole('region', { name: 'demo Structures' });
    expect(within(structures).getByRole('button', { name: 'demo:hut' }).textContent).toBe('hut');
    const tags = within(region).getByRole('region', { name: 'demo Tags' });
    expect(within(tags).getByRole('button', { name: 'demo:biomes' }).textContent).toBe(
      'worldgen/biomebiomes',
    );
  });
});

describe('ElementSidebar entities and models', () => {
  it('groups entities under Entities, geo models and animations under Models and animations', () => {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    demo.elements.push(
      element('demo:gloom', 'msm:entity'),
      element('demo:entity/gloom', 'msm:geo_model'),
      element('demo:entity/gloom_animations', 'msm:animation'),
    );
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    const region = screen.getByRole('region', { name: 'Namespace demo' });
    const headings = within(region)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Entities', 'Models and animations']));
    expect(headings.filter((text) => text?.startsWith('msm:'))).toEqual([]);
    const entities = within(region).getByRole('region', { name: 'demo Entities' });
    expect(within(entities).getByRole('button', { name: 'demo:gloom' }).textContent).toBe('gloom');
    const models = within(region).getByRole('region', { name: 'demo Models and animations' });
    expect(
      within(models)
        .getAllByRole('button', { name: /^demo:/ })
        .map((row) => row.textContent),
    ).toEqual(['animationentity/gloom_animations', 'modelentity/gloom']);
  });
});
