// @vitest-environment happy-dom
import type { ExampleProject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CopyExampleResult,
  copySummary,
  ExamplesDialog,
  exampleMatches,
} from '../../src/renderer/src/components/ExamplesDialog';
import { fakeExample } from './library-fixtures';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

afterEach(cleanup);

const lootExample: ExampleProject = {
  id: 'loot_block',
  title: 'Block drops',
  description: 'A loot table.',
  kind: 'minecraft:loot_table',
  category: 'Loot tables',
  tags: ['drops'],
  requiresKinds: ['minecraft:loot_table'],
  build: ({ namespace }) => ({
    elements: [
      {
        id: `${namespace}:blocks/ore`,
        kind: 'minecraft:loot_table',
        data: { type: 'minecraft:block', pools: [] },
        notes: 'Drops nothing yet.',
      },
    ],
    assets: [],
  }),
};

const EXAMPLES = [fakeExample, lootExample];

function renderGallery(
  namespaces: readonly string[] | null,
  onCopy = vi.fn(
    async (): Promise<CopyExampleResult> => ({
      added: ['demo:block/ruby_ore'],
      duplicates: [],
      assets: ['demo:textures/block/ruby_ore.png'],
      skippedAssets: [],
    }),
  ),
) {
  const onOpenAsProject = vi.fn();
  const onClose = vi.fn();
  render(
    <ExamplesDialog
      examples={EXAMPLES}
      namespaces={namespaces}
      target={target}
      onCopy={onCopy}
      onOpenAsProject={onOpenAsProject}
      onClose={onClose}
    />,
  );
  return { onCopy, onOpenAsProject, onClose };
}

const visibleIds = () =>
  within(screen.getByTestId('examples-list'))
    .queryAllByRole('radio')
    .map((radio) => (radio as HTMLInputElement).value);

describe('ExamplesDialog', () => {
  it('searches title, kind, category and tags', () => {
    expect(exampleMatches(lootExample, 'block DROPS')).toBe(true);
    expect(exampleMatches(lootExample, 'loot_table')).toBe(true);
    expect(exampleMatches(lootExample, 'loot tables')).toBe(true);
    expect(exampleMatches(lootExample, 'drops')).toBe(true);
    expect(exampleMatches(lootExample, 'A loot table.')).toBe(false);
    expect(exampleMatches(fakeExample, 'ore')).toBe(true);
  });

  it('filters by search and kind, groups by category and follows the selection', async () => {
    renderGallery(['demo']);
    expect(visibleIds()).toEqual(['test_example', 'loot_block']);
    expect(screen.getByTestId('examples-group-models')).toBeTruthy();
    expect(screen.getByTestId('examples-group-loot-tables')).toBeTruthy();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('examples-search'), 'loot');
    expect(visibleIds()).toEqual(['loot_block']);
    expect(screen.getByTestId('examples-count').textContent).toBe('1 of 2 examples');
    expect(screen.getByTestId('example-detail-title').textContent).toBe('Block drops');
    expect(screen.getByTestId('example-notes').textContent).toBe('Drops nothing yet.');
    expect(screen.getByTestId('example-contents').textContent).toContain('demo:blocks/ore');
    await user.clear(screen.getByTestId('examples-search'));
    await user.selectOptions(screen.getByTestId('examples-kind-filter'), 'minecraft:model');
    expect(visibleIds()).toEqual(['test_example']);
    expect(screen.getByTestId('example-contents').textContent).toContain(
      'assets/demo/textures/block/ruby_ore.png',
    );
    await user.type(screen.getByTestId('examples-search'), 'nothing like this');
    expect(screen.getByTestId('examples-empty').textContent).toBe('No example matches the search.');
    expect((screen.getByTestId('examples-open-new') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables copying without an open project and still opens as a new project', async () => {
    const { onOpenAsProject } = renderGallery(null);
    expect((screen.getByTestId('examples-copy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('examples-copy-reason').textContent).toBe(
      'Open or create a project first.',
    );
    await userEvent.setup().click(screen.getByTestId('examples-open-new'));
    expect(onOpenAsProject).toHaveBeenCalledExactlyOnceWith(fakeExample);
  });

  it('disables copying into a project with only the minecraft namespace', () => {
    renderGallery(['minecraft']);
    expect((screen.getByTestId('examples-copy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('examples-copy-reason').textContent).toMatch(/no namespace/);
  });

  it('copies into the chosen namespace and shows what was skipped', async () => {
    const onCopy = vi.fn(
      async (): Promise<CopyExampleResult> => ({
        added: [],
        duplicates: ['zeta:blocks/ore'],
        assets: [],
        skippedAssets: ['zeta:textures/x.png'],
      }),
    );
    renderGallery(['minecraft', 'demo', 'zeta'], onCopy);
    const user = userEvent.setup();
    const select = screen.getByTestId('examples-namespace') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['demo', 'zeta']);
    await user.selectOptions(select, 'zeta');
    await user.click(screen.getByTestId('example-loot_block'));
    await user.click(screen.getByTestId('examples-copy'));
    expect(onCopy).toHaveBeenCalledExactlyOnceWith(lootExample, 'zeta');
    const result = await screen.findByTestId('examples-copy-result');
    expect(result.getAttribute('role')).toBe('status');
    expect(result.textContent).toContain('Nothing was added to zeta');
    expect(screen.getByTestId('examples-copy-duplicates').textContent).toContain('zeta:blocks/ore');
    expect(screen.getByTestId('examples-copy-skipped-assets').textContent).toContain(
      'zeta:textures/x.png',
    );
  });

  it('shows a failed copy as an alert', async () => {
    renderGallery(
      ['demo'],
      vi.fn(async (): Promise<CopyExampleResult> => {
        throw new Error('No project is open.');
      }),
    );
    await userEvent.setup().click(screen.getByTestId('examples-copy'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No project is open.'));
  });
});

describe('copySummary with merged files', () => {
  const base = { added: ['demo:a'], duplicates: [], assets: [], skippedAssets: [] };
  it('names merged language files and tags', () => {
    expect(copySummary(base, 'demo')).toBe('Added 1 element and 0 assets to demo.');
    expect(copySummary({ ...base, merged: ['demo:en_us'] }, 'demo')).toBe(
      'Added 1 element and 0 assets to demo, and merged its entries into an existing language file or tag.',
    );
    expect(copySummary({ ...base, added: [], merged: ['demo:en_us', 'demo:logs'] }, 'demo')).toBe(
      "No new elements or assets for demo; the example's entries were merged into 2 existing language files or tags.",
    );
  });
});
