import type { Element, Project } from '@msm/plugin-api';
import type { OddsStep } from '@msm/sim';
import { describe, expect, it } from 'vitest';
import {
  DATA_SETS_KEPT,
  dataFolderOfKind,
  type LiveViewAnswer,
  LiveViewClient,
  type LiveViewRequest,
  projectDataFiles,
  seedNumber,
} from '../../../../src/renderer/src/liveviews/client';
import {
  answerRequest,
  createLiveViewHost,
  createStore,
  existsIn,
  mapLookup,
  SIM_ENGINE,
} from '../../../../src/renderer/src/liveviews/worker';
import { facts, fakeEngine, hostWorker, settle } from './fakes';

const situation = { context: 'minecraft:block' } as const;

function dataMessage(
  hash: string,
  project = {},
  vanillaKey: string | null = null,
  registries: Record<string, string[]> | null = null,
) {
  return {
    registries,
    token: 0,
    lane: '',
    kind: 'data',
    hash,
    project,
    vanillaKey,
    facts: facts(),
  } as const satisfies LiveViewRequest;
}

describe('the live views worker (B608)', () => {
  it('looks up the project’s file over vanilla’s, each layer also alone', () => {
    const store = createStore();
    answerRequest(
      {
        token: 0,
        lane: '',
        kind: 'vanilla',
        key: '9.9',
        folders: {
          loot_table: { 'minecraft:b': { from: 'vanilla' }, 'minecraft:c': { from: 'vanilla' } },
        },
      },
      store,
    );
    answerRequest(
      dataMessage(
        'h',
        { loot_table: { 'demo:a': { from: 'project' }, 'minecraft:b': { from: 'project' } } },
        '9.9',
      ),
      store,
    );
    const lookup = store.data.get('h')?.lookup;
    if (lookup === undefined) throw new Error('no file set');
    expect(lookup('loot_table', 'demo:a')).toEqual({ from: 'project' });
    expect(lookup('loot_table', 'b')).toEqual({ from: 'project' });
    expect(lookup('loot_table', '#minecraft:c')).toEqual({ from: 'vanilla' });
    expect(lookup('advancement', 'minecraft:c')).toBeUndefined();
    expect(lookup.vanilla('loot_table', 'minecraft:b')).toEqual({ from: 'vanilla' });
    expect(lookup.project('loot_table', 'minecraft:c')).toBeUndefined();
  });

  it('answers a job from the files it holds, seeded: the same seed gives the same roll', () => {
    const store = createStore();
    const engine = fakeEngine();
    expect(
      answerRequest(
        {
          token: 1,
          lane: '',
          kind: 'vanilla',
          key: '9.9',
          folders: { loot_table: { 'minecraft:x': { item: 'minecraft:stone' } } },
        },
        store,
        engine,
      ),
    ).toBeNull();
    expect(
      answerRequest(
        dataMessage('h1', { loot_table: { 'demo:named': { item: 'demo:ruby' } } }, '9.9'),
        store,
        engine,
      ),
    ).toBeNull();
    const roll = (seed: string, token: number) =>
      answerRequest(
        { token, lane: 'a', data: 'h1', kind: 'roll', table: {}, situation, seed },
        store,
        engine,
      );
    const first = roll('1', 2) as Extract<LiveViewAnswer, { kind: 'result' }>;
    expect(first.kind).toBe('result');
    expect(first.job).toBe('roll');
    expect((roll('1', 3) as typeof first).result).toEqual(first.result);
    expect((first.result as unknown as { stacks: { id: string }[] }).stacks[0]?.id).toBe(
      'demo:ruby',
    );
    expect(
      answerRequest(
        { token: 4, lane: 'a', data: 'nope', kind: 'tag', registry: 'item', id: 'x' },
        store,
        engine,
      ),
    ).toMatchObject({ kind: 'error' });
  });

  it('resolves tags in the target’s tags folder, checked against the registries sent', () => {
    const store = createStore();
    const calls = { rolls: 0, odds: 0, tags: [] as string[] };
    const engine = fakeEngine(calls);
    answerRequest(
      dataMessage(
        'h',
        { 'tags/item': { 'demo:gems': { values: ['demo:ruby', 'demo:gone'] } } },
        null,
        { item: ['demo:ruby'] },
      ),
      store,
      engine,
    );
    const tag = answerRequest(
      { token: 1, lane: '', data: 'h', kind: 'tag', registry: 'item', id: 'demo:gems' },
      store,
      engine,
    );
    expect(tag).toMatchObject({ kind: 'result', result: { members: [{ id: 'demo:ruby' }] } });
    expect((tag as unknown as { result: { members: unknown[] } }).result.members).toHaveLength(1);
    expect(calls.tags).toEqual(['item|demo:gems']);
    for (let i = 0; i < DATA_SETS_KEPT; i += 1) {
      answerRequest(dataMessage(`other${i}`), store, engine);
    }
    expect(store.data.has('h')).toBe(false);
    expect(store.data.size).toBe(DATA_SETS_KEPT);
  });

  it('knows a registry’s members, and cannot tell for a registry not sent', () => {
    const exists = existsIn({ item: ['minecraft:stone', 'demo:ruby'] });
    expect(exists?.('item', 'stone')).toBe(true);
    expect(exists?.('minecraft:item', 'demo:ruby')).toBe(true);
    expect(exists?.('item', 'demo:gone')).toBe(false);
    expect(exists?.('block', 'stone')).toBeUndefined();
    expect(existsIn(null)).toBeUndefined();
    expect(mapLookup(undefined)('loot_table', 'x')).toBeUndefined();
  });

  it('merges the project’s tag into vanilla’s with the real resolver', () => {
    const store = createStore();
    answerRequest(
      {
        token: 0,
        lane: '',
        kind: 'vanilla',
        key: '9.9',
        folders: { 'tags/item': { 'minecraft:made_up': { values: ['minecraft:stone'] } } },
      },
      store,
    );
    answerRequest(
      dataMessage('h', { 'tags/item': { 'minecraft:made_up': { values: ['demo:ruby'] } } }, '9.9'),
      store,
    );
    const answer = answerRequest(
      { token: 2, lane: '', data: 'h', kind: 'tag', registry: 'item', id: 'minecraft:made_up' },
      store,
    ) as unknown as { kind: string; result: { members: { id: string; origin: string }[] } };
    expect(answer.kind).toBe('result');
    expect(answer.result.members.map((m) => `${m.id} ${m.origin}`).sort()).toEqual([
      'demo:ruby project',
      'minecraft:stone vanilla',
    ]);
  });

  it('runs the real evaluators of @msm/sim', () => {
    const store = createStore();
    answerRequest(dataMessage('h'), store, SIM_ENGINE);
    const answer = answerRequest(
      { token: 7, lane: '', data: 'h', kind: 'roll', table: { pools: [] }, situation, seed: '1' },
      store,
    );
    expect(answer).toMatchObject({ token: 7, kind: 'result', job: 'roll' });
  });

  it('steps the odds, answers single jobs first, and stops at a cancel', () => {
    const posted: LiveViewAnswer[] = [];
    const queue: (() => void)[] = [];
    const host = createLiveViewHost(
      fakeEngine(),
      (answer) => posted.push(answer),
      (run) => {
        queue.push(run);
      },
    );
    const drain = () => {
      while (queue.length > 0) queue.shift()?.();
    };
    host.receive(dataMessage('h'));
    host.receive({
      token: 1,
      lane: 'o',
      data: 'h',
      kind: 'odds',
      table: {},
      situation,
      seed: '1',
      rolls: 1000,
      step: 300,
    });
    host.receive({ token: 2, lane: 'r', data: 'h', kind: 'roll', table: {}, situation, seed: '1' });
    queue.shift()?.();
    expect(posted[0]).toMatchObject({ token: 2, kind: 'result', job: 'roll' });
    drain();
    const odds = posted.filter((answer) => answer.token === 1);
    expect(odds.map((answer) => answer.kind)).toEqual(['step', 'step', 'step', 'result']);
    expect(odds.at(-1)).toMatchObject({ result: { done: 1000 } });

    posted.length = 0;
    host.receive({
      token: 3,
      lane: 'o',
      data: 'h',
      kind: 'odds',
      table: {},
      situation,
      seed: '1',
      rolls: 1000,
      step: 100,
    });
    queue.shift()?.();
    host.receive({ token: 3, lane: 'o', kind: 'cancel' });
    drain();
    expect(posted.map((answer) => answer.kind)).toEqual(['step']);
    expect(host.queued).toBe(0);
  });

  it('answers a ping at once', () => {
    const posted: LiveViewAnswer[] = [];
    const host = createLiveViewHost(
      fakeEngine(),
      (answer) => posted.push(answer),
      () => undefined,
    );
    host.receive({ token: 9, lane: 'p', kind: 'ping' });
    expect(posted).toEqual([{ token: 9, kind: 'not_yet' }]);
  });
});

describe('the live views client (B608)', () => {
  it('sends files once, vanilla folders once per version, and runs jobs over them', async () => {
    const worker = hostWorker(fakeEngine());
    const client = new LiveViewClient({ createWorker: () => worker });
    const vanilla = { key: '9.9', folders: { loot_table: { 'minecraft:x': {} } } };
    const data = client.setData({ project: {}, vanilla, facts: facts() });
    expect(client.setData({ project: {}, vanilla, facts: facts() })).toBe(data);
    const other = client.setData({
      project: { loot_table: { 'demo:named': { item: 'demo:ruby' } } },
      vanilla,
      facts: facts(),
    });
    expect(other).not.toBe(data);
    const roll = await client.run('lane', other, { kind: 'roll', table: {}, situation, seed: '5' });
    expect(roll?.stacks[0]?.id).toBe('demo:ruby');
    const kinds = worker.sent.map((message) => message.kind);
    expect(kinds).toEqual(['vanilla', 'data', 'data', 'roll']);
    client.dispose();
  });

  it('answers a repeated job from its cache, and the odds step by step', async () => {
    const worker = hostWorker(fakeEngine());
    const client = new LiveViewClient({ createWorker: () => worker });
    const data = client.setData({ project: {}, vanilla: null, facts: facts() });
    const steps: OddsStep[] = [];
    const job = { kind: 'odds', table: {}, situation, seed: '1', rolls: 1000, step: 400 } as const;
    const odds = await client.run('odds', data, job, (step) => steps.push(step));
    expect(odds?.done).toBe(1000);
    expect(steps.map((step) => step.done)).toEqual([400, 800, 1000]);
    const before = client.posted;
    const again: OddsStep[] = [];
    expect((await client.run('odds', data, job, (step) => again.push(step)))?.done).toBe(1000);
    expect(client.posted).toBe(before);
    expect(again).toHaveLength(1);
    client.dispose();
  });

  it('cancels a lane’s older request, and rejects a job on files it never sent', async () => {
    const worker = hostWorker(fakeEngine());
    const client = new LiveViewClient({ createWorker: () => worker });
    const data = client.setData({ project: {}, vanilla: null, facts: facts() });
    const first = client.run('lane', data, { kind: 'roll', table: {}, situation, seed: '1' });
    const second = client.run('lane', data, { kind: 'roll', table: {}, situation, seed: '2' });
    expect(await first).toBeNull();
    expect(await second).not.toBeNull();
    await expect(
      client.run('lane', 'unknown', { kind: 'roll', table: {}, situation, seed: '1' }),
    ).rejects.toThrow(/not given/);
    for (let i = 0; i < DATA_SETS_KEPT; i += 1) {
      client.setData({
        project: { loot_table: { [`demo:t${i}`]: {} } },
        vanilla: null,
        facts: facts(),
      });
    }
    await expect(
      client.run('lane', data, { kind: 'roll', table: {}, situation, seed: '1' }),
    ).rejects.toThrow(/not given/);
    // Sent again, it works again.
    const back = client.setData({ project: {}, vanilla: null, facts: facts() });
    expect(back).toBe(data);
    expect(
      await client.run('lane', back, { kind: 'roll', table: {}, situation, seed: '1' }),
    ).not.toBeNull();
    await settle();
    client.dispose();
  });

  it('passes a worker’s error on to the view', async () => {
    const engine = fakeEngine();
    const worker = hostWorker({
      ...engine,
      rollLoot() {
        throw new Error('broken table');
      },
    });
    const client = new LiveViewClient({ createWorker: () => worker });
    const data = client.setData({ project: {}, vanilla: null, facts: facts() });
    await expect(
      client.run('lane', data, { kind: 'roll', table: {}, situation, seed: '1' }),
    ).rejects.toThrow('broken table');
    client.dispose();
  });
});

describe('the files a view sends (B608)', () => {
  it('maps the data kinds to their folders', () => {
    expect(dataFolderOfKind('minecraft:loot_table')).toBe('loot_table');
    expect(dataFolderOfKind('minecraft:tag/item')).toBe('tags/item');
    expect(dataFolderOfKind('minecraft:function')).toBeNull();
    expect(dataFolderOfKind('msm:loot_addition')).toBeNull();
    const element = (id: string, kind: string, data: unknown) =>
      ({ id, kind, data }) as unknown as Element;
    const project = {
      namespaces: [
        {
          name: 'demo',
          elements: [
            element('demo:blocks/ruby', 'minecraft:loot_table', { pools: [] }),
            element('demo:gems', 'minecraft:tag/item', { values: [] }),
            element('demo:go', 'minecraft:function', 'say hi'),
          ],
        },
      ],
    } as unknown as Project;
    expect(projectDataFiles(project)).toEqual({
      loot_table: { 'demo:blocks/ruby': { pools: [] } },
      'tags/item': { 'demo:gems': { values: [] } },
    });
    expect(projectDataFiles(project, ['tags/item'])).toEqual({
      'tags/item': { 'demo:gems': { values: [] } },
    });
  });

  it('turns a seed into the number it rolls with', () => {
    expect(seedNumber('1')).toBe(1);
    expect(seedNumber(' 42 ')).toBe(42);
    expect(seedNumber('ruby')).toBe(seedNumber('ruby'));
    expect(seedNumber('ruby')).not.toBe(seedNumber('rubies'));
    expect(seedNumber('99999999999')).toBeLessThanOrEqual(0xffffffff);
  });
});
