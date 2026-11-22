// @vitest-environment happy-dom

/**
 * B610's views over the real evaluators of `@msm/sim` (run by the real worker host in this
 * thread): a predicate's parts each show their answer, unknown is shown as unknown and never as
 * no, an item modifier's before and after, an enchantment's level table following a cost edit.
 * Only MSM's own made-up files; no Mojang file.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveViewClient } from '../../../../src/renderer/src/liveviews/client';
import EnchantmentCard from '../../../../src/renderer/src/liveviews/data/EnchantmentCard';
import EnchantmentView from '../../../../src/renderer/src/liveviews/data/enchantment/EnchantmentView';
import PredicateView from '../../../../src/renderer/src/liveviews/data/predicate/PredicateView';
import TryItOn from '../../../../src/renderer/src/liveviews/data/TryItOn';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
} from '../../../../src/renderer/src/liveviews/view-prefs';
import { SIM_ENGINE } from '../../../../src/renderer/src/liveviews/worker';
import { hostWorker } from '../frame/fakes';

afterEach(cleanup);

function element(kind: string, id: string, data: Json): Element {
  return { id, kind, data } as unknown as Element;
}

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

type View = (props: LiveViewProps & { client?: LiveViewClient }) => React.ReactNode;

/** Renders a view with its preferences held in state, as the app's store holds them. */
function Harness(props: {
  view: View;
  project: Project;
  element: Element;
  client: LiveViewClient;
  vanilla?: VanillaDataReader;
  prefs?: Partial<LiveViewPrefs>;
  onSetup?: () => void;
}) {
  const [prefs, setPrefs] = useState<LiveViewPrefs>({ ...DEFAULT_PREFS, ...props.prefs });
  const ViewOf = props.view;
  return (
    <ViewOf
      project={props.project}
      element={props.element}
      vanilla={props.vanilla ?? NOT_SET_UP_VANILLA_DATA}
      vanillaAssets={null}
      preferences={prefs}
      onPreferences={(patch) => setPrefs((before) => ({ ...before, ...patch }))}
      onSetup={props.onSetup ?? vi.fn()}
      client={props.client}
    />
  );
}

const newClient = () => new LiveViewClient({ createWorker: () => hostWorker(SIM_ENGINE) });

/** A cache with some made-up vanilla files (MSM's own, not Mojang's). */
function fakeVanilla(files: Record<string, Record<string, Json>>): VanillaDataReader {
  return createVanillaDataReader({
    mcVersion: '9.9',
    read: async (version, folders) => ({
      version,
      folders: Object.fromEntries(folders.map((folder) => [folder, files[folder] ?? {}])),
      fileCount: 0,
    }),
  });
}

describe('Try it on: a predicate (B610)', () => {
  const predicate = element('minecraft:predicate', 'demo:needs_pickaxe', {
    type: 'minecraft:all_of',
    terms: [
      { type: 'minecraft:random_chance', chance: 1 },
      { type: 'minecraft:match_tool', predicate: { items: 'minecraft:diamond_pickaxe' } },
      { type: 'minecraft:enchantment_active_check', active: true },
    ],
  });

  it('shows the answer of every part beside it, and unknown as unknown, never as no', async () => {
    const client = newClient();
    render(
      <Harness
        view={PredicateView}
        project={projectOf(predicate)}
        element={predicate}
        client={client}
        prefs={{ situation: 'mine_pickaxe' }}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('predicate-part')).toHaveLength(4));
    const parts = screen.getAllByTestId('predicate-part');
    expect(
      parts.map((part) => [part.getAttribute('data-path'), part.getAttribute('data-answer')]),
    ).toEqual([
      // `@msm/sim` puts an all_of's own answer at its terms' pointer.
      ['/terms', 'unknown'],
      ['/terms/0', 'yes'],
      ['/terms/1', 'yes'],
      ['/terms/2', 'unknown'],
    ]);
    const answer = screen.getByTestId('predicate-answer');
    expect(answer.getAttribute('data-answer')).toBe('unknown');
    expect(answer.textContent).toBe('Only the game knows');
    expect(
      within(parts[3] as HTMLElement).getByTestId('predicate-part-unknown').textContent,
    ).not.toBe('');
    expect(within(parts[3] as HTMLElement).queryByText('No')).toBeNull();
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    client.dispose();
  });

  it('turns from yes to no when the situation changes', async () => {
    const simple = element('minecraft:predicate', 'demo:pick', {
      type: 'minecraft:match_tool',
      predicate: { items: 'minecraft:diamond_pickaxe' },
    });
    const client = newClient();
    render(
      <Harness
        view={TryItOn}
        project={projectOf(simple)}
        element={simple}
        client={client}
        prefs={{ situation: 'mine_pickaxe' }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('predicate-answer').getAttribute('data-answer')).toBe('yes'),
    );
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe('checked');
    await act(async () => {
      screen.getByRole('radio', { name: 'Mining a block with your hand' }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('predicate-answer').getAttribute('data-answer')).toBe('no'),
    );
    expect(screen.getByTestId('predicate-answer').textContent).toBe('No');
    client.dispose();
  });

  it('gives the likelihood of yes for a part that goes by chance', async () => {
    const chance = element('minecraft:predicate', 'demo:coin', {
      type: 'minecraft:random_chance',
      chance: 0.25,
    });
    const client = newClient();
    render(
      <Harness view={PredicateView} project={projectOf(chance)} element={chance} client={client} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('predicate-chance').textContent).toBe('Yes in 25% of tries'),
    );
    client.dispose();
  });
});

describe('Try it on: an item modifier (B610)', () => {
  it('shows the item before and after, with their tooltips', async () => {
    const modifier = element('minecraft:item_modifier', 'demo:ruby_blade', [
      { type: 'minecraft:set_name', name: 'Ruby blade' },
      { type: 'minecraft:set_lore', lore: ['Made in a test'], mode: 'append' },
      { type: 'minecraft:set_damage', damage: 0.5 },
      { type: 'minecraft:fill_player_head', entity: 'this' },
    ]);
    const client = newClient();
    render(
      <Harness view={TryItOn} project={projectOf(modifier)} element={modifier} client={client} />,
    );
    const after = await screen.findByTestId('modifier-after');
    await waitFor(() =>
      expect(within(after).getByTestId('live-view-tooltip').textContent).toContain('Ruby blade'),
    );
    const lines = within(after).getByTestId('live-view-tooltip').textContent ?? '';
    expect(lines).toContain('Made in a test');
    expect(lines).toContain('Durability: 781 / 1561');
    const before = screen.getByTestId('modifier-before');
    expect(within(before).getByTestId('live-view-tooltip').textContent).toBe('Diamond Sword');
    expect(screen.getByTestId('live-view-unsupported').textContent).toContain('fill_player_head');
    expect(screen.getByTestId('modifier-parts').textContent).toContain('set_name');
    client.dispose();
  });

  it('turns a book with enchantments into an enchanted book', async () => {
    const frost = element('minecraft:enchantment', 'demo:frost', {
      description: 'Frost',
      max_level: 3,
      supported_items: 'minecraft:diamond_sword',
      weight: 1,
      min_cost: { base: 1, per_level_above_first: 1 },
      max_cost: { base: 5, per_level_above_first: 1 },
      anvil_cost: 1,
      slots: ['mainhand'],
    });
    const modifier = element('minecraft:item_modifier', 'demo:frost_book', {
      type: 'minecraft:set_enchantments',
      enchantments: { 'demo:frost': 2 },
    });
    const client = newClient();
    render(
      <Harness
        view={TryItOn}
        project={projectOf(frost, modifier)}
        element={modifier}
        client={client}
        prefs={{ sampleItem: 'minecraft:book' }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('modifier-after-slot').getAttribute('data-item')).toBe(
        'minecraft:enchanted_book',
      ),
    );
    const after = screen.getByTestId('modifier-after');
    expect(within(after).getByTestId('live-view-tooltip').textContent).toContain('Frost II');
    client.dispose();
  });
});

describe('an enchantment (B610)', () => {
  const data = {
    description: 'Frost',
    max_level: 3,
    supported_items: '#demo:blades',
    weight: 5,
    anvil_cost: 2,
    min_cost: { base: 1, per_level_above_first: 11 },
    max_cost: { base: 21, per_level_above_first: 11 },
    slots: ['mainhand'],
    effects: {
      'minecraft:damage': [{ effect: { type: 'minecraft:add', value: 2 } }],
    },
  };
  const blades = element('minecraft:tag/item', 'demo:blades', {
    values: ['minecraft:diamond_sword', 'minecraft:iron_sword'],
  });

  it('shows the card: lines at each level, the level table, what it goes on, its effects', async () => {
    const frost = element('minecraft:enchantment', 'demo:frost', data);
    const client = newClient();
    const onSetup = vi.fn();
    render(
      <Harness
        view={EnchantmentCard}
        project={projectOf(frost, blades)}
        element={frost}
        client={client}
        onSetup={onSetup}
      />,
    );
    expect(screen.getByTestId('enchantment-lines').textContent).toBe('Frost IFrost IIFrost III');
    expect(screen.getAllByTestId('enchantment-min-cost').map((cell) => cell.textContent)).toEqual([
      '1',
      '12',
      '23',
    ]);
    await waitFor(() =>
      expect(within(screen.getByTestId('enchantment-items')).getAllByRole('img')).toHaveLength(2),
    );
    expect(screen.getByTestId('enchantment-effects').textContent).toContain(
      'Changes the damage dealt',
    );
    expect(screen.getByTestId('enchantment-slot-costs').textContent).toContain(
      'the top slot costs 2 to 10, the middle 6 to 21 and the bottom 30 levels',
    );
    // The table's pool is vanilla's: without the Minecraft folder, the banner, not a made-up chance.
    expect(screen.getByTestId('enchantment-table-chances').textContent).toContain(
      'need Minecraft’s own enchantments',
    );
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
    client.dispose();
  });

  it('follows a cost edit in the level table at once', () => {
    const client = newClient();
    const frost = element('minecraft:enchantment', 'demo:frost', data);
    const { rerender } = render(
      <Harness view={EnchantmentView} project={projectOf(frost)} element={frost} client={client} />,
    );
    expect(screen.getByTestId('enchantment-level-2').textContent).toContain('12');
    const edited = element('minecraft:enchantment', 'demo:frost', {
      ...data,
      min_cost: { base: 1, per_level_above_first: 5 },
    });
    rerender(
      <Harness
        view={EnchantmentView}
        project={projectOf(edited)}
        element={edited}
        client={client}
      />,
    );
    expect(
      within(screen.getByTestId('enchantment-level-2')).getByTestId('enchantment-min-cost')
        .textContent,
    ).toBe('6');
    client.dispose();
  });

  it('gives the enchanting table’s chances at a cost from the table’s own pool', async () => {
    const frost = element('minecraft:enchantment', 'demo:frost', {
      ...data,
      supported_items: 'minecraft:book',
    });
    const vanilla = fakeVanilla({
      'tags/enchantment': {
        'minecraft:in_enchanting_table': { values: ['demo:frost'] },
        'minecraft:curse': { values: [] },
      },
    });
    const client = newClient();
    render(
      <Harness
        view={EnchantmentView}
        project={projectOf(frost)}
        element={frost}
        client={client}
        vanilla={vanilla}
        prefs={{ sampleItem: 'minecraft:book' }}
      />,
    );
    await waitFor(
      () => expect(screen.getByTestId('enchantment-table-total').textContent).toBe('100%'),
      { timeout: 5000 },
    );
    expect(screen.getByTestId('enchantment-table-chances').textContent).toContain('Frost III');
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
    client.dispose();
  });
});
