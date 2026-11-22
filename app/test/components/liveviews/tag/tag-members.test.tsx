// @vitest-environment happy-dom

/**
 * B612: Everything in a tag. The real resolver (`@msm/sim`, B604) runs in the live views host in
 * this thread; vanilla's tags are MSM's own made-up files standing in for the jar's (no Mojang
 * file is read).
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveViewClient } from '../../../../src/renderer/src/liveviews/client';
import { DATA_VIEWS, TAG_VIEW_REGISTRIES } from '../../../../src/renderer/src/liveviews/data';
import TagMembers, {
  MEMBERS_SHOWN,
  TagMembersView,
} from '../../../../src/renderer/src/liveviews/data/tag/TagMembers';
import {
  comesFrom,
  groupMembers,
  panelRegistryIds,
  whatChanged,
  writtenEntries,
} from '../../../../src/renderer/src/liveviews/data/tag/tag-model';
import {
  langKeyOf,
  memberName,
  pictureItemOf,
} from '../../../../src/renderer/src/liveviews/data/tag/tag-pictures';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';
import {
  answerRequest,
  createStore,
  SIM_ENGINE,
} from '../../../../src/renderer/src/liveviews/worker';
import { TagStudio } from '../../../../src/renderer/src/studios/TagStudio';
import { facts, hostWorker } from '../frame/fakes';

afterEach(cleanup);

type Folders = Record<string, Record<string, Json>>;

function reader(folders: Folders): VanillaDataReader {
  return createVanillaDataReader({
    mcVersion: '9.9',
    read: async (version, asked) => ({
      version,
      folders: Object.fromEntries(asked.map((folder) => [folder, folders[folder] ?? {}])),
      fileCount: 0,
    }),
  });
}

function projectOf(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [
      {
        name: 'demo',
        assets: [],
        elements: elements.filter((element) => element.id.startsWith('demo:')),
      },
      {
        name: 'minecraft',
        assets: [],
        elements: elements.filter((element) => element.id.startsWith('minecraft:')),
      },
    ],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

function tagElement(id: string, registry: string, data: Json): Element {
  return { id, kind: `minecraft:tag/${registry}`, data } as unknown as Element;
}

function client(): LiveViewClient {
  return new LiveViewClient({ createWorker: () => hostWorker(SIM_ENGINE) });
}

function show(props: {
  project: Project;
  element: Element;
  vanilla: VanillaDataReader;
  registryIds?: readonly string[] | null;
  client: LiveViewClient;
  onSetup?: () => void;
}) {
  return render(
    <TagMembersView
      project={props.project}
      element={props.element}
      vanilla={props.vanilla}
      vanillaAssets={null}
      {...(props.registryIds === undefined
        ? { registryIds: null }
        : { registryIds: props.registryIds })}
      preferences={DEFAULT_PREFS}
      onPreferences={() => {}}
      onSetup={props.onSetup ?? vi.fn()}
      client={props.client}
    />,
  );
}

const members = () =>
  screen.getAllByTestId('tag-member').map((row) => row.getAttribute('data-id') as string);

describe('Everything in a tag (B612)', () => {
  it('opens a block tag’s nested tags, says where each came from and marks an optional entry not found', async () => {
    const live = client();
    const element = tagElement('demo:ores', 'block', {
      values: ['minecraft:stone', '#minecraft:base_stone', { id: 'demo:nope', required: false }],
    });
    show({
      project: projectOf([element]),
      element,
      vanilla: reader({
        'tags/block': {
          'minecraft:base_stone': { values: ['minecraft:granite', '#minecraft:deep'] },
          'minecraft:deep': { values: ['minecraft:deepslate', 'minecraft:stone'] },
        },
      }),
      registryIds: ['minecraft:deepslate', 'minecraft:granite', 'minecraft:stone'],
      client: live,
    });
    await waitFor(() => expect(screen.getByTestId('tag-count').textContent).toContain('3 things'));
    expect(members()).toEqual(['minecraft:stone', 'minecraft:granite', 'minecraft:deepslate']);
    const groups = screen
      .getAllByTestId('tag-group')
      .map((group) => group.getAttribute('data-via'));
    expect(groups).toEqual(['', 'minecraft:base_stone']);
    const deepslate = screen
      .getAllByTestId('tag-member')
      .find((row) => row.getAttribute('data-id') === 'minecraft:deepslate') as HTMLElement;
    expect(deepslate.getAttribute('data-origin')).toBe('vanilla');
    expect(deepslate.getAttribute('data-chain')).toBe('minecraft:base_stone minecraft:deep');
    expect(deepslate.textContent).toContain(
      'comes from Minecraft’s #minecraft:deep, through #minecraft:base_stone',
    );
    // Blocks are drawn as slots (their block item's picture, or the name without the jar).
    expect(within(deepslate).getByRole('img', { name: 'Deepslate' })).toBeTruthy();
    const optional = screen.getByTestId('tag-optional');
    expect(optional.getAttribute('data-found')).toBe('false');
    expect(optional.textContent).toContain('optional');
    expect(optional.textContent).toContain('not found');
    expect(screen.getByTestId('live-view-fidelity').textContent).toBe('As in the game, checked');
    // Not a Minecraft id: nothing to compare with.
    expect(screen.queryByTestId('tag-what-changed')).toBeNull();
    live.dispose();
  });

  it('shows What changed for an item tag merged into Minecraft’s, and a replace', async () => {
    const live = client();
    const vanilla = reader({
      'tags/item': {
        'minecraft:planks': { values: ['minecraft:oak_planks', 'minecraft:birch_planks'] },
      },
    });
    const ids = ['demo:ruby_planks', 'minecraft:birch_planks', 'minecraft:oak_planks'];
    const merged = tagElement('minecraft:planks', 'item', { values: ['demo:ruby_planks'] });
    const view = show({
      project: projectOf([merged]),
      element: merged,
      vanilla,
      registryIds: ids,
      client: live,
    });
    await waitFor(() =>
      expect(screen.getByTestId('tag-added').textContent).toContain('Ruby Planks'),
    );
    expect(members()).toEqual([
      'minecraft:oak_planks',
      'minecraft:birch_planks',
      'demo:ruby_planks',
    ]);
    expect(screen.queryByTestId('tag-removed')).toBeNull();
    const ruby = screen
      .getAllByTestId('tag-member')
      .find((row) => row.getAttribute('data-id') === 'demo:ruby_planks') as HTMLElement;
    expect(ruby.textContent).toContain('comes from your #minecraft:planks');
    view.unmount();

    const replaced = tagElement('minecraft:planks', 'item', {
      replace: true,
      values: ['demo:ruby_planks'],
    });
    show({
      project: projectOf([replaced]),
      element: replaced,
      vanilla,
      registryIds: ids,
      client: live,
    });
    await waitFor(() =>
      expect(screen.getByTestId('tag-removed').textContent).toContain('Oak Planks'),
    );
    expect(screen.getByTestId('tag-replaced')).toBeTruthy();
    expect(members()).toEqual(['demo:ruby_planks']);
    live.dispose();
  });

  it('drops an entity type tag with a missing required entry, as the game does', async () => {
    const live = client();
    const element = tagElement('demo:foes', 'entity_type', {
      values: ['minecraft:zombie', 'minecraft:zombi'],
    });
    show({
      project: projectOf([element]),
      element,
      vanilla: reader({}),
      registryIds: ['minecraft:skeleton', 'minecraft:zombie'],
      client: live,
    });
    await waitFor(() => expect(screen.getByTestId('tag-dropped')).toBeTruthy());
    expect(screen.queryAllByTestId('tag-member')).toEqual([]);
    const missing = screen.getByTestId('tag-missing');
    expect(missing.getAttribute('data-entry')).toBe('minecraft:zombi');
    expect(missing.textContent).toContain('Not found');
    expect(pictureItemOf('entity_type', 'minecraft:zombie')).toBe('minecraft:zombie_spawn_egg');
    live.dispose();
  });

  it('reports a worldgen tag cycle, and a Minecraft biome tag without the jar asks for the folder', async () => {
    const live = client();
    const a = tagElement('demo:a', 'worldgen/biome', { values: ['minecraft:plains', '#demo:b'] });
    const b = tagElement('demo:b', 'worldgen/biome', { values: ['#demo:a'] });
    const view = show({
      project: projectOf([a, b]),
      element: a,
      vanilla: reader({}),
      registryIds: ['minecraft:plains'],
      client: live,
    });
    await waitFor(() => expect(screen.getByTestId('tag-cycle').textContent).toContain('#demo:a'));
    expect(screen.getByTestId('tag-dropped')).toBeTruthy();
    view.unmount();

    const onSetup = vi.fn();
    const forest = tagElement('minecraft:is_forest', 'worldgen/biome', {
      values: ['demo:glade', '#minecraft:is_taiga'],
    });
    show({
      project: projectOf([forest]),
      element: forest,
      vanilla: NOT_SET_UP_VANILLA_DATA,
      registryIds: ['demo:glade', 'minecraft:plains'],
      client: live,
      onSetup,
    });
    await waitFor(() =>
      expect(screen.getByTestId('tag-unread').textContent).toContain('#minecraft:is_taiga'),
    );
    expect(screen.queryByTestId('tag-dropped')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set up Minecraft folder' }));
    expect(onSetup).toHaveBeenCalledOnce();
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
    live.dispose();
  });

  it('resolves and draws a large vanilla tag within the budget, a group at a time', async () => {
    const blocks = Array.from({ length: 1200 }, (_, i) => `minecraft:block_${i}`);
    const vanillaFolders: Folders = {
      'tags/block': {
        'minecraft:mineable/pickaxe': {
          values: ['#minecraft:part_a', '#minecraft:part_b', ...blocks.slice(800)],
        },
        'minecraft:part_a': { values: blocks.slice(0, 400) },
        'minecraft:part_b': { values: ['#minecraft:part_a', ...blocks.slice(400, 800)] },
      },
    };
    // The worker's own answer time for the tag: well inside the 150 ms of the plan.
    const store = createStore();
    answerRequest(
      { token: 1, lane: '', kind: 'vanilla', key: 'v', folders: vanillaFolders },
      store,
    );
    answerRequest(
      {
        token: 2,
        lane: '',
        kind: 'data',
        hash: 'h',
        project: {},
        vanillaKey: 'v',
        facts: facts(),
        registries: { block: blocks },
      },
      store,
    );
    const answer = answerRequest(
      {
        token: 3,
        lane: '',
        kind: 'tag',
        data: 'h',
        registry: 'block',
        id: 'minecraft:mineable/pickaxe',
      },
      store,
    );
    expect(answer?.kind).toBe('result');
    if (answer?.kind !== 'result') return;
    expect((answer.result as unknown as { members: unknown[] }).members).toHaveLength(1200);
    expect(answer.ms).toBeLessThan(150);

    const live = client();
    const element = tagElement('minecraft:mineable/pickaxe', 'block', { values: [] });
    show({
      project: projectOf([element]),
      element,
      vanilla: reader(vanillaFolders),
      registryIds: blocks,
      client: live,
    });
    await waitFor(() =>
      expect(screen.getByTestId('tag-count').textContent).toContain('1200 things'),
    );
    expect(screen.getAllByTestId('tag-group')).toHaveLength(3);
    expect(screen.getAllByTestId('tag-member')).toHaveLength(3 * MEMBERS_SHOWN);
    const [first] = screen.getAllByRole('button', { name: 'Show all 400' });
    await userEvent.click(first as HTMLElement);
    expect(screen.getAllByTestId('tag-member')).toHaveLength(2 * MEMBERS_SHOWN + 400);
    expect(screen.getByTestId('tag-what-changed').textContent).toContain('Nothing');
    live.dispose();
  });

  it('is the view of all 20 tag kinds, and the Tag Studio shows it beside the editor', async () => {
    expect(TAG_VIEW_REGISTRIES).toHaveLength(20);
    for (const registry of TAG_VIEW_REGISTRIES) {
      const loader = DATA_VIEWS[`minecraft:tag/${registry}`];
      expect(loader, registry).toBeDefined();
      expect((await loader?.())?.default).toBe(TagMembers);
    }
    const element = tagElement('demo:gems', 'item', { values: ['minecraft:emerald'] });
    render(
      <TagStudio
        data={element.data}
        registry="item"
        onChange={vi.fn()}
        live={{
          project: projectOf([element]),
          element,
          mcVersion: null,
          registryIds: ['minecraft:emerald'],
        }}
      />,
    );
    expect(screen.getByTestId('tag-studio')).toBeTruthy();
    expect(screen.getByTestId('tag-studio-live')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('live-view')).toBeTruthy());
  });
});

describe('the tag view’s model (B612)', () => {
  it('reads written entries, groups members and words where they came from', () => {
    expect(
      writtenEntries({ values: ['stone', '#logs', { id: 'demo:x', required: false }] }),
    ).toEqual([
      { id: 'minecraft:stone', tag: false, required: true },
      { id: 'minecraft:logs', tag: true, required: true },
      { id: 'demo:x', tag: false, required: false },
    ]);
    const list = [
      { id: 'minecraft:a', origin: 'project' as const, chain: [] },
      { id: 'minecraft:b', origin: 'vanilla' as const, chain: ['minecraft:t'] },
    ];
    expect(groupMembers(list).map((group) => group.via)).toEqual([null, 'minecraft:t']);
    expect(comesFrom(list[0] as (typeof list)[number], 'demo:x')).toBe('comes from your #demo:x');
  });

  it('says a tag Minecraft does not have is new', () => {
    const now = {
      registry: 'item',
      id: 'minecraft:new',
      members: [],
      missing: [],
      cycles: [],
      dropped: false,
      replaced: false,
    };
    expect(whatChanged(now, { ...now, missing: ['#minecraft:new'], dropped: true }).kind).toBe(
      'new',
    );
  });

  it('takes the project’s own entries to exist in the panel, and Minecraft’s from the vendored list', () => {
    const project = projectOf([
      tagElement('demo:t', 'item', { values: ['demo:ruby', 'minecraft:stoen'] }),
    ]);
    const ids = panelRegistryIds({ item: ['stone'] }, project, 'item');
    expect(ids).toContain('minecraft:stone');
    expect(ids).toContain('demo:ruby');
    expect(ids).not.toContain('minecraft:stoen');
    expect(panelRegistryIds(null, project, 'item')).toBeNull();
  });

  it('names members from en_us, else from their id', () => {
    expect(langKeyOf('worldgen/biome', 'minecraft:plains')).toBe('biome.minecraft.plains');
    expect(
      memberName('worldgen/biome', 'minecraft:plains', { 'biome.minecraft.plains': 'Plains!' }),
    ).toBe('Plains!');
    expect(memberName('game_event', 'minecraft:block_open', null)).toBe('Block Open');
    expect(pictureItemOf('fluid', 'minecraft:water')).toBeNull();
  });
});
