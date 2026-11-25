// @vitest-environment happy-dom
/**
 * The upgrade report's part "Minecraft changed these too" (ADR 0136 D11, B823): a mod that
 * replaces a loot table Minecraft changed between the built-in targets is told so, from the
 * newer target's `changes.vanillaFiles` fact; every kind of change gets its sentence; the part
 * hides itself when nothing is touched; More options compares Minecraft's own two files.
 */
import type {
  Element,
  ElementKind,
  Project,
  TargetFacts,
  VanillaFileChanges,
} from '@msm/plugin-api';
import { targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  elementFilesOf,
  type VanillaFileHit,
  VanillaFiles,
  vanillaFileHits,
  vanillaFileListsOf,
  vanillaFileSentence,
} from '../../src/renderer/src/components/upgrade/parts/VanillaFiles';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { displayNameOf } from '../../src/renderer/src/session/plain-problems';

afterEach(cleanup);

const kinds = new Map<string, ElementKind>(
  builtInPlugins.flatMap((plugin) =>
    (plugin.contributes?.elementKinds ?? []).map((kind) => [kind.id, kind] as const),
  ),
);

function element(id: string, kind: string, data: Element['data']): Element {
  return { formatVersion: 1, id, kind, data, meta: {} } as Element;
}

function projectOf(elements: Element[]): Project {
  const byNamespace = new Map<string, Element[]>();
  for (const e of elements) {
    const ns = e.id.split(':')[0] as string;
    byNamespace.set(ns, [...(byNamespace.get(ns) ?? []), e]);
  }
  return {
    formatVersion: 1,
    name: 'Fixture',
    namespaces: [...byNamespace].map(([name, list]) => ({ name, elements: list, assets: [] })),
    targets: ['mc-26.3'],
    plugins: [],
    settings: {},
  };
}

const list = (over: Partial<VanillaFileChanges>): VanillaFileChanges => ({
  from: 'mc-1.0',
  to: 'mc-2.0',
  refs: { from: '1.0', to: '2.0' },
  leftOut: [],
  added: [],
  removed: [],
  moved: {},
  changed: [],
  ...over,
});

describe('vanillaFileHits on the built-in targets', () => {
  it('tells a mod that replaces a loot table Minecraft changed', async () => {
    const older = targetFacts('mc-26.3') as TargetFacts;
    const newer = targetFacts('mc-26.4') as TargetFacts;
    const lists = vanillaFileListsOf([newer.changes]);
    expect(lists).toHaveLength(1);
    const project = projectOf([
      element('minecraft:chests/igloo_chest', 'minecraft:loot_table', { pools: [] }),
      element('my_mod:chests/ruby', 'minecraft:loot_table', { pools: [] }),
    ]);
    const files = await elementFilesOf(
      project,
      (e) => kinds.get(e.kind)?.lower(e, older),
      displayNameOf,
    );
    expect(files.map((f) => f.files.map((x) => x.path))).toEqual([
      ['data/minecraft/loot_table/chests/igloo_chest.json'],
      ['data/my_mod/loot_table/chests/ruby.json'],
    ]);
    const hits = vanillaFileHits(lists, files);
    expect(hits).toEqual([
      {
        elementId: 'minecraft:chests/igloo_chest',
        name: displayNameOf(project.namespaces[0]?.elements[0] as Element),
        path: 'data/minecraft/loot_table/chests/igloo_chest.json',
        change: 'changed',
        how: 'replaces',
      },
    ]);

    const onShow = vi.fn();
    render(<VanillaFiles hits={hits} onShow={onShow} fromVersion="a" toVersion="b" />);
    expect(screen.getByRole('heading').textContent).toBe('Minecraft changed these too (1)');
    expect(screen.getByTestId('upgrade-vanilla-file-0-text').textContent).toContain(
      'Minecraft changed this one too.',
    );
    await userEvent.setup().click(screen.getByTestId('upgrade-vanilla-file-0-show'));
    expect(onShow).toHaveBeenCalledWith('minecraft:chests/igloo_chest');
    // The path shows only under More options.
    expect(screen.getByTestId('upgrade-vanilla-file-0-path').textContent).toContain(
      'data/minecraft/loot_table/chests/igloo_chest.json',
    );
  });
});

describe('vanillaFileHits', () => {
  const files = [
    {
      elementId: 'a:one',
      name: 'One',
      files: [
        {
          path: 'data/minecraft/tags/block/logs.json',
          layer: 'datapack' as const,
          merge: 'tag' as const,
        },
        { path: 'assets/minecraft/textures/gui/old.png', layer: 'resourcepack' as const },
        { path: 'data/minecraft/recipe/new.json', layer: 'datapack' as const },
      ],
    },
    {
      elementId: 'a:two',
      name: 'Two',
      files: [
        { path: 'data/minecraft/recipe/gone.json', layer: 'datapack' as const },
        { path: 'data/minecraft/recipe/gone.json', layer: 'datapack' as const },
        { path: 'data/minecraft/loot_table/x.json', layer: 'msm' as const },
      ],
    },
  ];

  it('finds each kind once per thing and path, changes first, and skips the runtime layer', () => {
    const hits = vanillaFileHits(
      [
        list({
          changed: ['data/minecraft/tags/block/logs.json'],
          removed: ['data/minecraft/recipe/gone.json'],
          moved: {
            'assets/minecraft/textures/gui/old.png': 'assets/minecraft/textures/gui/new.png',
          },
          added: ['data/minecraft/recipe/new.json', 'data/minecraft/loot_table/x.json'],
        }),
      ],
      files,
    );
    expect(hits.map((h) => [h.elementId, h.change, h.how, h.movedTo])).toEqual([
      ['a:one', 'changed', 'adds-to', undefined],
      ['a:two', 'removed', 'replaces', undefined],
      ['a:one', 'moved', 'replaces', 'assets/minecraft/textures/gui/new.png'],
      ['a:one', 'added', 'replaces', undefined],
    ]);
  });

  it('over a chain, lets the first step that names a path decide', () => {
    const hits = vanillaFileHits(
      [
        list({ added: ['data/minecraft/recipe/new.json'] }),
        list({ changed: ['data/minecraft/recipe/new.json'] }),
      ],
      files,
    );
    expect(hits.map((h) => h.change)).toEqual(['added']);
    expect(vanillaFileListsOf([undefined])).toEqual([]);
  });
});

describe('VanillaFiles', () => {
  const hit = (over: Partial<VanillaFileHit>): VanillaFileHit => ({
    elementId: 'minecraft:chests/igloo_chest',
    name: 'Igloo chest',
    path: 'data/minecraft/loot_table/chests/igloo_chest.json',
    change: 'changed',
    how: 'replaces',
    ...over,
  });

  it('shows nothing when no thing is touched', () => {
    const view = render(<VanillaFiles hits={[]} onShow={() => {}} fromVersion="a" toVersion="b" />);
    expect(view.container.innerHTML).toBe('');
  });

  it('words every kind plainly, with no version, id or path', () => {
    const sentences = (['changed', 'removed', 'moved', 'added'] as const).flatMap((change) =>
      (['replaces', 'adds-to'] as const).map((how) => vanillaFileSentence({ change, how })),
    );
    expect(new Set(sentences).size).toBe(6);
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/\d|:|\//);
      expect(sentence.startsWith('Minecraft ')).toBe(true);
    }
  });

  it('compares Minecraft’s own two files side by side under More options', async () => {
    const read = vi.fn(async (version: string) =>
      new TextEncoder().encode(`{"version": "${version}"}`),
    );
    render(
      <VanillaFiles
        hits={[hit({})]}
        onShow={() => {}}
        fromVersion="older"
        toVersion="newer"
        readVanillaFile={read}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('upgrade-vanilla-file-0-compare'));
    expect((await screen.findByTestId('upgrade-vanilla-file-0-before')).textContent).toBe(
      'older{"version": "older"}',
    );
    expect(screen.getByTestId('upgrade-vanilla-file-0-after').textContent).toBe(
      'newer{"version": "newer"}',
    );
    expect(read.mock.calls).toEqual([
      ['older', 'data/minecraft/loot_table/chests/igloo_chest.json'],
      ['newer', 'data/minecraft/loot_table/chests/igloo_chest.json'],
    ]);
  });

  it('says how to see them when neither version is set up, and reads a moved file at its new place', async () => {
    const read = vi.fn(async () => null);
    render(
      <VanillaFiles
        hits={[hit({ change: 'moved', movedTo: 'data/minecraft/loot_table/chests/igloo.json' })]}
        onShow={() => {}}
        fromVersion="older"
        toVersion="newer"
        readVanillaFile={read}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('upgrade-vanilla-file-0-compare'));
    expect((await screen.findByTestId('upgrade-vanilla-file-0-not-set-up')).textContent).toContain(
      'set up both versions',
    );
    expect(read.mock.calls[1]).toEqual(['newer', 'data/minecraft/loot_table/chests/igloo.json']);
  });
});
