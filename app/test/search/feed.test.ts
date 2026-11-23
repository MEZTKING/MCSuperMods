/**
 * The feed (B660): the open mod's layer sent whole and then as deltas 300 ms after an edit, so an
 * edit reaches a query within the debounce; the context with the mod's ids and the history; the
 * vanilla layer on first need, named from the jar or from the ids; the static layer rebuilt when
 * the mod's target changes.
 */

import type { SearchEntry, SearchThing } from '@msm/search';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchClient, type StaticSpec } from '../../src/renderer/src/search/client';
import { withChoice } from '../../src/renderer/src/search/history';
import {
  type AppLists,
  layerDelta,
  PROJECT_DELAY_MS,
  SearchFeed,
} from '../../src/renderer/src/search/sources';
import { clearVanillaNames } from '../../src/renderer/src/search/vanilla-names';
import {
  appLists,
  builtInPlugins,
  FakeSession,
  factsOf,
  madeUpNames,
  projectWith,
  registriesOf,
  TARGET_IDS,
} from './fixtures';

const DEFAULT_TARGET = TARGET_IDS[TARGET_IDS.length - 1] as string;
const OTHER_TARGET = TARGET_IDS[0] as string;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lists: AppLists;
let client: SearchClient;
let session: FakeSession;
let feed: SearchFeed;
const patches: { at: number; upserts: string[]; removes: string[] }[] = [];
const statics: StaticSpec[] = [];
const layers: { layer: string; entries: number; things: number }[] = [];
let history = withChoice({ chosen: [], searches: [] }, 'flow:weapon');

beforeAll(async () => {
  lists = await appLists();
  clearVanillaNames();
  client = new SearchClient({
    createWorker: () => {
      throw new Error('main thread in tests');
    },
  });
  const spied = {
    setStatic: (spec: StaticSpec) => {
      statics.push(spec);
      client.setStatic(spec);
    },
    setLayer: (
      layer: string,
      entries: readonly SearchEntry[],
      extras?: { things?: readonly SearchThing[]; protect?: readonly string[] },
    ) => {
      layers.push({ layer, entries: entries.length, things: extras?.things?.length ?? 0 });
      client.setLayer(layer, entries, extras);
    },
    patchLayer: (
      layer: string,
      upserts: readonly SearchEntry[],
      removes: readonly string[],
      things?: readonly SearchThing[],
    ) => {
      patches.push({ at: Date.now(), upserts: upserts.map((e) => e.id), removes: [...removes] });
      client.patchLayer(layer, upserts, removes, things);
    },
    setContext: client.setContext.bind(client),
    layerEntries: client.layerEntries.bind(client),
  };
  session = new FakeSession(
    projectWith([
      { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
    ]),
  );
  feed = new SearchFeed({
    client: spied,
    plugins: () => builtInPlugins,
    lists,
    defaultTargetId: DEFAULT_TARGET,
    targetFacts: (id) => (TARGET_IDS.includes(id) ? factsOf(id) : undefined),
    session,
    readNames: async (targetId) => (targetId === DEFAULT_TARGET ? madeUpNames() : null),
    readRegistries: async (targetId) => registriesOf(targetId),
    readGuide: async () => ({
      pages: [{ page: 'recipes', title: 'Recipes' }],
      sections: [
        {
          page: 'recipes',
          level: 1,
          heading: 'Recipes',
          anchor: 'recipes',
          sentence: '',
        },
        {
          page: 'recipes',
          level: 2,
          heading: 'Add a smelting recipe',
          anchor: 'add-a-smelting-recipe',
          sentence: 'Pick the furnace and what goes in.',
        },
      ],
    }),
    history: () => history,
  });
  await feed.start();
  await feed.prepare();
});

afterAll(() => {
  feed.dispose();
  client.dispose();
});

const ids = async (text: string): Promise<string[]> => {
  const answer = await client.query({ text, mode: 'easy' });
  return [...(answer?.best ?? []), ...(answer?.sections.flatMap((s) => s.hits) ?? [])].map(
    (hit) => hit.entry.id,
  );
};

describe('the search feed', () => {
  it('sends the static, guide, vanilla and project layers', async () => {
    await wait(20);
    expect(statics.map((spec) => spec.targetId)).toEqual([DEFAULT_TARGET]);
    expect(layers.map((entry) => entry.layer).sort()).toEqual(['guide', 'project', 'vanilla']);
    expect(layers.find((entry) => entry.layer === 'vanilla')?.things).toBeGreaterThan(1000);
    expect(await ids('ruby sword')).toContain('project:element:gems:ruby_sword');
    expect(await ids('smelting recipe')).toContain('guide:recipes#add-a-smelting-recipe');
    expect(await ids('Plain Test Rock')).toContain('vanilla:thing:stone');
  });

  it('lets a project edit reach a query within the debounce', async () => {
    const before = patches.length;
    const edited = Date.now();
    session.set(
      projectWith([
        { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
        { id: 'gems:moonstone_lamp', kind: 'msm:block', data: { display_name: 'Moonstone Lamp' } },
      ]),
    );
    session.set(
      projectWith([
        { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
        { id: 'gems:moonstone_lamp', kind: 'msm:block', data: { display_name: 'Moonstone Lamp' } },
      ]),
    );
    await wait(PROJECT_DELAY_MS - 100);
    expect(patches.length).toBe(before);
    await wait(150);
    expect(patches.length).toBe(before + 1);
    const patch = patches[patches.length - 1];
    expect(patch?.upserts).toContain('project:element:gems:moonstone_lamp');
    expect(patch?.upserts).not.toContain('project:element:gems:ruby_sword');
    expect((patch?.at ?? 0) - edited).toBeGreaterThanOrEqual(PROJECT_DELAY_MS - 5);
    expect(await ids('moonstone lamp')).toContain('project:element:gems:moonstone_lamp');
  });

  it('removes deleted things and sends the context with the mod’s ids and the history', async () => {
    history = withChoice(history, 'flow:gear-set');
    session.set(
      projectWith([
        { id: 'gems:ruby_sword', kind: 'msm:item', data: { display_name: 'Ruby Sword' } },
      ]),
    );
    await feed.flush();
    expect(patches[patches.length - 1]?.removes).toContain('project:element:gems:moonstone_lamp');
    expect(await ids('moonstone lamp')).not.toContain('project:element:gems:moonstone_lamp');
  });

  it('rebuilds the static and vanilla layers when the mod’s target changes', async () => {
    if (OTHER_TARGET === DEFAULT_TARGET) return;
    const project = projectWith([{ id: 'gems:ruby_sword', kind: 'msm:item' }]);
    session.set({ ...project, targets: [OTHER_TARGET] });
    await wait(50);
    await feed.prepare();
    expect(statics.map((spec) => spec.targetId)).toEqual([DEFAULT_TARGET, OTHER_TARGET]);
    // No jar names for the other target: names are made from the ids.
    expect(await ids('stone')).toContain('vanilla:thing:stone');
    expect(client.entry('vanilla:thing:stone')?.title).toBe('Stone');
  });
});

describe('a layer delta', () => {
  it('sends only what changed', () => {
    const a = {
      id: 'a',
      source: 'project',
      title: 'A',
      available: true,
      action: { type: 'x' },
      preview: { type: 'x' },
    } as const;
    const b = { ...a, id: 'b', title: 'B' };
    const held = new Map<string, SearchEntry>([
      ['a', a],
      ['b', b],
    ]);
    expect(layerDelta(held, [a, { ...b, title: 'B2' }])).toEqual({
      upserts: [{ ...b, title: 'B2' }],
      removes: [],
    });
    expect(layerDelta(held, [a])).toEqual({ upserts: [], removes: ['b'] });
  });
});
