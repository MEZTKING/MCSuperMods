// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfferCardHost } from '../../../src/renderer/src/components/instances/OfferCard';
import {
  PLAIN_PLAY_WORDS,
  PlainPlayDialog,
  type PlainPlayHost,
  plainGameWorld,
  plainPlayHostOf,
  usePlainPlayStore,
  withCopySentence,
} from '../../../src/renderer/src/components/instances/PlainPlay';
import { PlayControls } from '../../../src/renderer/src/components/play/PlayControls';
import type { MapContent } from '../../../src/renderer/src/session/project-session';
import {
  connectInstances,
  useInstancesStore,
} from '../../../src/renderer/src/store/instances-store';
import { connectPlay } from '../../../src/renderer/src/store/play-store';
import type { StatusMessage } from '../../../src/renderer/src/store/ui-store';
import type {
  InstanceLaunchResult,
  InstanceOpenMapRequest,
  InstancePlainRequest,
  InstancePlanRequest,
  InstancePlanResult,
  InstancesPlatform,
  MapWorldSource,
} from '../../../src/shared/platform';
import { expectPlain } from '../plain-sweep';
import { fakeBridge, fakeSession, gameProject } from '../play-fixtures';
import { planFor, TARGET_IDS } from './plans';

/**
 * Play without mods and Open this map in the renderer (ADR 0133 D6, B766): a game that needs its
 * mod is refused in words, a game without a world yet gets the card that says to press Play my
 * game once first, the Plain instance is offered before it is made, and main is asked to copy
 * the world with the project's packs.
 */

const DATA_PACK = { fileName: 'sky.zip', data: new Uint8Array([1, 2, 3]) };
const RESOURCE_PACK = new Uint8Array([4, 5]);

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

let messages: StatusMessage[];

function content(overrides: Partial<MapContent> = {}): MapContent {
  return {
    report: { ok: true, problems: [], files: [] },
    needsJar: false,
    dataPack: DATA_PACK,
    resourcePack: RESOURCE_PACK,
    recordExport: async () => {},
    ...overrides,
  } as MapContent;
}

interface Fakes {
  host: PlainPlayHost;
  plan: ReturnType<typeof vi.fn<(request: InstancePlanRequest) => Promise<InstancePlanResult>>>;
  playPlain: ReturnType<
    typeof vi.fn<(request: InstancePlainRequest) => Promise<InstanceLaunchResult>>
  >;
  openMap: ReturnType<
    typeof vi.fn<(request: InstanceOpenMapRequest) => Promise<InstanceLaunchResult>>
  >;
  build: ReturnType<typeof vi.fn<() => Promise<MapContent>>>;
  save: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function fakes(
  options: {
    targetId?: string;
    built?: MapContent;
    worlds?: string[];
    existing?: boolean;
    ask?: boolean;
    launched?: InstanceLaunchResult;
  } = {},
): Fakes {
  const targetId = options.targetId ?? 'mc-26.3';
  const plan = vi.fn(async (request: InstancePlanRequest): Promise<InstancePlanResult> => {
    return planFor(request.targetId, 'plain', {
      ask: options.ask ?? true,
      existing: options.existing === true ? { id: 'instance:/prism/plain', name: 'Plain' } : null,
    }).plan;
  });
  const launched: InstanceLaunchResult = options.launched ?? {
    ok: true,
    name: 'MCSuperMods Plain',
    launched: true,
    note: null,
  };
  const playPlain = vi.fn(async (_request: InstancePlainRequest) => launched);
  const openMap = vi.fn(async (_request: InstanceOpenMapRequest) => launched);
  const build = vi.fn(async () => options.built ?? content());
  const save = vi.fn(async () => {});
  const sources: MapWorldSource[] = [
    {
      id: 'msm-play',
      name: 'MCSuperMods Test',
      managed: true,
      worlds: (options.worlds ?? [plainGameWorld('sky')]).map((dir) => ({
        dir,
        name: dir,
        lastModified: '2026-11-25T00:00:00.000Z',
      })),
    },
  ];
  const host: PlainPlayHost = {
    session: {
      snapshot: {
        dirty: false,
        project: {
          namespaces: [
            { name: 'minecraft', elements: [] },
            { name: 'sky', elements: [] },
          ],
        },
      },
      target: { id: targetId },
      save,
      buildMapContent: build,
    } as unknown as PlainPlayHost['session'],
    instances: { plan, playPlain, openMap },
    maps: { listWorlds: async () => sources },
    notify: (message) => messages.push(message),
  };
  return { host, plan, playPlain, openMap, build, save };
}

beforeEach(() => {
  messages = [];
  usePlainPlayStore.setState({ card: null, progress: null });
  useInstancesStore.setState({ card: null });
});

afterEach(() => {
  cleanup();
  connectInstances(null);
  useInstancesStore.setState({ card: null });
});

describe('Play without mods', () => {
  it('refuses a game that needs its mod, in words, before asking for anything', async () => {
    const f = fakes({ built: content({ needsJar: true }) });
    await usePlainPlayStore.getState().play(f.host);
    expect(usePlainPlayStore.getState().card).toEqual({ kind: 'needs-mod', map: false });
    expect(f.plan).not.toHaveBeenCalled();
    expect(f.playPlain).not.toHaveBeenCalled();
    const { container } = render(<PlainPlayDialog onPlayMyGame={() => {}} />);
    expect(screen.getByTestId('plain-play-text').textContent).toBe(PLAIN_PLAY_WORDS.needsMod);
    expectPlain(container);
  });

  it('says to press Play my game once first when the game has no world yet, and offers it', async () => {
    const f = fakes({ worlds: ['msm-test-sky'] });
    await usePlainPlayStore.getState().play(f.host);
    expect(usePlainPlayStore.getState().card).toEqual({ kind: 'needs-game' });
    expect(f.plan).not.toHaveBeenCalled();
    const playMyGame = vi.fn();
    const { container } = render(<PlainPlayDialog onPlayMyGame={playMyGame} />);
    expect(screen.getByTestId('plain-play-text').textContent).toContain('Play my game once');
    expectPlain(container);
    fireEvent.click(screen.getByTestId('plain-play-dialog-submit'));
    expect(playMyGame).toHaveBeenCalledTimes(1);
    expect(usePlainPlayStore.getState().card).toBeNull();
  });

  for (const targetId of TARGET_IDS) {
    it(`shows the card the first time on ${targetId}, then copies the game with the packs`, async () => {
      const f = fakes({ targetId });
      const ensure = vi.fn(async () => ({
        ok: true as const,
        id: 'instance:/prism/plain',
        name: 'MCSuperMods Plain',
        created: true,
        updated: false,
        gameDir: '/prism/plain/minecraft',
        mods: [],
      }));
      connectInstances({ ensure } as unknown as InstancesPlatform);
      const { container } = render(<OfferCardHost />);
      let done = false;
      void usePlainPlayStore
        .getState()
        .play(f.host)
        .then(() => {
          done = true;
        });
      await waitFor(() => expect(screen.getByTestId('instance-offer-make')).toBeTruthy());
      // Nothing is made or sent before the answer; the card says which world it opens.
      expect(ensure).not.toHaveBeenCalled();
      expect(f.playPlain).not.toHaveBeenCalled();
      expect(container.ownerDocument.body.textContent).toContain(PLAIN_PLAY_WORDS.copySentence);
      expectPlain(container.ownerDocument.body);
      fireEvent.click(screen.getByTestId('instance-offer-make'));
      await waitFor(() => expect(done).toBe(true));
      expect(ensure).toHaveBeenCalledTimes(1);
      expect(f.playPlain).toHaveBeenCalledWith({
        targetId,
        project: { namespace: 'sky', modId: null, playsWithoutMods: true },
        dataPack: DATA_PACK,
        resourcePack: RESOURCE_PACK,
      });
      expect(messages).toEqual([{ kind: 'info', text: PLAIN_PLAY_WORDS.started }]);
    });
  }

  it('plays straight away when the Plain instance is there', async () => {
    const f = fakes({ existing: true });
    const prepare = vi.fn();
    f.host.prepare = prepare;
    await usePlainPlayStore.getState().play(f.host);
    expect(prepare).not.toHaveBeenCalled();
    expect(f.playPlain).toHaveBeenCalledTimes(1);
    expect(usePlainPlayStore.getState().card).toBeNull();
    expect(usePlainPlayStore.getState().progress).toBeNull();
  });

  it('stops quietly when the card is cancelled', async () => {
    const f = fakes();
    f.host.prepare = async () => ({ kind: 'cancelled' });
    await usePlainPlayStore.getState().play(f.host);
    expect(f.playPlain).not.toHaveBeenCalled();
    expect(usePlainPlayStore.getState().card).toBeNull();
    expect(messages).toEqual([]);
  });

  it('shows main’s words when it fails, and the Play my game card when main finds no world', async () => {
    const failed = fakes({
      existing: true,
      launched: { ok: false, code: 'failed', message: 'That world is open in the game.' },
    });
    await usePlainPlayStore.getState().play(failed.host);
    expect(usePlainPlayStore.getState().card).toEqual({
      kind: 'failed',
      text: 'That world is open in the game.',
    });
    const gone = fakes({
      existing: true,
      launched: { ok: false, code: 'not-found', message: 'No world.' },
    });
    await usePlainPlayStore.getState().play(gone.host);
    expect(usePlainPlayStore.getState().card).toEqual({ kind: 'needs-game' });
  });

  it('says how to start the game when the launcher was not started', async () => {
    const f = fakes({
      existing: true,
      launched: { ok: true, name: 'Plain', launched: false, note: 'Start Prism Launcher.' },
    });
    await usePlainPlayStore.getState().play(f.host);
    expect(messages).toEqual([{ kind: 'info', text: 'Start Prism Launcher.' }]);
  });

  it('refuses blocked packs without asking main', async () => {
    const f = fakes({ built: content({ report: { ok: false, problems: [], files: [] } }) });
    await usePlainPlayStore.getState().play(f.host);
    expect(usePlainPlayStore.getState().card).toEqual({
      kind: 'failed',
      text: PLAIN_PLAY_WORDS.blocked,
    });
    expect(f.plan).not.toHaveBeenCalled();
  });

  it('puts the copy sentence before the last one', () => {
    const { plan } = planFor('mc-26.3', 'plain');
    const last = plan.sentences.at(-1);
    const withCopy = withCopySentence(plan, 'Copy.');
    expect(withCopy.sentences.at(-1)).toBe(last);
    expect(withCopy.sentences.at(-2)).toBe('Copy.');
    expect(plan.sentences).not.toContain('Copy.');
  });
});

describe('Open this map', () => {
  it('opens the exported world without mods, with the packs and the player data choice', async () => {
    const f = fakes({ existing: true, worlds: [] });
    await usePlainPlayStore.getState().openMap(f.host, {
      mapName: 'Sky Race',
      sourceId: 'msm-play',
      worldDir: 'msm-game-sky',
      keepPlayerData: true,
    });
    expect(f.openMap).toHaveBeenCalledWith({
      targetId: 'mc-26.3',
      project: { namespace: 'sky', modId: null, playsWithoutMods: true },
      mapName: 'Sky Race',
      sourceId: 'msm-play',
      worldDir: 'msm-game-sky',
      jars: [],
      keepPlayerData: true,
      dataPack: DATA_PACK,
      resourcePack: RESOURCE_PACK,
    });
    expect(messages).toEqual([{ kind: 'info', text: PLAIN_PLAY_WORDS.mapStarted }]);
  });

  it('refuses a map that needs its mod in words', async () => {
    const f = fakes({ built: content({ needsJar: true }) });
    await usePlainPlayStore.getState().openMap(f.host, {
      mapName: 'M',
      sourceId: 'msm-play',
      worldDir: 'w',
      keepPlayerData: false,
    });
    expect(usePlainPlayStore.getState().card).toEqual({ kind: 'needs-mod', map: true });
    render(<PlainPlayDialog onPlayMyGame={() => {}} />);
    expect(screen.getByTestId('plain-play-text').textContent).toBe(PLAIN_PLAY_WORDS.mapNeedsMod);
  });
});

describe('the host', () => {
  it('is there only with the preload’s services and a session that builds maps', async () => {
    const globals = globalThis as { msm?: unknown };
    const before = globals.msm;
    try {
      globals.msm = undefined;
      expect(plainPlayHostOf({ buildMapContent: () => {} })).toBeNull();
      globals.msm = { instances: {}, maps: {} };
      expect(plainPlayHostOf({})).toBeNull();
      expect(plainPlayHostOf({ buildMapContent: () => {} })).not.toBeNull();
    } finally {
      globals.msm = before;
    }
    await act(async () => {
      await flush();
    });
  });
});

describe('the Play menu', () => {
  it('offers Play without mods with a world setup, and starts it from the menu', async () => {
    const globals = globalThis as { msm?: unknown };
    const before = globals.msm;
    const f = fakes({ existing: true, worlds: [plainGameWorld('demo')] });
    globals.msm = { instances: f.host.instances, maps: f.host.maps };
    const session = Object.assign(fakeSession({ project: gameProject() }), {
      buildMapContent: f.build,
    });
    const disconnect = connectPlay(session, fakeBridge(), {
      notify: (message) => messages.push(message),
      showProblems: () => {},
    });
    try {
      const { container } = render(
        <Tooltip.Provider>
          <PlayControls />
        </Tooltip.Provider>,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-menu'));
      const item = await screen.findByTestId('play-menu-play-plain');
      expect(item.textContent).toBe(PLAIN_PLAY_WORDS.menu);
      expectPlain(container.ownerDocument.body);
      await user.click(item);
      await waitFor(() => expect(f.playPlain).toHaveBeenCalledTimes(1));
      expect(f.playPlain.mock.calls[0]?.[0].project.namespace).toBe('demo');
      await waitFor(() =>
        expect(messages).toContainEqual({ kind: 'info', text: PLAIN_PLAY_WORDS.started }),
      );
    } finally {
      disconnect();
      globals.msm = before;
    }
  });
});
