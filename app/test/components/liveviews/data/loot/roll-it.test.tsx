// @vitest-environment happy-dom

/**
 * Roll it (B609): the loot table, extra drops, enchantment provider and trial spawner views over
 * the real `@msm/sim` evaluators, run by the live views worker's host in this thread. Only MSM's
 * own made-up tables; no Mojang file.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  additionTables,
  howMany,
  ODDS_WORDS,
  percent,
  tableContexts,
  tableSubject,
  tableWords,
} from '../../../../../src/renderer/src/liveviews/data/loot/loot-model';
import RollIt from '../../../../../src/renderer/src/liveviews/data/loot/RollIt';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../../src/renderer/src/liveviews/vanilla-data';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
} from '../../../../../src/renderer/src/liveviews/view-prefs';
import {
  answerRequest,
  createStore,
  idsOf,
} from '../../../../../src/renderer/src/liveviews/worker';
import { facts } from '../../frame/fakes';

vi.mock('../../../../../src/renderer/src/liveviews/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../src/renderer/src/liveviews/client')>();
  let client: InstanceType<typeof actual.LiveViewClient> | null = null;
  return {
    ...actual,
    sharedLiveViewClient: () => {
      client ??= new actual.LiveViewClient({
        createWorker: async () => {
          const { SIM_ENGINE } = await import('../../../../../src/renderer/src/liveviews/worker');
          const { hostWorker } = await import('../../frame/fakes');
          return hostWorker(SIM_ENGINE);
        },
      });
      return client;
    },
  };
});

afterEach(cleanup);

const item = (name: string, weight = 1, modifier?: Json): Json => ({
  type: 'minecraft:item',
  name,
  weight,
  ...(modifier === undefined ? {} : { modifier }),
});

const pool = (...entries: Json[]): Json => ({ rolls: 1, entries });

function projectOf(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

const element = (id: string, kind: string, data: Json): Element =>
  ({ id, kind, data }) as unknown as Element;

let versions = 0;

/**
 * A made-up vanilla cache (no Mojang file), as its own version: the shared client sends a
 * version's folders to the worker once, as one installed version has one set of files.
 */
function vanillaOf(folders: Record<string, Record<string, Json>>): VanillaDataReader {
  versions += 1;
  return createVanillaDataReader({
    mcVersion: `9.${versions}`,
    read: async (version, asked) => ({
      version,
      folders: Object.fromEntries(asked.map((folder) => [folder, folders[folder] ?? {}])),
      fileCount: 0,
    }),
  });
}

interface Shown {
  rerender(next: { project?: Project; element?: Element; prefs?: Partial<LiveViewPrefs> }): void;
  onSetup: ReturnType<typeof vi.fn>;
  onPreferences: ReturnType<typeof vi.fn>;
}

function show(
  project: Project,
  shown: Element,
  options: { vanilla?: VanillaDataReader; prefs?: Partial<LiveViewPrefs> } = {},
): Shown {
  const onSetup = vi.fn();
  const onPreferences = vi.fn();
  let state = { project, element: shown, prefs: { ...DEFAULT_PREFS, ...options.prefs } };
  const vanilla = options.vanilla ?? NOT_SET_UP_VANILLA_DATA;
  const view = () => (
    <RollIt
      project={state.project}
      element={state.element}
      vanilla={vanilla}
      vanillaAssets={null}
      preferences={state.prefs}
      onPreferences={onPreferences}
      onSetup={onSetup}
    />
  );
  const result = render(view());
  return {
    onSetup,
    onPreferences,
    rerender(next) {
      state = {
        project: next.project ?? state.project,
        element: next.element ?? state.element,
        prefs: { ...state.prefs, ...next.prefs },
      };
      result.rerender(view());
    },
  };
}

/** The odds rows on screen by item: their chance. */
function oddsOf(testId = 'odds'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of screen.queryAllByTestId(new RegExp(`^${testId}-row-\\d+$`))) {
    out[row.getAttribute('data-item') ?? ''] = Number(row.getAttribute('data-chance'));
  }
  return out;
}

/** Waits until the odds have all 1,000 rolls (no "so far" line) and a row matches. */
async function oddsDone(testId: string, check: (rows: Record<string, number>) => boolean) {
  await waitFor(
    () => {
      expect(screen.queryByTestId(`${testId}-done`)).toBeNull();
      expect(check(oddsOf(testId))).toBe(true);
    },
    { timeout: 4000 },
  );
}

describe('Roll it on a loot table (B609)', () => {
  const tableOf = (stoneWeight: number) =>
    element('demo:blocks/ruby', 'minecraft:loot_table', {
      type: 'minecraft:block',
      pools: [pool(item('minecraft:dirt', 1), item('minecraft:stone', stoneWeight))],
    });

  it('rolls once and shows the odds out of 1,000, then follows a weight edit within the budget', async () => {
    const table = tableOf(1);
    const view = show(projectOf([table]), table);
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('roll-it-fidelity').textContent).toBe('One roll: MSM’s own');
    await waitFor(() => expect(screen.getByTestId('roll-it-stacks')).toBeTruthy(), {
      timeout: 4000,
    });
    await oddsDone('odds', (rows) => Math.abs((rows['minecraft:stone'] ?? 0) - 0.5) < 0.06);
    expect(screen.getByTestId('odds-fidelity').textContent).toBe(ODDS_WORDS.checked);
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe('checked');
    expect(screen.getByTestId('situation-picker')).toBeTruthy();
    expect(
      screen.getByText('Your roll in the game will differ; the odds are the same.'),
    ).toBeTruthy();

    const edited = tableOf(3);
    const started = performance.now();
    act(() => view.rerender({ project: projectOf([edited]), element: edited }));
    // The first step of the edited table's odds (after 150 ms and the first 100 rolls).
    await waitFor(() => expect(oddsOf()['minecraft:stone'] ?? 0).toBeGreaterThan(0.62), {
      timeout: 4000,
      interval: 5,
    });
    const firstStep = performance.now() - started;
    await oddsDone('odds', (rows) => Math.abs((rows['minecraft:stone'] ?? 0) - 0.75) < 0.06);
    const allRolls = performance.now() - started;
    // 150 ms after the edit, then a first result within 250 ms (ADR 0120, "Follows an edit");
    // the budget's 400 ms with room for a loaded test machine.
    expect(firstStep).toBeLessThan(800);
    console.info(
      `B609 weight edit: first odds step ${firstStep.toFixed(0)} ms, 1,000 rolls ${allRolls.toFixed(0)} ms`,
    );
  });

  it('a new seed changes the roll and not the odds', async () => {
    const table = element('demo:blocks/ruby', 'minecraft:loot_table', {
      pools: [
        pool(
          item('minecraft:dirt', 1, {
            type: 'minecraft:set_count',
            count: { type: 'minecraft:uniform', min: 1, max: 64 },
          }),
        ),
      ],
    });
    const view = show(projectOf([table]), table, { prefs: { seed: '1' } });
    const countOf = async () => {
      await waitFor(() => expect(screen.getByTestId('roll-it-stack-0')).toBeTruthy(), {
        timeout: 4000,
      });
      return screen.getByTestId('roll-it-stack-0').getAttribute('data-count');
    };
    const first = await countOf();
    await oddsDone('odds', (rows) => rows['minecraft:dirt'] === 1);
    const oddsBefore = screen.getByTestId('odds-row-0').textContent;
    const seeds = ['2', '3', '4'];
    let changed = false;
    for (const seed of seeds) {
      act(() => view.rerender({ prefs: { seed } }));
      await waitFor(
        () =>
          expect(screen.getByTestId('roll-it-stack-0').getAttribute('data-count')).not.toBe(first),
        { timeout: 2000 },
      ).then(
        () => {
          changed = true;
        },
        () => undefined,
      );
      if (changed) break;
    }
    expect(changed).toBe(true);
    await oddsDone('odds', (rows) => rows['minecraft:dirt'] === 1);
    expect(screen.getByTestId('odds-row-0').textContent).toBe(oddsBefore);
  });

  it('the seed box and Roll again change only the view choices', async () => {
    const table = tableOf(1);
    const view = show(projectOf([table]), table);
    fireEvent.click(screen.getByTestId('live-view-roll'));
    expect(view.onPreferences).toHaveBeenCalledWith({ seed: expect.any(String) });
    expect(screen.getByTestId('live-view-roll').textContent).toContain('Roll again');
  });

  it('names a function only the game knows, and marks what it touched', async () => {
    const table = element('demo:entities/ghost', 'minecraft:loot_table', {
      pools: [
        pool(
          item('minecraft:player_head', 1, { type: 'minecraft:fill_player_head', entity: 'this' }),
        ),
      ],
    });
    show(projectOf([table]), table);
    await waitFor(
      () =>
        expect(
          screen
            .getByTestId('live-view-unsupported')
            .querySelector('[data-type="fill_player_head"]'),
        ).toBeTruthy(),
      { timeout: 4000 },
    );
    await oddsDone('odds', (rows) => rows['minecraft:player_head'] === 1);
    expect(screen.getByTestId('odds-row-0').getAttribute('data-uncertain')).toBe('true');
    expect(screen.getByTestId('odds-row-0-uncertain').textContent).toBe('Only the game knows');
    expect(screen.getByTestId('live-view-unsupported').textContent).toContain('Only in the game');
  });

  it('shows the set-up banner when a vanilla table it names is not there and the jar is not set up', async () => {
    const table = element('demo:chests/hoard', 'minecraft:loot_table', {
      pools: [pool({ type: 'minecraft:loot_table', value: 'minecraft:chests/made_up' })],
    });
    const view = show(projectOf([table]), table);
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy(), {
      timeout: 4000,
    });
    fireEvent.click(screen.getByText('Set up Minecraft folder'));
    expect(view.onSetup).toHaveBeenCalled();
  });

  it('reads a nested vanilla table from the jar cache when it is set up', async () => {
    const table = element('demo:chests/hoard', 'minecraft:loot_table', {
      pools: [pool({ type: 'minecraft:loot_table', value: 'minecraft:chests/made_up' })],
    });
    show(projectOf([table]), table, {
      vanilla: vanillaOf({
        loot_table: { 'minecraft:chests/made_up': { pools: [pool(item('minecraft:apple'))] } },
      }),
    });
    await oddsDone('odds', (rows) => rows['minecraft:apple'] === 1);
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
  });
});

describe('With and without (msm:loot_addition)', () => {
  const vanilla = () =>
    vanillaOf({
      loot_table: {
        'minecraft:entities/made_up_mob': {
          type: 'minecraft:entity',
          pools: [pool(item('minecraft:bone'))],
        },
      },
    });
  const addition = (chanceItem: string) =>
    element('demo:mob_extras', 'msm:loot_addition', {
      tables: ['minecraft:entities/made_up_mob'],
      pools: [pool(item(chanceItem))],
    });

  it('rolls the vanilla table without and with the additions, the added rows marked', async () => {
    const extra = addition('minecraft:emerald');
    const view = show(projectOf([extra]), extra, { vanilla: vanilla() });
    await oddsDone(
      'with-odds',
      (rows) => rows['minecraft:emerald'] === 1 && rows['minecraft:bone'] === 1,
    );
    await oddsDone('without-odds', (rows) => rows['minecraft:bone'] === 1);
    expect(oddsOf('without-odds')['minecraft:emerald']).toBeUndefined();
    const rows = screen.getAllByTestId(/^with-odds-row-\d+$/);
    const emerald = rows.find((row) => row.getAttribute('data-item') === 'minecraft:emerald');
    const bone = rows.find((row) => row.getAttribute('data-item') === 'minecraft:bone');
    expect(emerald?.getAttribute('data-added')).toBe('true');
    expect(bone?.getAttribute('data-added')).toBeNull();
    expect(screen.queryAllByTestId(/^without-odds-row-\d+-added$/)).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('with-roll-stacks')).toBeTruthy());
    expect(
      screen.getByTestId('with-roll-stacks').querySelector('[data-added="true"]'),
    ).toBeTruthy();

    // An edit to the addition shows on the With side.
    const edited = addition('minecraft:diamond');
    act(() => view.rerender({ project: projectOf([edited]), element: edited }));
    await oddsDone('with-odds', (rows) => rows['minecraft:diamond'] === 1);
  });

  it('says when Minecraft has no table of that name, and asks for a table when none is named', async () => {
    const stray = element('demo:stray', 'msm:loot_addition', {
      tables: ['minecraft:entities/no_such_mob'],
      pools: [pool(item('minecraft:emerald'))],
    });
    show(projectOf([stray]), stray, { vanilla: vanilla() });
    await waitFor(() => expect(screen.getByTestId('with-and-without-missing')).toBeTruthy());
    cleanup();
    const none = element('demo:none', 'msm:loot_addition', { tables: [], pools: [] });
    show(projectOf([none]), none, { vanilla: vanilla() });
    expect(screen.getByTestId('with-and-without-no-table')).toBeTruthy();
  });

  it('shows the set-up banner for a vanilla table without the jar', async () => {
    const extra = addition('minecraft:emerald');
    show(projectOf([extra]), extra);
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
  });
});

describe('Roll it on an item (minecraft:enchantment_provider)', () => {
  it('gives the item its enchantment once and in the odds', async () => {
    const provider = element('demo:sharp', 'minecraft:enchantment_provider', {
      type: 'minecraft:single',
      enchantment: 'minecraft:sharpness',
      level: 3,
    });
    show(projectOf([provider]), provider);
    await waitFor(
      () => expect(screen.getByTestId('enchant-roll-lines').textContent).toBe('Sharpness III'),
      {
        timeout: 4000,
      },
    );
    await waitFor(
      () => {
        const row = screen.getByTestId('enchant-odds-row-0');
        expect(row.getAttribute('data-enchantment')).toBe('minecraft:sharpness');
        expect(row.getAttribute('data-level')).toBe('3');
        expect(row.getAttribute('data-chance')).toBe('1');
      },
      { timeout: 4000 },
    );
    expect(screen.getByTestId('enchant-item')).toHaveProperty('value', 'minecraft:diamond_sword');
  });
});

describe('A trial spawner', () => {
  it('draws the waves per player count and rolls each reward table', async () => {
    const reward = element('demo:spawners/reward', 'minecraft:loot_table', {
      pools: [pool(item('minecraft:emerald'))],
    });
    const spawner = element('demo:crypt', 'minecraft:trial_spawner', {
      total_mobs: 6,
      total_mobs_added_per_player: 2,
      simultaneous_mobs: 2,
      simultaneous_mobs_added_per_player: 1,
      spawn_potentials: [{ weight: 3, data: { entity: { id: 'minecraft:zombie' } } }],
      loot_tables_to_eject: [{ weight: 1, data: 'demo:spawners/reward' }],
    });
    show(projectOf([reward, spawner]), spawner);
    expect(screen.getByTestId('trial-wave-1').getAttribute('data-total')).toBe('6');
    expect(screen.getByTestId('trial-wave-3').getAttribute('data-total')).toBe('10');
    expect(screen.getByTestId('trial-wave-3').getAttribute('data-at-once')).toBe('4');
    expect(screen.getByTestId('trial-mob-0').textContent).toBe('Zombie: 100%');
    expect(screen.getByTestId('trial-reward-0').getAttribute('data-table')).toBe(
      'demo:spawners/reward',
    );
    await oddsDone('trial-reward-0-odds', (rows) => rows['minecraft:emerald'] === 1);
    await waitFor(() => expect(screen.getByTestId('trial-reward-0-roll-stacks')).toBeTruthy());
    expect(screen.getByTestId('live-view-notes').textContent).toContain('ticks between spawn');
  });
});

describe('the worker gives the loot evaluators every id of a folder (B605 LootContext.ids)', () => {
  it('lists ids over the project and vanilla, or nothing for a folder neither holds', () => {
    const ids = idsOf(
      { enchantment: { 'demo:zap': {} } },
      { enchantment: { 'minecraft:sharpness': {} } },
    );
    expect(ids('enchantment')).toEqual(['demo:zap', 'minecraft:sharpness']);
    expect(ids('recipe')).toBeUndefined();
  });

  it('runs enchant_randomly without options over every enchantment it was sent', () => {
    const store = createStore();
    answerRequest(
      {
        token: 1,
        lane: '',
        kind: 'data',
        hash: 'h',
        project: {
          enchantment: {
            'demo:zap': {
              supported_items: 'minecraft:stick',
              weight: 1,
              max_level: 1,
              min_cost: { base: 1, per_level_above_first: 0 },
              max_cost: { base: 10, per_level_above_first: 0 },
            },
          },
        },
        vanillaKey: null,
        facts: facts(),
        registries: null,
      },
      store,
    );
    const answer = answerRequest(
      {
        token: 2,
        lane: 'a',
        data: 'h',
        kind: 'roll',
        table: {
          pools: [pool(item('minecraft:stick', 1, { type: 'minecraft:enchant_randomly' }))],
        },
        situation: { context: 'minecraft:empty' },
        seed: '1',
      },
      store,
    );
    expect(answer?.kind).toBe('result');
    const roll = (
      answer as unknown as { result: { stacks: { enchantments?: Record<string, number> }[] } }
    ).result;
    expect(roll.stacks[0]?.enchantments).toEqual({ 'demo:zap': 1 });
  });

  it('answers the enchant and enchant_odds jobs', () => {
    const store = createStore();
    answerRequest(
      {
        token: 1,
        lane: '',
        kind: 'data',
        hash: 'h',
        project: {},
        vanillaKey: null,
        facts: facts(),
        registries: null,
      },
      store,
    );
    const provider = { type: 'minecraft:single', enchantment: 'minecraft:unbreaking', level: 2 };
    const one = answerRequest(
      {
        token: 2,
        lane: 'a',
        data: 'h',
        kind: 'enchant',
        provider,
        item: { id: 'minecraft:diamond_sword', count: 1 },
        situation: { context: 'minecraft:empty' },
        seed: '1',
      },
      store,
    );
    expect(one).toMatchObject({
      kind: 'result',
      job: 'enchant',
      result: { item: { enchantments: { 'minecraft:unbreaking': 2 } } },
    });
    const odds = answerRequest(
      {
        token: 3,
        lane: 'a',
        data: 'h',
        kind: 'enchant_odds',
        provider,
        item: { id: 'minecraft:diamond_sword', count: 1 },
        situation: { context: 'minecraft:empty' },
        seed: '1',
        rolls: 200,
        step: 100,
      },
      store,
    );
    expect(odds).toMatchObject({ kind: 'result', job: 'enchant_odds', result: { done: 200 } });
  });
});

describe('the Roll it words', () => {
  it('says shares, counts, tables and subjects in plain words', () => {
    expect(percent(0)).toBe('0%');
    expect(percent(0.0004)).toBe('under 0.1%');
    expect(percent(0.034)).toBe('3.4%');
    expect(percent(0.5)).toBe('50%');
    expect(percent(1)).toBe('100%');
    expect(howMany({ item: 'a', chance: 0.5, mean: 1, counts: { 0: 500, 1: 250, 3: 250 } })).toBe(
      '1 to 3, about 2.0',
    );
    expect(howMany({ item: 'a', chance: 1, mean: 1, counts: { 1: 1000 } })).toBe('1');
    expect(tableWords('minecraft:entities/zombie')).toBe('Zombie (a mob)');
    expect(tableSubject('demo:blocks/ruby')).toEqual({ block: 'demo:ruby' });
    expect(tableSubject('demo:entities/ghost')).toEqual({ entity: 'demo:ghost' });
    expect(tableContexts({ type: 'minecraft:block' })).toEqual(['minecraft:block']);
    expect(tableContexts({ type: 'minecraft:made_up' })).toEqual([]);
    expect(
      additionTables({ tables: ['entities/zombie', 'minecraft:entities/zombie', 'demo:x'] }),
    ).toEqual(['minecraft:entities/zombie', 'demo:x']);
  });
});
