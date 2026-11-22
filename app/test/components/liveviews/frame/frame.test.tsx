// @vitest-environment happy-dom

import type { Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveViewClient } from '../../../../src/renderer/src/liveviews/client';
import {
  type UnsupportedPart,
  unsupportedLine,
} from '../../../../src/renderer/src/liveviews/frame/fidelity';
import {
  LiveViewFrame,
  needsSetUpBanner,
} from '../../../../src/renderer/src/liveviews/frame/LiveViewFrame';
import { useLiveViewData } from '../../../../src/renderer/src/liveviews/frame/live-data';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import { fakeEngine, hostWorker } from './fakes';

afterEach(cleanup);

const reported: UnsupportedPart[] = [
  {
    kind: 'function',
    type: 'minecraft:fill_player_head',
    path: '/pools/0/entries/0/functions/0',
    reason: 'not_supported',
  },
  {
    kind: 'function',
    type: 'minecraft:fill_player_head',
    path: '/pools/0/entries/0/functions/0',
    reason: 'not_supported',
  },
  {
    kind: 'condition',
    type: 'minecraft:location_check',
    path: '/conditions/0',
    reason: 'needs_world',
  },
  {
    kind: 'reference',
    type: 'minecraft:loot_table',
    path: '/pools/1/entries/0',
    reason: 'missing_file',
  },
];

describe('the live view frame (B608)', () => {
  it('lists every reported type once, by name, as only in the game', () => {
    render(
      <LiveViewFrame title="Loot table" fidelity="about_right" unsupported={reported}>
        <p>body</p>
      </LiveViewFrame>,
    );
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').textContent).toBe('About right');
    const list = screen.getByTestId('live-view-unsupported');
    expect(list.textContent).toContain('Only in the game');
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]?.getAttribute('data-type')).toBe('minecraft:fill_player_head');
    expect(items[0]?.textContent).toContain('minecraft:fill_player_head');
    expect(items[0]?.textContent).toContain('At /pools/0/entries/0/functions/0:');
    expect(items[1]?.textContent).toContain('At /conditions/0:');
    expect(items[2]?.textContent).toContain('was not found');
  });

  it('says nothing about parts when every part was worked out', () => {
    render(<LiveViewFrame title="Loot table" fidelity="checked" unsupported={[]} />);
    expect(screen.queryByTestId('live-view-unsupported')).toBeNull();
    expect(screen.getByTestId('live-view-fidelity').textContent).toBe('As in the game, checked');
  });

  it('words a part that is not built yet', () => {
    expect(
      unsupportedLine({ kind: 'entry', type: 'not_yet', path: '', reason: 'not_supported' }),
    ).toBe('Not worked out yet.');
  });

  it('shows the set-up banner only when a read was not set up and the view names a vanilla file', () => {
    expect(needsSetUpBanner('not_set_up', true)).toBe(true);
    expect(needsSetUpBanner('not_set_up', false)).toBe(false);
    expect(needsSetUpBanner('ready', true)).toBe(false);
    expect(needsSetUpBanner(null, true)).toBe(false);
  });
});

const project = {
  formatVersion: 1,
  name: 'Demo',
  namespaces: [
    {
      name: 'demo',
      assets: [],
      elements: [{ id: 'demo:blocks/ruby', kind: 'minecraft:loot_table', data: { pools: [] } }],
    },
  ],
  targets: [],
  plugins: [],
  settings: {},
} as unknown as Project;

/** A view as B609 will write one: its files to the worker, the banner when a vanilla file is named. */
function TestView(props: {
  vanilla: VanillaDataReader;
  namesVanilla: boolean;
  client: LiveViewClient;
  onSetup(): void;
}) {
  const state = useLiveViewData(project, props.vanilla, ['loot_table'], props.client);
  const read = state.status === 'ready' ? (state.vanilla === 'none' ? null : state.vanilla) : null;
  return (
    <LiveViewFrame
      title="Loot table"
      fidelity="about_right"
      needsSetUp={needsSetUpBanner(read, props.namesVanilla)}
      onSetup={props.onSetup}
    >
      <p data-testid="state">{state.status}</p>
    </LiveViewFrame>
  );
}

describe('a view without the Minecraft jar (B608)', () => {
  it('shows the banner when it names a vanilla file, and draws the project’s own files anyway', async () => {
    const client = new LiveViewClient({ createWorker: () => hostWorker(fakeEngine()) });
    const onSetup = vi.fn();
    render(
      <TestView vanilla={NOT_SET_UP_VANILLA_DATA} namesVanilla client={client} onSetup={onSetup} />,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    const banner = screen.getByTestId('live-view-set-up');
    expect(banner.textContent).toContain('Set up your Minecraft folder');
    await userEvent.click(screen.getByRole('button', { name: 'Set up Minecraft folder' }));
    expect(onSetup).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('shows no banner when the view names only project files', async () => {
    const client = new LiveViewClient({ createWorker: () => hostWorker(fakeEngine()) });
    render(
      <TestView
        vanilla={NOT_SET_UP_VANILLA_DATA}
        namesVanilla={false}
        client={client}
        onSetup={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
    client.dispose();
  });

  it('shows no banner once the jar is set up', async () => {
    const client = new LiveViewClient({ createWorker: () => hostWorker(fakeEngine()) });
    const reader = createVanillaDataReader({
      mcVersion: '9.9',
      read: async (version, folders) => ({
        version,
        folders: Object.fromEntries(folders.map((folder) => [folder, {}])),
        fileCount: 0,
      }),
    });
    render(<TestView vanilla={reader} namesVanilla client={client} onSetup={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
    client.dispose();
  });
});
