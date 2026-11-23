// @vitest-environment happy-dom

import type { Element } from '@msm/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ElementSidebar,
  groupLabel,
  groupOf,
  matchesSearch,
  searchElements,
} from '../../src/renderer/src/components/ElementSidebar';
import { element, sampleProject } from './fixtures';

afterEach(cleanup);

/** A group heading's label (its first span), without the kind id and the count. */
const headingLabel = (heading: HTMLElement): string | null =>
  heading.querySelector('button span')?.textContent ?? heading.textContent;

/** The element ids of the rows under `root`, in order (rows name things, never ids: ADR 0130 D4). */
const idsOf = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLElement>('[data-testid^="element-row-"]')].map((row) =>
    (row.dataset.testid ?? '').slice('element-row-'.length),
  );
/** The sub-headings (level 4) under `root`, in order. */
const subHeadingsOf = (root: HTMLElement): string[] =>
  within(root)
    .queryAllByRole('heading', { level: 4 })
    .map((heading) => heading.textContent ?? '');
/** The rows under `root`, in order. */
const rowsOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>('[data-testid^="element-row-"]'),
];

describe('ElementSidebar', () => {
  it('asks for a project when none is open', () => {
    render(
      <ElementSidebar project={null} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText('No mod is open. Start one or open one from Home.')).toBeTruthy();
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
    const demo = screen.getByRole('region', { name: 'demo' });
    const kinds = within(demo).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(kinds).toEqual(['Block states', 'Models', 'Pictures and sounds']);

    const models = within(demo).getByRole('region', { name: 'demo Models' });
    expect(idsOf(models)).toEqual(['demo:block/ruby_block', 'demo:item/ruby']);

    const assets = within(demo).getByRole('region', { name: 'demo Pictures and sounds' });
    expect(within(assets).getByText('Ruby block')).toBeTruthy();
    // The test setup starts every More options open: the paths show.
    expect(within(assets).getByText('textures/block/ruby_block.png')).toBeTruthy();

    const empty = screen.getByRole('region', { name: 'empty' });
    expect(within(empty).getByText('Nothing here yet.')).toBeTruthy();
    expect(within(empty).getByText('No pictures or sounds yet.')).toBeTruthy();
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
    expect(screen.getByTestId('element-row-demo:item/ruby').getAttribute('aria-current')).toBe(
      'true',
    );
    expect(
      screen.getByTestId('element-row-demo:ruby_block').getAttribute('aria-current'),
    ).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('element-row-demo:ruby_block'));
    expect(onSelect).toHaveBeenCalledWith('demo:ruby_block');
    await user.click(screen.getByRole('button', { name: 'Remove Ruby' }));
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
    const region = screen.getByRole('region', { name: 'demo' });
    const headings = within(region).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(headings.filter((text) => text?.includes('tag'))).toEqual([]);
    expect(headings).toContain('Tags');
    const tags = within(region).getByRole('region', { name: 'demo Tags' });
    const rows = rowsOf(tags);
    expect(idsOf(tags)).toEqual(['demo:ores', 'demo:gems', 'demo:stones']);
    // The name only; the kind words are small sub-headings above the rows.
    expect(rows.map((row) => row.textContent)).toEqual(['Ores', 'Gems', 'Stones']);
    expect(subHeadingsOf(tags)).toEqual(['Block tags', 'Item tags']);
  });
});

describe('ElementSidebar worldgen and structures', () => {
  it('groups worldgen kinds and dimensions under World generation, structure templates under Structures', () => {
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
    const region = screen.getByRole('region', { name: 'demo' });
    const headings = within(region).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(headings).toEqual(expect.arrayContaining(['Structures', 'Tags', 'World generation']));
    expect(
      headings.filter((text) => text?.includes('worldgen') || text?.includes('dimension')),
    ).toEqual([]);
    // The group's key, and so its test id, stays.
    expect(within(region).getByTestId('group-toggle-demo-Worldgen')).toBeTruthy();
    const worldgen = within(region).getByRole('region', { name: 'demo World generation' });
    expect(rowsOf(worldgen).map((row) => row.textContent)).toEqual(['Sky', 'Plains plus', 'Start']);
    expect(subHeadingsOf(worldgen)).toEqual(['Dimensions', 'Biomes', 'Building pools']);
    const structures = within(region).getByRole('region', { name: 'demo Structures' });
    expect(within(structures).getByTestId('element-row-demo:hut').textContent).toBe('Hut');
    const tags = within(region).getByRole('region', { name: 'demo Tags' });
    expect(within(tags).getByTestId('element-row-demo:biomes').textContent).toBe('Biomes');
    expect(subHeadingsOf(tags)).toEqual(['Biome tags']);
  });
});

describe('ElementSidebar entities and models', () => {
  it('groups entities under Mobs, geo models and animations under Models and animations', () => {
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
    const region = screen.getByRole('region', { name: 'demo' });
    const headings = within(region).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(headings).toEqual(expect.arrayContaining(['Mobs', 'Models and animations']));
    expect(headings.filter((text) => text?.startsWith('msm:'))).toEqual([]);
    expect(within(region).getByTestId('group-toggle-demo-Entities')).toBeTruthy();
    const entities = within(region).getByRole('region', { name: 'demo Mobs' });
    expect(within(entities).getByTestId('element-row-demo:gloom').textContent).toBe('Gloom');
    const models = within(region).getByRole('region', { name: 'demo Models and animations' });
    expect(rowsOf(models).map((row) => row.textContent)).toEqual(['Gloom animations', 'Gloom']);
    expect(subHeadingsOf(models)).toEqual(['Animations', 'Models']);
  });
});

describe('ElementSidebar status effects (ADR 0055)', () => {
  it('groups msm:effect elements under Status effects', () => {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    demo.elements.push(element('demo:frost_bite', 'msm:effect'));
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    const region = screen.getByRole('region', { name: 'demo' });
    const headings = within(region).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(headings).toContain('Status effects');
    const effects = within(region).getByRole('region', { name: 'demo Status effects' });
    expect(within(effects).getByTestId('element-row-demo:frost_bite')).toBeTruthy();
  });
});

describe('ElementSidebar navigation (ADR 0047)', () => {
  function projectWithSet() {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    const creator = (generatedId: string) => ({
      flowId: 'msm.library.gear-set',
      setId: 'set-1',
      values: { material_name: 'Ruby' },
      generatedId,
    });
    demo.elements.push(
      {
        ...element('demo:ruby_sword', 'msm:item'),
        meta: { createdAt: '', creator: creator('demo:ruby_sword') },
      },
      {
        ...element('demo:item/ruby_sword', 'minecraft:model'),
        meta: { createdAt: '', creator: creator('demo:item/ruby_sword') },
      },
      element('demo:wand', 'msm:item'),
      element('demo:mod', 'msm:mod'),
    );
    return project;
  }

  it('filters by search and collapses groups', async () => {
    const onToggleGroup = vi.fn();
    render(
      <ElementSidebar
        project={projectWithSet()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        collapsed={new Set(['demo/msm:mod'])}
        onToggleGroup={onToggleGroup}
      />,
    );
    // A collapsed group shows its heading and count but no rows.
    expect(screen.queryByTestId('element-row-demo:mod')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('group-toggle-demo-msm:mod'));
    expect(onToggleGroup).toHaveBeenCalledWith('demo/msm:mod');
    await userEvent.setup().type(screen.getByTestId('sidebar-search'), 'wand');
    expect(screen.getByTestId('element-row-demo:wand')).toBeTruthy();
    expect(screen.queryByTestId('element-row-demo:ruby_sword')).toBeNull();
  });

  it('shows Creator sets first and folds technical groups under More', async () => {
    // The real default: More folded (the test setup starts every More options open).
    window.msmMoreOptionsOpen = false;
    render(
      <ElementSidebar
        project={projectWithSet()}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        flowTitles={{ 'msm.library.gear-set': 'Gear set' }}
      />,
    );
    const region = screen.getByRole('region', { name: 'demo' });
    const labels = within(region).getAllByRole('heading', { level: 3 }).map(headingLabel);
    expect(labels[0]).toBe('Ruby (Gear set)');
    expect(labels).toContain('Items');
    expect(labels).not.toContain('Mod settings');
    expect(within(region).getByTestId('group-toggle-demo-more').textContent).toBe(
      'More things (4)',
    );
    // The set holds both of its elements, the model included.
    const set = within(region).getByRole('region', { name: 'demo Ruby (Gear set)' });
    expect(within(set).getAllByRole('listitem')).toHaveLength(2);
    window.msmMoreOptionsOpen = true;
  });
});

describe('ElementSidebar search (B668)', () => {
  /** The matcher before B668, kept to check that nothing it matched is lost. */
  const oldMatchesSearch = (entry: Element, query: string): boolean => {
    const text = query.trim().toLowerCase();
    if (text === '') return true;
    return [entry.id, entry.kind, groupLabel(groupOf(entry.kind))].some((value) =>
      value.toLowerCase().includes(text),
    );
  };
  const elements = [
    ...(sampleProject().namespaces[0]?.elements ?? []),
    element('demo:ruby_sword', 'msm:item'),
    element('demo:ruby_armour', 'msm:item'),
    element('demo:armor_stand_pose', 'msm:item'),
    element('demo:wand', 'msm:item'),
    element('demo:drops', 'minecraft:loot_table'),
  ];

  it('keeps every match of the old matcher', () => {
    const queries = [
      '',
      '  ',
      'ruby',
      'RUBY',
      'ruby_b',
      'demo:item',
      'block/',
      'minecraft:model',
      'model',
      'Models',
      'loot',
      'sword',
      'wand',
      'b',
      'y_s',
      'armour',
      'armor',
      'demo:ruby_block',
    ];
    for (const query of queries) {
      for (const entry of elements) {
        if (oldMatchesSearch(entry, query)) expect(matchesSearch(entry, query)).toBe(true);
      }
      const before = elements.filter((entry) => oldMatchesSearch(entry, query));
      const after = searchElements(elements, query);
      // The old matches come first, in their order.
      expect(after.slice(0, before.length)).toEqual(before);
    }
  });

  it('finds a misspelling', () => {
    const sword = elements.find((entry) => entry.id === 'demo:ruby_sword') as Element;
    expect(oldMatchesSearch(sword, 'swrod')).toBe(false);
    expect(matchesSearch(sword, 'swrod')).toBe(true);
    expect(matchesSearch(sword, 'rubby sword')).toBe(true);
    expect(matchesSearch(sword, 'shield')).toBe(false);
    expect(searchElements(elements, 'swrod').map((entry) => entry.id)).toEqual(['demo:ruby_sword']);
  });

  it('finds "armor" against "armour" and back', () => {
    expect(searchElements(elements, 'armor').map((entry) => entry.id)).toEqual([
      'demo:armor_stand_pose',
      'demo:ruby_armour',
    ]);
    expect(searchElements(elements, 'armour').map((entry) => entry.id)).toEqual([
      'demo:ruby_armour',
      'demo:armor_stand_pose',
    ]);
  });

  it('shows a misspelt search in the list', async () => {
    const project = sampleProject();
    project.namespaces[0]?.elements.push(element('demo:ruby_sword', 'msm:item'));
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    await userEvent.setup().type(screen.getByTestId('sidebar-search'), 'swrod');
    expect(screen.getByTestId('element-row-demo:ruby_sword')).toBeTruthy();
    expect(screen.queryByTestId('element-row-demo:item/ruby')).toBeNull();
  });
});
