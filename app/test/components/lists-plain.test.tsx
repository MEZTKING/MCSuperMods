// @vitest-environment happy-dom
/**
 * The element list, the asset list and the status bar in plain words (plan B703, D5): over real
 * library examples with tags, world generation and a mob, every readable string passes
 * `expectPlain` with every More options closed; rows show names only (the kind words are small
 * sub-headings from one table); the old test ids stay.
 */
import type { Element, Project, ResourceLocation } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ElementSidebar,
  groupByKind,
  groupOf,
  SUB_HEADINGS,
  subHeadingOf,
  TECHNICAL_GROUPS,
} from '../../src/renderer/src/components/ElementSidebar';
import { StatusBar } from '../../src/renderer/src/components/StatusBar';
import { displayNameOf } from '../../src/renderer/src/session/plain-problems';
import type { SessionSnapshot } from '../../src/renderer/src/session/project-session';
import { exampleProject, expectPlain } from './plain-sweep';

/**
 * Library examples with tags, world generation and mobs. (The starters' mod part is named
 * `msm_starter`; a started mod takes the user's own, so they are not used here.)
 */
const FOLDERS = ['all-kinds', 'blocks-items', 'entities'] as const;

const projects = new Map<string, Project>(
  FOLDERS.map((folder) => [folder, exampleProject(folder)]),
);

const actions = {
  onImport: vi.fn(),
  onRemove: vi.fn(),
  onReveal: vi.fn(),
  onPaint: vi.fn(),
  onNewTexture: vi.fn(),
  onPicture: vi.fn(),
};

beforeAll(() => {
  // The default view: every More options closed (the test setup opens them).
  window.msmMoreOptionsOpen = false;
});
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});
afterAll(() => {
  window.msmMoreOptionsOpen = true;
});

/** The sidebar with its collapsed groups kept, as the app keeps them. */
function Sidebar(props: { project: Project }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  return (
    <ElementSidebar
      project={props.project}
      selectedId={null}
      onSelect={vi.fn()}
      onRemove={vi.fn()}
      assetActions={actions}
      collapsed={collapsed}
      onToggleGroup={(key) =>
        setCollapsed((old) => {
          const next = new Set(old);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        })
      }
      flowTitles={{}}
    />
  );
}

function sidebar(project: Project) {
  return render(<Sidebar project={project} />);
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

/** Words a row must never start with: the registries and kind words shown before names until B703. */
const KIND_WORDS =
  /^(item|block|biome|dimension|template_pool|placed_feature|feature|structure|structure_set|processor_list|noise|noise_settings|density_function|world_preset|worldgen\/|entity_type|function|model|animation)(?=[A-Z])/;

describe('the element list in plain words', () => {
  it.each(FOLDERS)('%s: plain, names only, sub-headings from the table', (folder) => {
    const project = projects.get(folder) as Project;
    const { container } = sidebar(project);
    expectPlain(container);

    // Every row shows the thing's name, and only that.
    const rows = [...container.querySelectorAll<HTMLElement>('[data-testid^="element-row-"]')];
    expect(rows.length).toBeGreaterThan(0);
    const byId = new Map(elementsOf(project).map((element) => [element.id, element]));
    for (const row of rows) {
      const id = (row.dataset.testid ?? '').slice('element-row-'.length);
      const element = byId.get(id as ResourceLocation) as Element;
      expect(row.textContent).toBe(displayNameOf(element));
      expect(row.textContent).not.toMatch(KIND_WORDS);
    }

    // Each sub-heading heads rows whose kinds it names.
    for (const heading of container.querySelectorAll('h4')) {
      const group = heading.closest('section')?.querySelector('[data-testid^="group-toggle-"]');
      const key = (group?.getAttribute('data-testid') ?? '').replace(/^group-toggle-[^-]+-/, '');
      const list = heading.nextElementSibling as HTMLElement;
      for (const row of list.querySelectorAll<HTMLElement>('[data-testid^="element-row-"]')) {
        const id = (row.dataset.testid ?? '').slice('element-row-'.length);
        const element = byId.get(id as ResourceLocation) as Element;
        expect(subHeadingOf(key, element.kind)).toBe(heading.textContent);
      }
    }

    // The old test ids: a toggle per group (keys unchanged), a row per thing outside More things.
    for (const namespace of project.namespaces) {
      for (const [group, elements] of groupByKind(namespace)) {
        if (TECHNICAL_GROUPS.has(group)) continue;
        expect(screen.getByTestId(`group-toggle-${namespace.name}-${group}`)).toBeTruthy();
        for (const element of elements) {
          expect(screen.getByTestId(`element-row-${element.id}`)).toBeTruthy();
        }
      }
      expect(screen.getByTestId(`assets-import-${namespace.name}`)).toBeTruthy();
    }
    expect(screen.getByTestId('sidebar-search')).toBeTruthy();
  });

  it.each(FOLDERS)('%s: More things opened is plain too', (folder) => {
    const project = projects.get(folder) as Project;
    const { container } = sidebar(project);
    for (const namespace of project.namespaces) {
      const more = screen.queryByTestId(`group-toggle-${namespace.name}-more`);
      if (more === null) continue;
      expect(more.textContent).toMatch(/^More things \(\d+\)$/);
      fireEvent.click(more);
    }
    expectPlain(container);
    for (const element of elementsOf(project)) {
      expect(screen.getByTestId(`element-row-${element.id}`)).toBeTruthy();
    }
  });

  it('heads world generation, mobs and pictures in plain words', () => {
    // Two mod parts: each section is named with its part's name before it.
    sidebar(projects.get('all-kinds') as Project);
    expect(screen.getByTestId('group-toggle-msm_examples-Worldgen').textContent).toContain(
      'World generation',
    );
    const worldgen = screen.getByRole('region', { name: 'msm_examples World generation' });
    const subHeadings = within(worldgen)
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(subHeadings).toEqual(
      expect.arrayContaining(['Biomes', 'Where features go', 'Building pools', 'World types']),
    );
    expect(screen.getByRole('region', { name: 'msm_examples Tags' })).toBeTruthy();
    cleanup();
    // One mod part: sections are named by their headings alone.
    sidebar(projects.get('entities') as Project);
    expect(screen.getByTestId('group-toggle-msm_examples-Entities').textContent).toContain('Mobs');
    expect(screen.getByRole('region', { name: 'Mobs' })).toBeTruthy();
    const pictures = screen.getByRole('region', { name: 'Pictures and sounds' });
    expect(within(pictures).queryByText(/textures\//)).toBeNull();
    expect(within(pictures).getByTestId('more-options-assets-msm_examples').textContent).toBe(
      'Show where the files are',
    );
  });

  it('says the empty states in plain words', () => {
    const { container, rerender } = render(
      <ElementSidebar project={null} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(container.textContent).toContain('No mod is open. Start one or open one from Home.');
    expectPlain(container);
    rerender(
      <ElementSidebar
        project={{ ...(projects.get('entities') as Project), namespaces: [] }}
        selectedId={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Nothing here yet.');
    expectPlain(container);
  });
});

describe('the sub-heading table', () => {
  it('names every kind of the Tags, World generation and Models and animations groups', () => {
    expect(SUB_HEADINGS).toEqual({
      'minecraft:tag/item': 'Item tags',
      'minecraft:tag/block': 'Block tags',
      'minecraft:tag/entity_type': 'Mob tags',
      'minecraft:tag/fluid': 'Fluid tags',
      'minecraft:tag/function': 'Function tags',
      'minecraft:tag/worldgen/biome': 'Biome tags',
      'minecraft:tag/worldgen/world_preset': 'World type tags',
      'minecraft:worldgen/biome': 'Biomes',
      'minecraft:worldgen/feature': 'Features',
      'minecraft:worldgen/configured_feature': 'Features',
      'minecraft:worldgen/placed_feature': 'Where features go',
      'minecraft:worldgen/carver': 'Carvers',
      'minecraft:worldgen/configured_carver': 'Carvers',
      'minecraft:worldgen/structure': 'Structures',
      'minecraft:worldgen/structure_set': 'Structure sets',
      'minecraft:worldgen/template_pool': 'Building pools',
      'minecraft:worldgen/processor_list': 'Block changers',
      'minecraft:worldgen/noise_settings': 'Noise settings',
      'minecraft:worldgen/noise': 'Noise',
      'minecraft:worldgen/density_function': 'Density functions',
      'minecraft:worldgen/world_preset': 'World types',
      'minecraft:dimension': 'Dimensions',
      'msm:geo_model': 'Models',
      'msm:animation': 'Animations',
    });
    for (const kind of Object.keys(SUB_HEADINGS)) {
      expect(subHeadingOf(groupOf(kind), kind)).toBe(SUB_HEADINGS[kind]);
    }
  });

  it('falls back to words: a tag registry and "tags", else the kind in words', () => {
    expect(subHeadingOf('Tags', 'minecraft:tag/damage_type')).toBe('Damage type tags');
    expect(subHeadingOf('Tags', 'minecraft:tag/worldgen/structure')).toBe('Structure tags');
    expect(subHeadingOf('Worldgen', 'minecraft:worldgen/material_rule')).toBe('Material rules');
    expect(subHeadingOf('msm:item', 'msm:item')).toBeUndefined();
  });
});

describe('the status bar in plain words', () => {
  const target = (index: number) => builtInTargets[index]?.target as TargetFacts;

  it.each(FOLDERS)('%s: plain, the name and not the folder', (folder) => {
    const project = projects.get(folder) as Project;
    const first = elementsOf(project)[0] as Element;
    const snapshot = {
      root: `/home/someone/mods/${folder}`,
      project,
      dirty: true,
      canUndo: true,
      canRedo: true,
      undoLabel: `Edit ${first.id}`,
      redoLabel: `Rename ${first.id} to ${first.id}_two`,
      problems: [
        { severity: 'error', code: 'x', message: 'x' },
        { severity: 'warning', code: 'x', message: 'x' },
      ],
    } as unknown as SessionSnapshot;
    for (const facts of [target(0), target(1)]) {
      const { container, unmount } = render(<StatusBar snapshot={snapshot} target={facts} />);
      expectPlain(container);
      expect(container.textContent).toContain(project.name);
      expect(container.textContent).not.toContain('/home/someone');
      expect(container.textContent).toContain('Not saved yet');
      expect(container.textContent).toContain('2 things to fix');
      expect(screen.getByTestId('project-target').textContent).toContain(
        `For Minecraft ${facts.mcVersion}`,
      );
      expect(screen.queryByTestId('project-target-snapshot') !== null).toBe(
        facts.channel === 'snapshot',
      );
      unmount();
    }
  });
});
