// @vitest-environment happy-dom

/**
 * B611's views as a user meets them: the advancement tab (a parent edit moves the node; a
 * vanilla parent without the jar shows the banner), the dialog screen (every body, input and
 * dialog type of both targets draws or is named; buttons say what they would do) and the sample
 * lines of damage and chat types. Only MSM's own made-up files; no Mojang file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Json, Project } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_VIEWS } from '../../../../src/renderer/src/liveviews/data';
import AdvancementTree from '../../../../src/renderer/src/liveviews/data/advancement/AdvancementTree';
import DialogScreen from '../../../../src/renderer/src/liveviews/data/dialog/DialogScreen';
import SampleLine from '../../../../src/renderer/src/liveviews/data/lines/SampleLine';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import {
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
  type VanillaFolderFiles,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';
import { fakePlayer, fakeVanilla, oggOf, SoundHarness } from '../../audio/fake-player';

afterEach(cleanup);

const element = (kind: string, id: string, data: Json): Element =>
  ({ id, kind, data, meta: {} }) as unknown as Element;

const projectOf = (elements: Element[]): Project =>
  ({
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  }) as unknown as Project;

/** A ready reader over made-up folders (MSM's own files standing in for the jar cache). */
function readyReader(folders: Record<string, VanillaFolderFiles>): VanillaDataReader {
  const all = (names: readonly string[]) =>
    Object.fromEntries(names.map((name) => [name, folders[name] ?? {}]));
  return {
    mcVersion: '26.3',
    folders: async (names) => ({ status: 'ready', version: '26.3', folders: all(names) }),
    folder: async (name) => ({ status: 'ready', version: '26.3', files: folders[name] ?? {} }),
    file: async () => ({ status: 'missing', id: '' }),
    lookup: async () => ({ status: 'ready', version: '26.3', lookup: () => undefined }),
    forget: () => {},
  };
}

function props(
  project: Project,
  shown: Element,
  extra: Partial<LiveViewProps> = {},
): LiveViewProps {
  return {
    project,
    element: shown,
    vanilla: NOT_SET_UP_VANILLA_DATA,
    vanillaAssets: null,
    preferences: DEFAULT_PREFS,
    onPreferences: vi.fn(),
    onSetup: vi.fn(),
    ...extra,
  };
}

const adv = (
  parent: string | null,
  title: string,
  frame = 'task',
  extra: Record<string, Json> = {},
): Json => ({
  ...(parent === null ? {} : { parent }),
  display: { icon: { id: 'minecraft:stone' }, title: { text: title }, description: 'd', frame },
  criteria: {
    got_it: { trigger: 'minecraft:inventory_changed' },
    held_it: { trigger: 'minecraft:tick' },
  },
  ...extra,
});

describe('the advancement tab (B611)', () => {
  const root = element('minecraft:advancement', 'demo:tab/root', adv(null, 'Start'));
  const a = element('minecraft:advancement', 'demo:tab/a', adv('demo:tab/root', 'First', 'goal'));

  it('is the registry’s view of advancements', () => {
    expect(DATA_VIEWS['minecraft:advancement']).toBeTypeOf('function');
  });

  it('lights this advancement and its parent, and moves the node when its parent changes', async () => {
    const b = element(
      'minecraft:advancement',
      'demo:tab/b',
      adv('demo:tab/root', 'Second', 'challenge'),
    );
    const { rerender } = render(<AdvancementTree {...props(projectOf([root, a, b]), b)} />);
    const nodeOf = (id: string) =>
      screen.getAllByTestId('advancement-node').find((node) => node.getAttribute('data-id') === id);
    await waitFor(() => expect(nodeOf('demo:tab/b')).toBeTruthy());
    expect(nodeOf('demo:tab/b')?.getAttribute('data-state')).toBe('this');
    expect(nodeOf('demo:tab/b')?.getAttribute('data-x')).toBe('1');
    expect(nodeOf('demo:tab/b')?.getAttribute('data-frame')).toBe('challenge');
    expect(nodeOf('demo:tab/root')?.getAttribute('data-state')).toBe('parent');
    expect(nodeOf('demo:tab/a')?.getAttribute('data-state')).toBe('other');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain('about right');

    const moved = element(
      'minecraft:advancement',
      'demo:tab/b',
      adv('demo:tab/a', 'Second', 'challenge'),
    );
    rerender(<AdvancementTree {...props(projectOf([root, a, moved]), moved)} />);
    await waitFor(() => expect(nodeOf('demo:tab/b')?.getAttribute('data-x')).toBe('2'));
    expect(nodeOf('demo:tab/a')?.getAttribute('data-state')).toBe('parent');
  });

  it('lists the criteria as a checklist that does not tick, and shows the toast and the chat line', async () => {
    render(<AdvancementTree {...props(projectOf([root, a]), a)} />);
    const criteria = await screen.findAllByTestId('advancement-criterion');
    expect(criteria.map((row) => row.getAttribute('data-name'))).toEqual(['got_it', 'held_it']);
    for (const row of criteria) {
      const box = within(row).getByRole('checkbox') as HTMLInputElement;
      expect(box.checked).toBe(false);
      expect(box.disabled).toBe(true);
    }
    expect(screen.getByTestId('advancement-toast').textContent).toContain('Goal Reached!');
    expect(screen.getByTestId('advancement-toast').textContent).toContain('First');
    expect(screen.getByTestId('advancement-chat').textContent).toBe(
      'Ann has reached the goal [First]',
    );
  });

  it('shows another node’s details when it is chosen', async () => {
    render(<AdvancementTree {...props(projectOf([root, a]), a)} />);
    const nodes = await screen.findAllByTestId('advancement-node');
    const start = nodes.find(
      (node) => node.getAttribute('data-id') === 'demo:tab/root',
    ) as HTMLElement;
    fireEvent.click(start);
    expect(screen.getByTestId('advancement-details').getAttribute('data-id')).toBe('demo:tab/root');
    expect(screen.getByTestId('advancement-title').textContent).toBe('Start');
  });

  it('shows the banner for a vanilla parent without the jar, and draws the parent with it', async () => {
    const mine = element(
      'minecraft:advancement',
      'demo:mine_more',
      adv('minecraft:story/made_up_parent', 'Mine more'),
    );
    const setup = vi.fn();
    const { unmount } = render(
      <AdvancementTree {...props(projectOf([mine]), mine, { onSetup: setup })} />,
    );
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
    const placeholder = screen
      .getAllByTestId('advancement-node')
      .find((node) => node.getAttribute('data-id') === 'minecraft:story/made_up_parent');
    expect(placeholder?.getAttribute('data-origin')).toBe('missing');
    fireEvent.click(within(screen.getByTestId('live-view-set-up')).getByRole('button'));
    expect(setup).toHaveBeenCalled();
    unmount();

    const vanilla = readyReader({
      advancement: {
        'minecraft:story/made_up_root': adv(null, 'Made-up root') as Json,
        'minecraft:story/made_up_parent': adv(
          'minecraft:story/made_up_root',
          'Made-up parent',
        ) as Json,
        'minecraft:story/made_up_sibling': adv(
          'minecraft:story/made_up_root',
          'Made-up sibling',
        ) as Json,
      },
    });
    render(<AdvancementTree {...props(projectOf([mine]), mine, { vanilla })} />);
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('advancement-node')
          .find((node) => node.getAttribute('data-id') === 'minecraft:story/made_up_parent')
          ?.getAttribute('data-origin'),
      ).toBe('vanilla'),
    );
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
    expect(screen.getAllByTestId('advancement-node')).toHaveLength(4);
    expect(
      screen
        .getAllByTestId('advancement-node')
        .find((node) => node.getAttribute('data-id') === 'demo:mine_more')
        ?.getAttribute('data-x'),
    ).toBe('2');
  });

  it('says a root without a display makes no tab', async () => {
    const plain = element('minecraft:advancement', 'demo:plain', {
      criteria: { c: { trigger: 'minecraft:tick' } },
    });
    render(<AdvancementTree {...props(projectOf([plain]), plain)} />);
    expect(await screen.findByTestId('advancement-no-tab')).toBeTruthy();
    expect(screen.queryByTestId('advancement-tree')).toBeNull();
    expect(screen.getAllByTestId('advancement-criterion')).toHaveLength(1);
  });
});

const REGISTRY_FILES = {
  '26.3': join(__dirname, '../../../../../packages/targets/mc-26.3/vendor/mcmeta/registries.json'),
  '26.4': join(__dirname, '../../../../../packages/targets/mc-26.4/vendor/mcmeta/registries.json'),
};

function registry(version: keyof typeof REGISTRY_FILES, name: string): string[] {
  const all = JSON.parse(readFileSync(REGISTRY_FILES[version], 'utf8')) as Record<string, string[]>;
  return all[name] ?? [];
}

/** A small dialog of each body and input type, with fields a made-up dialog would set. */
const SAMPLE_BODY: Record<string, Json> = {
  plain_message: { type: 'minecraft:plain_message', contents: 'Hello' },
  item: {
    type: 'minecraft:item',
    item: { id: 'minecraft:stone', count: 2 },
    description: 'Stones',
  },
};
const SAMPLE_INPUT: Record<string, Json> = {
  text: { type: 'minecraft:text', key: 'name', label: 'Name' },
  boolean: { type: 'minecraft:boolean', key: 'ok', label: 'Agree' },
  single_option: {
    type: 'minecraft:single_option',
    key: 'pick',
    label: 'Pick',
    options: ['a', 'b'],
  },
  number_range: { type: 'minecraft:number_range', key: 'n', label: 'How many', start: 0, end: 10 },
};

const dialogProps = (data: Json, extra: Partial<LiveViewProps> = {}) => {
  const shown = element('minecraft:dialog', 'demo:screen', data);
  return props(projectOf([shown]), shown, extra);
};

describe('the dialog screen (B611)', () => {
  for (const version of ['26.3', '26.4'] as const) {
    it(`draws every body and input type of ${version}, or names it`, async () => {
      const bodies = registry(version, 'dialog_body_type');
      const inputTypes = registry(version, 'input_control_type');
      expect(bodies.length).toBeGreaterThan(0);
      expect(inputTypes.length).toBeGreaterThan(0);
      for (const type of bodies) {
        const body = SAMPLE_BODY[type] ?? { type: `minecraft:${type}` };
        const { unmount } = render(
          <DialogScreen {...dialogProps({ type: 'minecraft:notice', title: 'T', body })} />,
        );
        const drawn = await screen.findAllByTestId(/dialog-widget|dialog-unknown/);
        expect(
          drawn.some((node) => node.getAttribute('data-type') === type),
          type,
        ).toBe(true);
        unmount();
      }
      for (const type of inputTypes) {
        const input = SAMPLE_INPUT[type] ?? { type: `minecraft:${type}`, key: 'k', label: 'K' };
        const { unmount } = render(
          <DialogScreen
            {...dialogProps({ type: 'minecraft:notice', title: 'T', inputs: [input] })}
          />,
        );
        const drawn = await screen.findAllByTestId(/dialog-widget|dialog-unknown/);
        expect(
          drawn.some((node) => node.getAttribute('data-type') === type),
          type,
        ).toBe(true);
        unmount();
      }
    });

    it(`draws every dialog type of ${version}`, async () => {
      for (const type of registry(version, 'dialog_type')) {
        const { unmount } = render(
          <DialogScreen
            {...dialogProps({
              type: `minecraft:${type}`,
              title: 'T',
              yes: { label: 'Yes' },
              no: { label: 'No' },
              actions: [{ label: 'One' }],
              dialogs: { type: 'minecraft:notice', title: 'Inner' },
            })}
          />,
        );
        const shown = await screen.findByTestId('dialog-screen');
        expect(shown.getAttribute('data-type')).toBe(type);
        expect(screen.queryByTestId('dialog-unknown')).toBeNull();
        unmount();
      }
    });
  }

  it('names a type it cannot draw in its place', async () => {
    render(
      <DialogScreen
        {...dialogProps({
          type: 'minecraft:notice',
          title: 'T',
          body: { type: 'minecraft:made_up' },
        })}
      />,
    );
    const unknown = await screen.findByTestId('dialog-unknown');
    expect(unknown.textContent).toBe('Only in the game: a body of type made_up');
  });

  it('says what a button would do, filling a template from the inputs', async () => {
    render(
      <DialogScreen
        {...dialogProps({
          type: 'minecraft:multi_action',
          title: 'Choose',
          inputs: [
            { type: 'minecraft:text', key: 'name', label: 'Name', initial: 'Ann' },
            {
              type: 'minecraft:boolean',
              key: 'ok',
              label: 'Agree',
              on_true: 'yes',
              on_false: 'no',
            },
          ],
          actions: [
            { label: 'Hi', action: { type: 'minecraft:run_command', command: 'say hi' } },
            {
              label: 'Greet',
              action: { type: 'minecraft:dynamic/run_command', template: 'say $(name) $(ok)' },
            },
            { label: 'Site', action: { type: 'minecraft:open_url', url: 'https://example.org' } },
          ],
        })}
      />,
    );
    const buttons = await screen.findAllByTestId('dialog-button');
    fireEvent.click(buttons.find((button) => button.textContent === 'Hi') as HTMLElement);
    expect(screen.getByTestId('dialog-said').textContent).toBe(
      'This button would run /say hi, then close the dialog.',
    );
    const box = screen
      .getAllByTestId('dialog-widget')
      .find((node) => node.getAttribute('data-kind') === 'text') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Bea' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(buttons.find((button) => button.textContent === 'Greet') as HTMLElement);
    expect(screen.getByTestId('dialog-said').textContent).toBe(
      'This button would run /say Bea yes, then close the dialog.',
    );
    fireEvent.click(buttons.find((button) => button.textContent === 'Site') as HTMLElement);
    expect(screen.getByTestId('dialog-said').textContent).toContain(
      'open the link https://example.org',
    );
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
  });

  it('shows the banner when a list names a vanilla dialog and the jar is not set up', async () => {
    render(
      <DialogScreen
        {...dialogProps({
          type: 'minecraft:dialog_list',
          title: 'L',
          dialogs: ['minecraft:made_up'],
        })}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
  });

  it('labels a list’s buttons with the named dialogs’ titles', async () => {
    const other = element('minecraft:dialog', 'demo:other', {
      type: 'minecraft:notice',
      title: 'Other',
      external_title: 'Go to other',
    });
    const list = element('minecraft:dialog', 'demo:list', {
      type: 'minecraft:dialog_list',
      title: 'L',
      dialogs: ['demo:other'],
    });
    render(<DialogScreen {...props(projectOf([other, list]), list)} />);
    const buttons = await screen.findAllByTestId('dialog-button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Go to other']);
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
  });
});

describe('the sample lines (B611)', () => {
  const lang = element('minecraft:lang', 'demo:en_us', {
    'death.attack.demo_zap': '%1$s was zapped',
    'death.attack.demo_zap.item': '%1$s was zapped by %2$s using %3$s',
  });

  it('shows the three forms of a death line in the game’s keys', async () => {
    const zap = element('minecraft:damage_type', 'demo:zap', {
      message_id: 'demo_zap',
      exhaustion: 0.1,
      scaling: 'never',
    });
    render(<SampleLine {...props(projectOf([lang, zap]), zap)} />);
    const lines = await screen.findAllByTestId('sample-line-death');
    expect(lines.map((line) => line.getAttribute('data-key'))).toEqual([
      'death.attack.demo_zap',
      'death.attack.demo_zap',
      'death.attack.demo_zap.item',
    ]);
    expect(lines[0]?.textContent).toContain('Ann was zapped');
    expect(lines[1]?.textContent).toContain('Ann was zapped');
    expect(lines[2]?.textContent).toContain('Ann was zapped by Bea using [Spiky]');
    expect(screen.queryByTestId('sample-line-missing-words')).toBeNull();
  });

  it('shows a key no language file names, as the game does, and the design form', async () => {
    const zap = element('minecraft:damage_type', 'demo:zap', {
      message_id: 'demo_other',
      death_message_type: 'intentional_game_design',
    });
    render(<SampleLine {...props(projectOf([zap]), zap)} />);
    const lines = await screen.findAllByTestId('sample-line-death');
    expect(lines.map((line) => line.getAttribute('data-form'))).toEqual([
      'alone',
      'mob',
      'named_item',
      'design',
    ]);
    expect(lines[0]?.textContent).toContain('death.attack.demo_other');
    expect(screen.getByTestId('sample-line-missing-words').textContent).toContain(
      'death.attack.demo_other.message',
    );
  });

  it('plays the hurt sound of the damage effects through the shared Play button', async () => {
    const fake = fakePlayer();
    const vanilla = fakeVanilla({
      'entity.player.hurt_on_fire': { sounds: ['damage/hit_fire'] },
      'entity.player.hurt': { sounds: ['damage/hit1'] },
    });
    const burn = element('minecraft:damage_type', 'demo:burn', {
      message_id: 'demo_burn',
      effects: 'burning',
    });
    render(
      <SoundHarness
        player={fake.player}
        sources={{ project: null, sounds: null, readProjectAsset: null, random: () => 0 }}
      >
        <SampleLine {...props(projectOf([lang, burn]), burn, { sounds: vanilla })} />
      </SoundHarness>,
    );
    const play = await screen.findByTestId('sample-line-hurt-play');
    expect(screen.queryByText(/cannot be played/)).toBeNull();
    await waitFor(() => expect(play.getAttribute('data-state')).toBe('idle'));
    await act(async () => {
      fireEvent.click(play);
    });
    await waitFor(() => expect(fake.played).toHaveLength(1));
    expect(vanilla.files).toEqual(['minecraft/sounds/damage/hit_fire.ogg']);
    expect(fake.played[0]?.bytes).toEqual(oggOf('minecraft/sounds/damage/hit_fire.ogg'));
  });

  it("plays the project's own hurt sound when the project redefines it", async () => {
    const fake = fakePlayer();
    const vanilla = fakeVanilla({ 'entity.player.hurt': { sounds: ['damage/hit1'] } });
    const own = element('minecraft:sounds', 'minecraft:sounds', {
      'entity.player.hurt': { replace: true, sounds: ['demo:ouch'] },
    });
    const zap = element('minecraft:damage_type', 'demo:zap', { message_id: 'demo_zap' });
    const project = {
      ...projectOf([lang, zap]),
      namespaces: [
        { name: 'demo', assets: [{ path: 'sounds/ouch.ogg' }], elements: [lang, zap] },
        { name: 'minecraft', assets: [], elements: [own] },
      ],
    } as unknown as Project;
    const reads: string[] = [];
    const readProject = async (path: string) => {
      reads.push(path);
      return oggOf(path);
    };
    render(
      <SoundHarness
        player={fake.player}
        sources={{ project: null, sounds: null, readProjectAsset: null, random: () => 0 }}
      >
        <SampleLine {...props(project, zap, { sounds: vanilla, readProject })} />
      </SoundHarness>,
    );
    const play = await screen.findByTestId('sample-line-hurt-play');
    await act(async () => {
      fireEvent.click(play);
    });
    await waitFor(() => expect(fake.played).toHaveLength(1));
    expect(reads).toEqual(['assets/demo/sounds/ouch.ogg']);
    expect(vanilla.files).toEqual([]);
    expect(fake.played[0]?.bytes).toEqual(oggOf('assets/demo/sounds/ouch.ogg'));
  });

  it('fills a chat type’s key with its parameters in order, in its style, and follows the typed text', async () => {
    const words = element('minecraft:lang', 'demo:en_us', {
      'demo.shout': '%s shouts at %s: %s',
      'demo.shout.narrate': '%s says %s',
    });
    const shout = element('minecraft:chat_type', 'demo:shout', {
      chat: {
        translation_key: 'demo.shout',
        parameters: ['sender', 'target', 'content'],
        style: { color: 'red', bold: true },
      },
      narration: { translation_key: 'demo.shout.narrate', parameters: ['sender', 'content'] },
    });
    const onPreferences = vi.fn();
    render(<SampleLine {...props(projectOf([words, shout]), shout, { onPreferences })} />);
    const line = await screen.findByTestId('sample-line-chat');
    expect(line.textContent).toBe('Ann shouts at Bea: Hello there!');
    const styled = line.querySelector('span span') as HTMLElement;
    expect(styled.style.color).toBe('#ff5555');
    expect(styled.style.fontWeight).toBe('700');
    expect(screen.getByTestId('sample-line-narration').textContent).toBe('Ann says Hello there!');
    await act(async () => {
      fireEvent.change(screen.getByTestId('sample-line-text'), { target: { value: 'Run!' } });
    });
    expect(screen.getByTestId('sample-line-chat').textContent).toBe('Ann shouts at Bea: Run!');
    expect(onPreferences).toHaveBeenCalledWith({ sampleText: 'Run!' });
  });
});
