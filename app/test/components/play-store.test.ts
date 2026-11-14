import type { Problem } from '@msm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPendingEdit } from '../../src/renderer/src/session/pending-edits';
import {
  connectPlay,
  newWorldMessage,
  playChipState,
  playItems,
  playNames,
  playNamespaces,
  playOutputs,
  playResultMessage,
  restartTexts,
  usePlayStore,
} from '../../src/renderer/src/store/play-store';
import type { StatusMessage } from '../../src/renderer/src/store/ui-store';
import type { PlayInput, ReloadInput } from '../../src/shared/platform';
import {
  builtJar,
  type FakeBridge,
  type FakeSession,
  fakeBridge,
  fakeSession,
  JAR,
  LOWERED,
  NEW_BLOCK_REASON,
  PLAY_OK,
  playProject,
  RESTART_REASONS,
  reloadOk,
  statusFor,
} from './play-fixtures';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

let disconnect: (() => void) | null = null;
let messages: StatusMessage[] = [];
let shown: (readonly Problem[])[] = [];

async function connect(
  session: FakeSession = fakeSession(),
  bridge: FakeBridge = fakeBridge(),
): Promise<{ session: FakeSession; bridge: FakeBridge }> {
  messages = [];
  shown = [];
  disconnect = connectPlay(session, bridge, {
    notify: (message) => messages.push(message),
    showProblems: (problems) => shown.push(problems),
  });
  await flush();
  return { session, bridge };
}

beforeEach(() => {
  messages = [];
});

afterEach(() => {
  disconnect?.();
  disconnect = null;
});

describe('Play store helpers', () => {
  it('gives every chip state, restart needed while the game runs', () => {
    expect(playChipState(null)).toBeNull();
    for (const state of [
      'no-prism',
      'not-running',
      'starting',
      'test-world',
      'other-world',
    ] as const) {
      expect(playChipState(statusFor(state))).toBe(state);
    }
    expect(playChipState(statusFor('test-world', { restart: true }))).toBe('restart-needed');
    expect(playChipState(statusFor('starting', { restart: true }))).toBe('restart-needed');
    // A game that is not running needs no restart: the next Play installs everything.
    expect(playChipState(statusFor('not-running', { restart: true }))).toBe('not-running');
  });

  it('lists items, then block items, then spawn eggs, own namespace first', () => {
    expect(playItems(playProject())).toEqual([
      { id: 'demo:ruby' },
      { id: 'demo:ruby_lamp' },
      { id: 'demo:goblin_spawn_egg' },
    ]);
    expect(playNamespaces(playProject())).toEqual(['demo', 'minecraft']);
  });

  it('names elements by display name, else the readable id', () => {
    const names = playNames(playProject());
    expect(names['demo:ruby_lamp']).toBe('Ruby Lamp');
    expect(names['demo:hidden_block']).toBe('Hidden block');
    expect(names['demo:ruby_recipe']).toBe('Ruby recipe');
  });

  it('sends the lowered files with the element each path names', () => {
    const outputs = playOutputs(LOWERED, playProject());
    expect(outputs).toEqual([
      {
        path: 'msm/demo/block/ruby_lamp.json',
        contents: { type: 'simple' },
        elementId: 'demo:ruby_lamp',
      },
      {
        path: 'data/demo/recipe/ruby_recipe.json',
        contents: { type: 'x' },
        elementId: 'demo:ruby_recipe',
      },
      { path: 'assets/demo/lang/en_us.json', contents: {} },
    ]);
    // An elementId the lowering already gives wins.
    const own = playOutputs(
      [{ ...(LOWERED[0] as (typeof LOWERED)[0]), elementId: 'demo:other' } as never],
      playProject(),
    );
    expect(own[0]?.elementId).toBe('demo:other');
  });

  it('leaves out the pack files the content jar leaves out (B379)', () => {
    const outputs = playOutputs(
      [
        ...LOWERED,
        { path: 'pack.mcmeta', layer: 'datapack', contents: { pack: {} } },
        { path: 'pack.mcmeta', layer: 'resourcepack', contents: { pack: {} } },
        { path: 'pack.png', layer: 'resourcepack', contents: new Uint8Array([1]) },
        { path: 'fabric.mod.json', layer: 'msm', contents: { id: 'demo' } },
      ],
      playProject(),
    );
    expect(outputs.map((file) => file.path)).toEqual([
      'msm/demo/block/ruby_lamp.json',
      'data/demo/recipe/ruby_recipe.json',
      'assets/demo/lang/en_us.json',
      'fabric.mod.json',
    ]);
  });

  it('words Play results and New test world', () => {
    expect(playResultMessage(PLAY_OK as never)).toBe(
      'Minecraft is starting. It opens the test world by itself.',
    );
    expect(
      playResultMessage({
        ...(PLAY_OK as object),
        instanceCreated: true,
        restarted: true,
        itemsLeftOut: 3,
      } as never),
    ).toBe(
      'Made the test instance "MCSuperMods Test (26.3)" in Prism Launcher. Minecraft is starting again with your changes. 3 items do not fit in the test world\'s chests.',
    );
    expect(
      playResultMessage({
        ...(PLAY_OK as object),
        launched: false,
        note: 'Start the instance in Prism Launcher.',
      } as never),
    ).toBe('Start the instance in Prism Launcher.');
    expect(newWorldMessage({ ok: true, renamedTo: null })).toBe(
      'The next Play makes a fresh test world.',
    );
    expect(newWorldMessage({ ok: true, renamedTo: 'msm-test-demo-old-2' })).toBe(
      'The old test world is kept as "msm-test-demo-old-2". The next Play makes a fresh one.',
    );
  });

  it('keeps each restart text once', () => {
    expect(restartTexts([...RESTART_REASONS, NEW_BLOCK_REASON])).toHaveLength(9);
  });
});

describe('Play store actions', () => {
  it('reads the status on connect and follows pushes for its target only', async () => {
    const { bridge, session } = await connect();
    expect(bridge.play.status).toHaveBeenCalledWith('mc-26.3');
    expect(usePlayStore.getState().status?.state).toBe('not-running');
    bridge.push({ ...statusFor('test-world'), targetId: 'mc-26.4' });
    expect(usePlayStore.getState().status?.state).toBe('not-running');
    bridge.push(statusFor('test-world'));
    expect(usePlayStore.getState().status?.state).toBe('test-world');
    session.setTarget('mc-26.4');
    await flush();
    expect(bridge.play.status).toHaveBeenLastCalledWith('mc-26.4');
    expect(usePlayStore.getState().status?.targetId).toBe('mc-26.4');
  });

  it('stays unconnected without window.msm.play', () => {
    const bridge = fakeBridge();
    const off = connectPlay(fakeSession(), { ...bridge, play: undefined });
    expect(usePlayStore.getState().host).toBeNull();
    off();
  });

  it('Play flushes held-back typing, saves, builds and sends the input', async () => {
    const session = fakeSession({ dirty: false });
    const order: string[] = [];
    const unregister = registerPendingEdit(() => {
      order.push('flush');
      session.publish({ dirty: true });
    });
    session.save.mockImplementation(async () => {
      order.push('save');
    });
    session.buildContentJar.mockImplementation(async () => {
      order.push('build');
      return builtJar();
    });
    const { bridge } = await connect(session);
    await usePlayStore.getState().play();
    unregister();
    expect(order).toEqual(['flush', 'save', 'build']);
    expect(bridge.play.play).toHaveBeenCalledTimes(1);
    const input = bridge.play.play.mock.calls[0]?.[0] as PlayInput;
    expect(input).toMatchObject({
      targetId: 'mc-26.3',
      modId: 'demo',
      jar: JAR,
      namespaces: ['demo', 'minecraft'],
      items: [{ id: 'demo:ruby' }, { id: 'demo:ruby_lamp' }, { id: 'demo:goblin_spawn_egg' }],
    });
    expect(input.outputs[0]).toMatchObject({ elementId: 'demo:ruby_lamp' });
    expect(messages).toEqual([
      { kind: 'info', text: 'Minecraft is starting. It opens the test world by itself.' },
    ]);
    expect(usePlayStore.getState().running).toBeNull();
  });

  it('does not save a clean project', async () => {
    const { session, bridge } = await connect(fakeSession({ dirty: false }));
    await usePlayStore.getState().play();
    expect(session.save).not.toHaveBeenCalled();
    expect(bridge.play.play).toHaveBeenCalled();
  });

  it('shows the progress lines while saving and building', async () => {
    const session = fakeSession({ dirty: true });
    const seen: (string | null)[] = [];
    session.save.mockImplementation(async () => {
      seen.push(usePlayStore.getState().progress);
    });
    session.buildContentJar.mockImplementation(async () => {
      seen.push(usePlayStore.getState().progress);
      return builtJar();
    });
    await connect(session);
    await usePlayStore.getState().play();
    expect(seen).toEqual(['Saving the project…', 'Building the mod…']);
    expect(usePlayStore.getState().progress).toBeNull();
  });

  it('stops on errors that block the jar and shows them', async () => {
    const problem: Problem = { severity: 'error', code: 'x.bad', message: 'Bad.' };
    const { bridge } = await connect(fakeSession({ blocked: [problem] }));
    await usePlayStore.getState().play();
    expect(bridge.play.play).not.toHaveBeenCalled();
    expect(shown).toEqual([[problem]]);
    expect(messages[0]).toEqual({
      kind: 'error',
      text: 'Play blocked by 1 error(s); nothing was sent to the game. See Problems.',
    });
  });

  it('opens the Prism panel instead of building when Prism is missing', async () => {
    const { session, bridge } = await connect(fakeSession(), fakeBridge(statusFor('no-prism')));
    await usePlayStore.getState().play();
    expect(usePlayStore.getState().prismPanel).toBe(true);
    expect(session.buildContentJar).not.toHaveBeenCalled();
    expect(bridge.play.play).not.toHaveBeenCalled();
  });

  it('opens the Prism panel when main says no-prism, with its message', async () => {
    const bridge = fakeBridge();
    bridge.play.play.mockResolvedValue({
      ok: false,
      code: 'no-prism',
      message: 'Prism Launcher was not found.',
    });
    await connect(fakeSession(), bridge);
    await usePlayStore.getState().play();
    expect(usePlayStore.getState().prismPanel).toBe(true);
    expect(messages).toEqual([{ kind: 'error', text: 'Prism Launcher was not found.' }]);
  });

  it('shows other failures in plain words', async () => {
    const bridge = fakeBridge();
    bridge.play.play.mockResolvedValue({
      ok: false,
      code: 'game-not-closing',
      message: 'Close Minecraft, then press Play again.',
    });
    await connect(fakeSession(), bridge);
    await usePlayStore.getState().play();
    expect(usePlayStore.getState().prismPanel).toBe(false);
    expect(messages).toEqual([{ kind: 'error', text: 'Close Minecraft, then press Play again.' }]);
  });

  it('Reload runs only in the test world', async () => {
    const { bridge } = await connect();
    await usePlayStore.getState().reload();
    expect(bridge.play.reload).not.toHaveBeenCalled();
  });

  it('Reload sends the same outputs with the jar and names', async () => {
    const { bridge } = await connect(fakeSession(), fakeBridge(statusFor('test-world')));
    await usePlayStore.getState().reload();
    const input = bridge.play.reload.mock.calls[0]?.[0] as ReloadInput;
    const names = input.names ?? {};
    expect(input).toMatchObject({ targetId: 'mc-26.3', modId: 'demo', jar: JAR });
    expect(names['demo:ruby_lamp']).toBe('Ruby Lamp');
    expect(input.outputs).toEqual(playOutputs(LOWERED, playProject()));
    expect(messages).toEqual([{ kind: 'info', text: 'Reloading 1 change in Minecraft.' }]);
    expect(usePlayStore.getState().restartDialog).toBeNull();
  });

  it('Reload with restart reasons opens Restart needed', async () => {
    const bridge = fakeBridge(statusFor('test-world'));
    bridge.play.reload.mockResolvedValue(reloadOk([NEW_BLOCK_REASON]));
    await connect(fakeSession(), bridge);
    await usePlayStore.getState().reload();
    expect(usePlayStore.getState().restartDialog).toEqual([NEW_BLOCK_REASON]);
  });

  it('Restart closes the dialog and calls restart', async () => {
    const { bridge } = await connect(fakeSession(), fakeBridge(statusFor('test-world')));
    usePlayStore.setState({ restartDialog: [NEW_BLOCK_REASON] });
    await usePlayStore.getState().restart();
    expect(bridge.play.restart).toHaveBeenCalledTimes(1);
    expect(usePlayStore.getState().restartDialog).toBeNull();
    expect(messages).toEqual([
      { kind: 'info', text: 'Minecraft is starting again with your changes.' },
    ]);
  });

  it('reopens Restart needed from the status reasons', async () => {
    await connect(fakeSession(), fakeBridge(statusFor('test-world', { restart: true })));
    usePlayStore.getState().showRestartNeeded();
    expect(usePlayStore.getState().restartDialog).toEqual([NEW_BLOCK_REASON]);
  });

  it('New test world names the own namespace and words the result', async () => {
    const { bridge } = await connect();
    await usePlayStore.getState().newTestWorld();
    expect(bridge.play.newWorld).toHaveBeenCalledWith('mc-26.3', 'demo');
    expect(messages[0]?.text).toBe(
      'The old test world is kept as "msm-test-demo-old-1". The next Play makes a fresh one.',
    );
  });

  it('opens the instance folder, or says where it is', async () => {
    const { bridge } = await connect();
    await usePlayStore.getState().openInstanceFolder();
    expect(bridge.shell.showItemInFolder).toHaveBeenCalledWith(
      '/prism/instances/MCSuperMods Test (26.3)/minecraft',
    );
    bridge.shell.showItemInFolder.mockRejectedValue(new Error('outside'));
    await usePlayStore.getState().openInstanceFolder();
    expect(messages.at(-1)?.text).toBe(
      "The test instance's folder is /prism/instances/MCSuperMods Test (26.3)/minecraft",
    );
  });

  it('Find Prism closes the panel once Prism is found', async () => {
    const bridge = fakeBridge(statusFor('no-prism'));
    await connect(fakeSession(), bridge);
    usePlayStore.getState().openPrismPanel();
    await usePlayStore.getState().findPrism();
    expect(usePlayStore.getState().prismPanel).toBe(true);
    expect(usePlayStore.getState().prismMessage).toMatch(/still not found/);
    bridge.setCurrent(statusFor('not-running'));
    await usePlayStore.getState().findPrism();
    expect(usePlayStore.getState().prismPanel).toBe(false);
    expect(messages.at(-1)?.text).toBe('Found Prism Launcher. Press Play to start.');
  });

  it("Choose Prism's folder adds it to the launcher folders and looks again", async () => {
    const bridge = fakeBridge(statusFor('no-prism'));
    await connect(fakeSession(), bridge);
    usePlayStore.getState().openPrismPanel();
    bridge.settings.set.mockImplementation(async () => {
      bridge.setCurrent(statusFor('not-running'));
    });
    await usePlayStore.getState().choosePrismFolder();
    expect(bridge.settings.set).toHaveBeenCalledWith({
      launchers: { prismDataDirs: ['/home/me/prism'], multimcRoots: [], curseForgeRoots: [] },
    });
    expect(usePlayStore.getState().prismPanel).toBe(false);
  });

  it('ignores a second Play while one runs', async () => {
    const session = fakeSession();
    let release: () => void = () => {};
    session.buildContentJar.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(builtJar());
        }),
    );
    const { bridge } = await connect(session);
    const first = usePlayStore.getState().play();
    await flush();
    await usePlayStore.getState().play();
    release();
    await first;
    expect(bridge.play.play).toHaveBeenCalledTimes(1);
  });

  it('reports a thrown save as a failure', async () => {
    const session = fakeSession({ dirty: true });
    session.save.mockRejectedValue(new Error('disk full'));
    const { bridge } = await connect(session);
    await usePlayStore.getState().play();
    expect(bridge.play.play).not.toHaveBeenCalled();
    expect(messages).toEqual([{ kind: 'error', text: 'Play failed: disk full' }]);
    expect(vi.isMockFunction(session.save)).toBe(true);
  });
});
